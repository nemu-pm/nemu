import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { classifyArchiveEntry, compareNaturalPaths } from "./entries";
import { extractArchivePages, type ArchivePageSink } from "./extract";
import { BlockedSha256, LOCAL_ARCHIVE_HASH_BLOCK_BYTES, volumeIdForContentHash } from "./hash";
import {
  deleteImportedFile,
  moveVolumeToWork,
  registerImportedArchive,
  volumeAvailability,
  workChapters,
  type LocalArchiveDeviceFile,
  type LocalArchiveStorage,
  type LocalArchiveVolume,
} from "./library";
import { LOCAL_ARCHIVE_LIMITS, LocalArchiveError, type LocalArchiveLimits, assertNotLocalArchivePath } from "./policy";

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

async function* chunked(data: Uint8Array, size = 64): AsyncIterable<Uint8Array> {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

function memorySink() {
  const files = new Map<number, number>();
  const events: string[] = [];
  let order: number[] = [];
  const sink: ArchivePageSink = {
    begin: (id) => void files.set(id, 0),
    write: (id, chunk) => void files.set(id, (files.get(id) ?? 0) + chunk.length),
    end: (id) => void events.push(`end:${id}`),
    finalize: (ids) => void (order = ids),
    abort: () => void events.push("abort"),
  };
  return { sink, files, events, order: () => order };
}

const zipOf = (entries: Record<string, Uint8Array>) => zipSync(entries, { level: 0 });

describe("classifyArchiveEntry", () => {
  test("keeps image pages, skips hidden and junk files", () => {
    expect(classifyArchiveEntry("ch1/001.JPG")).toEqual({ kind: "page", name: "ch1/001.JPG", extension: "jpg" });
    for (const name of [".hidden.jpg", "a/.DS_Store", "__MACOSX/a.jpg", "a/Thumbs.db", "notes.txt", "a/", "a/.cache/1.png"]) {
      expect(classifyArchiveEntry(name)).toEqual({ kind: "skip" });
    }
  });
  test("rejects traversal and unsafe names", () => {
    for (const name of ["../a.jpg", "a/../../b.jpg", "/etc/a.jpg", "C:/a.jpg", "a\\b.jpg", "a\u0000.jpg", "x".repeat(600) + ".jpg"]) {
      expect(() => classifyArchiveEntry(name)).toThrow(LocalArchiveError);
    }
  });
});

describe("natural order", () => {
  test("numbers compare as numbers, case-insensitively", () => {
    const sorted = ["10.jpg", "2.jpg", "1.jpg", "B/1.jpg", "a/10.jpg", "a/9.jpg", "A/2.jpg"].sort(compareNaturalPaths);
    expect(sorted).toEqual(["1.jpg", "2.jpg", "10.jpg", "A/2.jpg", "a/9.jpg", "a/10.jpg", "B/1.jpg"]);
  });
});

describe("extractArchivePages", () => {
  test("streams pages in natural order, ignoring hidden files", async () => {
    const zip = zipOf({
      "10.jpg": bytes(30),
      "2.jpg": bytes(20),
      "1.png": bytes(10),
      ".hidden.jpg": bytes(5),
      "__MACOSX/1.jpg": bytes(5),
      "readme.txt": bytes(5),
    });
    const { sink, files, order } = memorySink();
    const result = await extractArchivePages({ chunks: chunked(zip), sink });
    expect(result.pages.map((p) => p.name)).toEqual(["1.png", "2.jpg", "10.jpg"]);
    expect(result.totalBytes).toBe(60);
    expect(order()).toEqual(result.pages.map((p) => p.entryId));
    expect([...files.values()].sort((a, b) => a - b)).toEqual([10, 20, 30]);
  });

  test("traversal aborts the import and cleans up", async () => {
    const zip = zipOf({ "1.jpg": bytes(10), "../evil.jpg": bytes(10) });
    const { sink, events } = memorySink();
    await expect(extractArchivePages({ chunks: chunked(zip), sink })).rejects.toMatchObject({ code: "unsafe-path" });
    expect(events).toContain("abort");
  });

  test("an archive with no pages is rejected", async () => {
    const { sink } = memorySink();
    await expect(extractArchivePages({ chunks: chunked(zipOf({ "a.txt": bytes(3) })), sink })).rejects.toMatchObject({ code: "no-pages" });
  });

  test("limits: entries, pages, page size, total size, archive size", async () => {
    const small: LocalArchiveLimits = { ...LOCAL_ARCHIVE_LIMITS };
    const zip = zipOf({ "1.jpg": bytes(100), "2.jpg": bytes(100), "3.jpg": bytes(100) });
    const run = (limits: typeof small) => extractArchivePages({ chunks: chunked(zip), sink: memorySink().sink, limits });
    await expect(run({ ...small, maxEntries: 2 })).rejects.toMatchObject({ code: "too-many-entries" });
    await expect(run({ ...small, maxPages: 2 })).rejects.toMatchObject({ code: "too-many-pages" });
    await expect(run({ ...small, maxPageBytes: 50 })).rejects.toMatchObject({ code: "page-too-large" });
    await expect(run({ ...small, maxTotalUncompressedBytes: 250 })).rejects.toMatchObject({ code: "total-too-large" });
    await expect(run({ ...small, maxArchiveBytes: 100 })).rejects.toMatchObject({ code: "archive-too-large" });
  });

  test("a zip bomb (highly compressible page) trips the ratio limit without buffering it", async () => {
    const bomb = zipSync({ "1.jpg": bytes(8 * 1024 * 1024, 0) }, { level: 9 });
    const { sink, files } = memorySink();
    await expect(
      extractArchivePages({ chunks: chunked(bomb, 1024), sink }),
    ).rejects.toMatchObject({ code: "compression-ratio" });
    expect((files.get(0) ?? 0) < 8 * 1024 * 1024).toBe(true);
  });

  test("honours abort", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractArchivePages({ chunks: chunked(zipOf({ "1.jpg": bytes(10) })), sink: memorySink().sink, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("BlockedSha256", () => {
  test("is chunking independent and defined by the block construction", () => {
    const data = new Uint8Array(LOCAL_ARCHIVE_HASH_BLOCK_BYTES * 2 + 123).map((_, i) => i % 251);
    const a = new BlockedSha256();
    a.update(data);
    const b = new BlockedSha256();
    for (let i = 0; i < data.length; i += 777_777) b.update(data.subarray(i, i + 777_777));
    expect(b.digestHex()).toBe(a.digestHex());
    const blocks = [0, 1, 2].map((i) =>
      createHash("sha256").update(data.subarray(i * LOCAL_ARCHIVE_HASH_BLOCK_BYTES, (i + 1) * LOCAL_ARCHIVE_HASH_BLOCK_BYTES)).digest(),
    );
    expect(a.digestHex()).toBe(createHash("sha256").update(Buffer.concat(blocks)).digest("hex"));
    const other = new BlockedSha256();
    other.update(data.subarray(1));
    expect(other.digestHex()).not.toBe(a.digestHex());
    expect(volumeIdForContentHash(a.digestHex())).toMatch(/^v-[0-9a-f]{32}$/);
  });
});

function memoryStorage(): LocalArchiveStorage & { volumes: Map<string, LocalArchiveVolume>; files: Map<string, LocalArchiveDeviceFile> } {
  const volumes = new Map<string, LocalArchiveVolume>();
  const files = new Map<string, LocalArchiveDeviceFile>();
  return {
    volumes,
    files,
    getVolumes: async () => [...volumes.values()],
    saveVolume: async (v) => void volumes.set(v.volumeId, v),
    getDeviceFiles: async () => [...files.values()],
    saveDeviceFile: async (f) => void files.set(f.volumeId, f),
    removeDeviceFile: async (id) => void files.delete(id),
  };
}

describe("library and sync model", () => {
  const hash = "ab".repeat(32);
  test("one archive is one volume in a new work", async () => {
    const storage = memoryStorage();
    const out = await registerImportedArchive(storage, { contentHash: hash, title: "Vol 1", pageCount: 12, now: 100, newWorkId: () => "work-1" });
    expect(out.kind).toBe("created");
    expect(out.volume).toMatchObject({ workId: "work-1", volumeId: volumeIdForContentHash(hash) });
    expect(volumeAvailability(out.volume.volumeId, await storage.getDeviceFiles())).toBe("available");
  });

  test("an identical file on a device that only knew the synced volume re-links", async () => {
    const storage = memoryStorage();
    const id = volumeIdForContentHash(hash);
    storage.volumes.set(id, { volumeId: id, workId: "synced-work", title: "Vol 1", contentHash: hash, pageCount: 12, importedAt: 1, updatedAt: 1 });
    expect(volumeAvailability(id, await storage.getDeviceFiles())).toBe("missing-file");
    const out = await registerImportedArchive(storage, { contentHash: hash, title: "other name", pageCount: 12, now: 200, newWorkId: () => "new" });
    expect(out.kind).toBe("relinked");
    expect(out.volume.workId).toBe("synced-work");
    expect(storage.volumes.size).toBe(1);
    expect(volumeAvailability(id, await storage.getDeviceFiles())).toBe("available");
  });

  test("manual grouping moves a volume into another work; chapters list newest first", async () => {
    const storage = memoryStorage();
    const a = await registerImportedArchive(storage, { contentHash: "a".repeat(64), title: "A", pageCount: 1, now: 1, newWorkId: () => "w1" });
    const b = await registerImportedArchive(storage, { contentHash: "b".repeat(64), title: "B", pageCount: 1, now: 2, newWorkId: () => "w2" });
    expect(await moveVolumeToWork(storage, b.volume.volumeId, "w1", 10)).toMatchObject({ workId: "w1" });
    expect(await moveVolumeToWork(storage, "missing", "w1", 10)).toBeNull();
    expect(workChapters("w1", await storage.getVolumes()).map((c) => c.title)).toEqual(["B", "A"]);
    expect(a.volume.workId).toBe("w1");
  });

  test("deleting the file keeps the synced volume, reading as missing", async () => {
    const storage = memoryStorage();
    const out = await registerImportedArchive(storage, { contentHash: hash, title: "V", pageCount: 3, now: 1, newWorkId: () => "w" });
    const removed: string[] = [];
    await deleteImportedFile(storage, out.volume.volumeId, async (id) => void removed.push(id));
    expect(removed).toEqual([out.volume.volumeId]);
    expect(storage.volumes.size).toBe(1);
    expect(volumeAvailability(out.volume.volumeId, await storage.getDeviceFiles())).toBe("missing-file");
  });

  test("cache clearing refuses archive paths", () => {
    expect(() => assertNotLocalArchivePath("file:///docs/local-archives/v-1")).toThrow();
    expect(() => assertNotLocalArchivePath("file:///caches/images")).not.toThrow();
  });
});
