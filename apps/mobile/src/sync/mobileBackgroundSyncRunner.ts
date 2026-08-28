// Platform-agnostic background sync runner.
//
// Holds the re-entrancy guard and last-run timestamp shared between the native
// background-task executor (`mobileBackgroundSync.native.ts`) and any caller
// that wants to trigger a sync pass (e.g. a debug button, or the foreground
// bridge reusing the same merge path). All `expo-*` / `react-native` imports
// stay out of this file so it loads under bun and can be unit-tested.
//
// The runner reuses the exact same cloud→local merge helpers as the foreground
// `MobileSyncBridge` (`mergeLibrarySnapshot`, `mergeCollectionSnapshot`, the
// `mapCloud*` mappers, `mergeMobileInstalledSources`) so there is one source of
// truth for the merge contract. It pulls fresh snapshots with
// `ConvexReactClient.query(...)` (a one-shot fetch, not a React subscription)
// and applies them through `runWithMobileRemoteSnapshot` / the store's
// `save*Snapshot` methods — the same serialized write queue the foreground
// bridge uses, so background and foreground sync can never race.

import { api } from "../../../../convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import type { MobileDataStore } from "@/data/storeTypes";
import type { MobileSyncSnapshotState } from "@/data/schema";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
  canonicalizeSyncSnapshotRecords,
  fetchBoundedSyncSnapshotPages,
  type SyncSnapshotResourceKey,
} from "@nemu/core";
import {
  mapCloudChapterProgress,
  mapCloudCollectionItems,
  mapCloudCollections,
  mapCloudLibraryItems,
  mapCloudMangaProgress,
  mapCloudSourceLinks,
  mergeCollectionSnapshot,
  mergeMobileInstalledSources,
  mergeLibrarySnapshot,
} from "./mobileSyncSnapshots";
import { hydrateMobileSyncedSourcePackages } from "./mobileSyncedSourcePackages";
import {
  reconcilePendingCollectionDeletions,
  reconcilePendingSourceLinkDeletions,
} from "./mobilePendingSyncDeletions";
import {
  getMobileSyncEpoch,
  isMobileSyncEpochCurrent,
  isMobileSyncSuspended,
  runWithMobileRemoteSnapshot,
  runWithMobileSyncWrite,
} from "./mobileSyncRuntime";
import {
  MOBILE_BACKGROUND_SYNC_TIMEOUT_MS,
  shouldRunMobileBackgroundSync,
} from "./mobileBackgroundSyncConfig";
import {
  createMobileSyncBudgetExceededState,
  createMobileSyncHealthyState,
} from "./mobileSyncSnapshotStatus";

export type MobileSyncClient = Pick<ConvexReactClient, "query" | "mutation">;

export type MobileBackgroundSyncDeps = {
  store: MobileDataStore;
  /** Account subject captured with the fixed auth token for this run. */
  expectedUserId: string;
  // Both ConvexReactClient and the headless ConvexHttpClient satisfy this
  // one-shot query/mutation contract.
  convex: MobileSyncClient;
  /** Cancels task-owned network work, including synced source-package
   * hydration, when the OS expires the background window. */
  signal?: AbortSignal;
  // `Date.now` override for tests; defaults to the real clock in production.
  now?: () => number;
  // Override the self-imposed timeout for tests; defaults to the config value.
  timeoutMs?: number;
  // Optional callback the runner checks between sync phases. On iOS the native
  // module wires this to `BackgroundTask.addExpirationListener` so the runner
  // stops starting new phases once the OS signals the background window is
  // closing. Defaults to "never expiring" when unset (e.g. in tests, or when
  // invoked from the foreground).
  isExpiring?: () => boolean;
  // Headless callers use this to abort their fixed-token HTTP client when the
  // deadline expires. Foreground/test clients may omit it.
  onTimeout?: () => void;
  // Captured once per run. Supplying it is mainly useful for deterministic
  // tests; production captures the current epoch automatically.
  syncEpoch?: number;
  /** Test seam for a deferred/cancellable package download. */
  hydrateSourcePackages?: typeof hydrateMobileSyncedSourcePackages;
  /** Mutable foreground transports re-confirm their server subject after the
   * full pull and before any local apply. Headless transports use a fixed token
   * and may omit this extra round trip. */
  confirmExpectedUser?: () => Promise<boolean>;
  /** Explicit Settings retry: bypasses only the debounce interval. */
  force?: boolean;
  /** Defaults to background; explicit foreground retries override this. */
  origin?: MobileSyncSnapshotState["origin"];
};

