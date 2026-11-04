import type { InstalledSource } from "@/data/schema";
import { createLocalArchiveExecutorSource, localArchiveInstalledSource } from "./executorSource";
import { indexBackedStorage, type ArchiveFs } from "./importArchive";
import { getLocalArchiveLanguage } from "./language";
import { deleteWorkVolumes, liveVolumes, type LocalArchiveVolume } from "./library";
import type { LocalArchiveProvider } from "./registry";
import { applyLocalArchiveVolumeSync } from "./syncVolumes";

/**
 * Builds the provider the app registers. `onVolumeChanged` is how volume
 * changes (tombstones on delete) reach the sync layer.
 */
export function createLocalArchiveProvider(
  fs: ArchiveFs,
  onVolumeChanged: (volume: LocalArchiveVolume) => void,
  now: () => number = Date.now,
): LocalArchiveProvider {
  return {
    async getInstalledSource(): Promise<InstalledSource | null> {
      const { volumes } = await fs.readIndex();
      return liveVolumes(volumes).length > 0 ? localArchiveInstalledSource(getLocalArchiveLanguage()) : null;
    },
    createExecutorSource: () => createLocalArchiveExecutorSource({ fs, language: getLocalArchiveLanguage }),
    applyCloudVolumes: (cloud) => applyLocalArchiveVolumeSync(fs, cloud),
    async deleteWork(workId) {
      const tombstones = await deleteWorkVolumes(indexBackedStorage(fs), workId, (id) => fs.removeVolumeFiles(id), now());
      for (const tombstone of tombstones) onVolumeChanged(tombstone);
    },
  };
}
