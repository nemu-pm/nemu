import {
  LEGACY_DEFAULT_SOURCE_DIRECTORIES,
  NEMU_RECOMMENDED_REGISTRY,
  NEMU_RECOMMENDED_REGISTRY_ID,
  SOURCE_DIRECTORY_MAX_COUNT,
  SOURCE_DIRECTORY_MAX_NAME_LENGTH,
  defaultSourceDirectoryName,
  normalizeSourceDirectoryUrl,
  sourceDirectoryIdForUrl,
  type SourceDirectory,
} from "@nemu/core/sources";
import {
  shouldApplyCloudSourceDirectory,
  type CloudSourceDirectory,
} from "@nemu/core/sources";
import type { InstalledSource, SourceRegistry } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import {
  fetchAidokuRegistryIndex,
  type AidokuRegistryIndex,
} from "@/sources/aidokuRegistry";
import { getMobileInstalledSourceRegistryKeys } from "@/lib/mobileInstalledSourceKeys";

export type { SourceDirectory };

export type MobileSourceDirectoryErrorCode =
  | "empty"
  | "invalid"
  | "not-https"
  | "credentials"
  | "too-long"
  | "local-host"
  | "duplicate"
  | "limit"
  | "unreachable"
  | "no-sources"
  | "built-in";

export class MobileSourceDirectoryError extends Error {
  readonly code: MobileSourceDirectoryErrorCode;

  constructor(code: MobileSourceDirectoryErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MobileSourceDirectoryError";
    this.code = code;
  }
}

type UrlRegistry = Extract<SourceRegistry, { type: "url" }>;

function isUrlRegistry(registry: SourceRegistry): registry is UrlRegistry {
  return registry.type === "url";
}

export function sourceDirectoryFromRegistry(
  registry: SourceRegistry,
): SourceDirectory | null {
  if (!isUrlRegistry(registry) || !registry.url) return null;
  return {
    id: registry.id,
    name: registry.name,
    indexUrl: registry.url,
    builtIn: registry.builtIn === true,
    enabled: registry.disabled !== true,
    addedAt: registry.addedAt ?? 0,
  };
}

export function registryFromSourceDirectory(
  directory: SourceDirectory,
): UrlRegistry {
  return {
    id: directory.id,
    name: directory.name,
    type: "url",
    url: directory.indexUrl,
    ...(directory.builtIn ? { builtIn: true } : {}),
    ...(directory.enabled ? {} : { disabled: true }),
    addedAt: directory.addedAt,
  };
}