export type MobileBackgroundSyncResult = {
  ran: boolean;
  reason: string;
  startedAt: number;
  finishedAt: number;
  completion?: Promise<void>;
};

let backgroundSyncRunning = false;
let lastBackgroundSyncAt = 0;

export function isMobileBackgroundSyncRunning(): boolean {
  return backgroundSyncRunning;
}

export function getLastMobileBackgroundSyncAt(): number {
  return lastBackgroundSyncAt;
}

// Exposed for tests to reset module state between cases.
export function resetMobileBackgroundSyncStateForTesting(): void {
  backgroundSyncRunning = false;
  lastBackgroundSyncAt = 0;
}

// A phase stops if either the global sync runtime is suspended (foreground
// bridge is applying a snapshot, or the app is mid-clear) or iOS has signalled
// the background execution window is expiring. Combining the two here means a
// single `if (shouldStop(deps)) return;` guard covers both races.
function shouldStop(deps: MobileBackgroundSyncDeps): boolean {
  if (deps.signal?.aborted) return true;
  if (isMobileSyncSuspended()) return true;
  if (!isMobileSyncEpochCurrent(deps.syncEpoch ?? getMobileSyncEpoch()))
    return true;
  return deps.isExpiring?.() === true;
}

async function isSnapshotGenerationCurrent(
  deps: MobileBackgroundSyncDeps,
  generation: number,
): Promise<boolean> {
  return (
    !shouldStop(deps) && (await deps.store.getSyncGeneration()) === generation
  );
}

async function pullMobileCloudSnapshot(deps: MobileBackgroundSyncDeps) {
  const { convex } = deps;
  const observedGeneration = await convex.query(api.sync.generation, {});
  if (shouldStop(deps)) return { status: "stopped" as const };
  const generation = observedGeneration.generation;
  const sharedBudget = { usedRows: 0, usedEstimatedBytes: 0 };
  const budgetExceeded = (resourceKey: SyncSnapshotResourceKey) => ({
    status: "budget-exceeded" as const,
    generation,
    resourceKey,
    totalRows: sharedBudget.usedRows,
    totalEstimatedBytes: sharedBudget.usedEstimatedBytes,
  });
  const libraryItemsResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.libraryItemsAllV2, { generation, paginationOpts }),
    sharedBudget,
  );
  if (libraryItemsResult.status === "budget-exceeded") {
    return budgetExceeded("libraryItems");
  }
  if (libraryItemsResult.status !== "complete") return libraryItemsResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const sourceLinksResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.sourceLinksAllV2, { generation, paginationOpts }),
    sharedBudget,
  );
  if (sourceLinksResult.status === "budget-exceeded") {
    return budgetExceeded("sourceLinks");
  }
  if (sourceLinksResult.status !== "complete") return sourceLinksResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const collectionsResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.collectionsAllV2, { generation, paginationOpts }),
    sharedBudget,
  );
  if (collectionsResult.status === "budget-exceeded") {
    return budgetExceeded("collections");
  }
  if (collectionsResult.status !== "complete") return collectionsResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const collectionItemsResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.collectionItemsAllV2, {
        generation,
        paginationOpts,
      }),
    sharedBudget,
  );
  if (collectionItemsResult.status === "budget-exceeded") {
    return budgetExceeded("collectionItems");
  }
  if (collectionItemsResult.status !== "complete") return collectionItemsResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const chapterProgressResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.chapterProgressAllV2, {
        generation,
        paginationOpts,
      }),
    sharedBudget,
  );
  if (chapterProgressResult.status === "budget-exceeded") {
    return budgetExceeded("chapterProgress");
  }
  if (chapterProgressResult.status !== "complete") return chapterProgressResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const mangaProgressResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.sync.mangaProgressAllV2, { generation, paginationOpts }),
    sharedBudget,
  );
  if (mangaProgressResult.status === "budget-exceeded") {
    return budgetExceeded("mangaProgress");
  }
  if (mangaProgressResult.status !== "complete") return mangaProgressResult;
  if (shouldStop(deps)) return { status: "stopped" as const };
  const settingsResult = await fetchBoundedSyncSnapshotPages(
    generation,
    (paginationOpts) =>
      convex.query(api.settings.getV2, { generation, paginationOpts }),
    sharedBudget,
  );
  if (settingsResult.status === "budget-exceeded") {
    return budgetExceeded("settings");
  }
  if (settingsResult.status !== "complete") return settingsResult;
  if (shouldStop(deps)) return { status: "stopped" as const };

  const libraryItems = libraryItemsResult.rows;
  const sourceLinks = sourceLinksResult.rows;
  const collections = collectionsResult.rows;
  const collectionItems = collectionItemsResult.rows;
  const chapterProgress = chapterProgressResult.rows;
  const mangaProgress = mangaProgressResult.rows;
  const settings = settingsResult.rows;
  const confirmedGeneration = await convex.query(api.sync.generation, {});
  if (confirmedGeneration.generation !== generation) {
    return { status: "generation-changed" as const };
  }
  if (shouldStop(deps)) return { status: "stopped" as const };
  const installedSources = canonicalizeSyncSnapshotRecords(
    settings.flatMap((row) => row.installedSources),
    (source) => source.id,
    (source) => source.removed === true,
  );
  return {
    status: "ready" as const,
    snapshot: {
      generation,
      libraryItems: canonicalizeSyncSnapshotRecords(
        libraryItems,
        (row) => row.libraryItemId,
        (row) => row.inLibrary === false,
      ),
      sourceLinks: canonicalizeSyncSnapshotRecords(
        sourceLinks,
        (row) =>
          `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
        (row) => row.removed === true,
      ),
      collections: canonicalizeSyncSnapshotRecords(
        collections,
        (row) => row.collectionId,
        (row) => row.removed === true,
      ),
      collectionItems: canonicalizeSyncSnapshotRecords(
        collectionItems,
        (row) => `${row.collectionId}\u0000${row.libraryItemId}`,
        (row) => row.removed === true,
      ),
      chapterProgress: canonicalizeSyncSnapshotRecords(
        chapterProgress,
        (row) =>
          `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}\u0000${row.sourceChapterId}`,
      ),
      mangaProgress: canonicalizeSyncSnapshotRecords(
        mangaProgress,
        (row) =>
          `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
      ),
      settings: {
        generation,
        installedSources,
        updatedAt: Math.max(0, ...settings.map((row) => row.updatedAt)),
      },
    },
  };
}

