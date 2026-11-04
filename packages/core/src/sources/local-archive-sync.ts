/**
 * Cloud shape and merge rules for imported-archive volumes (導入漫画).
 *
 * Only metadata syncs: the volume's stable id (content hash based), the work it
 * belongs to, title, page count and import time. The file itself and the
 * per-device "I have this file" mapping never leave the device. Rides on the
 * `settings` row as the optional `localArchiveVolumes` array, last-write-wins
 * per id with tombstones, like `sourceDirectories`.
 */

import { shouldApplyLww } from "../sync-lww";

export type CloudLocalArchiveVolume = {
  volumeId: string;
  workId: string;
  title: string;
  contentHash: string;
  pageCount: number;
  importedAt: number;
  updatedAt: number;
  removed?: boolean;
};

export const MAX_CLOUD_LOCAL_ARCHIVE_VOLUMES = 4_000;

export function isValidCloudLocalArchiveVolume(
  record: CloudLocalArchiveVolume,
): boolean {
  if (!/^v-[0-9a-f]{32}$/.test(record.volumeId)) return false;
  if (record.removed === true) return true;
  return (
    record.workId.length > 0 &&
    record.workId.length <= 128 &&
    record.title.length <= 512 &&
    /^[0-9a-f]{64}$/.test(record.contentHash) &&
    Number.isInteger(record.pageCount) &&
    record.pageCount >= 0
  );
}

export function mergeCloudLocalArchiveVolumes(
  existing: readonly CloudLocalArchiveVolume[],
  incoming: readonly CloudLocalArchiveVolume[],
): { records: CloudLocalArchiveVolume[]; accepted: boolean } {
  const byId = new Map<string, CloudLocalArchiveVolume>();
  for (const record of existing) {
    const current = byId.get(record.volumeId);
    if (!current || shouldApplyLww(current.updatedAt, record.updatedAt)) {
      byId.set(record.volumeId, record);
    }
  }
  let accepted = false;
  for (const record of incoming) {
    if (!isValidCloudLocalArchiveVolume(record)) continue;
    const current = byId.get(record.volumeId);
    if (current && !shouldApplyLww(current.updatedAt, record.updatedAt)) continue;
    if (record.removed !== true) {
      const live = [...byId.values()].filter((r) => !r.removed && r.volumeId !== record.volumeId);
      if (live.length >= MAX_CLOUD_LOCAL_ARCHIVE_VOLUMES) continue;
    }
    byId.set(
      record.volumeId,
      record.removed === true
        ? { volumeId: record.volumeId, workId: "", title: "", contentHash: "", pageCount: 0, importedAt: 0, updatedAt: record.updatedAt, removed: true }
        : record,
    );
    accepted = true;
  }
  return { records: [...byId.values()], accepted };
}
