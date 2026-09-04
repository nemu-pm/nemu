import { beforeEach, describe, expect, mock, test } from "bun:test";

type StoredFile = { bytes: Uint8Array; modifiedAt: number };
const files = new Map<string, StoredFile>();
const directories = new Set<string>(["/cache"]);
let failMoveDestination: RegExp | null = null;
let directoryListCalls = 0;
let existenceChecks = 0;

const pathFrom = (value: unknown): string => {
  if (value instanceof FakeDirectory || value instanceof FakeFile)
    return value.path;
  const raw = String(value).replace(/^file:\/\//, "");
  return raw.replace(/\/+$/, "") || "/";
};
const uriFor = (path: string) => `file://${path}`;

class FakeFile {
  path: string;
  constructor(parent: unknown, name?: string) {
    const base = pathFrom(parent);
    this.path = name == null ? base : `${base}/${name}`;
  }
  get uri() {
    return uriFor(this.path);
  }
  get name() {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
  get exists() {
    existenceChecks += 1;
    return files.has(this.path);
  }
  info() {
    const value = files.get(this.path);
    return {
      size: value?.bytes.byteLength ?? 0,
      modificationTime: value?.modifiedAt ?? 0,
    };
  }
  write(value: string | Uint8Array) {
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value.slice();
    files.set(this.path, { bytes, modifiedAt: Date.now() });
  }
  textSync() {
    const value = files.get(this.path);
    if (!value) throw new Error("missing file");
    return new TextDecoder().decode(value.bytes);
  }
  async base64() {
    const value = files.get(this.path);
    if (!value) throw new Error("missing file");
    return Buffer.from(value.bytes).toString("base64");
  }
  delete() {
    files.delete(this.path);
  }
  async move(destination: FakeFile, options?: { overwrite?: boolean }) {
    if (failMoveDestination?.test(destination.name)) {
      failMoveDestination = null;
      throw new Error("injected move failure");
    }
    const value = files.get(this.path);
    if (!value) throw new Error("missing source");
    if (destination.exists && options?.overwrite !== true) {
      throw new Error("destination exists");
    }
    if (destination.exists) destination.delete();
    files.set(destination.path, value);
    files.delete(this.path);
    // Expo FileSystem mutates the source object to point at its destination.
    // The cache must never use this object to clean up the old staging path.
    this.path = destination.path;
  }
}

class FakeDirectory {
  readonly path: string;
  constructor(parent: unknown, name?: string) {
    const base = pathFrom(parent);
    this.path = name == null ? base : `${base}/${name}`;
  }
  get uri() {
    return uriFor(this.path);
  }
  get exists() {
    return directories.has(this.path);
  }
  create() {
    directories.add(this.path);
  }
  list() {
    directoryListCalls += 1;
    const prefix = `${this.path}/`;
    return [...files.keys()]
      .filter(
        (path) =>
          path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
      )
      .map((path) => new FakeFile(path));
  }
  delete() {
    const prefix = `${this.path}/`;
    [...files.keys()].forEach((path) => {
      if (path.startsWith(prefix)) files.delete(path);
    });
    directories.delete(this.path);
  }
}

mock.module("expo-file-system", () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { cache: "/cache" },
}));

let nextNativeResponse: {
  kind: "segmented-image";
  status: number;
  headers: Record<string, string>;
  byteLength: number;
  manifestVersion: 1;
  imageWidth: number;
  imageHeight: number;
  imageSegments: Array<{
    fileUri: string;
    byteLength: number;
    width: number;
    height: number;
    mimeType: "image/png";
  }>;
};

mock.module("@/sources/mobileNativeHttpFile", () => ({
  downloadMobileNativeHttpFile: async () => nextNativeResponse,
}));

const { FileSystemBinaryCache } = await import("./nativeCache.native");

function stageResponse(suffix: string) {
  const first = new FakeFile(`/cache/native-${suffix}-0.part`);
  const second = new FakeFile(`/cache/native-${suffix}-1.part`);
  first.write(new Uint8Array([1, 2, 3]));
  second.write(new Uint8Array([4, 5, 6, 7]));
  nextNativeResponse = {
    kind: "segmented-image",
    status: 200,
    headers: { "content-type": "image/png" },
    byteLength: 7,
    manifestVersion: 1,
    imageWidth: 100,
    imageHeight: 10_000,
    imageSegments: [
      {
        fileUri: first.uri,
        byteLength: 3,
        width: 100,
        height: 5_000,
        mimeType: "image/png",
      },
      {
        fileUri: second.uri,
        byteLength: 4,
        width: 100,
        height: 5_000,
        mimeType: "image/png",
      },
    ],
  };
}

