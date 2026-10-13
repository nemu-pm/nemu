import { beforeEach, describe, expect, mock, test } from "bun:test";
import { zipSync } from "fflate";

/**
 * An in-memory expo-file-system with the SDK's real sync/async split: `create`,
 * `delete`, `list` and `open` are synchronous; `move`, `write`, `text` and the
 * handle's `readBytes` / `writeBytes` resolve on a later tick, as the native
 * AsyncFunctions do. An unawaited move or write therefore loses data here
 * exactly as it does on a device.
 */
const files = new Map<string, Uint8Array>();
const directories = new Set<string>();
const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const pathOf = (value: unknown): string =>
  value instanceof FakeFile || value instanceof FakeDirectory
    ? value.path
    : String(value).replace(/^file:\/\//, "").replace(/\/+$/, "");
const join = (parts: unknown[]) => parts.map(pathOf).join("/");

class FakeHandle {
  private offset = 0;
  constructor(private readonly path: string) {}
  async readBytes(length: number) {
    await later();
    const bytes = files.get(this.path) ?? new Uint8Array(0);
    const chunk = bytes.slice(this.offset, this.offset + length);
    this.offset += chunk.length;
    return chunk;
  }
  async writeBytes(chunk: Uint8Array) {
    await later();
    const current = files.get(this.path);
    if (!current) throw new Error(`write to a missing file: ${this.path}`);
    const next = new Uint8Array(current.length + chunk.length);
    next.set(current);
    next.set(chunk, current.length);
    files.set(this.path, next);
  }
  close() {}
}

class FakeFile {
  path: string;
  constructor(...parts: unknown[]) {
    this.path = join(parts);
  }
  get uri() {
    return `file://${this.path}`;
  }
  get name() {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
  get exists() {
    return files.has(this.path);
  }
  create() {
    files.set(this.path, new Uint8Array(0));
  }
  open() {
    return new FakeHandle(this.path);
  }
  async write(content: string) {
    await later();
    files.set(this.path, new TextEncoder().encode(content));
  }
  async text() {
    return new TextDecoder().decode(files.get(this.path) ?? new Uint8Array(0));
  }
  async move(destination: FakeFile) {
    await later();
    const bytes = files.get(this.path);
    if (!bytes || !directories.has(destination.path.slice(0, destination.path.lastIndexOf("/")))) {
      throw new Error(`"${this.name}" couldn't be moved: the source or the destination folder is gone`);
    }
    files.delete(this.path);
    files.set(destination.path, bytes);
    this.path = destination.path;
  }
}

class FakeDirectory {
  path: string;
  constructor(...parts: unknown[]) {
    this.path = join(parts);
  }
  get uri() {
    return `file://${this.path}/`;
  }
  get exists() {
    return directories.has(this.path);
  }
  create() {
    directories.add(this.path);
  }
  list() {
    const prefix = `${this.path}/`;
    const direct = (path: string) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/");
    return [
      ...[...directories].filter(direct).map((path) => new FakeDirectory(path)),
      ...[...files.keys()].filter(direct).map((path) => new FakeFile(path)),
    ];
  }
  delete() {
    const prefix = `${this.path}/`;
    for (const path of [...files.keys()]) if (path.startsWith(prefix)) files.delete(path);
    for (const path of [...directories]) if (path.startsWith(prefix)) directories.delete(path);
    directories.delete(this.path);
  }
  async move(destination: FakeDirectory) {
    await later();
    if (!directories.has(this.path)) throw new Error("source directory is gone");
    const rename = (path: string) => destination.path + path.slice(this.path.length);
    for (const path of [...files.keys()]) {
      if (!path.startsWith(`${this.path}/`)) continue;
      files.set(rename(path), files.get(path)!);
      files.delete(path);
    }
    for (const path of [...directories]) {
      if (path !== this.path && !path.startsWith(`${this.path}/`)) continue;
      directories.delete(path);
      directories.add(rename(path));
    }
    this.path = destination.path;
  }
}

mock.module("expo-file-system", () => ({
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { document: new FakeDirectory("/docs") },
}));

const { deviceArchiveFs } = await import("./fileSystem");
const { importLocalArchive } = await import("./importArchive");

/** A distinct, recognisable body per page so order is checked by content. */
const page = (n: number) => new Uint8Array(32 + n).fill(n);

async function importZip(entries: Record<string, Uint8Array>) {
  files.set("/picked/book.cbz", zipSync(entries, { level: 0 }));
  const result = await importLocalArchive({
    uri: "file:///picked/book.cbz",
    fileName: "book.cbz",
    fs: deviceArchiveFs,
    store: { saveLibraryItem: async () => {}, saveSourceLink: async () => {} },
    now: 1,
    newId: () => "work-1",
  });
  const names = deviceArchiveFs.listPageNames(result.volume.volumeId);
  const bodies = names.map((name) => files.get(`/docs/local-archives/${result.volume.volumeId}/pages/${name}`)?.[0]);
  return { result, names, bodies };
}

beforeEach(() => {
  files.clear();
  directories.clear();
  directories.add("/docs");
  directories.add("/picked");
});

describe("deviceArchiveFs import", () => {
  test("a 4-page CBZ keeps all 4 pages, in order", async () => {
    const { result, names, bodies } = await importZip({
      "001.jpg": page(1),
      "002.jpg": page(2),
      "003.jpg": page(3),
      "004.jpg": page(4),
    });
    expect(result.pageCount).toBe(4);
    expect(names).toEqual(["000001.jpg", "000002.jpg", "000003.jpg", "000004.jpg"]);
    expect(bodies).toEqual([1, 2, 3, 4]);
    // Nothing is left behind in staging.
    expect([...directories].some((path) => path.includes(".incoming-"))).toBe(false);
  });

  test("a nested folder with __MACOSX and AppleDouble decoys keeps exactly the 4 pages, in order", async () => {
    const { result, names, bodies } = await importZip({
      "__MACOSX/Vol 1/._001.jpg": new Uint8Array(8).fill(9),
      "__MACOSX/Vol 1/._002.jpg": new Uint8Array(8).fill(9),
      "Vol 1/._003.jpg": new Uint8Array(8).fill(9),
      "Vol 1/.DS_Store": new Uint8Array(8).fill(9),
      "Vol 1/004.jpg": page(4),
      "Vol 1/002.jpg": page(2),
      "Vol 1/003.jpg": page(3),
      "Vol 1/001.jpg": page(1),
      "Vol 1/notes.txt": new Uint8Array(8).fill(9),
    });
    expect(result.pageCount).toBe(4);
    expect(names).toEqual(["000001.jpg", "000002.jpg", "000003.jpg", "000004.jpg"]);
    expect(bodies).toEqual([1, 2, 3, 4]);
  });

  test("the index keeps both the volume and this device's file record", async () => {
    const { result } = await importZip({ "1.jpg": page(1), "2.jpg": page(2) });
    const index = await deviceArchiveFs.readIndex();
    expect(index.volumes.map((volume) => volume.volumeId)).toEqual([result.volume.volumeId]);
    expect(index.files.map((file) => file.volumeId)).toEqual([result.volume.volumeId]);
  });
});