type MobileCloudSnapshot =
  NonNullable<
    Awaited<ReturnType<typeof pullMobileCloudSnapshot>>
  > extends infer Result
    ? Result extends { status: "ready"; snapshot: infer Snapshot }
      ? Snapshot
      : never
    : never;

async function pullAndMergeLibrary(
  deps: MobileBackgroundSyncDeps,
  snapshot: MobileCloudSnapshot,
): Promise<void> {
  const { store, convex } = deps;
  const mappedCloudLinks = await reconcilePendingSourceLinkDeletions(
    store,
    convex,
    mapCloudSourceLinks(snapshot.sourceLinks),
    () => !shouldStop(deps),
    snapshot.generation,
    deps.expectedUserId,
  );
  if (shouldStop(deps)) return;

  if (store.applyLibrarySnapshot) {
    // Atomic read+merge+write in one store write-queue slot (same primitive
    // as the foreground bridge); winners are intentionally discarded — see
    // the pull-only note below.
    const applied = await runWithMobileSyncWrite(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return null;
      return store.applyLibrarySnapshot!(
        mapCloudLibraryItems(snapshot.libraryItems),
        mappedCloudLinks,
      );
    });
    if (
      !shouldStop(deps) &&
      applied &&
      (applied.changedItems.length > 0 || applied.changedLinks.length > 0)
    )
      emitMobileDataChanged("library");
    return;
  }

  const [localItems, localLinks] = await Promise.all([
    store.getAllLibraryItems({ includeRemoved: true }),
    store.getAllSourceLinks(),
  ]);
  if (shouldStop(deps)) return;

  const merged = mergeLibrarySnapshot(
    localItems,
    localLinks,
    mapCloudLibraryItems(snapshot.libraryItems),
    mappedCloudLinks,
  );
  await runWithMobileRemoteSnapshot(async () => {
    if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation))) return;
    await store.saveLibrarySnapshot(merged.items, merged.links);
  });
  if (
    !shouldStop(deps) &&
    (merged.changedItems.length > 0 || merged.changedLinks.length > 0)
  )
    emitMobileDataChanged("library");
}

// The foreground `MobileSyncBridge` does a "push local winners" pass after
// merging to upload local-only items to the cloud. Background sync deliberately
// omits that: pushing local winners from the background risks uploading stale
// local state if the user made changes on another device since the app was
// backgrounded. The pull-only merge here keeps the local DB fresh; the next
// foreground sync (or the live subscription) handles any local→cloud pushes
// with the full conflict-resolution context.

