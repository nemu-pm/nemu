import type { LocalLibraryItem, LocalSourceLink } from "@/data/schema";
import { makeSourceLinkId } from "@nemu/core";
import { extractArchivePages, type ArchivePageSink } from "./extract";
import { BlockedSha256 } from "./hash";
import {
  registerImportedArchive,
  type LocalArchiveDeviceFile,
  type LocalArchiveStorage,
  type LocalArchiveVolume,
} from "./library";
import { LOCAL_ARCHIVE_REGISTRY_ID, LOCAL_ARCHIVE_SOURCE_ID } from "./policy";
import { localArchiveRelativeUri } from "./uris";

/** A staging directory the importer fills before the volume gets its final id. */
export type ArchiveWorkspace = {
  writeArchive(chunk: Uint8Array): Promise<void>;
  sink: ArchivePageSink;
  /** Moves the workspace to the volume's directory; "already-present" when this device has it. */
  commit(volumeId: string): Promise<"moved" | "already-present">;
  discard(): Promise<void>;
};

/** File I/O of the importer. The device implementation lives in `fileSystem.ts`. */
export type ArchiveFs = {
  readChunks(uri: string): AsyncIterable<Uint8Array>;
  openWorkspace(): Promise<ArchiveWorkspace>;
  /** Page file names (`000001.jpg`, ...) in reading order. */
  listPageNames(volumeId: string): string[];
  /** `file://` URI of the documents directory in the *current* container. */
  rootUri(): string;
  removeVolumeFiles(volumeId: string): Promise<void>;
  readIndex(): Promise<{ volumes: LocalArchiveVolume[]; files: LocalArchiveDeviceFile[] }>;
  writeIndex(index: { volumes: LocalArchiveVolume[]; files: LocalArchiveDeviceFile[] }): Promise<void>;
};

/** The slice of the data store the importer writes to. */
export type ArchiveLibraryStore = {
  saveLibraryItem(item: LocalLibraryItem): Promise<void>;
  saveSourceLink(link: LocalSourceLink): Promise<void>;
};

export function indexBackedStorage(fs: ArchiveFs): LocalArchiveStorage {
  const update = async (change: (index: Awaited<ReturnType<ArchiveFs["readIndex"]>>) => void) => {
    const index = await fs.readIndex();
    change(index);
    await fs.writeIndex(index);
  };
  return {
    getVolumes: async () => (await fs.readIndex()).volumes,
    saveVolume: (volume) =>
      update((index) => {
        index.volumes = [...index.volumes.filter((v) => v.volumeId !== volume.volumeId), volume];
      }),
    getDeviceFiles: async () => (await fs.readIndex()).files,
    saveDeviceFile: (file) =>
      update((index) => {
        index.files = [...index.files.filter((f) => f.volumeId !== file.volumeId), file];
      }),
    removeDeviceFile: (id) =>
      update((index) => {
        index.files = index.files.filter((f) => f.volumeId !== id);
      }),
  };
}

/** `Vol 1.cbz` -> `Vol 1`. */
export function titleFromArchiveName(name: string): string {
  const base = name.replace(/\.(cbz|zip)$/i, "").trim();
  return base || name;
}

export type ImportLocalArchiveResult = {
  kind: "created" | "relinked";
  volume: LocalArchiveVolume;
  pageCount: number;
};

/**
 * Imports one CBZ/ZIP: streams it into a staging directory while hashing it,
 * extracts the pages, then registers the volume (a new work, or the existing
 * one when an identical file is already known) and, for a new work, adds it to
 * the library as a `local-archive` source link.
 */
export async function importLocalArchive(options: {
  uri: string;
  fileName: string;
  fs: ArchiveFs;
  store: ArchiveLibraryStore;
  now: number;
  newId: () => string;
  signal?: AbortSignal;
}): Promise<ImportLocalArchiveResult> {
  const { fs } = options;
  const workspace = await fs.openWorkspace();
  const hash = new BlockedSha256();
  try {
    async function* chunks(): AsyncIterable<Uint8Array> {
      for await (const chunk of fs.readChunks(options.uri)) {
        hash.update(chunk);
        await workspace.writeArchive(chunk);
        yield chunk;
      }
    }
    const extracted = await extractArchivePages({
      chunks: chunks(),
      sink: workspace.sink,
      signal: options.signal,
    });
    const contentHash = hash.digestHex();
    const storage = indexBackedStorage(fs);
    const volumeId = `v-${contentHash.slice(0, 32)}`;
    await workspace.commit(volumeId);
    const outcome = await registerImportedArchive(storage, {
      contentHash,
      title: titleFromArchiveName(options.fileName),
      pageCount: extracted.pages.length,
      now: options.now,
      newWorkId: options.newId,
    });
    if (outcome.kind === "created") {
      const workId = outcome.volume.workId;
      const sourceLinkId = makeSourceLinkId(LOCAL_ARCHIVE_REGISTRY_ID, LOCAL_ARCHIVE_SOURCE_ID, workId);
      const libraryItemId = `source:${sourceLinkId}`;
      const firstPage = fs.listPageNames(volumeId)[0];
      // Persisted relative to the documents directory; resolved at display time.
      const cover = firstPage ? localArchiveRelativeUri(volumeId, firstPage) : undefined;
      await options.store.saveLibraryItem({
        libraryItemId,
        metadata: { title: outcome.volume.title, ...(cover ? { cover } : {}) },
        inLibrary: true,
        sourceOrder: [sourceLinkId],
        createdAt: options.now,
        updatedAt: options.now,
      });
      await options.store.saveSourceLink({
        id: sourceLinkId,
        libraryItemId,
        registryId: LOCAL_ARCHIVE_REGISTRY_ID,
        sourceId: LOCAL_ARCHIVE_SOURCE_ID,
        sourceMangaId: workId,
        createdAt: options.now,
        updatedAt: options.now,
      });
    }
    return { kind: outcome.kind, volume: outcome.volume, pageCount: extracted.pages.length };
  } catch (error) {
    await workspace.discard().catch(() => undefined);
    throw error;
  }
}
