import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import type { LocalLibraryItem, LocalSourceLink } from "@/data/schema";
import { importLocalArchive, titleFromArchiveName, type ArchiveFs } from "./importArchive";
import type { LocalArchiveDeviceFile, LocalArchiveVolume } from "./library";

function fakeFs(archive: Uint8Array) {
  const index = { volumes: [] as LocalArchiveVolume[], files: [] as LocalArchiveDeviceFile[] };
  const state = { committed: [] as string[], discarded: 0, written: 0, present: new Set<string>() };
  const fs: ArchiveFs = {
    async *readChunks() {
      for (let i = 0; i < archive.length; i += 50) yield archive.subarray(i, i + 50);
    },
    async openWorkspace() {
      return {
        writeArchive: async (chunk) => void (state.written += chunk.length),
        sink: { begin() {}, write() {}, end() {}, finalize() {}, abort() {} },
        commit: async (id) => {
          if (state.present.has(id)) return "already-present";
          state.present.add(id);
          state.committed.push(id);
          return "moved";
        },
        discard: async () => void (state.discarded += 1),
      };
    },
    listPageNames: () => ["000001.jpg"],
    rootUri: () => "file:///containerA/Documents/",
    removeVolumeFiles: async () => {},
    readIndex: async () => ({ volumes: [...index.volumes], files: [...index.files] }),
    writeIndex: async (next) => {
      index.volumes = next.volumes;
      index.files = next.files;
    },
  };
  return { fs, index, state };
}

function fakeStore() {
  const items: LocalLibraryItem[] = [];
  const links: LocalSourceLink[] = [];
  return {
    items,
    links,
    store: {
      saveLibraryItem: async (item: LocalLibraryItem) => void items.push(item),
      saveSourceLink: async (link: LocalSourceLink) => void links.push(link),
    },
  };
}

const zip = zipSync({ "1.jpg": new Uint8Array(40).fill(1), "2.jpg": new Uint8Array(40).fill(2) }, { level: 0 });

describe("importLocalArchive", () => {
  test("creates a volume, a work and a library entry that point at the local archive source", async () => {
    const { fs, index, state } = fakeFs(zip);
    const { store, items, links } = fakeStore();
    const result = await importLocalArchive({ uri: "file:///x.cbz", fileName: "Vol 1.cbz", fs, store, now: 5, newId: () => "work-1" });
    expect(result).toMatchObject({ kind: "created", pageCount: 2, volume: { title: "Vol 1", workId: "work-1" } });
    expect(state.written).toBe(zip.length);
    expect(index.volumes).toHaveLength(1);
    expect(index.files).toHaveLength(1);
    expect(links[0]).toMatchObject({ registryId: "local-archive", sourceId: "local", sourceMangaId: "work-1" });
    expect(items[0]!.metadata.title).toBe("Vol 1");
    // Persisted relative to the documents directory, never an absolute container path.
    expect(items[0]!.metadata.cover).toMatch(/^nemu-local:\/\/v-[0-9a-f]{32}\/000001\.jpg$/);
    expect(JSON.stringify(items[0])).not.toContain("containerA");
    expect(JSON.stringify(index)).not.toContain("containerA");
  });

  test("importing the same file again re-links and adds nothing to the library", async () => {
    const { fs, index } = fakeFs(zip);
    const first = fakeStore();
    await importLocalArchive({ uri: "u", fileName: "a.cbz", fs, store: first.store, now: 1, newId: () => "w" });
    const second = fakeStore();
    const again = await importLocalArchive({ uri: "u", fileName: "b.cbz", fs, store: second.store, now: 2, newId: () => "other" });
    expect(again.kind).toBe("relinked");
    expect(second.items).toHaveLength(0);
    expect(index.volumes).toHaveLength(1);
  });

  test("a bad archive is discarded and nothing is registered", async () => {
    const { fs, index, state } = fakeFs(zipSync({ "../evil.jpg": new Uint8Array(4) }, { level: 0 }));
    const { store, items } = fakeStore();
    await expect(importLocalArchive({ uri: "u", fileName: "a.cbz", fs, store, now: 1, newId: () => "w" })).rejects.toMatchObject({ code: "unsafe-path" });
    expect(state.discarded).toBe(1);
    expect(index.volumes).toHaveLength(0);
    expect(items).toHaveLength(0);
  });

  test("titles drop the archive extension", () => {
    expect(titleFromArchiveName("My Book.CBZ")).toBe("My Book");
    expect(titleFromArchiveName(".zip")).toBe(".zip");
  });
});