async function pullAndMergeCollections(
  deps: MobileBackgroundSyncDeps,
  snapshot: MobileCloudSnapshot,
): Promise<void> {
  const { store, convex } = deps;
  const mappedCloudCollections = await reconcilePendingCollectionDeletions(
    store,
    convex,
    mapCloudCollections(snapshot.collections),
    () => !shouldStop(deps),
    snapshot.generation,
    deps.expectedUserId,
  );
  if (shouldStop(deps)) return;

  if (store.applyCollectionsSnapshot) {
    const applied = await runWithMobileSyncWrite(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return null;
      return store.applyCollectionsSnapshot!(
        mappedCloudCollections,
        mapCloudCollectionItems(snapshot.collectionItems),
      );
    });
    if (
      !shouldStop(deps) &&
      applied &&
      (applied.changedCollections.length > 0 ||
        applied.changedCollectionItems.length > 0)
    )
      emitMobileDataChanged("collections");
    return;
  }

  const [localCollections, localCollectionItems] = await Promise.all([
    store.getCollections(),
    store.getCollectionItems(),
  ]);
  if (shouldStop(deps)) return;

  const merged = mergeCollectionSnapshot(
    localCollections,
    localCollectionItems,
    mappedCloudCollections,
    mapCloudCollectionItems(snapshot.collectionItems),
  );
  await runWithMobileRemoteSnapshot(async () => {
    if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation))) return;
    await store.saveCollectionsSnapshot(
      merged.collections,
      merged.collectionItems,
    );
  });
  if (
    !shouldStop(deps) &&
    (merged.changedCollections.length > 0 ||
      merged.changedCollectionItems.length > 0)
  )
    emitMobileDataChanged("collections");
}

async function pullAndMergeProgress(
  deps: MobileBackgroundSyncDeps,
  snapshot: MobileCloudSnapshot,
): Promise<void> {
  const { store } = deps;

  if (store.applyChapterProgressSnapshot) {
    await runWithMobileSyncWrite(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.applyChapterProgressSnapshot!(
        mapCloudChapterProgress(snapshot.chapterProgress),
      );
    });
  } else {
    await runWithMobileRemoteSnapshot(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.saveChapterProgressBatch(
        mapCloudChapterProgress(snapshot.chapterProgress),
      );
    });
  }
  if (shouldStop(deps)) return;
  if (store.applyMangaProgressSnapshot) {
    await runWithMobileSyncWrite(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.applyMangaProgressSnapshot!(
        mapCloudMangaProgress(snapshot.mangaProgress),
      );
    });
  } else {
    await runWithMobileRemoteSnapshot(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.saveMangaProgressBatch(
        mapCloudMangaProgress(snapshot.mangaProgress),
      );
    });
  }
  if (!shouldStop(deps)) emitMobileDataChanged("progress");
}

async function pullAndMergeSettings(
  deps: MobileBackgroundSyncDeps,
  snapshot: MobileCloudSnapshot,
): Promise<void> {
  const { store } = deps;
  const localSettings = await store.getSyncSettings();
  if (shouldStop(deps)) return;

  const mergedSources = mergeMobileInstalledSources(
    localSettings.installedSources,
    snapshot.settings.installedSources ?? [],
  );
  const hydrateSourcePackages =
    deps.hydrateSourcePackages ?? hydrateMobileSyncedSourcePackages;
  const hydratedSources = await hydrateSourcePackages(mergedSources, {
    onHydrationError(source, error) {
      console.warn(
        `[MobileBackgroundSync] Failed to cache synced source package for ${source.id}:`,
        error,
      );
    },
    shouldContinue: () => !shouldStop(deps),
    signal: deps.signal,
  });
  if (shouldStop(deps)) return;
  if (store.applyInstalledSourcesSnapshot) {
    await runWithMobileSyncWrite(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.applyInstalledSourcesSnapshot!(hydratedSources);
    });
  } else {
    await runWithMobileRemoteSnapshot(async () => {
      if (!(await isSnapshotGenerationCurrent(deps, snapshot.generation)))
        return;
      await store.saveSettings({
        ...localSettings,
        installedSources: hydratedSources,
      });
    });
  }
  if (!shouldStop(deps)) emitMobileDataChanged("settings");
}

