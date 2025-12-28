/**
 * SyncSetup - All hooks, renders null (or portaled dialogs)
 * 
 * This component is a SIBLING to the app tree, not a parent.
 * When it re-renders, the app tree is unaffected.
 */

import { useEffect, useState } from "react";
import { useConvexAuth, useConvex, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { IDB_UI_EVENT, IndexedDBUserDataStore } from "@/data/indexeddb";
import type { LocalLibraryItem, LocalSourceLink, LocalMangaProgress, LocalChapterProgress } from "@/data/schema";
import { makeSourceLinkId, makeChapterProgressId, makeMangaProgressId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { getSyncStore } from "@/stores/sync";
import { authClient } from "@/lib/auth-client";
import { useDataServices, useProgressStoreApi, useProfileId, useStores } from "@/data/context";
import {
  convexRef,
  isAuthenticatedRef,
  sessionUserIdRef,
  subscriptionStoppedRef,
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

const IDB_UI_EVENT_BUFFER_KEY = "nemu:idb-ui-event";
const MOCK_BLOCK_STICKY_KEY = "nemu:idb-mock-blocked-sticky";
const IMPORT_OFFERED_SESSION_KEY = "nemu:import-offered-session";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:";
type ImportDecision = "skipped" | "imported";
type IdbBlockedEventDetail = {
  dbName: string;
  requestedVersion?: number;
  kind: "blocked" | "versionchange";
};

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
  } catch {}
}

export function SyncSetup() {
  const { t } = useTranslation();
  
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const syncStore = getSyncStore();
  const { data: session } = authClient.useSession();
  const { localStore } = useDataServices();
  const stores = useStores();
  const progressStore = useProgressStoreApi();
  const profileId = useProfileId();

  const [signingOut, setSigningOut] = useState(false);
  const [isFirstSync, setIsFirstSync] = useState(true);
  
  // Dialog states
  const [showSyncingDialog, setShowSyncingDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [idbDialogOpen, setIdbDialogOpen] = useState(false);
  const [idbBlocked, setIdbBlocked] = useState<IdbBlockedEventDetail | null>(null);

  // Update module-level refs
  convexRef.current = convex as ConvexReactClient;
  isAuthenticatedRef.current = isAuthenticated;
  sessionUserIdRef.current = session?.user?.id;

  // Check if first sync
  useEffect(() => {
    let cancelled = false;
    setIsFirstSync(true);
    localStore.hasSyncedData().then((hasSynced) => {
      if (!cancelled) setIsFirstSync(!hasSynced);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [localStore]);

  // ============================================================================
  // Convex subscriptions
  // ============================================================================
  const skipSubscriptions = !isAuthenticated || signingOut || subscriptionStoppedRef.current;
  
  const cloudLibraryItems = useQuery(api.sync.libraryItemsAll, skipSubscriptions ? "skip" : {});
  const cloudSourceLinks = useQuery(api.sync.sourceLinksAll, skipSubscriptions ? "skip" : {});
  const cloudChapterProgress = useQuery(api.sync.chapterProgressAll, skipSubscriptions ? "skip" : {});
  const cloudMangaProgress = useQuery(api.sync.mangaProgressAll, skipSubscriptions ? "skip" : {});
  const cloudSettings = useQuery(api.settings.get, skipSubscriptions ? "skip" : {});

  const isSyncing = isAuthenticated && (
    cloudLibraryItems === undefined ||
    cloudSourceLinks === undefined ||
    cloudSettings === undefined
  );

  // Update sync status
  useEffect(() => {
    syncStore.getState().setSyncStatus(isSyncing ? "syncing" : isAuthenticated ? "synced" : "offline");
  }, [isAuthenticated, isSyncing, syncStore]);

  // Update syncing dialog
  useEffect(() => {
    setShowSyncingDialog(isAuthenticated && isSyncing && !signingOut && isFirstSync);
  }, [isAuthenticated, isSyncing, signingOut, isFirstSync]);

  // Auth state tracking
  useEffect(() => { syncStore.getState().setAuthState(isAuthenticated, isLoading); }, [isAuthenticated, isLoading, syncStore]);
  useEffect(() => {
    if (session?.user) {
      syncStore.getState().setUser({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? "", image: session.user.image ?? null });
    } else {
      syncStore.getState().setUser(null);
    }
  }, [session, syncStore]);
  useEffect(() => { if (!isAuthenticated && signingOut) setSigningOut(false); }, [isAuthenticated, signingOut]);

  // Apply cloud data to local IDB (and update zustand stores directly from snapshots).
  useEffect(() => {
    // Keep library_items + source_links consistent for UI joins:
    // apply both snapshots as a unit, then update the library store directly (no load()).
    if (!cloudLibraryItems || !cloudSourceLinks || subscriptionStoppedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const items: LocalLibraryItem[] = cloudLibraryItems.map((item) => ({
          libraryItemId: item.id,
          metadata: item.metadata,
          externalIds: item.externalIds,
          inLibrary: item.inLibrary ?? true,
          overrides: item.overrides,
          sourceOrder: item.sourceOrder,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));

        const links: LocalSourceLink[] = cloudSourceLinks.map((link) => ({
          id: makeSourceLinkId(link.registryId, link.sourceId, link.sourceMangaId),
          libraryItemId: link.libraryItemId,
          registryId: link.registryId,
          sourceId: link.sourceId,
          sourceMangaId: link.sourceMangaId,
          latestChapter: link.latestChapter,
          latestChapterSortKey: link.latestChapterSortKey,
          latestFetchedAt: link.latestFetchedAt,
          updateAckChapter: link.updateAckChapter,
          updateAckChapterSortKey: link.updateAckChapterSortKey,
          updateAckAt: link.updateAckAt,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        }));

        // Apply library snapshot in a single IDB transaction (reduces partial local state windows).
        await localStore.saveLibrarySnapshot(items, links);

        if (cancelled) return;
        // Update Zustand store from snapshots (no IDB read, no load()).
        const linksByItem = new Map<string, LocalSourceLink[]>();
        for (const link of links) {
          const arr = linksByItem.get(link.libraryItemId) ?? [];
          arr.push(link);
          linksByItem.set(link.libraryItemId, arr);
        }

        const entries: LibraryEntry[] = items
          .map((it) => ({ item: it, sources: linksByItem.get(it.libraryItemId) ?? [] }))
          .filter((e) => e.sources.length > 0);

        stores.useLibraryStore.setState({ entries, loading: false, error: null });
      } catch (e) {
        console.error("[SyncSetup] Failed to apply library snapshot:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [cloudLibraryItems, cloudSourceLinks, localStore, stores]);

  useEffect(() => {
    if (!cloudChapterProgress || subscriptionStoppedRef.current) return;
    (async () => {
      const batch: LocalChapterProgress[] = cloudChapterProgress.map((cp) => ({
        id: makeChapterProgressId(cp.registryId, cp.sourceId, cp.sourceMangaId, cp.sourceChapterId),
        registryId: cp.registryId,
        sourceId: cp.sourceId,
        sourceMangaId: cp.sourceMangaId,
        sourceChapterId: cp.sourceChapterId,
        libraryItemId: cp.libraryItemId,
        progress: cp.progress,
        total: cp.total,
        completed: cp.completed,
        lastReadAt: cp.lastReadAt,
        chapterNumber: cp.chapterNumber,
        volumeNumber: cp.volumeNumber,
        chapterTitle: cp.chapterTitle,
        updatedAt: cp.updatedAt,
      }));
      await localStore.saveChapterProgressBatch(batch);
    })();
  }, [cloudChapterProgress, localStore]);

  useEffect(() => {
    if (!cloudMangaProgress || subscriptionStoppedRef.current) return;
    (async () => {
      const batch: LocalMangaProgress[] = cloudMangaProgress.map((mp) => ({
        id: makeMangaProgressId(mp.registryId, mp.sourceId, mp.sourceMangaId),
        registryId: mp.registryId,
        sourceId: mp.sourceId,
        sourceMangaId: mp.sourceMangaId,
        libraryItemId: mp.libraryItemId,
        lastReadAt: mp.lastReadAt,
        lastReadSourceChapterId: mp.lastReadSourceChapterId,
        lastReadChapterNumber: mp.lastReadChapterNumber,
        lastReadVolumeNumber: mp.lastReadVolumeNumber,
        lastReadChapterTitle: mp.lastReadChapterTitle,
        updatedAt: mp.updatedAt,
      }));
      await localStore.saveMangaProgressBatch(batch);
      // Update reactive index directly (no load()).
      const map = new Map<string, LocalMangaProgress>();
      for (const entry of batch) map.set(entry.id, entry);
      progressStore.setState({ index: map, loading: false });
    })();
  }, [cloudMangaProgress, localStore, progressStore]);

  useEffect(() => {
    if (!cloudSettings || subscriptionStoppedRef.current) return;
    (async () => {
      await localStore.saveSettings({ installedSources: cloudSettings.installedSources ?? [] });
      // Update settings store directly (no initialize()).
      const installedSources = cloudSettings.installedSources ?? [];
      const installedIds = new Set(installedSources.map((s) => s.id));
      stores.useSettingsStore.setState((state) => ({
        installedSources,
        availableSources: state.availableSources.map((s) => ({
          ...s,
          installed: installedIds.has(`${s.registryId}:${s.id}`),
        })),
      }));
    })();
  }, [cloudSettings, localStore, stores]);

  // Reload stores whenever the provider swaps the profile container.
  useEffect(() => {
    progressStore.getState().load();
    Promise.all([
      stores.useSettingsStore.getState().initialize(),
      stores.useLibraryStore.getState().load(false),
    ]);
    getSourceSettingsStore().getState().initialize();
  }, [profileId, progressStore, stores]);

  // Import dialog logic
  useEffect(() => {
    if (!isAuthenticated || isLoading || !session?.user?.id) return;

    const userId = session.user.id;
    if (getImportDecision(userId)) return;
    if (sessionStorage.getItem(IMPORT_OFFERED_SESSION_KEY)) return;

    (async () => {
      try {
        const defaultStore = new IndexedDBUserDataStore();
        const hasLocalLegacy = await defaultStore.hasLibraryData();
        if (!hasLocalLegacy) return;

        let cloudEmpty = false;
        try {
          const items = await convex.query(api.sync.libraryItemsAll, {});
          cloudEmpty = items.length === 0;
        } catch {
          return;
        }
        if (!cloudEmpty) return;

        const currentEntries = await localStore.getLibraryEntries();
        if (currentEntries.length > 0) return;

        sessionStorage.setItem(IMPORT_OFFERED_SESSION_KEY, "true");
        setShowImportDialog(true);
      } catch (e) {
        console.error("[SyncSetup] Import check failed:", e);
      }
    })();
  }, [isAuthenticated, isLoading, session?.user?.id, convex, localStore]);

  // IDB blocked dialog
  const shouldDebugIdbUi = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbMockUpgrade=1");
  const shouldForceIdbDialog = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbForceDialog=1");

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
      } catch {}
    }
    if (shouldForceIdbDialog) {
      setIdbBlocked({ dbName: "nemu-user", kind: "blocked", requestedVersion: 999 });
      setIdbDialogOpen(true);
    }
    const handler = (e: CustomEvent<IdbBlockedEventDetail>) => {
      setIdbBlocked(e.detail);
      setIdbDialogOpen(true);
      if (shouldDebugIdbUi) {
        try { sessionStorage.setItem(IDB_UI_EVENT_BUFFER_KEY, JSON.stringify(e.detail)); } catch {}
      }
    };
    window.addEventListener(IDB_UI_EVENT, handler as EventListener);
    return () => window.removeEventListener(IDB_UI_EVENT, handler as EventListener);
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
    const userId = sessionUserIdRef.current;
    if (!userId) return;
    setShowImportDialog(false);
    setImportDecision(userId, "imported");

    try {
      const defaultStore = new IndexedDBUserDataStore();
      const legacyData = await defaultStore.getLibrary();
      
      for (const legacy of legacyData) {
        const rawId = String(legacy.id ?? "");
        const first = rawId.indexOf(":");
        const second = first === -1 ? -1 : rawId.indexOf(":", first + 1);
        if (first === -1 || second === -1) continue;

        const registryId = rawId.slice(0, first);
        const sourceId = rawId.slice(first + 1, second);
        const sourceMangaId = rawId.slice(second + 1);
        
        const libraryItemId = crypto.randomUUID();
        const now = Date.now();
        
        const item: LocalLibraryItem = {
          libraryItemId,
          metadata: legacy.metadata ?? { title: "Unknown" },
          externalIds: legacy.externalIds,
          inLibrary: true,
          createdAt: legacy.addedAt ?? now,
          updatedAt: now,
        };
        
        if (legacy.overrides) {
          item.overrides = { metadata: legacy.overrides };
        }
        if (legacy.coverCustom) {
          item.overrides = { ...item.overrides, coverUrl: legacy.coverCustom };
        }
        
        // Save directly to localStore (will sync to cloud via ops)
        await localStore.saveLibraryItem(item);
        
        const sourceLink: LocalSourceLink = {
          id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
          libraryItemId,
          registryId,
          sourceId,
          sourceMangaId,
          createdAt: now,
          updatedAt: now,
        };
        
        await localStore.saveSourceLink(sourceLink);
      }
      
      // Import history
      const legacyHistory = await defaultStore.getAllLegacyHistory();
      for (const entry of legacyHistory) {
        await stores.useHistoryStore.getState().saveProgress(
          entry.registryId,
          entry.sourceId,
          entry.mangaId,
          entry.chapterId,
          entry.progress,
          entry.total,
          {
            chapterNumber: entry.chapterNumber,
            volumeNumber: entry.volumeNumber,
            chapterTitle: entry.chapterTitle,
          }
        );
      }
      
      stores.useLibraryStore.getState().load(false);
    } catch (e) {
      console.error("[SyncSetup] Import failed:", e);
    }
  };

  const handleSkipImport = () => {
    const userId = sessionUserIdRef.current;
    if (!userId) return;
    setShowImportDialog(false);
    setImportDecision(userId, "skipped");
  };

  const idbDescription = idbBlocked?.kind === "versionchange"
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
            <ResponsiveDialogDescription>{t("sync.syncingDescription")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex justify-center py-4">
            <div className="relative">
              <div className="size-10 rounded-full border-4 border-muted" />
              <div className="absolute inset-0 size-10 rounded-full border-4 border-t-primary animate-spin" />
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      
      {/* IDB blocked dialog */}
      <ResponsiveDialog open={idbDialogOpen} onOpenChange={setIdbDialogOpen} dismissible={false}>
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("storage.idbLock.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{idbDescription}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button onClick={() => window.location.reload()}>{t("storage.idbLock.reload")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Import dialog */}
      <ResponsiveDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("import.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("import.description")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={handleSkipImport}>{t("import.skip")}</Button>
            <Button onClick={handleImportLocal}>{t("import.confirm")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