describe("native segmented cache publication", () => {
  beforeEach(() => {
    files.clear();
    directories.clear();
    directories.add("/cache");
    failMoveDestination = null;
    directoryListCalls = 0;
    existenceChecks = 0;
  });

  test("publishes manifest last and never exposes it as binary bytes", async () => {
    stageResponse("first");
    const cache = new FileSystemBinaryCache("images", {
      maxBytes: 1_000_000,
      maxEntries: 10,
      maxAgeMs: 60_000,
      maxEntryBytes: 100_000,
    });
    const uri = await cache.downloadFile(
      "page",
      "https://example.test/p.png",
      "image/png",
      {
        maxBytes: 100_000,
        maxImageDimension: 16_384,
        maxImagePixels: 8 * 1024 * 1024,
        allowLongStripSegments: true,
      },
    );
    expect(uri).toMatch(
      /\.segments-v1-[a-z0-9]{10}-[a-z0-9]{6}-[a-z0-9]{10}\.json$/,
    );
    expect(await cache.getUri("page")).toBe(uri);
    expect(await cache.getBytes("page")).toBeNull();
    const manifest = JSON.parse(new FakeFile(uri).textSync()) as {
      segments: Array<{ fileName: string }>;
    };
    expect(manifest.segments).toHaveLength(2);
    manifest.segments.forEach((segment) => {
      expect(new FakeFile(`/cache/images/${segment.fileName}`).exists).toBe(
        true,
      );
    });
  });

  test("keeps the valid old generation when a replacement member move fails", async () => {
    const cache = new FileSystemBinaryCache("images", {
      maxBytes: 1_000_000,
      maxEntries: 10,
      maxAgeMs: 60_000,
      maxEntryBytes: 100_000,
    });
    stageResponse("old");
    const oldUri = await cache.downloadFile(
      "page",
      "https://example.test/p.png",
      "image/png",
      {
        maxBytes: 100_000,
        allowLongStripSegments: true,
      },
    );
    stageResponse("new");
    failMoveDestination = /-01\.png$/;
    await expect(
      cache.downloadFile("page", "https://example.test/p.png", "image/png", {
        maxBytes: 100_000,
        allowLongStripSegments: true,
      }),
    ).rejects.toThrow("injected move failure");
    expect(await cache.getUri("page")).toBe(oldUri);
    expect(new FakeFile(oldUri).exists).toBe(true);
  });

  test("rejects a replacement instead of quota-evicting a retained reader generation", async () => {
    const cache = new FileSystemBinaryCache("images", {
      maxBytes: 600,
      maxEntries: 10,
      maxAgeMs: 60_000,
      maxEntryBytes: 600,
    });
    stageResponse("retained");
    const oldUri = await cache.downloadFile(
      "page",
      "https://example.test/p.png",
      "image/png",
      {
        maxBytes: 600,
        allowLongStripSegments: true,
      },
    );
    const release = cache.retainSegmentedImageManifest(oldUri);
    stageResponse("replacement");
    await expect(
      cache.downloadFile("page", "https://example.test/p.png", "image/png", {
        maxBytes: 600,
        allowLongStripSegments: true,
      }),
    ).rejects.toThrow("active reader");
    expect(await cache.getUri("page")).toBe(oldUri);
    expect(new FakeFile(oldUri).exists).toBe(true);
    release();
  });

  test("repairs missing members and startup-sweeps uncommitted members", async () => {
    stageResponse("repair");
    const cache = new FileSystemBinaryCache("images", {
      maxBytes: 1_000_000,
      maxEntries: 10,
      maxAgeMs: 60_000,
      maxEntryBytes: 100_000,
    });
    const uri = await cache.downloadFile(
      "page",
      "https://example.test/p.png",
      "image/png",
      {
        maxBytes: 100_000,
        allowLongStripSegments: true,
      },
    );
    const manifest = JSON.parse(new FakeFile(uri).textSync()) as {
      segments: Array<{ fileName: string }>;
    };
    new FakeFile(`/cache/images/${manifest.segments[0]!.fileName}`).delete();
    expect(await cache.getUri("page")).toBeNull();
    expect(new FakeFile(uri).exists).toBe(false);

    const orphan = new FakeFile(
      "/cache/images/orphan.segment-v1-00000000m1-000000-0000000001-00.png",
    );
    orphan.write(new Uint8Array([1]));
    const restarted = new FileSystemBinaryCache("images", {
      maxBytes: 1_000_000,
      maxEntries: 10,
      maxAgeMs: 60_000,
      maxEntryBytes: 100_000,
    });
    await restarted.getUri("unrelated");
    expect(orphan.exists).toBe(false);
  });

  test("bounds a corrupt 4,096-file startup sweep to one-pass indexes", async () => {
    directories.add("/cache/images");
    const generation = "00000000m1-000000-0000000001";
    for (let group = 0; group < 512; group += 1) {
      const key = `corrupt-${group.toString().padStart(3, "0")}`;
      new FakeFile(`/cache/images/${key}.segments-v1-${generation}.json`).write(
        "{}",
      );
      for (let member = 0; member < 7; member += 1) {
        new FakeFile(
          `/cache/images/${key}.segment-v1-${generation}-${member
            .toString()
            .padStart(2, "0")}.png`,
        ).write(new Uint8Array([member]));
      }
    }
    expect(files.size).toBe(4_096);
    const cache = new FileSystemBinaryCache("images", {
      maxBytes: 10_000_000,
      maxEntries: 1_000,
      maxAgeMs: 60_000,
      maxEntryBytes: 100_000,
    });
    const startedAt = performance.now();
    expect(await cache.getUri("unrelated")).toBeNull();
    const elapsedMs = performance.now() - startedAt;
    expect(files.size).toBe(0);
    expect(directoryListCalls).toBeLessThanOrEqual(4);
    expect(elapsedMs).toBeLessThan(1_000);
  });
});

