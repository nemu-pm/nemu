import type { CloudLocalArchiveVolume } from "@nemu/core/sources";
import type { LocalArchiveVolume } from "./library";

export function toCloudLocalArchiveVolume(volume: LocalArchiveVolume): CloudLocalArchiveVolume {
  return volume.removed
    ? {
        volumeId: volume.volumeId,
        workId: "",
        title: "",
        contentHash: "",
        pageCount: 0,
        importedAt: 0,
        updatedAt: volume.updatedAt,
        removed: true,
      }
    : {
        volumeId: volume.volumeId,
        workId: volume.workId,
        title: volume.title,
        contentHash: volume.contentHash,
        pageCount: volume.pageCount,
        importedAt: volume.importedAt,
        updatedAt: volume.updatedAt,
      };
}

export function fromCloudLocalArchiveVolume(volume: CloudLocalArchiveVolume): LocalArchiveVolume {
  return { ...volume };
}
