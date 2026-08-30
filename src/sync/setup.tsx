/**
 * SyncSetup - All hooks, renders null (or portaled dialogs)
 *
 * This component is a SIBLING to the app tree, not a parent.
 * When it re-renders, the app tree is unaffected.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useConvexAuth,
  useConvex,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { IDB_UI_EVENT, IndexedDBUserDataStore } from "@/data/indexeddb";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalMangaProgress,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
} from "@/data/schema";
import { makeSourceLinkId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import { getSyncStore } from "@/stores/sync";
import { authClient } from "@/lib/auth-client";
import { normalizeOAuthProvider } from "@/sync/oauth-provider";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import {
  useDataServices,
  useProgressStoreApi,
  useProfileId,
  useSourceSettingsStoreApi,
  useStores,
} from "@/data/context";
import {
  areSyncAccountIdentitiesAligned,
  mapCloudChapterProgress,
  mapCloudCollectionItems,
  mapCloudCollections,
  mapCloudLibraryItems,
  mapCloudMangaProgress,
  mapCloudSourceLinks,
  canonicalizeSyncSnapshotRecords,
  clearSyncServerTimeObservation,
  completeSyncSnapshot,
  decodeSyncSnapshotPage,
  consistentSyncGeneration,
  measureSyncSnapshotRows,
  planSyncSnapshotPagination,
  refreshSyncServerTime,
  supportsChapterProgressIntraPageSync,
  toCloudHistorySaveInput,
  toCloudLibrarySaveInputBatches,
} from "@nemu/core";
import {
  convexRef,
  getSyncSubscriptionsStopped,
  LOCAL_PROFILE_IMPORT_EVENT,
  setSyncSubscriptionsStopped,
  subscribeSyncSubscriptionsStopped,
  subscriptionStoppedRef,
  updateObservedAuthSession,
  updateObservedSyncCapabilities,
} from "./services";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import {
  applyWebCollectionsSyncSnapshot,
  applyWebChapterProgressSyncSnapshot,
  applyWebInstalledSourcesSyncSnapshot,
  applyWebLibrarySyncSnapshot,
  isWebSyncRunCurrent,
  type WebSyncRunIdentity,
} from "./web-snapshot-sync";
import {
  convertLegacyHistoryEntry,
  convertLegacyLibraryEntry,
  deriveLegacyMangaProgress,
} from "./legacy-import";
import {
  getImportOfferedSessionKey,
  isWebImportOfferActionCurrent,
  isWebImportOfferEligible,
} from "./import-offer";
import { syncApplyRetryDelayMs } from "./retry-backoff";
import {
  clearSyncRecoveryRequest,
  getSyncRecoveryRequest,
  reportSyncMutationError,
  subscribeSyncRecovery,
} from "./sync-error-recovery";
import {
  getSyncSnapshotRetryAttempt,
  subscribeSyncSnapshotRetry,
} from "./snapshot-retry";

const IDB_UI_EVENT_BUFFER_KEY = "nemu:idb-ui-event";
const SYNC_SNAPSHOT_PAGE_SIZE = 128;
const MOCK_BLOCK_STICKY_KEY = "nemu:idb-mock-blocked-sticky";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:";
type ImportDecision = "skipped" | "imported";
type IdbBlockedEventDetail = {
  dbName: string;
  requestedVersion?: number;
  kind: "blocked" | "versionchange";
};
type WebSyncApplyDomain =
  | "library"
  | "collections"
  | "chapter-progress"
  | "manga-progress"
  | "settings";
type WebImportActionToken = {
  offerIdentity: WebSyncRunIdentity;
};
type WebSyncClockGate = {
  convex: ConvexReactClient;
  localStore: IndexedDBUserDataStore;
  profileId: string | undefined;
  userId: string | undefined;
  generation: number;
  chapterProgressIntraPageVersion?: unknown;
};

function wasImportOfferedThisSession(userId: string): boolean {
  try {
    return (
      sessionStorage.getItem(getImportOfferedSessionKey(userId)) === "true"
    );
  } catch {
    return false;
  }
}

function markImportOfferedThisSession(userId: string): void {
  try {
    sessionStorage.setItem(getImportOfferedSessionKey(userId), "true");
  } catch {
    // The identity guard still protects the offer when storage is unavailable.
  }
}

function getImportDecision(userId: string): ImportDecision | null {
  try {
    const raw = localStorage.getItem(`${IMPORT_DECISION_KEY_PREFIX}${userId}`);
    return raw === "skipped" || raw === "imported" ? raw : null;
  } catch {
    return null;
  }
}

function setImportDecision(userId: string, decision: ImportDecision): void {
  try {
    localStorage.setItem(`${IMPORT_DECISION_KEY_PREFIX}${userId}`, decision);
  } catch {
    // ignore storage failures
  }
}

async function prepareWebSnapshotGeneration(
  localStore: IndexedDBUserDataStore,
  generation: number,
  shouldContinue: () => boolean,
): Promise<boolean> {
  if (!shouldContinue()) return false;
  const decision = await localStore.prepareSyncGeneration(
    generation,
    shouldContinue,
  );
  return decision !== null && decision !== "stale" && shouldContinue();
}

/**
 * One snapshot run. Remounted (never re-rendered into) when a run has to start
 * over, because the paginated snapshot subscriptions can only be re-driven
 * from page one by fresh `usePaginatedQuery` state.
 */
