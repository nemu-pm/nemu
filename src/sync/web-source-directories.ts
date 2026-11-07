/**
 * Web side of source-directory sync (`settings.sourceDirectories`).
 *
 * The web keeps its directories in the IndexedDB `registries` store. This
 * brings them together with the account's list using the shared rules in
 * `@nemu/core/sources` (LWW per directory, matched by id or normalised index
 * URL, tombstones), then recovers directories for installed sources that have
 * none here. Built-in directories never sync; a synced copy of one is absorbed.
 */
import type { ConvexReactClient } from "convex/react";
import {
  mergeCloudSourceDirectories,
  planSourceDirectoryBackfill,
  planSourceDirectoryReconcile,
  type CloudSourceDirectory,
  type LocalSourceDirectoryRow,
} from "@nemu/core/sources";
import { api } from "../../convex/_generated/api";
import type { InstalledSource, SourceRegistry } from "@/data/schema";
import { WEB_BUILT_IN_SOURCE_DIRECTORIES } from "@/lib/sources/registry";

type UrlRegistry = Extract<SourceRegistry, { type: "url" }>;

export type WebSourceDirectoryStore = {
  getRegistries(): Promise<SourceRegistry[]>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
};

/** Collapses the per-row arrays of a settings snapshot (absent on old rows). */
export function canonicalCloudSourceDirectories(
  rows: readonly { sourceDirectories?: readonly CloudSourceDirectory[] }[],
): CloudSourceDirectory[] {
  return mergeCloudSourceDirectories(
    [],
    rows.flatMap((row) => row.sourceDirectories ?? []),
  ).records;
}

export function webSourceDirectoryRows(
  registries: readonly SourceRegistry[],
): LocalSourceDirectoryRow[] {
  const builtIns: LocalSourceDirectoryRow[] = WEB_BUILT_IN_SOURCE_DIRECTORIES.map(
    (def) => ({ ...def, enabled: true, builtIn: true }),
  );
  const builtInIds = new Set(builtIns.map((row) => row.id));
  const stored = registries.flatMap((registry): LocalSourceDirectoryRow[] => {
    if (registry.type !== "url" || builtInIds.has(registry.id)) return [];
    return [
      {
        id: registry.id,
        name: registry.name,
        indexUrl: registry.url,
        enabled: registry.disabled !== true,
        updatedAt: registry.updatedAt,
        addedAt: registry.addedAt,
        ...(registry.removed ? { removed: true } : {}),
      },
    ];
  });
  return [...builtIns, ...stored];
}

export type WebSourceDirectoryPlan = {
  save: UrlRegistry[];
  push: CloudSourceDirectory[];
};

/** Pure planning step of `syncWebSourceDirectories`. */
export function planWebSourceDirectorySync({
  registries,
  cloud,
  installedSources,
  now,
}: {
  registries: readonly SourceRegistry[];
  cloud: readonly CloudSourceDirectory[];
  installedSources: readonly InstalledSource[];
  now: number;
}): WebSourceDirectoryPlan {
  const byId = new Map(registries.map((registry) => [registry.id, registry]));
  const plan = planSourceDirectoryReconcile(
    webSourceDirectoryRows(registries),
    cloud,
  );
  const save: UrlRegistry[] = [];
  for (const { localId, remote } of plan.save) {
    const previous = byId.get(localId);
    const row = previous?.type === "url" ? previous : undefined;
    save.push({
      id: localId,
      name: remote.name,
      type: "url",
      url: remote.indexUrl,
      ...(remote.enabled ? {} : { disabled: true }),
      addedAt: row && !row.removed ? (row.addedAt ?? remote.updatedAt) : remote.updatedAt,
      updatedAt: remote.updatedAt,
    });
  }
  for (const id of plan.removeIds) {
    const previous = byId.get(id);
    // Kept as a tombstone: sources installed from it still load.
    if (previous?.type === "url") save.push({ ...previous, removed: true });
  }
  const afterReconcile = new Map(registries.map((r) => [r.id, r] as const));
  for (const row of save) afterReconcile.set(row.id, row);
  const push = [...plan.push];
  for (const directory of planSourceDirectoryBackfill({
    installedSources,
    local: webSourceDirectoryRows([...afterReconcile.values()]),
    cloud,
  })) {
    const row: UrlRegistry = {
      id: directory.id,
      name: directory.name,
      type: "url",
      url: directory.indexUrl,
      addedAt: now,
      updatedAt: now,
    };
    save.push(row);
    push.push({
      id: row.id,
      name: row.name,
      indexUrl: row.url,
      enabled: true,
      updatedAt: now,
    });
  }
  return { save, push };
}

/**
 * Reconciles, backfills and pushes. Returns whether local rows changed (the
 * caller reloads the registry manager and the source list).
 */
export async function syncWebSourceDirectories({
  localStore,
  convex,
  cloud,
  installedSources,
  generation,
  expectedUserId,
  shouldContinue,
  now = Date.now,
}: {
  localStore: WebSourceDirectoryStore;
  convex: Pick<ConvexReactClient, "mutation">;
  cloud: readonly CloudSourceDirectory[];
  installedSources: readonly InstalledSource[];
  generation: number;
  expectedUserId: string;
  shouldContinue: () => boolean;
  now?: () => number;
}): Promise<{ changed: boolean }> {
  if (!shouldContinue()) return { changed: false };
  const plan = planWebSourceDirectorySync({
    registries: await localStore.getRegistries(),
    cloud,
    installedSources,
    now: now(),
  });
  for (const row of plan.save) {
    if (!shouldContinue()) return { changed: false };
    await localStore.saveRegistry(row);
  }
  for (const directory of plan.push) {
    if (!shouldContinue()) break;
    try {
      await convex.mutation(api.settings.saveSourceDirectory, {
        expectedUserId,
        directory,
        generation,
      });
    } catch (error) {
      console.warn("[sync] Could not push a source directory:", error);
    }
  }
  return { changed: plan.save.length > 0 };
}
