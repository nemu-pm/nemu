/**
 * Cloud shape and merge rules for the user's source-directory list.
 *
 * The list rides on the existing `settings` row as the optional
 * `sourceDirectories` array (no new table). A row written by an older client
 * simply lacks the field, and an older client ignores it, so both directions
 * stay compatible. Records are last-write-wins per id, removals are
 * tombstones, exactly like installed sources.
 */

import { shouldApplyLww } from "../sync-lww";
import { normalizeSourceDirectoryUrl } from "./registries";

export type CloudSourceDirectory = {
  /** Deterministic id (`dir-…`, or a former built-in id such as `aidoku-zh`). */
  id: string;
  name: string;
  indexUrl: string;
  enabled: boolean;
  updatedAt: number;
  removed?: boolean;
};

export const MAX_CLOUD_SOURCE_DIRECTORIES = 64;

export function isValidCloudSourceDirectory(
  record: CloudSourceDirectory,
): boolean {
  if (!record.id || record.id.length > 64) return false;
  if (record.name.length > 120) return false;
  if (record.removed === true) return true;
  const url = normalizeSourceDirectoryUrl(record.indexUrl);
  return url.ok && url.indexUrl === record.indexUrl;
}

/** Tombstones keep only what is needed to win a later comparison. */
export function compactCloudSourceDirectory(
  record: CloudSourceDirectory,
): CloudSourceDirectory {
  return record.removed === true
    ? { id: record.id, name: "", indexUrl: "", enabled: false, updatedAt: record.updatedAt, removed: true }
    : record;
}

/**
 * LWW merge by id. Invalid incoming records are dropped (never throws, so one
 * bad client cannot wedge settings sync), and the live count is capped.
 */
export function mergeCloudSourceDirectories(
  existing: readonly CloudSourceDirectory[],
  incoming: readonly CloudSourceDirectory[],
): { records: CloudSourceDirectory[]; accepted: boolean } {
  const byId = new Map<string, CloudSourceDirectory>();
  for (const record of existing) {
    const current = byId.get(record.id);
    if (!current || shouldApplyLww(current.updatedAt, record.updatedAt)) {
      byId.set(record.id, record);
    }
  }
  let accepted = false;
  for (const record of incoming) {
    if (!isValidCloudSourceDirectory(record)) continue;
    const current = byId.get(record.id);
    if (current && !shouldApplyLww(current.updatedAt, record.updatedAt)) continue;
    const live = [...byId.values()].filter((r) => !r.removed && r.id !== record.id);
    if (record.removed !== true && live.length >= MAX_CLOUD_SOURCE_DIRECTORIES) continue;
    byId.set(record.id, compactCloudSourceDirectory(record));
    accepted = true;
  }
  return { records: [...byId.values()], accepted };
}

/** Whether a cloud record newer than the local clock should replace the local row. */
export function shouldApplyCloudSourceDirectory(
  localUpdatedAt: number | undefined,
  cloudUpdatedAt: number,
): boolean {
  return localUpdatedAt === undefined || cloudUpdatedAt > localUpdatedAt;
}
