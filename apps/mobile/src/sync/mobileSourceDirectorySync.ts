import type { ConvexReactClient } from "convex/react";
import {
  mergeCloudLocalArchiveVolumes,
  mergeCloudSourceDirectories,
  type CloudLocalArchiveVolume,
  type CloudSourceDirectory,
} from "@nemu/core/sources";
import { toCloudLocalArchiveVolume } from "@/lib/localArchives/cloud";
import { getLocalArchiveProvider } from "@/lib/localArchives/registry";
import { api } from "../../../../convex/_generated/api";
import {
  applySourceDirectoryReconcilePlan,
  loadMobileSourceDirectories,
  reconcileSourceDirectories,
} from "@/data/mobileSourceDirectories";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import type { MobileDataStore } from "@/data/storeTypes";

type DirectorySyncClient = Pick<ConvexReactClient, "mutation">;

/** Collapses the per-row arrays of a settings snapshot (absent on old rows). */
export function canonicalCloudSourceDirectories(
  rows: readonly { sourceDirectories?: readonly CloudSourceDirectory[] }[],
): CloudSourceDirectory[] {
  return mergeCloudSourceDirectories(
    [],
    rows.flatMap((row) => row.sourceDirectories ?? []),
  ).records;
}

/**
 * Brings the local directory list and the cloud list together. Runs before
 * synced source packages are hydrated so a restored source can resolve its
 * catalog entry through a directory the user added on another device.
 */
export async function syncMobileSourceDirectories({
  store,
  convex,
  cloud,
  generation,
  expectedUserId,
  shouldContinue,
}: {
  store: MobileDataStore;
  convex: DirectorySyncClient;
  cloud: readonly CloudSourceDirectory[];
  generation: number;
  expectedUserId?: string;
  shouldContinue: () => boolean;
}): Promise<{ changed: boolean }> {
  // Seeds the recommended directory and migrates the legacy ones first, so a
  // migrated directory is part of what gets pushed.
  await loadMobileSourceDirectories(store);
  if (!shouldContinue()) return { changed: false };
  const plan = reconcileSourceDirectories(await store.getRegistries(), cloud);
  if (!shouldContinue()) return { changed: false };
  await applySourceDirectoryReconcilePlan(store, plan);
  for (const directory of plan.push) {
    if (!shouldContinue()) break;
    try {
      await convex.mutation(api.settings.saveSourceDirectory, {
        expectedUserId,
        directory,
        generation,
      });
    } catch (error) {
      console.warn("[MobileSync] Could not push source directory:", error);
    }
  }
  const changed = plan.save.length > 0 || plan.removeIds.length > 0;
  if (changed) emitMobileDataChanged("registries");
  return { changed };
}

/** Same step for imported-archive volume metadata (never the files). */
export async function syncMobileLocalArchiveVolumes({
  convex,
  cloud,
  generation,
  expectedUserId,
  shouldContinue,
}: {
  convex: DirectorySyncClient;
  cloud: readonly CloudLocalArchiveVolume[];
  generation: number;
  expectedUserId?: string;
  shouldContinue: () => boolean;
}): Promise<{ changed: boolean }> {
  const provider = getLocalArchiveProvider();
  if (!provider || !shouldContinue()) return { changed: false };
  const { push, changed } = await provider.applyCloudVolumes(cloud);
  for (const volume of push) {
    if (!shouldContinue()) break;
    try {
      await convex.mutation(api.settings.saveLocalArchiveVolume, {
        expectedUserId,
        volume: toCloudLocalArchiveVolume(volume),
        generation,
      });
    } catch (error) {
      console.warn("[MobileSync] Could not push archive volume:", error);
    }
  }
  if (changed) emitMobileDataChanged("library");
  return { changed };
}

export function canonicalCloudLocalArchiveVolumes(
  rows: readonly { localArchiveVolumes?: readonly CloudLocalArchiveVolume[] }[],
): CloudLocalArchiveVolume[] {
  return mergeCloudLocalArchiveVolumes(
    [],
    rows.flatMap((row) => row.localArchiveVolumes ?? []),
  ).records;
}
