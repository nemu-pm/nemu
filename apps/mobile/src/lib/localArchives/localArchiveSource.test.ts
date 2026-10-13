import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createLocalArchiveExecutorSource, LOCAL_ARCHIVE_INSTALLED_SOURCE } from "./executorSource";
import { setLocalArchiveLanguage } from "./language";
import { indexBackedStorage, importLocalArchive, type ArchiveFs } from "./importArchive";
import { createLocalArchiveProvider } from "./provider";
import { deleteWorkVolumes, registerImportedArchive, volumeAvailability, type LocalArchiveDeviceFile, type LocalArchiveVolume } from "./library";
import { localArchiveRelativeUri, resolveLocalArchiveUri } from "./uris";
import { reconcileLocalArchiveVolumes, applyLocalArchiveVolumeSync } from "./syncVolumes";
import { volumeIdForContentHash } from "./hash";

const HASH = "cd".repeat(32);
const VID = volumeIdForContentHash(HASH);

function memoryFs(root = "file:///containerA/Documents/") {
  const state = {
    root,
    index: { volumes: [] as LocalArchiveVolume[], files: [] as LocalArchiveDeviceFile[] },
    removed: [] as string[],
  };
  const fs = {
    readIndex: async () => ({ volumes: [...state.index.volumes], files: [...state.index.files] }),
    writeIndex: async (next: typeof state.index) => void (state.index = { volumes: [...next.volumes], files: [...next.files] }),
    listPageNames: () => ["000001.jpg", "000002.png"],
    rootUri: () => state.root,
    removeVolumeFiles: async (id: string) => void state.removed.push(id),
  } as unknown as ArchiveFs;
  return { fs, state };
}

const volume = (over: Partial<LocalArchiveVolume> = {}): LocalArchiveVolume => ({
  volumeId: VID,
  workId: "work-1",
  title: "Vol 1",
  contentHash: HASH,
  pageCount: 2,
  importedAt: 10,
  updatedAt: 10,
  ...over,
});

describe("persisted references are relative to the documents directory", () => {
  test("a reference and an index written under one container resolve under another", async () => {
    const a = memoryFs("file:///containerA/Documents/");
    a.state.index.volumes = [volume()];
    a.state.index.files = [{ volumeId: VID, pageCount: 2, importedAt: 10 }];
    const cover = localArchiveRelativeUri(VID, "000001.jpg");
    const serialised = JSON.stringify({ index: a.state.index, cover });
    expect(serialised).not.toContain("containerA");

    // The app is updated / restored: same persisted bytes, new container path.
    const b = memoryFs("file:///containerB/Documents");
    b.state.index = JSON.parse(serialised).index;
    expect(resolveLocalArchiveUri(JSON.parse(serialised).cover, b.fs.rootUri())).toBe(
      `file:///containerB/Documents/local-archives/${VID}/pages/000001.jpg`,
    );
    const source = createLocalArchiveExecutorSource({ fs: b.fs, language: () => "en" });
    const pages = await source.getPageList({ key: "work-1" }, { key: VID });
    expect(pages.map((p) => p.localUri)).toEqual([
      `file:///containerB/Documents/local-archives/${VID}/pages/000001.jpg`,
      `file:///containerB/Documents/local-archives/${VID}/pages/000002.png`,
    ]);
  });

  test("only strict volume/page references resolve", () => {
    for (const bad of ["nemu-local://v-1/../../x.jpg", "nemu-local://v-" + "a".repeat(32) + "/x.jpg", "file:///etc/passwd", "nemu-local://v-" + "a".repeat(32) + "/000001.jpg/.."]) {
      expect(resolveLocalArchiveUri(bad, "file:///r/")).toBeNull();
    }
  });
});