function SyncSetupRun() {
  const { t } = useTranslation();

  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const syncStore = getSyncStore();
  const { data: session } = authClient.useSession();
  const { localStore } = useDataServices();
  const stores = useStores();
  const progressStore = useProgressStoreApi();
  const sourceSettingsStore = useSourceSettingsStoreApi();
  const profileId = useProfileId();
  const subscriptionsStopped = useSyncExternalStore(
    subscribeSyncSubscriptionsStopped,
    getSyncSubscriptionsStopped,
    getSyncSubscriptionsStopped,
  );
  const syncGenerationRef = useRef(0);
  const syncIdentityRef = useRef<WebSyncRunIdentity>({
    generation: 0,
    profileId,
    userId: session?.user?.id,
    authenticated: isAuthenticated,
    localStore,
  });

  const [signingOut, setSigningOut] = useState(false);
  const [isFirstSync, setIsFirstSync] = useState(true);
  const [syncClockGate, setSyncClockGate] = useState<WebSyncClockGate | null>(
    null,
  );
  const [syncApplyFailures, setSyncApplyFailures] = useState<
    Set<WebSyncApplyDomain>
  >(() => new Set());
  const [syncApplyRetryRevision, setSyncApplyRetryRevision] = useState<
    Record<WebSyncApplyDomain, number>
  >({
    library: 0,
    collections: 0,
    "chapter-progress": 0,
    "manga-progress": 0,
    settings: 0,
  });
  const syncApplyRetryTimersRef = useRef(
    new Map<WebSyncApplyDomain, ReturnType<typeof setTimeout>>(),
  );
  const syncApplyRetryAttemptsRef = useRef(
    new Map<WebSyncApplyDomain, number>(),
  );
  const chapterProgressRetryRevision =
    syncApplyRetryRevision["chapter-progress"];
  const mangaProgressRetryRevision = syncApplyRetryRevision["manga-progress"];

  const markSyncApplySucceeded = useCallback((domain: WebSyncApplyDomain) => {
    const timer = syncApplyRetryTimersRef.current.get(domain);
    if (timer) clearTimeout(timer);
    syncApplyRetryTimersRef.current.delete(domain);
    syncApplyRetryAttemptsRef.current.delete(domain);
    setSyncApplyFailures((current) => {
      if (!current.has(domain)) return current;
      const next = new Set(current);
      next.delete(domain);
      return next;
    });
  }, []);

  const markSyncApplyFailed = useCallback(
    (
      domain: WebSyncApplyDomain,
      error: unknown,
      shouldContinue: () => boolean,
    ) => {
      if (!shouldContinue()) return;
      console.error(
        `[SyncSetup] Failed to apply ${domain} snapshot:`,
        safeErrorCategory(error),
      );
      setSyncApplyFailures((current) => {
        if (current.has(domain)) return current;
        const next = new Set(current);
        next.add(domain);
        return next;
      });
      // A sync protocol error will fail identically on every retry. Publish it
      // for the recovery effect instead of burning a backoff schedule on it.
      const recovery = reportSyncMutationError(error);
      if (recovery && recovery.kind !== "generation-mismatch") return;
      if (syncApplyRetryTimersRef.current.has(domain)) return;
      const attempt = (syncApplyRetryAttemptsRef.current.get(domain) ?? 0) + 1;
      syncApplyRetryAttemptsRef.current.set(domain, attempt);
      const delayMs = syncApplyRetryDelayMs(attempt);
      const timer = setTimeout(() => {
        syncApplyRetryTimersRef.current.delete(domain);
        setSyncApplyRetryRevision((current) => ({
          ...current,
          [domain]: current[domain] + 1,
        }));
      }, delayMs);
      syncApplyRetryTimersRef.current.set(domain, timer);
    },
    [],
  );

  useEffect(
    () => () => {
      for (const timer of syncApplyRetryTimersRef.current.values())
        clearTimeout(timer);
      syncApplyRetryTimersRef.current.clear();
    },
    [],
  );

  // Dialog states
  const [showSyncingDialog, setShowSyncingDialog] = useState(false);
  const [importOfferIdentity, setImportOfferIdentity] =
    useState<WebSyncRunIdentity | null>(null);
  const importOfferIdentityRef = useRef<WebSyncRunIdentity | null>(null);
  const importActionTokenRef = useRef<WebImportActionToken | null>(null);
  const [importActionIdentity, setImportActionIdentity] =
    useState<WebSyncRunIdentity | null>(null);
  const [idbDialogOpen, setIdbDialogOpen] = useState(false);
  const [idbBlocked, setIdbBlocked] = useState<IdbBlockedEventDetail | null>(
    null,
  );

  const publishImportOffer = useCallback((identity: WebSyncRunIdentity) => {
    importOfferIdentityRef.current = identity;
    setImportOfferIdentity(identity);
  }, []);

  const dismissImportOffer = useCallback(
    (expectedIdentity: WebSyncRunIdentity): boolean => {
      if (importOfferIdentityRef.current !== expectedIdentity) return false;
      importOfferIdentityRef.current = null;
      setImportOfferIdentity((current) =>
        current === expectedIdentity ? null : current,
      );
      return true;
    },
    [],
  );

  const cancelImportOffer = useCallback(
    (expectedIdentity: WebSyncRunIdentity): void => {
      dismissImportOffer(expectedIdentity);
      const actionToken = importActionTokenRef.current;
      if (actionToken?.offerIdentity !== expectedIdentity) return;
      importActionTokenRef.current = null;
      setImportActionIdentity((current) =>
        current === expectedIdentity ? null : current,
      );
    },
    [dismissImportOffer],
  );

  const checkImportOfferEligibility = useCallback(
    (
      expectedIdentity: WebSyncRunIdentity,
      defaultStore: IndexedDBUserDataStore,
      profileStore: IndexedDBUserDataStore,
      isCancelled: () => boolean,
    ) =>
      isWebImportOfferEligible({
        expectedIdentity,
        getCurrentIdentity: () => syncIdentityRef.current,
        isCancelled,
        getSubscriptionsStopped: () => subscriptionStoppedRef.current,
        hasLegacyLibraryData: () => defaultStore.hasLibraryData(),
        loadRemoteUserId: () => convex.query(api.auth.getCurrentUserId, {}),
        loadRemoteGeneration: async () => {
          const result = await refreshSyncServerTime(
            () => convex.mutation(api.sync.observeGeneration, {}),
            () =>
              isWebSyncRunCurrent(
                expectedIdentity,
                syncIdentityRef.current,
                isCancelled(),
                subscriptionStoppedRef.current,
              ),
          );
          return result?.generation ?? -1;
        },
        // This is only an emptiness probe. Loading the entire account here
        // would duplicate the foreground subscription and bypass its shared
        // row/byte budget for large libraries.
        loadFirstRemoteLibraryPage: (generation) =>
          convex
            .query(api.sync.libraryItemsAllV2, {
              generation,
              paginationOpts: { numItems: 1, cursor: null },
            })
            .then((firstPage) => ({
              generation: firstPage.generation,
              items: decodeSyncSnapshotPage(firstPage.page, generation),
            })),
        hasProfileLibraryData: () =>
          profileStore
            .getLibraryEntries()
            .then((entries) => entries.length > 0),
      }),
    [convex],
  );

  // Update module-level refs
  useLayoutEffect(() => {
    convexRef.current = convex as ConvexReactClient;
    updateObservedAuthSession(
      isAuthenticated,
      session?.user?.id,
      (session as { session?: { id?: string } } | null)?.session?.id,
    );
  }, [convex, isAuthenticated, session]);

  // A run is bound to one immutable account/profile/store identity. Every
  // subscription effect below captures this generation and re-checks it after
  // each await, preventing stale A work from mutating the current B session.
  useLayoutEffect(() => {
    clearSyncServerTimeObservation();
    updateObservedSyncCapabilities(null);
    setSyncClockGate(null);
    syncGenerationRef.current += 1;
    syncIdentityRef.current = {
      generation: syncGenerationRef.current,
      profileId,
      userId: session?.user?.id,
      authenticated: isAuthenticated,
      localStore,
    };
  }, [convex, isAuthenticated, localStore, profileId, session?.user?.id]);

  // Invalidate a visible offer or in-flight confirmation as soon as its
  // account/profile/store identity is no longer the selected one.
  useLayoutEffect(() => {
    const currentIdentity = syncIdentityRef.current;
    const activeOffer = importOfferIdentityRef.current;
    if (
      activeOffer &&
      !isWebImportOfferActionCurrent(
        activeOffer,
        activeOffer,
        currentIdentity,
        false,
        subscriptionsStopped,
      )
    ) {
      cancelImportOffer(activeOffer);
    }

    const actionToken = importActionTokenRef.current;
    if (
      actionToken &&
      !isWebSyncRunCurrent(
        actionToken.offerIdentity,
        currentIdentity,
        false,
        subscriptionsStopped,
      )
    ) {
      importActionTokenRef.current = null;
      setImportActionIdentity((current) =>
        current === actionToken.offerIdentity ? null : current,
      );
    }
  }, [
    cancelImportOffer,
    isAuthenticated,
    localStore,
    profileId,
    session?.user?.id,
    subscriptionsStopped,
  ]);

  useEffect(
    () => () => {
      importActionTokenRef.current = null;
    },
    [],
  );

  // Check if first sync
  useEffect(() => {
    let cancelled = false;
    setIsFirstSync(true);
    localStore
      .hasSyncedData()
      .then((hasSynced) => {
        if (!cancelled) setIsFirstSync(!hasSynced);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [localStore]);

  // ============================================================================
  // Convex subscriptions
  // ============================================================================
  const sessionUserId = session?.user?.id;
  const skipAccountCheck =
    !isAuthenticated || !sessionUserId || signingOut || subscriptionsStopped;
  // Better Auth's session and Convex's websocket can briefly belong to
  // different users during an account switch. Verify the server identity
  // before any downloaded snapshot may touch the selected local profile.
  const convexUser = useQuery(
    api.auth.getCurrentUserId,
    skipAccountCheck ? "skip" : {},
  );
  const skipSubscriptions =
    skipAccountCheck ||
    !areSyncAccountIdentitiesAligned(sessionUserId, convexUser);

  const cloudGeneration = useQuery(
    api.sync.generation,
    skipSubscriptions ? "skip" : {},
  );
  const cloudGenerationNumber = cloudGeneration?.generation;
  const cloudChapterProgressIntraPageVersion =
    cloudGeneration?.chapterProgressIntraPageVersion;
  useEffect(() => {
    updateObservedSyncCapabilities(null);
    setSyncClockGate(null);
    if (skipSubscriptions || cloudGenerationNumber === undefined) return;
    const expectedIdentity = syncIdentityRef.current;
    let cancelled = false;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    const readiness = (async () => {
      // Invalidate every warm view now. New-generation actions await this
      // promise, which includes the fresh server-time observation and durable
      // IndexedDB reset, while old in-flight actions lose their store token.
      try {
        // Convex can reuse a dependency-cached query result, including its old
        // `serverNow`. A no-op authenticated mutation is the fresh round trip
        // that makes the clock anchor trustworthy.
        const observation = await refreshSyncServerTime(
          () => convex.mutation(api.sync.observeGeneration, {}),
          shouldContinue,
        );
        if (!observation || !shouldContinue()) return;
        // Enqueue the durable reset and invalidate warm chapter state together
        // before opening snapshot or mutation gates for this generation.
        await localStore.prepareSyncGeneration(observation.generation);
        if (!shouldContinue()) return;
        const chapterProgressIntraPageVersion =
          supportsChapterProgressIntraPageSync(
            observation.chapterProgressIntraPageVersion,
          ) &&
          supportsChapterProgressIntraPageSync(
            cloudChapterProgressIntraPageVersion,
          )
            ? observation.chapterProgressIntraPageVersion
            : undefined;
        const observedCapabilities = {
          convex: convex as ConvexReactClient,
          localStore,
          profileId,
          userId: sessionUserId,
          generation: observation.generation,
          chapterProgressIntraPageVersion,
        };
        updateObservedSyncCapabilities(observedCapabilities);
        setSyncClockGate(observedCapabilities);
      } catch (error) {
        if (!cancelled) {
          console.error(
            "[SyncSetup] Fresh server-clock observation failed:",
            safeErrorCategory(error),
          );
        }
        throw error;
      }
    })();
    stores.useLibraryStore
      .getState()
      .prepareSyncGeneration(cloudGenerationNumber, readiness);
    stores.useCollectionsStore
      .getState()
      .prepareSyncGeneration(cloudGenerationNumber, readiness);
    stores.useSettingsStore
      .getState()
      .prepareSyncGeneration(cloudGenerationNumber, readiness);
    progressStore
      .getState()
      .prepareSyncGeneration(cloudGenerationNumber, readiness);
    stores.useHistoryStore
      .getState()
      .prepareSyncGeneration(cloudGenerationNumber, readiness);
    return () => {
      cancelled = true;
    };
  }, [
    cloudGenerationNumber,
    cloudChapterProgressIntraPageVersion,
    convex,
    localStore,
    profileId,
    progressStore,
    sessionUserId,
    skipSubscriptions,
    stores,
  ]);
  const syncClockGateReady =
    syncClockGate?.convex === convex &&
    syncClockGate.localStore === localStore &&
    syncClockGate.profileId === profileId &&
    syncClockGate.userId === sessionUserId &&
    syncClockGate.generation === cloudGenerationNumber;
  const snapshotArgs =
    skipSubscriptions || cloudGeneration === undefined || !syncClockGateReady
      ? ("skip" as const)
      : { generation: cloudGeneration.generation };
  const libraryPages = usePaginatedQuery(
    api.sync.libraryItemsAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const sourceLinkPages = usePaginatedQuery(
    api.sync.sourceLinksAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const collectionPages = usePaginatedQuery(
    api.sync.collectionsAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const collectionItemPages = usePaginatedQuery(
    api.sync.collectionItemsAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const chapterProgressPages = usePaginatedQuery(
    api.sync.chapterProgressAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const mangaProgressPages = usePaginatedQuery(
    api.sync.mangaProgressAllV2,
    snapshotArgs,
    { initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE },
  );
  const settingsPages = usePaginatedQuery(api.settings.getV2, snapshotArgs, {
    initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
  });

  const snapshotPaginationPlan = useMemo(
    () =>
      planSyncSnapshotPagination([
        {
          key: "libraryItems",
          ...measureSyncSnapshotRows(libraryPages.results),
          status: libraryPages.status,
        },
        {
          key: "sourceLinks",
          ...measureSyncSnapshotRows(sourceLinkPages.results),
          status: sourceLinkPages.status,
        },
        {
          key: "collections",
          ...measureSyncSnapshotRows(collectionPages.results),
          status: collectionPages.status,
        },
        {
          key: "collectionItems",
          ...measureSyncSnapshotRows(collectionItemPages.results),
          status: collectionItemPages.status,
        },
        {
          key: "chapterProgress",
          ...measureSyncSnapshotRows(chapterProgressPages.results),
          status: chapterProgressPages.status,
        },
        {
          key: "mangaProgress",
          ...measureSyncSnapshotRows(mangaProgressPages.results),
          status: mangaProgressPages.status,
        },
        {
          key: "settings",
          ...measureSyncSnapshotRows(settingsPages.results),
          status: settingsPages.status,
        },
      ]),
    [
      chapterProgressPages.results,
      chapterProgressPages.status,
      collectionItemPages.results,
      collectionItemPages.status,
      collectionPages.results,
      collectionPages.status,
      libraryPages.results,
      libraryPages.status,
      mangaProgressPages.results,
      mangaProgressPages.status,
      settingsPages.results,
      settingsPages.status,
      sourceLinkPages.results,
      sourceLinkPages.status,
    ],
  );

  useEffect(() => {
    if (snapshotPaginationPlan.status === "budget-exceeded") {
      // Reported through the sync status below as "limit-exceeded" rather than
      // "offline": nothing here recovers on its own, and the round only runs
      // again on a remount (next app start, or requestSyncSnapshotRetry()).
      console.warn(
        `[SyncSetup] Snapshot budget exceeded (${snapshotPaginationPlan.key}, ${snapshotPaginationPlan.totalRows} rows, ${snapshotPaginationPlan.totalEstimatedBytes} estimated bytes); sync is paused until it is retried.`,
      );
      return;
    }
    if (snapshotPaginationPlan.status !== "load-more") return;
    const loadMore = {
      libraryItems: libraryPages.loadMore,
      sourceLinks: sourceLinkPages.loadMore,
      collections: collectionPages.loadMore,
      collectionItems: collectionItemPages.loadMore,
      chapterProgress: chapterProgressPages.loadMore,
      mangaProgress: mangaProgressPages.loadMore,
      settings: settingsPages.loadMore,
    }[snapshotPaginationPlan.key];
    loadMore(snapshotPaginationPlan.numItems);
  }, [
    chapterProgressPages,
    collectionItemPages,
    collectionPages,
    libraryPages,
    mangaProgressPages,
    settingsPages,
    snapshotPaginationPlan,
    sourceLinkPages,
  ]);

  const syncSnapshotBudgetExceeded =
    snapshotPaginationPlan.status === "budget-exceeded";

  // Sync protocol failures published by the mutation wrappers in
  // `sync-error-recovery`. Each one needs a different answer: a generation
  // mismatch self-heals by re-pulling, while a limit or upgrade failure is
  // terminal for this run and only the status can tell the user the truth.
  const syncRecovery = useSyncExternalStore(
    subscribeSyncRecovery,
    getSyncRecoveryRequest,
    getSyncRecoveryRequest,
  );
  const syncRecoveryKind = syncRecovery?.kind ?? null;

  useEffect(() => {
    if (syncRecovery?.kind !== "generation-mismatch") return;
    const { revision } = syncRecovery;
    const expectedIdentity = syncIdentityRef.current;
    let cancelled = false;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    void (async () => {
      try {
        // The account was reset on another device. Adopt the server's
        // generation, which drops local rows from the abandoned one and lets
        // the snapshot subscriptions re-hydrate from page one.
        const remote = await refreshSyncServerTime(
          () => convex.mutation(api.sync.observeGeneration, {}),
          shouldContinue,
        );
        if (!remote || !shouldContinue()) return;
        await prepareWebSnapshotGeneration(
          localStore,
          remote.generation,
          shouldContinue,
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "[SyncSetup] Sync generation recovery failed; will retry on the next failed write:",
            safeErrorCategory(error),
          );
        }
      } finally {
        if (!cancelled) clearSyncRecoveryRequest(revision);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convex, localStore, syncRecovery]);

  // A fresh snapshot run supersedes whatever stopped the previous one.
  useEffect(() => {
    const pending = getSyncRecoveryRequest();
    if (pending && pending.kind !== "generation-mismatch") {
      clearSyncRecoveryRequest(pending.revision);
    }
  }, []);

  const generation =
    syncSnapshotBudgetExceeded || !syncClockGateReady
      ? undefined
      : cloudGeneration?.generation;
  const cloudLibraryItems = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      libraryPages.results,
      generation,
      libraryPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => row.libraryItemId,
            (row) => row.inLibrary === false,
          ),
        };
  }, [generation, libraryPages.results, libraryPages.status]);
  const cloudSourceLinks = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      sourceLinkPages.results,
      generation,
      sourceLinkPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
            (row) => row.removed === true,
          ),
        };
  }, [generation, sourceLinkPages.results, sourceLinkPages.status]);
  const cloudCollections = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      collectionPages.results,
      generation,
      collectionPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => row.collectionId,
            (row) => row.removed === true,
          ),
        };
  }, [collectionPages.results, collectionPages.status, generation]);
  const cloudCollectionItems = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      collectionItemPages.results,
      generation,
      collectionItemPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => `${row.collectionId}\u0000${row.libraryItemId}`,
            (row) => row.removed === true,
          ),
        };
  }, [collectionItemPages.results, collectionItemPages.status, generation]);
  const cloudChapterProgress = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      chapterProgressPages.results,
      generation,
      chapterProgressPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}\u0000${row.sourceChapterId}`,
          ),
        };
  }, [chapterProgressPages.results, chapterProgressPages.status, generation]);
  const cloudMangaProgress = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      mangaProgressPages.results,
      generation,
      mangaProgressPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
          ),
        };
  }, [generation, mangaProgressPages.results, mangaProgressPages.status]);
  const cloudSettings = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      settingsPages.results,
      generation,
      settingsPages.status,
    );
    if (rows === null) return undefined;
    const installedSources = canonicalizeSyncSnapshotRecords(
      rows.flatMap((row) => row.installedSources),
      (source) => source.id,
      (source) => source.removed === true,
    );
    return {
      generation,
      installedSources,
      updatedAt: Math.max(0, ...rows.map((row) => row.updatedAt)),
    };
  }, [generation, settingsPages.results, settingsPages.status]);
  const oauthProvider = useQuery(
    api.auth.getOAuthProvider,
    skipSubscriptions ? "skip" : {},
  );

  const snapshotGeneration = consistentSyncGeneration(
    cloudLibraryItems,
    cloudSourceLinks,
    cloudCollections,
    cloudCollectionItems,
    cloudChapterProgress,
    cloudMangaProgress,
    cloudSettings,
  );

  const isSyncing =
    isAuthenticated &&
    !syncSnapshotBudgetExceeded &&
    (cloudLibraryItems === undefined ||
      cloudSourceLinks === undefined ||
      cloudCollections === undefined ||
      cloudCollectionItems === undefined ||
      cloudChapterProgress === undefined ||
      cloudMangaProgress === undefined ||
      cloudSettings === undefined ||
      snapshotGeneration === null);

  // Update sync status
  useEffect(() => {
    syncStore
      .getState()
      .setSyncStatus(
        syncRecoveryKind === "clock-invalid"
          ? "clock-invalid"
          : syncRecoveryKind === "upgrade-required"
            ? "upgrade-required"
            : syncSnapshotBudgetExceeded ||
                syncRecoveryKind === "limit-exceeded"
              ? "limit-exceeded"
              : syncApplyFailures.size > 0
                ? "offline"
                : isSyncing
                  ? "syncing"
                  : isAuthenticated
                    ? "synced"
                    : "offline",
      );
  }, [
    isAuthenticated,
    isSyncing,
    syncApplyFailures,
    syncRecoveryKind,
    syncSnapshotBudgetExceeded,
    syncStore,
  ]);

  // Update syncing dialog
  useEffect(() => {
    setShowSyncingDialog(
      isAuthenticated &&
        isSyncing &&
        !signingOut &&
        isFirstSync &&
        syncRecoveryKind === null,
    );
  }, [isAuthenticated, isSyncing, signingOut, isFirstSync, syncRecoveryKind]);

  // Auth state tracking
  useEffect(() => {
    syncStore.getState().setAuthState(isAuthenticated, isLoading);
  }, [isAuthenticated, isLoading, syncStore]);
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      // signOut() deliberately leaves this guard set while the remote auth
      // request is in flight. Only resume after Convex auth confirms logout.
      setSyncSubscriptionsStopped(false);
    }
  }, [isAuthenticated, isLoading]);
  useEffect(() => {
    if (session?.user) {
      syncStore.getState().setUser({
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        image: session.user.image ?? null,
      });
    } else {
      syncStore.getState().setUser(null);
    }
  }, [session, syncStore]);
  useEffect(() => {
    if (!isAuthenticated) {
      syncStore.getState().setOAuthProvider(null);
      return;
    }
    if (oauthProvider !== undefined) {
      syncStore
        .getState()
        .setOAuthProvider(normalizeOAuthProvider(oauthProvider));
    }
  }, [isAuthenticated, oauthProvider, syncStore]);
  useEffect(() => {
    if (!isAuthenticated && signingOut) setSigningOut(false);
  }, [isAuthenticated, signingOut]);

  // Apply cloud data to local IDB (and update zustand stores directly from snapshots).
  useEffect(() => {
    // Keep library_items + source_links consistent for UI joins:
    // apply both snapshots as a unit, then update the library store directly (no load()).
    if (
      !cloudLibraryItems ||
      !cloudSourceLinks ||
      snapshotGeneration === null ||
      subscriptionStoppedRef.current
    )
      return;
    let cancelled = false;
    const expectedIdentity = syncIdentityRef.current;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    (async () => {
      try {
        if (
          !(await prepareWebSnapshotGeneration(
            localStore,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;
        const merged = await applyWebLibrarySyncSnapshot({
          localStore,
          convex: convex as ConvexReactClient,
          cloudItems: mapCloudLibraryItems(
            cloudLibraryItems.rows,
          ) as LocalLibraryItem[],
          cloudLinks: mapCloudSourceLinks(
            cloudSourceLinks.rows,
          ) as LocalSourceLink[],
          generation: snapshotGeneration,
          expectedUserId: expectedIdentity.userId!,
          shouldContinue,
        });
        if (!merged || !shouldContinue()) return;
        const [items, links] = await Promise.all([
          localStore.getAllLibraryItems({ includeRemoved: true }),
          localStore.getAllSourceLinks(),
        ]);
        if (!shouldContinue()) return;
        // Update Zustand store from snapshots (no IDB read, no load()).
        const linksByItem = new Map<string, LocalSourceLink[]>();
        for (const link of links) {
          if (link.removed) continue;
          const arr = linksByItem.get(link.libraryItemId) ?? [];
          arr.push(link);
          linksByItem.set(link.libraryItemId, arr);
        }

        const entries: LibraryEntry[] = items
          .map((it) => ({
            item: it,
            sources: linksByItem.get(it.libraryItemId) ?? [],
          }))
          .filter((e) => e.item.inLibrary !== false && e.sources.length > 0);

        if (!shouldContinue()) return;
        stores.useLibraryStore
          .getState()
          .replaceSyncSnapshot(entries, snapshotGeneration);
        markSyncApplySucceeded("library");
      } catch (e) {
        markSyncApplyFailed("library", e, shouldContinue);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cloudLibraryItems,
    cloudSourceLinks,
    convex,
    isAuthenticated,
    localStore,
    markSyncApplyFailed,
    markSyncApplySucceeded,
    profileId,
    session?.user?.id,
    snapshotGeneration,
    stores,
    syncApplyRetryRevision.library,
  ]);

  useEffect(() => {
    if (
      !cloudCollections ||
      !cloudCollectionItems ||
      !cloudLibraryItems ||
      snapshotGeneration === null ||
      subscriptionStoppedRef.current
    )
      return;
    let cancelled = false;
    const expectedIdentity = syncIdentityRef.current;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    (async () => {
      try {
        if (
          !(await prepareWebSnapshotGeneration(
            localStore,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;
        const merged = await applyWebCollectionsSyncSnapshot({
          localStore,
          convex: convex as ConvexReactClient,
          cloudCollections: mapCloudCollections(
            cloudCollections.rows,
          ) as LocalCollection[],
          cloudCollectionItems: mapCloudCollectionItems(
            cloudCollectionItems.rows,
          ) as LocalCollectionItem[],
          cloudLibraryItems: mapCloudLibraryItems(
            cloudLibraryItems.rows,
          ) as LocalLibraryItem[],
          generation: snapshotGeneration,
          expectedUserId: expectedIdentity.userId!,
          shouldContinue,
        });
        if (!merged || !shouldContinue()) return;
        const [allCollections, collectionItems] = await Promise.all([
          localStore.getCollections(),
          localStore.getCollectionItems(),
        ]);
        if (!shouldContinue()) return;
        const collections = allCollections.filter(
          (collection) => !collection.removed,
        );

        collections.sort((a, b) => {
          if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
          return a.collectionId.localeCompare(b.collectionId);
        });

        if (!shouldContinue()) return;
        stores.useCollectionsStore
          .getState()
          .replaceSyncSnapshot(
            collections,
            collectionItems,
            snapshotGeneration,
          );
        markSyncApplySucceeded("collections");
      } catch (e) {
        markSyncApplyFailed("collections", e, shouldContinue);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cloudCollections,
    cloudCollectionItems,
    cloudLibraryItems,
    convex,
    isAuthenticated,
    localStore,
    markSyncApplyFailed,
    markSyncApplySucceeded,
    profileId,
    session?.user?.id,
    snapshotGeneration,
    stores,
    syncApplyRetryRevision.collections,
  ]);

  useEffect(() => {
    if (
      !cloudChapterProgress ||
      snapshotGeneration === null ||
      subscriptionStoppedRef.current
    )
      return;
    let cancelled = false;
    const expectedIdentity = syncIdentityRef.current;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    (async () => {
      try {
        if (!shouldContinue()) return;
        if (
          !(await prepareWebSnapshotGeneration(
            localStore,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;
        const batch = mapCloudChapterProgress(
          cloudChapterProgress.rows,
        ) as LocalChapterProgress[];
        if (!shouldContinue()) return;
        const applied = await applyWebChapterProgressSyncSnapshot({
          localStore,
          convex,
          cloudProgress: batch,
          generation: snapshotGeneration,
          expectedUserId: expectedIdentity.userId!,
          chapterProgressIntraPageVersion:
            syncClockGate?.chapterProgressIntraPageVersion,
          shouldContinue,
        });
        if (!applied || !shouldContinue()) return;
        stores.useHistoryStore
          .getState()
          .replaceSyncSnapshot(applied, snapshotGeneration);
        markSyncApplySucceeded("chapter-progress");
      } catch (error) {
        markSyncApplyFailed("chapter-progress", error, shouldContinue);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cloudChapterProgress,
    convex,
    isAuthenticated,
    localStore,
    markSyncApplyFailed,
    markSyncApplySucceeded,
    profileId,
    session?.user?.id,
    snapshotGeneration,
    stores,
    syncClockGate?.chapterProgressIntraPageVersion,
    chapterProgressRetryRevision,
  ]);

  useEffect(() => {
    if (
      !cloudMangaProgress ||
      snapshotGeneration === null ||
      subscriptionStoppedRef.current
    )
      return;
    let cancelled = false;
    const expectedIdentity = syncIdentityRef.current;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    (async () => {
      try {
        if (!shouldContinue()) return;
        if (
          !(await prepareWebSnapshotGeneration(
            localStore,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;
        const batch = mapCloudMangaProgress(
          cloudMangaProgress.rows,
        ) as LocalMangaProgress[];
        if (!shouldContinue()) return;
        const applied = await localStore.applyMangaProgressSnapshot(
          batch,
          snapshotGeneration,
          shouldContinue,
        );
        if (!applied || !shouldContinue()) return;
        // Update reactive index directly (no load()).
        progressStore
          .getState()
          .replaceSyncSnapshot(applied.progress, snapshotGeneration);
        markSyncApplySucceeded("manga-progress");
      } catch (error) {
        markSyncApplyFailed("manga-progress", error, shouldContinue);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cloudMangaProgress,
    isAuthenticated,
    localStore,
    markSyncApplyFailed,
    markSyncApplySucceeded,
    profileId,
    progressStore,
    session?.user?.id,
    snapshotGeneration,
    mangaProgressRetryRevision,
  ]);

  useEffect(() => {
    if (
      !cloudSettings ||
      snapshotGeneration === null ||
      subscriptionStoppedRef.current
    )
      return;
    let cancelled = false;
    const expectedIdentity = syncIdentityRef.current;
    const shouldContinue = () =>
      isWebSyncRunCurrent(
        expectedIdentity,
        syncIdentityRef.current,
        cancelled,
        subscriptionStoppedRef.current,
      );
    (async () => {
      try {
        if (!shouldContinue()) return;
        if (
          !(await prepareWebSnapshotGeneration(
            localStore,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;
        const cloudSources = cloudSettings.installedSources ?? [];
        const mergedSources = await applyWebInstalledSourcesSyncSnapshot({
          localStore,
          convex: convex as ConvexReactClient,
          cloudSources,
          generation: snapshotGeneration,
          expectedUserId: expectedIdentity.userId!,
          shouldContinue,
        });
        if (!mergedSources || !shouldContinue()) return;
        const finalSources = await localStore.getInstalledSources();
        if (!shouldContinue()) return;

        // Update settings store - filter out tombstones for UI
        const activeSources = finalSources.filter((s) => !s.removed);
        stores.useSettingsStore
          .getState()
          .replaceInstalledSourcesSnapshot(activeSources, snapshotGeneration);
        markSyncApplySucceeded("settings");
      } catch (error) {
        markSyncApplyFailed("settings", error, shouldContinue);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cloudSettings,
    convex,
    isAuthenticated,
    localStore,
    markSyncApplyFailed,
    markSyncApplySucceeded,
    profileId,
    session?.user?.id,
    snapshotGeneration,
    stores,
    syncApplyRetryRevision.settings,
  ]);

  // Reload stores whenever the provider swaps the profile container.
  useEffect(() => {
    const reloadProfileStores = () => {
      void Promise.all([
        progressStore.getState().load(),
        stores.useSettingsStore.getState().initialize(),
        stores.useLibraryStore.getState().load(false),
        stores.useCollectionsStore.getState().load(),
        sourceSettingsStore.getState().initialize(),
      ]).catch((error) => {
        console.error(
          "[sync] Failed to reload profile stores:",
          safeErrorCategory(error),
        );
      });
    };
    reloadProfileStores();
    window.addEventListener(LOCAL_PROFILE_IMPORT_EVENT, reloadProfileStores);
    return () => {
      window.removeEventListener(
        LOCAL_PROFILE_IMPORT_EVENT,
        reloadProfileStores,
      );
    };
  }, [profileId, progressStore, sourceSettingsStore, stores]);

  // Import dialog logic
  useEffect(() => {
    if (!isAuthenticated || isLoading || !session?.user?.id) return;

    const expectedIdentity = syncIdentityRef.current;
    const userId = session.user.id;
    if (expectedIdentity.userId !== userId) return;

    const activeOffer = importOfferIdentityRef.current;
    if (activeOffer === expectedIdentity) return;
    if (activeOffer) cancelImportOffer(activeOffer);
    if (getImportDecision(userId)) return;
    if (wasImportOfferedThisSession(userId)) return;

    let cancelled = false;
    const defaultStore = new IndexedDBUserDataStore();

    void checkImportOfferEligibility(
      expectedIdentity,
      defaultStore,
      localStore,
      () => cancelled,
    )
      .then((eligible) => {
        if (!eligible) return;
        if (
          !isWebSyncRunCurrent(
            expectedIdentity,
            syncIdentityRef.current,
            cancelled,
            subscriptionStoppedRef.current,
          )
        ) {
          return;
        }
        if (importOfferIdentityRef.current !== null) return;
        markImportOfferedThisSession(userId);
        publishImportOffer(expectedIdentity);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[SyncSetup] Import check failed:", safeErrorCategory(e));
      });

    return () => {
      cancelled = true;
    };
  }, [
    cancelImportOffer,
    checkImportOfferEligibility,
    isAuthenticated,
    isLoading,
    localStore,
    publishImportOffer,
    session?.user?.id,
    subscriptionsStopped,
  ]);

  // IDB blocked dialog
  const shouldDebugIdbUi =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location?.search?.includes("idbMockUpgrade=1");
  const shouldForceIdbDialog =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location?.search?.includes("idbForceDialog=1");

  useEffect(() => {
    if (shouldDebugIdbUi) {
      try {
        const buffered = sessionStorage.getItem(IDB_UI_EVENT_BUFFER_KEY);
        if (buffered) {
          sessionStorage.removeItem(IDB_UI_EVENT_BUFFER_KEY);
          const parsed = JSON.parse(buffered) as IdbBlockedEventDetail;
          setIdbBlocked(parsed);
          setIdbDialogOpen(true);
        }
      } catch {
        // ignore malformed buffered event payloads
      }
    }
    if (shouldForceIdbDialog) {
      setIdbBlocked({
        dbName: "nemu-user",
        kind: "blocked",
        requestedVersion: 999,
      });
      setIdbDialogOpen(true);
    }
    const handler = (e: CustomEvent<IdbBlockedEventDetail>) => {
      setIdbBlocked(e.detail);
      setIdbDialogOpen(true);
      if (shouldDebugIdbUi) {
        try {
          sessionStorage.setItem(
            IDB_UI_EVENT_BUFFER_KEY,
            JSON.stringify(e.detail),
          );
        } catch {
          // ignore storage failures
        }
      }
    };
    window.addEventListener(IDB_UI_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(IDB_UI_EVENT, handler as EventListener);
  }, [shouldDebugIdbUi, shouldForceIdbDialog]);

  useEffect(() => {
    if (shouldDebugIdbUi) {
      const sticky = localStorage.getItem(MOCK_BLOCK_STICKY_KEY);
      if (sticky === "true") {
        setIdbBlocked({ dbName: "nemu-user", kind: "blocked" });
        setIdbDialogOpen(true);
      }
    }
  }, [shouldDebugIdbUi]);

  // Import handlers
  const handleImportLocal = async () => {
    const expectedIdentity = importOfferIdentity;
    if (!expectedIdentity || importActionTokenRef.current !== null) return;
    if (
      !isWebImportOfferActionCurrent(
        expectedIdentity,
        importOfferIdentityRef.current,
        syncIdentityRef.current,
        false,
        subscriptionStoppedRef.current,
      )
    ) {
      cancelImportOffer(expectedIdentity);
      return;
    }

    const userId = expectedIdentity.userId;
    if (!userId || expectedIdentity.localStore !== localStore) {
      cancelImportOffer(expectedIdentity);
      return;
    }

    const actionToken: WebImportActionToken = {
      offerIdentity: expectedIdentity,
    };
    importActionTokenRef.current = actionToken;
    setImportActionIdentity(expectedIdentity);
    const shouldContinue = () =>
      importActionTokenRef.current === actionToken &&
      isWebSyncRunCurrent(
        actionToken.offerIdentity,
        syncIdentityRef.current,
        importActionTokenRef.current !== actionToken,
        subscriptionStoppedRef.current,
      );
    let localImportCommitted = false;

    try {
      const defaultStore = new IndexedDBUserDataStore();
      // Confirmation re-runs the complete offer predicate. A stale dialog, a
      // newly populated cloud/local profile, or removed legacy data aborts
      // before any import write can begin.
      const stillEligible = await checkImportOfferEligibility(
        expectedIdentity,
        defaultStore,
        localStore,
        () => importActionTokenRef.current !== actionToken,
      );
      if (!shouldContinue()) return;
      if (!stillEligible) {
        cancelImportOffer(expectedIdentity);
        return;
      }

      const [legacyData, legacyHistory] = await Promise.all([
        defaultStore.getLibrary(),
        defaultStore.getAllLegacyHistory(),
      ]);
      if (!shouldContinue()) return;

      // Preserve the legacy row id. The import spans several IndexedDB
      // transactions, so a quota/connection failure can leave a durable prefix
      // before the user retries. Stable ids make that retry an idempotent
      // overwrite instead of duplicating already-imported library entries.
      const importedLibrary = legacyData.map((legacy) =>
        convertLegacyLibraryEntry(legacy),
      );
      const libraryItemBySource = new Map<string, string>();
      for (const imported of importedLibrary) {
        for (const link of imported.links) {
          libraryItemBySource.set(link.id, imported.item.libraryItemId);
        }
      }
      const importedHistory = legacyHistory.map((entry) =>
        convertLegacyHistoryEntry(
          entry,
          libraryItemBySource.get(
            makeSourceLinkId(entry.registryId, entry.sourceId, entry.mangaId),
          ),
        ),
      );
      const importedMangaProgress = deriveLegacyMangaProgress(importedHistory);

      const writeResult = await localStore.runWithSyncWrite(async (lease) => {
        if (!shouldContinue()) return null;
        for (const imported of importedLibrary) {
          await localStore.saveLibraryItem(imported.item, lease);
          if (!shouldContinue()) return null;
          for (const link of imported.links) {
            await localStore.saveSourceLink(link, lease);
            if (!shouldContinue()) return null;
          }
        }
        await localStore.saveChapterProgressBatch(importedHistory, lease);
        if (!shouldContinue()) return null;
        await localStore.saveMangaProgressBatch(importedMangaProgress, lease);
        if (!shouldContinue()) return null;
        const generation = await localStore.getSyncGeneration();
        if (!shouldContinue()) return null;
        return { generation };
      });
      if (!shouldContinue() || writeResult === null) return;

      // The account import is now durable locally. Mark it only after that
      // boundary so an IndexedDB/quota failure can still be retried.
      setImportDecision(userId, "imported");
      localImportCommitted = true;
      dismissImportOffer(expectedIdentity);

      // Explicitly push the imported winners. Direct IndexedDB writes do not
      // trigger the subscription effect by themselves; if transport fails,
      // the durable local winners will be retried by a later snapshot round.
      if (writeResult.generation !== null && shouldContinue()) {
        try {
          for (const imported of importedLibrary) {
            if (!shouldContinue()) return;
            for (const input of toCloudLibrarySaveInputBatches(
              imported.item,
              imported.links,
            )) {
              if (!shouldContinue()) return;
              await convex.mutation(api.library.save, {
                expectedUserId: userId,
                ...input,
                generation: writeResult.generation,
              });
            }
          }
          for (const entry of importedHistory) {
            if (!shouldContinue()) return;
            await convex.mutation(api.history.save, {
              expectedUserId: userId,
              ...toCloudHistorySaveInput(entry, {
                includeIntraPageState:
                  syncClockGateReady &&
                  syncClockGate?.generation === writeResult.generation &&
                  supportsChapterProgressIntraPageSync(
                    syncClockGate.chapterProgressIntraPageVersion,
                  ),
              }),
              generation: writeResult.generation,
            });
            if (!shouldContinue()) return;
          }
        } catch (error) {
          if (shouldContinue()) {
            console.warn(
              "[SyncSetup] Imported locally; cloud push will retry on a later sync:",
              safeErrorCategory(error),
            );
          }
        }
      }

      if (!shouldContinue()) return;
      await Promise.all([
        stores.useLibraryStore.getState().load(false),
        progressStore.getState().load(),
      ]);
      if (!shouldContinue()) return;
    } catch (e) {
      if (shouldContinue()) {
        console.error(
          localImportCommitted
            ? "[SyncSetup] Post-import refresh failed:"
            : "[SyncSetup] Import failed:",
          safeErrorCategory(e),
        );
      }
    } finally {
      if (importActionTokenRef.current === actionToken) {
        importActionTokenRef.current = null;
      }
      setImportActionIdentity((current) =>
        current === expectedIdentity ? null : current,
      );
    }
  };

  const handleSkipImport = () => {
    const expectedIdentity = importOfferIdentity;
    if (!expectedIdentity || importActionTokenRef.current !== null) return;
    if (
      !isWebImportOfferActionCurrent(
        expectedIdentity,
        importOfferIdentityRef.current,
        syncIdentityRef.current,
        false,
        subscriptionStoppedRef.current,
      )
    ) {
      cancelImportOffer(expectedIdentity);
      return;
    }
    const userId = expectedIdentity.userId;
    if (!userId) {
      cancelImportOffer(expectedIdentity);
      return;
    }
    setImportDecision(userId, "skipped");
    cancelImportOffer(expectedIdentity);
  };

  const idbDescription =
    idbBlocked?.kind === "versionchange"
      ? t("storage.idbLock.descriptionVersionChange")
      : t("storage.idbLock.descriptionBlocked");

  // Render dialogs only (portals) - main app tree is unaffected by re-renders
  return (
    <>
      {/* Syncing dialog */}
      <ResponsiveDialog open={showSyncingDialog} dismissible={false}>
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("sync.syncing")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("sync.syncingDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex justify-center py-4">
            <div className="relative">
              <div className="size-10 rounded-full border-4 border-muted" />
              <div className="absolute inset-0 size-10 rounded-full border-4 border-t-primary animate-spin" />
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Invalid clock dialog */}
      <ResponsiveDialog
        open={syncRecoveryKind === "clock-invalid"}
        dismissible={false}
      >
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t("sync.clockInvalid.title")}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("sync.clockInvalid.description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button onClick={() => window.location.reload()}>
              {t("sync.clockInvalid.reload")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* IDB blocked dialog */}
      <ResponsiveDialog
        open={idbDialogOpen}
        onOpenChange={setIdbDialogOpen}
        dismissible={false}
      >
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t("storage.idbLock.title")}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {idbDescription}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button onClick={() => window.location.reload()}>
              {t("storage.idbLock.reload")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Import dialog */}
      <ResponsiveDialog
        open={importOfferIdentity !== null}
        onOpenChange={(open) => {
          if (!open && importOfferIdentity) {
            cancelImportOffer(importOfferIdentity);
          }
        }}
      >
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("import.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("import.description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={handleSkipImport}
              disabled={importActionIdentity === importOfferIdentity}
            >
              {t("import.skip")}
            </Button>
            <Button
              onClick={handleImportLocal}
              disabled={importActionIdentity === importOfferIdentity}
            >
              {t("import.confirm")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

/**
 * SyncSetup keys its run on the retry counter so `requestSyncSnapshotRetry()`
 * (and every fresh app start) restarts a sync round that stopped on a hard
 * limit. Without the remount, an exhausted snapshot budget disabled sync for
 * the entire session with no way back.
 */
export function SyncSetup() {
  const attempt = useSyncExternalStore(
    subscribeSyncSnapshotRetry,
    getSyncSnapshotRetryAttempt,
    getSyncSnapshotRetryAttempt,
  );
  return <SyncSetupRun key={attempt} />;
}