const plainPolicy = {
  maxBytes: 1_000_000,
  maxEntries: 10,
  // Far beyond any fixture timestamp: these cases exercise ordering, not age.
  maxAgeMs: 10_000_000_000_000,
  maxEntryBytes: 100_000,
};

function writePlainFile(name: string, modifiedAt: number, size = 4) {
  const file = new FakeFile(`/cache/images/${name}`);
  file.write(new Uint8Array(size).fill(1));
  files.get(file.path)!.modifiedAt = modifiedAt;
  return file;
}

describe("native cache file name index", () => {
  beforeEach(() => {
    files.clear();
    directories.clear();
    directories.add("/cache");
    failMoveDestination = null;
    directoryListCalls = 0;
    existenceChecks = 0;
  });

  test("serves a cached file without probing every extension", async () => {
    directories.add("/cache/images");
    // `wav` is last in the extension probe order, so the old linear scan cost
    // one `exists` call per known extension on every single hit.
    writePlainFile("cover.wav", 1_000);
    const cache = new FileSystemBinaryCache("images", plainPolicy);

    expect(await cache.getUri("cover")).toBe("file:///cache/images/cover.wav");
    existenceChecks = 0;
    expect(await cache.getUri("cover")).toBe("file:///cache/images/cover.wav");

    expect(existenceChecks).toBeLessThanOrEqual(2);
  });

  test("tracks writes and removals in the name index", async () => {
    const cache = new FileSystemBinaryCache("images", plainPolicy);
    await cache.setBytes("cover", new Uint8Array([1, 2, 3]), "image/png");

    existenceChecks = 0;
    expect(await cache.getUri("cover")).toBe("file:///cache/images/cover.png");
    expect(existenceChecks).toBeLessThanOrEqual(2);

    await cache.remove("cover");
    expect(await cache.getUri("cover")).toBeNull();
  });

  test("re-indexes a name whose file disappeared underneath it", async () => {
    const cache = new FileSystemBinaryCache("images", plainPolicy);
    await cache.setBytes("cover", new Uint8Array([1, 2, 3]), "image/png");
    files.delete("/cache/images/cover.png");

    expect(await cache.getUri("cover")).toBeNull();
  });
});