describe("the local-archive source", () => {
  test("lists a work's volumes as chapters and opens them through localUri pages", async () => {
    const { fs, state } = memoryFs();
    state.index.volumes = [volume(), volume({ volumeId: `v-${"e".repeat(32)}`, title: "Vol 2", importedAt: 20, updatedAt: 20 })];
    state.index.files = [{ volumeId: VID, pageCount: 2, importedAt: 10 }, { volumeId: `v-${"e".repeat(32)}`, pageCount: 2, importedAt: 20 }];
    const source = createLocalArchiveExecutorSource({ fs, language: () => "en" });
    expect((await source.getChapterList({ key: "work-1" })).map((c) => c.title)).toEqual(["Vol 2", "Vol 1"]);
    const details = await source.getMangaDetails({ key: "work-1" });
    expect(details.title).toBe("Vol 1");
    expect(details.cover).toBe(`nemu-local://${VID}/000001.jpg`);
    expect((await source.getPageList({ key: "work-1" }, { key: VID }))[0]).toMatchObject({ index: 0, id: `${VID}:1` });
  });

  test("a volume known from sync but not imported here says so and cannot be opened", async () => {
    const { fs, state } = memoryFs();
    state.index.volumes = [volume()];
    const zh = createLocalArchiveExecutorSource({ fs, language: () => "zh" });
    expect((await zh.getChapterList({ key: "work-1" }))[0]!.scanlator).toBe("此设备尚未导入文件");
    await expect(zh.getPageList({ key: "work-1" }, { key: VID })).rejects.toThrow("此设备尚未导入文件");
  });
});

describe("sync", () => {
  test("only metadata is synced; the device mapping and files stay local", () => {
    const plan = reconcileLocalArchiveVolumes([volume()], []);
    expect(plan.push).toHaveLength(1);
    expect(Object.keys(plan.push[0]!).sort()).toEqual(["contentHash", "importedAt", "pageCount", "title", "updatedAt", "volumeId", "workId"]);
  });

  test("a new device receives the volume, shows it missing, and importing the identical file re-links it", async () => {
    const a = memoryFs();
    const b = memoryFs("file:///deviceB/Documents/");
    // Device A imported it.
    await registerImportedArchive(indexBackedStorage(a.fs), { contentHash: HASH, title: "Vol 1", pageCount: 2, now: 10, newWorkId: () => "work-1" });
    const pushed = (await applyLocalArchiveVolumeSync(a.fs, [])).push;
    expect(pushed).toHaveLength(1);
    // Device B pulls the cloud list.
    const pulled = await applyLocalArchiveVolumeSync(b.fs, pushed.map((v) => ({ ...v })));
    expect(pulled.changed).toBe(true);
    expect(volumeAvailability(VID, b.state.index.files)).toBe("missing-file");
    // B imports a file with the same content hash.
    const outcome = await registerImportedArchive(indexBackedStorage(b.fs), { contentHash: HASH, title: "renamed", pageCount: 2, now: 50, newWorkId: () => "different" });
    expect(outcome.kind).toBe("relinked");
    expect(outcome.volume.workId).toBe("work-1");
    expect(b.state.index.volumes).toHaveLength(1);
    expect(volumeAvailability(VID, b.state.index.files)).toBe("available");
  });

  test("a delete on another device removes this device's files too", async () => {
    const a = memoryFs();
    a.state.index.volumes = [volume()];
    a.state.index.files = [{ volumeId: VID, pageCount: 2, importedAt: 10 }];
    const result = await applyLocalArchiveVolumeSync(a.fs, [
      { volumeId: VID, workId: "", title: "", contentHash: "", pageCount: 0, importedAt: 0, updatedAt: 99, removed: true },
    ]);
    expect(result.changed).toBe(true);
    expect(a.state.removed).toEqual([VID]);
    expect(a.state.index.files).toEqual([]);
    expect(a.state.index.volumes[0]).toMatchObject({ removed: true });
  });
});

