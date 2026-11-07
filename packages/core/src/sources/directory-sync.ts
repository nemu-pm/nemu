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
import {
  LEGACY_DEFAULT_SOURCE_DIRECTORIES,
  NEMU_RECOMMENDED_REGISTRY,
  defaultSourceDirectoryName,
  normalizeSourceDirectoryUrl,
  sourceDirectoryIdForUrl,
  type AidokuRegistryDefinition,
} from "./registries";

export type CloudSourceDirectory = {
  /** Initially derived from the URL; retained when that URL is edited. */
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

/**
 * Comparison key for a directory address: the canonical index URL (what
 * `normalizeSourceDirectoryUrl` stores), else the trimmed input. Two rows with
 * the same key are the same directory whatever their ids.
 */
export function sourceDirectoryUrlKey(indexUrl: string): string {
  const normalized = normalizeSourceDirectoryUrl(indexUrl);
  return normalized.ok ? normalized.indexUrl : indexUrl.trim();
}

/** A platform's directory row, reduced to what reconciling needs. */
export type LocalSourceDirectoryRow = {
  id: string;
  name: string;
  indexUrl: string;
  enabled: boolean;
  /** Sync clock; a row never stamped falls back to `addedAt`, then 0. */
  updatedAt?: number;
  addedAt?: number;
  /** Shipped with the app: never synced, but a cloud copy of it is no new row. */
  builtIn?: boolean;
  /** A local removal not yet known to the cloud (web keeps these rows). */
  removed?: boolean;
};

export type SourceDirectoryReconcile = {
  /** Cloud state to write locally, under the local row's id when one matched. */
  save: Array<{ localId: string; remote: CloudSourceDirectory }>;
  /** Local rows a newer cloud tombstone removed. */
  removeIds: string[];
  /** Local state the cloud lacks or has an older copy of, under the cloud's id. */
  push: CloudSourceDirectory[];
};

function localClock(row: LocalSourceDirectoryRow): number {
  return row.updatedAt ?? row.addedAt ?? 0;
}

/**
 * Plans bringing a local directory list and the cloud list together.
 *
 * A local row matches the cloud record with its id, else the live record with
 * the same normalised index URL, so one directory added on two devices under
 * different ids stays one entry: the local row keeps its id (installed sources
 * reference it) and pushes go to the cloud's id. Newer wins per match;
 * tombstones remove; unmatched cloud records become new rows; unmatched local
 * rows are pushed. Built-in rows only absorb cloud copies of themselves.
 */
export function planSourceDirectoryReconcile(
  local: readonly LocalSourceDirectoryRow[],
  cloud: readonly CloudSourceDirectory[],
): SourceDirectoryReconcile {
  const plan: SourceDirectoryReconcile = { save: [], removeIds: [], push: [] };
  const byId = new Map(cloud.map((record) => [record.id, record]));
  const liveByUrl = new Map<string, CloudSourceDirectory>();
  for (const record of cloud) {
    if (record.removed === true) continue;
    const key = sourceDirectoryUrlKey(record.indexUrl);
    const current = liveByUrl.get(key);
    if (!current || record.updatedAt > current.updatedAt) liveByUrl.set(key, record);
  }
  const claimed = new Set<string>();
  const pushed = new Set<string>();
  const push = (record: CloudSourceDirectory) => {
    // The server drops what it would reject; pushing it again every sync is waste.
    if (pushed.has(record.id) || !isValidCloudSourceDirectory(record)) return;
    pushed.add(record.id);
    plan.push.push(compactCloudSourceDirectory(record));
  };

  for (const row of local) {
    const idMatch = byId.get(row.id);
    const urlMatch = row.indexUrl
      ? liveByUrl.get(sourceDirectoryUrlKey(row.indexUrl))
      : undefined;
    const remote = idMatch && idMatch.removed !== true ? idMatch : (urlMatch ?? idMatch);
    if (remote) claimed.add(remote.id);
    if (row.builtIn) continue;
    const clock = localClock(row);
    const asCloud = (id: string): CloudSourceDirectory => ({
      id,
      name: row.name,
      indexUrl: row.indexUrl,
      enabled: row.enabled,
      updatedAt: clock,
      ...(row.removed ? { removed: true } : {}),
    });
    if (!remote) {
      push(asCloud(row.id));
      continue;
    }
    if (remote.removed === true) {
      if (remote.updatedAt >= clock) {
        if (!row.removed) plan.removeIds.push(row.id);
      } else {
        push(asCloud(remote.id));
      }
      continue;
    }
    if (remote.updatedAt > clock) {
      plan.save.push({ localId: row.id, remote });
    } else if (clock > remote.updatedAt) {
      push(asCloud(remote.id));
    }
  }

  const localIds = new Set(local.map((row) => row.id));
  const localUrls = new Set(
    local.filter((row) => row.indexUrl).map((row) => sourceDirectoryUrlKey(row.indexUrl)),
  );
  // Several cloud ids for one URL collapse to the newest; a local row may hold
  // that URL or one of the other ids.
  for (const [key, record] of liveByUrl) {
    if (claimed.has(record.id) || localIds.has(record.id) || localUrls.has(key)) continue;
    plan.save.push({ localId: record.id, remote: record });
  }
  return plan;
}

/** What an installed-source record says about where it came from. */
export type InstalledSourceOrigin = {
  id?: string;
  registryId?: string;
  downloadUrl?: string;
  sourceKind?: string;
  removed?: boolean;
};

const KNOWN_SOURCE_DIRECTORIES: readonly AidokuRegistryDefinition[] = [
  NEMU_RECOMMENDED_REGISTRY,
  ...LEGACY_DEFAULT_SOURCE_DIRECTORIES,
];

function installedSourceRegistryId(source: InstalledSourceOrigin): string | null {
  if (source.registryId) return source.registryId;
  const index = source.id?.indexOf(":") ?? -1;
  return index > 0 ? source.id!.slice(0, index) : null;
}

/**
 * The directory an installed source was installed from, when the record alone
 * proves it: a shipped or legacy directory by id, or a user directory whose id
 * (a hash of its index URL) is reproduced by an `index(.min).json` beside one
 * of the package's parent folders. Never guesses: an id that no candidate
 * reproduces yields null.
 */
export function deriveSourceDirectoryFromInstalledSource(
  source: InstalledSourceOrigin,
): AidokuRegistryDefinition | null {
  const registryId = installedSourceRegistryId(source);
  if (!registryId) return null;
  const known = KNOWN_SOURCE_DIRECTORIES.find((entry) => entry.id === registryId);
  if (known) return { ...known };
  if (!source.downloadUrl) return null;
  let url: URL;
  try {
    url = new URL(source.downloadUrl);
  } catch {
    return null;
  }
  url.search = "";
  url.hash = "";
  const segments = url.pathname.split("/");
  // Drop the file name, then try each parent folder, nearest first.
  for (let depth = segments.length - 1; depth >= 1 && depth >= segments.length - 5; depth--) {
    const folder = segments.slice(0, depth).join("/");
    for (const file of ["index.min.json", "index.json"]) {
      url.pathname = `${folder}/${file}`;
      const normalized = normalizeSourceDirectoryUrl(url.toString());
      if (!normalized.ok) continue;
      if (sourceDirectoryIdForUrl(normalized.indexUrl) === registryId) {
        return {
          id: registryId,
          name: defaultSourceDirectoryName(normalized.indexUrl),
          indexUrl: normalized.indexUrl,
        };
      }
    }
  }
  return null;
}

/**
 * Directories to recreate for installed sources whose directory this device
 * lacks. Skips sources with a directory already (by id), directories the
 * account removed (a cloud tombstone), live cloud records (the reconcile adds
 * those), Tachiyomi sources, and anything not derivable.
 */
export function planSourceDirectoryBackfill({
  installedSources,
  local,
  cloud,
}: {
  installedSources: readonly InstalledSourceOrigin[];
  local: readonly Pick<LocalSourceDirectoryRow, "id" | "indexUrl" | "removed">[];
  cloud: readonly CloudSourceDirectory[];
}): AidokuRegistryDefinition[] {
  const knownIds = new Set(local.map((row) => row.id));
  const knownUrls = new Set(
    local.filter((row) => row.indexUrl).map((row) => sourceDirectoryUrlKey(row.indexUrl)),
  );
  for (const record of cloud) knownIds.add(record.id);
  const out: AidokuRegistryDefinition[] = [];
  for (const source of installedSources) {
    if (source.removed === true || source.sourceKind === "tachiyomi") continue;
    const registryId = installedSourceRegistryId(source);
    if (!registryId || knownIds.has(registryId)) continue;
    const directory = deriveSourceDirectoryFromInstalledSource(source);
    if (!directory) continue;
    knownIds.add(directory.id);
    const key = sourceDirectoryUrlKey(directory.indexUrl);
    if (knownUrls.has(key)) continue;
    knownUrls.add(key);
    out.push(directory);
  }
  return out;
}
