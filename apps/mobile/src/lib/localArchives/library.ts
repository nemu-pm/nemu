import type { AppLanguage, ChapterSummary } from "@/data/schema";
import { LOCAL_ARCHIVE_REGISTRY_ID, LOCAL_ARCHIVE_SOURCE_ID } from "./policy";
import { volumeIdForContentHash } from "./hash";

/** Synced (metadata only): a volume is a chapter of its work. */
export type LocalArchiveVolume = {
  volumeId: string;
  workId: string;
  title: string;
  contentHash: string;
  pageCount: number;
  importedAt: number;
  /** Sync clock of the last change; with `removed` it makes a delete a tombstone. */
  updatedAt: number;
  removed?: boolean;
};

/** Device-local only: whether this device holds the file for a volume. */
export type LocalArchiveDeviceFile = {
  volumeId: string;
  pageCount: number;
  importedAt: number;
};

export type LocalArchiveStorage = {
  getVolumes(): Promise<LocalArchiveVolume[]>;
  saveVolume(volume: LocalArchiveVolume): Promise<void>;
  getDeviceFiles(): Promise<LocalArchiveDeviceFile[]>;
  saveDeviceFile(file: LocalArchiveDeviceFile): Promise<void>;
  removeDeviceFile(volumeId: string): Promise<void>;
};

export type LocalArchiveAvailability = "available" | "missing-file";

export const LOCAL_ARCHIVE_MISSING_FILE_LABELS: Record<AppLanguage, string> = {
  en: "Not imported on this device",
  zh: "此设备尚未导入文件",
  ja: "このデバイスには読み込まれていません",
};

/** The source-link identity the existing sync/progress code already understands. */
export function localArchiveSourceLink(workId: string) {
  return {
    registryId: LOCAL_ARCHIVE_REGISTRY_ID,
    sourceId: LOCAL_ARCHIVE_SOURCE_ID,
    sourceMangaId: workId,
  };
}

export function isLocalArchiveSource(registryId: string): boolean {
  return registryId === LOCAL_ARCHIVE_REGISTRY_ID;
}

export function volumeAvailability(
  volumeId: string,
  deviceFiles: readonly LocalArchiveDeviceFile[],
): LocalArchiveAvailability {
  return deviceFiles.some((file) => file.volumeId === volumeId) ? "available" : "missing-file";
}

export function liveVolumes(volumes: readonly LocalArchiveVolume[]): LocalArchiveVolume[] {
  return volumes.filter((volume) => volume.removed !== true);
}

/** Chapters of one work, newest import first (the order the list expects). */
export function workChapters(
  workId: string,
  volumes: readonly LocalArchiveVolume[],
): ChapterSummary[] {
  return liveVolumes(volumes)
    .filter((volume) => volume.workId === workId)
    .sort((a, b) => b.importedAt - a.importedAt || a.title.localeCompare(b.title))
    .map((volume) => ({
      id: volume.volumeId,
      title: volume.title,
      dateUploaded: volume.importedAt,
    }));
}

export type ImportOutcome =
  | { kind: "created"; volume: LocalArchiveVolume }
  | { kind: "relinked"; volume: LocalArchiveVolume };

/**
 * Registers an imported file. An identical file (same content hash) that is
 * already known from sync, but missing on this device, re-links to the existing
 * volume and work instead of creating a duplicate. Importing a file this device
 * already has is idempotent.
 */
export async function registerImportedArchive(
  storage: LocalArchiveStorage,
  input: {
    contentHash: string;
    title: string;
    pageCount: number;
    now: number;
    newWorkId: () => string;
    /** Put the new volume into this existing work instead of a fresh one. */
    intoWorkId?: string;
  },
): Promise<ImportOutcome> {
  const volumeId = volumeIdForContentHash(input.contentHash);
  const volumes = await storage.getVolumes();
  const known = volumes.find((volume) => volume.volumeId === volumeId && volume.removed !== true);
  await storage.saveDeviceFile({ volumeId, pageCount: input.pageCount, importedAt: input.now });
  if (known) return { kind: "relinked", volume: known };
  const volume: LocalArchiveVolume = {
    volumeId,
    workId: input.intoWorkId ?? input.newWorkId(),
    title: input.title,
    contentHash: input.contentHash,
    pageCount: input.pageCount,
    importedAt: input.now,
    updatedAt: input.now,
  };
  await storage.saveVolume(volume);
  return { kind: "created", volume };
}

/** Manual grouping: move a volume into another work. */
export async function moveVolumeToWork(
  storage: LocalArchiveStorage,
  volumeId: string,
  workId: string,
  now: number,
): Promise<LocalArchiveVolume | null> {
  const volume = liveVolumes(await storage.getVolumes()).find((item) => item.volumeId === volumeId);
  if (!volume) return null;
  const moved = { ...volume, workId, updatedAt: Math.max(now, volume.updatedAt + 1) };
  await storage.saveVolume(moved);
  return moved;
}

/** Deleting the file keeps the synced volume (progress stays; it reads "missing-file"). */
export async function deleteImportedFile(
  storage: LocalArchiveStorage,
  volumeId: string,
  removeFiles: (volumeId: string) => Promise<void>,
): Promise<void> {
  await removeFiles(volumeId);
  await storage.removeDeviceFile(volumeId);
}

/**
 * Removing a work from the library: every volume is tombstoned (so other
 * devices drop it) and its files on this device are deleted. Returns the
 * tombstones to push.
 */
export async function deleteWorkVolumes(
  storage: LocalArchiveStorage,
  workId: string,
  removeFiles: (volumeId: string) => Promise<void>,
  now: number,
): Promise<LocalArchiveVolume[]> {
  const volumes = liveVolumes(await storage.getVolumes()).filter((volume) => volume.workId === workId);
  const tombstones: LocalArchiveVolume[] = [];
  for (const volume of volumes) {
    await deleteImportedFile(storage, volume.volumeId, removeFiles);
    const tombstone = { ...volume, removed: true, updatedAt: Math.max(now, volume.updatedAt + 1) };
    await storage.saveVolume(tombstone);
    tombstones.push(tombstone);
  }
  return tombstones;
}