describe("installed source display name", () => {
  test("is localised at display time while identity stays fixed", async () => {
    const { fs, state } = memoryFs();
    state.index.volumes = [volume()];
    state.index.files = [{ volumeId: VID, pageCount: 2, importedAt: 10 }];
    const provider = createLocalArchiveProvider(fs, () => {}, () => 100);
    for (const [lang, name] of [["zh", "本地漫画"], ["ja", "ローカル漫画"], ["en", "Local comics"]] as const) {
      setLocalArchiveLanguage(lang);
      const source = await provider.getInstalledSource();
      expect(source?.name).toBe(name);
      expect(source?.id).toBe(LOCAL_ARCHIVE_INSTALLED_SOURCE.id);
      expect(source?.registryId).toBe(LOCAL_ARCHIVE_INSTALLED_SOURCE.registryId);
    }
    expect(LOCAL_ARCHIVE_INSTALLED_SOURCE.name).toBe("Local archive");
    setLocalArchiveLanguage("en");
  });
});

describe("delete", () => {
  test("removing a work deletes its files and tombstones its volumes", async () => {
    const { fs, state } = memoryFs();
    state.index.volumes = [volume()];
    state.index.files = [{ volumeId: VID, pageCount: 2, importedAt: 10 }];
    const pushed: LocalArchiveVolume[] = [];
    const provider = createLocalArchiveProvider(fs, (v) => void pushed.push(v), () => 100);
    expect(await provider.getInstalledSource()).not.toBeNull();
    await provider.deleteWork("work-1");
    expect(state.removed).toEqual([VID]);
    expect(state.index.files).toEqual([]);
    expect(pushed[0]).toMatchObject({ volumeId: VID, removed: true, updatedAt: 100 });
    // With nothing left the source disappears from the app's view.
    expect(await provider.getInstalledSource()).toBeNull();
  });

  test("deleteWorkVolumes leaves other works alone", async () => {
    const { fs, state } = memoryFs();
    const other = volume({ volumeId: `v-${"f".repeat(32)}`, workId: "work-2" });
    state.index.volumes = [volume(), other];
    const tombstones = await deleteWorkVolumes(indexBackedStorage(fs), "work-1", async () => {}, 5);
    expect(tombstones.map((t) => t.volumeId)).toEqual([VID]);
    expect(state.index.volumes.find((v) => v.workId === "work-2")!.removed).toBeUndefined();
  });
});

describe("clearing the cache never touches imported books", () => {
  const read = (file: string) => Bun.file(path.join(import.meta.dir, file)).text();

  test("books live under the documents directory, not any cache directory", async () => {
    const fsSource = await read("fileSystem.ts");
    expect(fsSource).toContain("Paths.document");
    expect(fsSource).not.toContain("Paths.cache");
  });

  test("no cache-clear step list mentions local archives", async () => {
    for (const file of ["../../data/mobileHooks.ts", "../../data/mobileDeviceDataClear.ts", "../../data/mobileCacheClear.ts"]) {
      const text = await read(file);
      const start = text.indexOf("runMobileCacheClearSteps([");
      if (start < 0) continue;
      const list = text.slice(start, text.indexOf("]);", start));
      expect(list.toLowerCase()).not.toContain("localarchive");
      expect(list.toLowerCase()).not.toContain("local-archive");
    }
  });
});

describe("import creates the library entry that points at the source", () => {
  test("a library item and link use the local-archive identity", async () => {
    const { fs } = memoryFs();
    const zip = (await import("fflate")).zipSync({ "1.jpg": new Uint8Array(8).fill(1) }, { level: 0 });
    const items: unknown[] = [];
    const links: Array<{ registryId: string; sourceMangaId: string }> = [];
    (fs as { readChunks: ArchiveFs["readChunks"] }).readChunks = async function* () {
      yield zip;
    };
    (fs as { openWorkspace: ArchiveFs["openWorkspace"] }).openWorkspace = async () => ({
      writeArchive: async () => {},
      sink: { begin() {}, write() {}, end() {}, finalize() {}, abort() {} },
      commit: async () => "moved",
      discard: async () => {},
    });
    const result = await importLocalArchive({
      uri: "u",
      fileName: "Book.cbz",
      fs,
      store: { saveLibraryItem: async (i) => void items.push(i), saveSourceLink: async (l) => void links.push(l) },
      now: 5,
      newId: () => "w9",
    });
    expect(result.kind).toBe("created");
    expect(links[0]).toMatchObject({ registryId: "local-archive", sourceMangaId: "w9" });
  });
});