async function runMobileBackgroundSyncOnce(
  deps: MobileBackgroundSyncDeps,
): Promise<MobileBackgroundSyncResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const eligibility = shouldRunMobileBackgroundSync({
    configured: true,
    authenticated: true,
    lastRunAt: deps.force ? 0 : lastBackgroundSyncAt,
    now: startedAt,
    alreadyRunning: backgroundSyncRunning,
  });
  if (!eligibility.eligible) {
    return {
      ran: false,
      reason: eligibility.reason,
      startedAt,
      finishedAt: startedAt,
    };
  }

  backgroundSyncRunning = true;
  const syncEpoch = deps.syncEpoch ?? getMobileSyncEpoch();
  const timeoutMs = deps.timeoutMs ?? MOBILE_BACKGROUND_SYNC_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        deps.onTimeout?.();
      } catch (error) {
        console.warn(
          "[MobileBackgroundSync] Failed to cancel timed-out work:",
          error,
        );
      }
      resolve();
    }, timeoutMs);
  });

  const runDeps: MobileBackgroundSyncDeps = {
    ...deps,
    syncEpoch,
    isExpiring: () => timedOut || deps.isExpiring?.() === true,
  };
  let snapshotBudgetExceeded = false;

  // A timeout stops later phases from starting through runDeps.isExpiring, but
  // an already-running Convex request may not be cancellable.
  const work = (async () => {
    if (shouldStop(runDeps)) return;
    // Fetch all seven V2 resources before touching local state. Convex queries
    // are individually transactional, so a reset between requests can yield a
    // mixed bundle; only an all-equal generation is safe to apply.
    const pullResult = await pullMobileCloudSnapshot(runDeps);
    if (
      pullResult.status !== "budget-exceeded" &&
      pullResult.status !== "ready"
    ) {
      return;
    }
    if (shouldStop(runDeps)) return;
    if (runDeps.confirmExpectedUser && !(await runDeps.confirmExpectedUser())) {
      return;
    }
    if (shouldStop(runDeps)) return;
    if (pullResult.status === "budget-exceeded") {
      snapshotBudgetExceeded = true;
      console.warn(
        "[MobileBackgroundSync] Snapshot row/byte budget exceeded; skipping this background sync round.",
      );
      if (!shouldStop(runDeps)) {
        const accepted = await runDeps.store.recordSyncSnapshotState(
          createMobileSyncBudgetExceededState({
            generation: pullResult.generation,
            origin: runDeps.origin ?? "background",
            resourceKey: pullResult.resourceKey,
            totalRows: pullResult.totalRows,
            totalEstimatedBytes: pullResult.totalEstimatedBytes,
            observedAt: now(),
          }),
          () => !shouldStop(runDeps),
        );
        if (accepted) emitMobileDataChanged("syncStatus");
      }
      return;
    }
    if (pullResult.status !== "ready") return;
    const snapshot = pullResult.snapshot;
    const generationDecision = await runWithMobileSyncWrite(async () => {
      if (shouldStop(runDeps)) return "stale" as const;
      return runDeps.store.applySyncGeneration(snapshot.generation);
    });
    if (generationDecision === "stale" || shouldStop(runDeps)) return;
    await pullAndMergeLibrary(runDeps, snapshot);
    if (shouldStop(runDeps)) return;
    await pullAndMergeCollections(runDeps, snapshot);
    if (shouldStop(runDeps)) return;
    await pullAndMergeProgress(runDeps, snapshot);
    if (shouldStop(runDeps)) return;
    await pullAndMergeSettings(runDeps, snapshot);
    if (shouldStop(runDeps)) return;
    const accepted = await runDeps.store.recordSyncSnapshotState(
      createMobileSyncHealthyState({
        generation: snapshot.generation,
        origin: runDeps.origin ?? "background",
        observedAt: now(),
      }),
      () => !shouldStop(runDeps),
    );
    if (accepted) emitMobileDataChanged("syncStatus");
  })();

  let result: MobileBackgroundSyncResult;
  try {
    await Promise.race([work, timeout]);
    lastBackgroundSyncAt = now();
    result = {
      ran: true,
      reason: timedOut
        ? "timed-out"
        : snapshotBudgetExceeded
          ? "budget-exceeded"
          : "completed",
      startedAt,
      finishedAt: lastBackgroundSyncAt,
    };
  } catch (error) {
    if (!timedOut) {
      console.error("[MobileBackgroundSync] Background sync failed:", error);
    }
    lastBackgroundSyncAt = now();
    result = {
      ran: true,
      reason: timedOut ? "timed-out" : "error",
      startedAt,
      finishedAt: lastBackgroundSyncAt,
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  if (timedOut) {
    // The captured epoch + timedOut flag prevent late work from writing. Free
    // the global guard immediately so a client that ignores cancellation can
    // never wedge every future scheduled run.
    backgroundSyncRunning = false;
    const completion = work.catch((error) => {
      if (!timedOut) {
        console.error(
          "[MobileBackgroundSync] Sync settled with an error:",
          error,
        );
      }
    });
    return { ...result, completion };
  }

  backgroundSyncRunning = false;
  return result;
}

export { runMobileBackgroundSyncOnce };