describe("native cache read recency", () => {
  beforeEach(() => {
    files.clear();
    directories.clear();
    directories.add("/cache");
    failMoveDestination = null;
    directoryListCalls = 0;
    existenceChecks = 0;
  });

  test("persists a read hit and protects it from write-age eviction", async () => {
    directories.add("/cache/images");
    writePlainFile("old.jpg", 1_000);
    writePlainFile("new.jpg", 2_000);

    const first = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxEntries: 2,
    });
    expect(await first.getUri("old")).toBe("file:///cache/images/old.jpg");
    // The sidecar is flushed on the next index pass, not on the read itself.
    await first.getStats();
    expect(files.has("/cache/images/nemu-access-index.json")).toBe(true);

    const second = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxEntries: 1,
    });
    await second.getStats();

    expect(files.has("/cache/images/old.jpg")).toBe(true);
    expect(files.has("/cache/images/new.jpg")).toBe(false);
  });

  test("evicts by write time when nothing has been read", async () => {
    directories.add("/cache/images");
    writePlainFile("old.jpg", 1_000);
    writePlainFile("new.jpg", 2_000);

    const cache = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxEntries: 1,
    });
    await cache.getStats();

    expect(files.has("/cache/images/old.jpg")).toBe(false);
    expect(files.has("/cache/images/new.jpg")).toBe(true);
  });

  test("trims an oversized recency sidecar instead of losing it wholesale", async () => {
    // Sidecar names are encoded URLs. Without a write cap the file outgrows
    // ACCESS_INDEX_MAX_BYTES and the next load deletes it, dropping every
    // recorded read hit at once.
    const ACCESS_INDEX_MAX_BYTES = 512 * 1024;
    directories.add("/cache/images");
    const keys = Array.from(
      { length: 200 },
      (_, index) => `k${String(index).padStart(4, "0")}${"x".repeat(3_000)}`,
    );
    for (const key of keys) writePlainFile(`${key}.jpg`, 1_000);

    const cache = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxBytes: 100_000_000,
      maxEntries: 10_000,
    });
    await cache.getStats();
    for (const key of keys) {
      expect(await cache.getUri(key)).toBe(`file:///cache/images/${key}.jpg`);
    }
    await cache.getStats();

    const sidecar = files.get("/cache/images/nemu-access-index.json");
    expect(sidecar).toBeDefined();
    // Untrimmed this would be ~600 KB.
    expect(sidecar!.bytes.byteLength).toBeLessThanOrEqual(
      ACCESS_INDEX_MAX_BYTES,
    );
    const persisted = JSON.parse(
      new TextDecoder().decode(sidecar!.bytes),
    ) as { access: Record<string, number> };
    expect(Object.keys(persisted.access).length).toBeGreaterThan(0);
    expect(Object.keys(persisted.access).length).toBeLessThan(keys.length);

    // The next process still finds a usable sidecar rather than deleting it.
    const reopened = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxBytes: 100_000_000,
      maxEntries: 10_000,
    });
    await reopened.getStats();
    expect(files.has("/cache/images/nemu-access-index.json")).toBe(true);
  });

  test("caps the persisted recency map at the policy entry limit", async () => {
    directories.add("/cache/images");
    const keys = Array.from({ length: 6 }, (_, index) => `cover-${index}`);
    for (const [index, key] of keys.entries()) {
      writePlainFile(`${key}.jpg`, 1_000 + index);
    }

    const cache = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxEntries: 10_000,
    });
    await cache.getStats();
    for (const key of keys) await cache.getUri(key);
    await cache.getStats();

    const persisted = JSON.parse(
      new TextDecoder().decode(
        files.get("/cache/images/nemu-access-index.json")!.bytes,
      ),
    ) as { access: Record<string, number> };
    expect(Object.keys(persisted.access).sort()).toEqual(
      keys.map((key) => `${key}.jpg`).sort(),
    );
  });

  test("keeps the recency sidecar out of the cache entry budget", async () => {
    directories.add("/cache/images");
    writePlainFile("cover.jpg", 1_000);
    const cache = new FileSystemBinaryCache("images", {
      ...plainPolicy,
      maxEntries: 1,
    });

    expect(await cache.getUri("cover")).toBe("file:///cache/images/cover.jpg");
    const stats = await cache.getStats();

    expect(files.has("/cache/images/nemu-access-index.json")).toBe(true);
    expect(stats.entries).toBe(1);
    expect(files.has("/cache/images/cover.jpg")).toBe(true);
  });
});