function sortDirectories(directories: SourceDirectory[]): SourceDirectory[] {
  return [...directories].sort((a, b) => {
    if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
    if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export type SourceDirectorySeedPlan = {
  save: SourceRegistry[];
  removeIds: string[];
};

/**
 * First-launch plan for the directory list.
 *
 * - The nemu recommended directory is always present (built in).
 * - Aidoku Community / Aidoku ZH are no longer registered by default. A
 *   profile that installed a source from one keeps it as a user-added
 *   directory (same id, so the source keeps its update origin); a profile that
 *   never installed from it loses the stale row the old catalog loader wrote.
 */
export function planSourceDirectorySeed({
  registries,
  installedSources,
  seeded,
  now,
}: {
  registries: readonly SourceRegistry[];
  installedSources: readonly InstalledSource[];
  seeded: boolean;
  now: number;
}): SourceDirectorySeedPlan {
  const save: SourceRegistry[] = [];
  const removeIds: string[] = [];
  const existing = new Map(registries.map((entry) => [entry.id, entry]));

  const recommended = existing.get(NEMU_RECOMMENDED_REGISTRY_ID);
  if (!recommended || !isUrlRegistry(recommended) || !recommended.builtIn) {
    save.push({
      id: NEMU_RECOMMENDED_REGISTRY.id,
      name: NEMU_RECOMMENDED_REGISTRY.name,
      type: "url",
      url: NEMU_RECOMMENDED_REGISTRY.indexUrl,
      builtIn: true,
      ...(recommended && isUrlRegistry(recommended) && recommended.disabled
        ? { disabled: true }
        : {}),
      addedAt: now,
    });
  }

  if (!seeded) {
    const usedRegistryIds = new Set<string>();
    for (const source of installedSources) {
      if (source.removed) continue;
      for (const key of getMobileInstalledSourceRegistryKeys(source)) {
        const index = key.indexOf(":");
        if (index > 0) usedRegistryIds.add(key.slice(0, index));
      }
      if (source.registryId) usedRegistryIds.add(source.registryId);
    }
    for (const legacy of LEGACY_DEFAULT_SOURCE_DIRECTORIES) {
      const row = existing.get(legacy.id);
      if (usedRegistryIds.has(legacy.id)) {
        save.push({
          id: legacy.id,
          name: legacy.name,
          type: "url",
          url: legacy.indexUrl,
          addedAt: now,
        });
      } else if (row) {
        removeIds.push(legacy.id);
      }
    }
  }

  return { save, removeIds };
}

const seedRuns = new WeakMap<MobileDataStore, Promise<void>>();

async function ensureSourceDirectoriesSeeded(
  store: MobileDataStore,
  now: () => number,
): Promise<void> {
  const inflight = seedRuns.get(store);
  if (inflight) return inflight;
  const run = (async () => {
    const [registries, settings] = await Promise.all([
      store.getRegistries(),
      store.getSyncSettings(),
    ]);
    const plan = planSourceDirectorySeed({
      registries,
      installedSources: settings.installedSources,
      seeded: settings.sourceDirectoriesSeeded === true,
      now: now(),
    });
    for (const registry of plan.save) await store.saveRegistry(registry);
    for (const id of plan.removeIds) await store.removeRegistry(id);
    if (settings.sourceDirectoriesSeeded !== true) {
      await store.updateSettings((current) => ({
        ...current,
        sourceDirectoriesSeeded: true,
      }));
    }
  })().finally(() => {
    seedRuns.delete(store);
  });
  seedRuns.set(store, run);
  return run;
}

/** Every directory, seeded and migrated on first use. Built-in first. */
export async function loadMobileSourceDirectories(
  store: MobileDataStore,
  options: { now?: () => number } = {},
): Promise<SourceDirectory[]> {
  await ensureSourceDirectoriesSeeded(store, options.now ?? Date.now);
  const directories = (await store.getRegistries())
    .map(sourceDirectoryFromRegistry)
    .filter((entry): entry is SourceDirectory => entry !== null);
  return sortDirectories(directories);
}

export function enabledSourceDirectories(
  directories: readonly SourceDirectory[],
): SourceDirectory[] {
  return directories.filter((directory) => directory.enabled);
}

export async function addMobileSourceDirectory(
  store: MobileDataStore,
  input: { url: string; name?: string },
  options: {
    now?: () => number;
    fetchIndex?: (directory: {
      id: string;
      name: string;
      indexUrl: string;
    }) => Promise<AidokuRegistryIndex>;
    signal?: AbortSignal;
  } = {},
): Promise<SourceDirectory> {
  const normalized = normalizeSourceDirectoryUrl(input.url);
  if (!normalized.ok) throw new MobileSourceDirectoryError(normalized.reason);
  const id = sourceDirectoryIdForUrl(normalized.indexUrl);

  const existing = await loadMobileSourceDirectories(store, options);
  if (existing.some((directory) => directory.id === id)) {
    throw new MobileSourceDirectoryError("duplicate");
  }
  if (existing.length >= SOURCE_DIRECTORY_MAX_COUNT) {
    throw new MobileSourceDirectoryError("limit");
  }

  const typedName = input.name?.trim().slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  const probe = {
    id,
    name: typedName || defaultSourceDirectoryName(normalized.indexUrl),
    indexUrl: normalized.indexUrl,
  };
  // Only a URL that serves a readable index is worth keeping.
  let index: AidokuRegistryIndex;
  try {
    index = await (options.fetchIndex ?? ((directory) =>
      fetchAidokuRegistryIndex(directory, { signal: options.signal })))(probe);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new MobileSourceDirectoryError(
      "unreachable",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (index.sources.length === 0) {
    throw new MobileSourceDirectoryError("no-sources");
  }

  const directory: SourceDirectory = {
    id,
    name: typedName || index.name || probe.name,
    indexUrl: normalized.indexUrl,
    builtIn: false,
    enabled: true,
    addedAt: (options.now ?? Date.now)(),
  };
  await store.saveRegistry(registryFromSourceDirectory(directory));
  return directory;
}

export async function setMobileSourceDirectoryEnabled(
  store: MobileDataStore,
  id: string,
  enabled: boolean,
): Promise<void> {
  const registry = await store.getRegistry(id);
  const directory = registry ? sourceDirectoryFromRegistry(registry) : null;
  if (!directory) return;
  if (directory.enabled === enabled) return;
  await store.saveRegistry(
    registryFromSourceDirectory({ ...directory, enabled }),
  );
}

/**
 * Removing a directory only forgets the list entry. Installed sources, their
 * library links and reading history are untouched: they keep their
 * `registryId`, simply with no directory left to update them from. Adding the
 * same URL again restores updates (the id is derived from the URL).
 */
export async function removeMobileSourceDirectory(
  store: MobileDataStore,
  id: string,
): Promise<void> {
  const registry = await store.getRegistry(id);
  const directory = registry ? sourceDirectoryFromRegistry(registry) : null;
  if (!directory) return;
  if (directory.builtIn) throw new MobileSourceDirectoryError("built-in");
  await store.removeRegistry(id);
}

export function isMobileSourceAutoUpdateEnabled(settings: {
  autoUpdateSources?: boolean;
}): boolean {
  return settings.autoUpdateSources !== false;
}

export function toCloudSourceDirectory(
  registry: SourceRegistry,
): CloudSourceDirectory | null {
  if (registry.type !== "url" || registry.builtIn || !registry.url) return null;
  return {
    id: registry.id,
    name: registry.name,
    indexUrl: registry.url,
    enabled: registry.disabled !== true,
    updatedAt: registry.updatedAt ?? registry.addedAt ?? 0,
  };
}

export type SourceDirectoryReconcilePlan = {
  save: SourceRegistry[];
  removeIds: string[];
  /** Local user directories the cloud is missing or has an older copy of. */
  push: CloudSourceDirectory[];
};

/**
 * Reconciles the local directory rows with the cloud list: newer wins per id,
 * tombstones remove, cloud-only directories are added, and local-only (or
 * newer) ones are returned for pushing. Built-in rows never sync. Rows written
 * from the cloud carry its `updatedAt`, so the sync store does not echo them.
 */
export function reconcileSourceDirectories(
  local: readonly SourceRegistry[],
  cloud: readonly CloudSourceDirectory[],
): SourceDirectoryReconcilePlan {
  const plan: SourceDirectoryReconcilePlan = { save: [], removeIds: [], push: [] };
  const localById = new Map(local.map((row) => [row.id, row]));
  const cloudById = new Map(cloud.map((row) => [row.id, row]));
  for (const remote of cloud) {
    const row = localById.get(remote.id);
    const localClock =
      row?.type === "url" ? (row.updatedAt ?? row.addedAt ?? 0) : undefined;
    if (row && (row.type !== "url" || row.builtIn)) continue;
    if (remote.removed) {
      if (row && localClock !== undefined && remote.updatedAt >= localClock) {
        plan.removeIds.push(remote.id);
      }
      continue;
    }
    if (!row || shouldApplyCloudSourceDirectory(localClock, remote.updatedAt)) {
      plan.save.push({
        id: remote.id,
        name: remote.name,
        type: "url",
        url: remote.indexUrl,
        ...(remote.enabled ? {} : { disabled: true }),
        addedAt: row?.type === "url" ? row.addedAt : remote.updatedAt,
        updatedAt: remote.updatedAt,
      });
    }
  }
  for (const row of local) {
    const directory = toCloudSourceDirectory(row);
    if (!directory) continue;
    const remote = cloudById.get(row.id);
    if (!remote || directory.updatedAt > remote.updatedAt) {
      plan.push.push(directory);
    }
  }
  return plan;
}

export async function applySourceDirectoryReconcilePlan(
  store: MobileDataStore,
  plan: SourceDirectoryReconcilePlan,
): Promise<void> {
  for (const registry of plan.save) await store.saveRegistry(registry);
  for (const id of plan.removeIds) await store.removeRegistry(id);
}
