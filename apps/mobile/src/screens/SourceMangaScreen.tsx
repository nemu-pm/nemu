import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileMangaChapterRow,
  MobileMangaChapterSectionHeader,
  MobileMangaChapterSortAction,
  MobileMangaChapterToolbar,
} from "@/components/MobileMangaChapterSection";
import { MobileMangaDetailSurface } from "@/components/MobileMangaDetailSurface";
import { MobileMangaPageSkeleton } from "@/components/MobileMangaPageSkeleton";
import { MobileSourceErrorNotice } from "@/components/MobileSourceErrorNotice";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileLibraryDataChanged,
} from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  getEntryCover,
  makeSourceLinkId,
  sourceHasUpdate,
  type ChapterSummary,
  type InstalledSource,
  type LibraryEntry,
  type LocalChapterProgress,
  type LocalMangaProgress,
  type LocalSourceLink,
  type MangaMetadata,
} from "@/data/schema";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  PageListScaffold,
  PageScaffold,
  createNemuNativeScreenOptions,
  renderNemuNativeToolbarButtons,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  MOBILE_CHAPTER_LIST_PERFORMANCE,
  buildMobileChapterRows,
} from "@/lib/mobileChapterRows";
import {
  DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
  filterAndSortMobileChapters,
  getMobileChapterLanguages,
  normalizeMobileChapterListPreference,
  type MobileChapterListPreference,
} from "@/lib/mobileChapterFilters";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileSourceLinkRegistryKeys,
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesLink,
  mobileInstalledSourceMatchesRoute,
} from "@/lib/mobileInstalledSourceKeys";
import { applyMobileSourceDetailsRefresh } from "@/lib/mobileLibraryDetails";
import { makeSourceDetailsLibraryImport } from "@/lib/mobileLibraryImport";
import {
  findMobileMangaProgressForSource,
  loadMobileChapterProgressForSource,
} from "@/lib/mobileMangaDetailProgress";
import { toSearchSourceDisplay } from "@/lib/mobileSearch";
import { getMobileSourceMangaContinueTarget } from "@/lib/mobileSourceMangaContinue";
import {
  canOpenMobileSourceMangaReader,
  canPressMobileSourceMangaLibraryAction,
  getMobileSourceMangaMutationResultAction,
  isMobileSourceMangaLibraryActionBusy,
  isMobileSourceMangaReaderActionBusy,
  shouldRenderMobileSourceMangaReaderAction,
  shouldRenderMobileSourceMangaSkeleton,
  shouldShowMobileSourceMangaDetailLoadError,
  type MobileSourceMangaReaderActionState,
} from "@/lib/mobileSourceMangaActions";
import { getMobileSourceDisplayRouteRef } from "@/lib/mobileSourceRouteRef";
import { nextSyncTimestamp } from "@nemu/core";
import {
  makeMobileSourceKey,
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  getMobileSourceMangaBackAction,
  getMobileSourceReaderHref,
  normalizeMobileReaderRouteLabel,
  normalizeMobileSourceRouteParam,
} from "@/lib/mobileSourceRoutes";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
  getMobileSourceErrorRecoveryAction,
  type MobileSourceErrorRecoveryAction,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { takeMobileSourceDetailSeed } from "@/lib/mobileSourceDetailSeed";
import { mergeDefinedMangaMetadata } from "@/lib/mobileLibraryDetails";
import { withMobileSourceOperationTimeout } from "@/sources/mobileSourceOperationTimeout";
import { normalizeReaderProcessPageImages } from "@/lib/mobileReaderSettings";
import { refreshMobileReaderPages } from "@/sources/mobileSourcePages";
import {
  disposeMobileReaderPagesPrefetchResult,
  makeMobileReaderPagesPrefetchKey,
  mobileReaderPagesPrefetchCache,
} from "@/sources/mobileReaderPagesPrefetch";
import {
  refreshMobileSourceDetails,
  resolveMobileSourceMangaMetadataTitle,
  type MobileSourceDetailsRefresh,
} from "@/sources/mobileSourceDetails";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  applyMobileSourcePackageHydration,
  type MobileSourcePackageHydration,
} from "@/sources/mobileSourcePackageLoader";

type SourceMangaDetailState =
  | { status: "idle"; detail: string }
  | { status: "loading"; detail: string }
  | {
      status: "ready";
      refresh: Extract<MobileSourceDetailsRefresh, { status: "ready" }>;
      metadata: MangaMetadata;
      chapters: ChapterSummary[];
      detail: string;
    }
  | {
      status: "blocked";
      detail: string;
      title?: string;
      recoveryAction?: MobileSourceErrorRecoveryAction | null;
    }
  | {
      status: "error";
      detail: string;
      title?: string;
      recoveryAction?: MobileSourceErrorRecoveryAction | null;
    };

type SourceMangaLocalState = {
  installedSource: InstalledSource | null;
  libraryEntry: LibraryEntry | null;
  mangaProgress: LocalMangaProgress | null;
  chapterProgress: Record<string, LocalChapterProgress>;
};

function findInstalledSource(
  sources: InstalledSource[],
  registryId: string,
  sourceId: string,
): InstalledSource | null {
  return (
    sources.find((item) =>
      mobileInstalledSourceMatchesRoute(item, registryId, sourceId),
    ) ?? null
  );
}

function sourceLinkReference(
  registryId: string,
  sourceId: string,
  mangaId: string,
): LocalSourceLink {
  return {
    id: makeSourceLinkId(registryId, sourceId, mangaId),
    libraryItemId: "",
    registryId,
    sourceId,
    sourceMangaId: mangaId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function findLibrarySourceForKeys(
  entry: LibraryEntry | null | undefined,
  sourceKeys: Iterable<string>,
  mangaId: string,
): LocalSourceLink | undefined {
  const sourceKeySet = new Set(sourceKeys);
  return entry?.sources.find(
    (source) =>
      source.sourceMangaId === mangaId &&
      sourceKeySet.has(makeMobileSourceKey(source.registryId, source.sourceId)),
  );
}

function findLibraryEntryForSourceKeys(
  entries: LibraryEntry[],
  sourceKeys: Iterable<string>,
  mangaId: string,
): LibraryEntry | null {
  return (
    entries.find((entry) =>
      findLibrarySourceForKeys(entry, sourceKeys, mangaId),
    ) ?? null
  );
}

function loadedChapterCountText(count: number, strings: MobileStrings): string {
  return formatMobileString(
    count === 1
      ? strings.sourceManga.chapterLoadedOne
      : strings.sourceManga.chapterLoadedOther,
    { count },
  );
}

export function SourceMangaScreen() {
  const params = useLocalSearchParams<{
    registryId: string;
    sourceId: string;
    mangaId: string;
    mangaTitle?: string | string[];
  }>();
  const registryId = normalizeMobileSourceRouteParam(params.registryId);
  const sourceId = normalizeMobileSourceRouteParam(params.sourceId);
  const mangaId = normalizeMobileSourceRouteParam(params.mangaId);
  const navigationTitle = normalizeMobileReaderRouteLabel(
    params.mangaTitle,
    mangaId,
  );
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const store = useMobileDataStore();
  const saveSourcePackageHydration = useCallback(
    async (
      sourceRecord: InstalledSource,
      hydration: MobileSourcePackageHydration,
    ) => {
      const hydratedSource = applyMobileSourcePackageHydration(
        sourceRecord,
        hydration,
      );
      if (hydratedSource === sourceRecord) return;
      const saved = await store.saveInstalledSourceIfCurrent?.(
        hydratedSource,
        sourceRecord.updatedAt,
      );
      if (!saved) return;
      emitMobileDataChanged("sources");
    },
    [store],
  );
  const [localState, setLocalState] = useState<SourceMangaLocalState>({
    installedSource: null,
    libraryEntry: null,
    mangaProgress: null,
    chapterProgress: {},
  });
  const [detailState, setDetailState] = useState<SourceMangaDetailState>({
    status: "idle",
    detail: strings.sourceManga.detailsNotLoaded,
  });
  const [chapterListPreference, setChapterListPreference] =
    useState<MobileChapterListPreference>(
      DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
    );
  const chapterListPreferenceKey = `${registryId}:${sourceId}:${mangaId}`;
  useEffect(() => {
    let active = true;
    void store
      .getSettings()
      .then((settings) => {
        if (!active) return;
        setChapterListPreference(
          normalizeMobileChapterListPreference(
            settings.mobileChapterListPreferences?.[chapterListPreferenceKey],
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [chapterListPreferenceKey, store]);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);
  const [openingReader, setOpeningReader] = useState(false);
  const openingReaderRef = useRef(false);
  const [retryingData, setRetryingData] = useState(false);
  const retryDataGuardRef = useRef(false);
  const [retryRun, setRetryRun] = useState(0);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  const [collectionSheetPresentation, setCollectionSheetPresentation] =
    useState<{ libraryItemId: string; title: string } | null>(null);
  const [libraryOptionsOpen, setLibraryOptionsOpen] = useState(false);
  const [libraryOptionsPresentationMode, setLibraryOptionsPresentationMode] =
    useState<"add" | "in-library" | null>(null);
  const libraryOptionsNextSheetRef = useRef<
    | "close-only"
    | "collections"
    | "remove-confirm"
    | { kind: "reader"; chapter: ChapterSummary }
    | null
  >(null);
  // Lets the detail-refresh effect report Cloudflare failures to the bypass
  // sheet without adding the sheet controller to the effect's deps (which
  // would re-trigger the refresh on every render).
  const cloudflareSheetRef = useRef<{
    reportError: (error: unknown) => boolean;
  } | null>(null);
  // NOTE: despite the legacy name, this drives the Nemu Agent sheet
  // (`useNemuAgentSheet` / `MobileNemuAgentSheet`) — kept to minimize churn in
  // the focus-effect error seam below.
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(
    () => () => {
      libraryOptionsNextSheetRef.current = null;
    },
    [],
  );

  const reloadLocalState = useCallback(
    async (options?: { includeInstalledSource?: boolean }) => {
      const [installedSources, entries, progressItems] = await Promise.all([
        options?.includeInstalledSource
          ? store.getInstalledSources()
          : Promise.resolve(null),
        store.getLibraryEntries(),
        store.getMangaProgress(),
      ]);
      const installedSource = installedSources
        ? findInstalledSource(installedSources, registryId, sourceId)
        : undefined;
      const sourceLink = sourceLinkReference(registryId, sourceId, mangaId);
      const sourceKeys = getMobileSourceLinkRegistryKeys(
        sourceLink,
        installedSource,
      );
      const chapterProgress = await loadMobileChapterProgressForSource(
        store,
        sourceLink,
        installedSource ? [installedSource] : [],
      );
      const existingEntry = findLibraryEntryForSourceKeys(
        entries,
        sourceKeys,
        mangaId,
      );
      const progressIndex = new Map(
        progressItems.map((item) => [item.id, item]),
      );
      const mangaProgress =
        findMobileMangaProgressForSource(
          sourceLink,
          installedSource ? [installedSource] : [],
          progressIndex,
        ) ?? null;

      return {
        installedSource,
        libraryEntry: existingEntry,
        mangaProgress,
        chapterProgress,
      };
    },
    [mangaId, registryId, sourceId, store],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      openingReaderRef.current = false;
      setOpeningReader(false);
      void reloadLocalState({ includeInstalledSource: true })
        .then((nextState) => {
          if (!active) return;
          setLocalState((current) => ({
            installedSource:
              nextState.installedSource ?? current.installedSource,
            libraryEntry: nextState.libraryEntry,
            mangaProgress: nextState.mangaProgress,
            chapterProgress: nextState.chapterProgress,
          }));
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [reloadLocalState]),
  );

  useEffect(() => {
    let cancelled = false;
    const reportRetryResult = retryDataGuardRef.current;

    setActionError(null);
    setDetailState({
      status: "loading",
      detail: strings.sourceManga.loadingDetails,
    });

    void (async () => {
      try {
        const nextLocalState = await reloadLocalState({
          includeInstalledSource: true,
        });
        const installedSource = nextLocalState.installedSource ?? null;
        const existingEntry = nextLocalState.libraryEntry;

        if (cancelled) return;
        setLocalState({
          installedSource,
          libraryEntry: existingEntry,
          mangaProgress: nextLocalState.mangaProgress,
          chapterProgress: nextLocalState.chapterProgress,
        });

        if (!installedSource) {
          setDetailState({
            status: "blocked",
            detail: strings.sourceManga.installSourceBeforeDetails,
          });
          if (reportRetryResult) {
            await hapticError();
          }
          return;
        }

        const refreshed = await withMobileSourceOperationTimeout(
          refreshMobileSourceDetails(
            installedSource,
            mangaId,
            {
            getSourceSettings: async (_sourceKey, sourceRecord) => {
              const normalized = normalizeInstalledSource(sourceRecord);
              const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
              const saved = await loadMobileSourceSettingsByKeys(store, [
                runtimeSourceKey,
                ...getMobileInstalledSourceSettingsKeys(sourceRecord),
              ]);
              return mergeSourceSettingValues(
                sourceRecord.packageMetadata?.settings ?? [],
                saved?.values,
              );
            },
              onSourcePackageHydrated: saveSourcePackageHydration,
            },
          ),
          { message: strings.sourceBrowse.sourceOperationTimedOut },
        );

        if (cancelled) return;
        if (refreshed.status === "blocked") {
          setDetailState({
            status: "blocked",
            detail: refreshed.detail,
          });
          if (reportRetryResult) {
            await hapticError();
          }
          return;
        }

        let nextEntry = existingEntry;
        const existingSource = existingEntry?.sources.find(
          (source) =>
            mobileInstalledSourceMatchesLink(installedSource, source) &&
            source.sourceMangaId === mangaId,
        );
        if (existingEntry && existingSource) {
          const applied = applyMobileSourceDetailsRefresh(
            existingEntry,
            existingSource,
            refreshed,
          );
          await Promise.all([
            store.saveLibraryItem(applied.item),
            store.saveSourceLink(applied.sourceLink),
          ]);
          emitMobileDataChanged("library");
          nextEntry = {
            item: applied.item,
            sources: existingEntry.sources.map((source) =>
              source.id === applied.sourceLink.id ? applied.sourceLink : source,
            ),
          };
        }

        if (cancelled) return;
        setLocalState((current) => ({
          ...current,
          libraryEntry: nextEntry,
        }));
        setDetailState({
          status: "ready",
          refresh: refreshed,
          metadata: refreshed.metadata,
          chapters: refreshed.chapters,
          detail: loadedChapterCountText(refreshed.chapters.length, strings),
        });
        if (reportRetryResult) {
          await hapticConfirm();
        }
      } catch (error) {
        if (cancelled) return;
        const presentation = getMobileSourceErrorPresentation(error, strings);
        setDetailState({
          status: "error",
          title: presentation.title,
          detail: presentation.detail,
          recoveryAction: getMobileSourceErrorRecoveryAction(
            presentation,
            strings,
          ),
        });
        // Surface Cloudflare-classified failures on the bypass sheet (the
        // native solver already ran automatically inside the blocking HTTP
        // call; this is the post-failure retry seam).
        cloudflareSheetRef.current?.reportError(error);
        if (reportRetryResult) {
          await hapticError();
        }
      } finally {
        if (!cancelled && reportRetryResult) {
          retryDataGuardRef.current = false;
          setRetryingData(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    mangaId,
    registryId,
    reloadLocalState,
    retryRun,
    saveSourcePackageHydration,
    sourceId,
    store,
    strings,
  ]);

  const sourceDisplay = useMemo(
    () =>
      localState.installedSource
        ? toSearchSourceDisplay(localState.installedSource)
        : null,
    [localState.installedSource],
  );
  const routeRef = getMobileSourceDisplayRouteRef(sourceDisplay, {
    registryId,
    sourceId,
  });
  const sourceName = localState.installedSource?.name ?? sourceId;
  const librarySourceKeys = getMobileSourceLinkRegistryKeys(
    sourceLinkReference(registryId, sourceId, mangaId),
    localState.installedSource,
  );
  const librarySource = findLibrarySourceForKeys(
    localState.libraryEntry,
    librarySourceKeys.length > 0
      ? librarySourceKeys
      : [makeMobileSourceKey(routeRef.registryId, routeRef.sourceId)],
    mangaId,
  );
  const inLibrary = Boolean(librarySource);
  // Consume the listing seed once: the tapped card already knew the title,
  // cover, and authors, so paint them instead of a blank skeleton.
  const seedMetadata = useMemo(
    () => takeMobileSourceDetailSeed(registryId, sourceId, mangaId),
    [mangaId, registryId, sourceId],
  );
  const listingMetadata = seedMetadata
    ? {
        title: seedMetadata.title,
        cover: seedMetadata.cover,
        authors: seedMetadata.authors,
        description: seedMetadata.description,
        tags: seedMetadata.tags,
        status: seedMetadata.status,
        url: seedMetadata.url,
      }
    : null;
  const metadata =
    detailState.status === "ready"
      ? listingMetadata
        ? mergeDefinedMangaMetadata(listingMetadata, detailState.metadata)
        : detailState.metadata
      : (localState.libraryEntry?.item.metadata ?? listingMetadata);
  const title = resolveMobileSourceMangaMetadataTitle(
    metadata?.title,
    mangaId,
    navigationTitle,
  );
  const cover = localState.libraryEntry
    ? getEntryCover(localState.libraryEntry)
    : metadata?.cover;
  const coverRequest = useMobileSourceImageRequest(
    localState.installedSource,
    cover,
  );
  const chapters = useMemo(
    () => (detailState.status === "ready" ? detailState.chapters : []),
    [detailState],
  );
  const chapterLanguages = useMemo(
    () => getMobileChapterLanguages(chapters),
    [chapters],
  );
  const effectiveChapterListPreference = useMemo(
    () => ({
      ...chapterListPreference,
      languages: chapterListPreference.languages.filter((language) =>
        chapterLanguages.includes(language),
      ),
    }),
    [chapterLanguages, chapterListPreference],
  );
  // The chapter subtitle only repeats the language while the visible list can
  // actually mix languages: one selected language makes it noise.
  const showChapterLanguage =
    chapterLanguages.length > 1 &&
    effectiveChapterListPreference.languages.length !== 1;
  const visibleChapters = useMemo(
    () =>
      filterAndSortMobileChapters(
        chapters,
        localState.chapterProgress,
        effectiveChapterListPreference,
      ),
    [chapters, effectiveChapterListPreference, localState.chapterProgress],
  );
  const unreadChapterCount = useMemo(
    () =>
      chapters.reduce(
        (count, chapter) =>
          count + (localState.chapterProgress[chapter.id]?.completed ? 0 : 1),
        0,
      ),
    [chapters, localState.chapterProgress],
  );
  const chapterRows = useMemo(
    () => buildMobileChapterRows(visibleChapters),
    [visibleChapters],
  );
  const changeChapterListPreference = useCallback(
    (nextPreference: MobileChapterListPreference) => {
      setChapterListPreference(nextPreference);
      void store
        .updateSettings((settings) => ({
          ...settings,
          mobileChapterListPreferences: {
            ...settings.mobileChapterListPreferences,
            [chapterListPreferenceKey]: nextPreference,
          },
        }))
        .then(() => emitMobileDataChanged("settings"))
        .catch(() => undefined);
    },
    [chapterListPreferenceKey, store],
  );
  const continueTarget = getMobileSourceMangaContinueTarget(
    chapters,
    localState.mangaProgress,
  );
  const continueChapter = continueTarget.chapter;
  const isContinuation = continueTarget.isContinuation;
  const libraryActionState = {
    adding,
    removing,
    inLibrary,
    detailReady: detailState.status === "ready",
  };
  const libraryPressState = {
    ...libraryActionState,
    openingReader,
  };
  const libraryActionBusy =
    isMobileSourceMangaLibraryActionBusy(libraryActionState);
  const libraryActionDisabled =
    !canPressMobileSourceMangaLibraryAction(libraryPressState);
  const readerActionState: MobileSourceMangaReaderActionState = {
    openingReader,
    adding,
    removing,
  };
  const readerActionBusy =
    isMobileSourceMangaReaderActionBusy(readerActionState);
  const canOpenContinueChapter = canOpenMobileSourceMangaReader({
    hasChapter: Boolean(continueChapter),
    state: readerActionState,
  });
  const showReaderAction = shouldRenderMobileSourceMangaReaderAction({
    hasChapter: Boolean(continueChapter),
  });
  const continueActionAvailable =
    Boolean(continueChapter) && !adding && !removing;
  const continueActionLabel =
    isContinuation && continueChapter
      ? formatMobileString(strings.sourceManga.continueChapter, {
          chapter: formatChapterTitle(continueChapter, strings),
        })
      : strings.sourceManga.startReading;
  const showSkeleton = shouldRenderMobileSourceMangaSkeleton({
    loading: detailState.status === "loading",
    hasMetadata: Boolean(metadata),
  });
  const showLoadError = shouldShowMobileSourceMangaDetailLoadError({
    status: detailState.status,
    hasMetadata: Boolean(metadata),
  });
  const getGuardedReaderActionState = useCallback(
    (): MobileSourceMangaReaderActionState => ({
      openingReader: openingReaderRef.current || openingReader,
      adding: addingRef.current || adding,
      removing: removingRef.current || removing,
    }),
    [adding, openingReader, removing],
  );

  const openReader = useCallback(
    (chapter: ChapterSummary | null) => {
      if (!chapter) {
        void hapticError();
        return;
      }
      if (
        !canOpenMobileSourceMangaReader({
          hasChapter: Boolean(chapter),
          state: getGuardedReaderActionState(),
        })
      ) {
        return;
      }
      openingReaderRef.current = true;
      setOpeningReader(true);
      const installedSource = localState.installedSource;
      if (installedSource) {
        void Promise.all([
          store.getSettings(),
          loadMobileSourceSettingsByKeys(store, [
            makeMobileRuntimeSourceKey(normalizeInstalledSource(installedSource)),
            ...getMobileInstalledSourceSettingsKeys(installedSource),
          ]),
        ]).then(([settings, saved]) => {
          const processPageImages = normalizeReaderProcessPageImages(
            settings.readerProcessPageImages,
          );
          const key = makeMobileReaderPagesPrefetchKey({
            registryId: routeRef.registryId,
            sourceId: routeRef.sourceId,
            mangaId,
            chapterId: chapter.id,
            processPageImages,
          });
          mobileReaderPagesPrefetchCache.start(
            key,
            () =>
              refreshMobileReaderPages(installedSource, mangaId, chapter, {
                processPageImages,
                getSourceSettings: async () =>
                  mergeSourceSettingValues(
                    installedSource.packageMetadata?.settings ?? [],
                    saved?.values,
                  ),
                onSourcePackageHydrated: saveSourcePackageHydration,
              }),
            disposeMobileReaderPagesPrefetchResult,
          );
        }).catch(() => undefined);
      }
      try {
        router.push(
          getMobileSourceReaderHref({
            registryId: routeRef.registryId,
            sourceId: routeRef.sourceId,
            mangaId,
            chapter,
            mangaTitle: title,
          }),
        );
      } catch {
        openingReaderRef.current = false;
        setOpeningReader(false);
        void hapticError();
      }
    },
    [
      getGuardedReaderActionState,
      localState.installedSource,
      mangaId,
      routeRef.registryId,
      routeRef.sourceId,
      saveSourcePackageHydration,
      store,
      title,
    ],
  );

  const addToLibrary = useCallback(
    async (afterClose?: {
      kind: "reader";
      chapter: ChapterSummary;
    }): Promise<boolean> => {
      if (openingReaderRef.current || addingRef.current || removingRef.current) {
        return false;
      }

      const claimedTransition = afterClose ?? "close-only";
      if (libraryOptionsNextSheetRef.current) return false;

      if (inLibrary) {
        libraryOptionsNextSheetRef.current = claimedTransition;
        setLibraryOptionsOpen(false);
        return true;
      }

      if (!sourceDisplay || detailState.status !== "ready") {
        setActionError(strings.sourceManga.actionFailedDetail);
        await hapticError();
        return false;
      }
      libraryOptionsNextSheetRef.current = claimedTransition;
      addingRef.current = true;
      setAdding(true);
      setActionError(null);
      try {
        const imported = makeSourceDetailsLibraryImport(
          sourceDisplay,
          mangaId,
          detailState.refresh,
          nextSyncTimestamp(),
        );
        await store.saveLibraryItem(imported.item);
        await store.saveSourceLink(imported.sourceLink);
        emitMobileDataChanged("library");
        setLocalState((current) => ({
          ...current,
          libraryEntry: {
            item: imported.item,
            sources: [imported.sourceLink],
          },
        }));
        setRemoveConfirmOpen(false);
        await hapticConfirm();
        // The queued reader opens from the native sheet's post-dismiss callback.
        // Release the mutation guard before requesting that dismissal so the
        // reader action cannot be rejected if the native animation is fast.
        addingRef.current = false;
        setAdding(false);
        setLibraryOptionsOpen(false);
        return true;
      } catch (error) {
        if (libraryOptionsNextSheetRef.current === claimedTransition) {
          libraryOptionsNextSheetRef.current = null;
        }
        setActionError(
          describeMobileErrorDetail(
            error,
            strings.sourceManga.actionFailedDetail,
          ),
        );
        await hapticError();
        return false;
      } finally {
        addingRef.current = false;
        setAdding(false);
      }
    },
    [
      detailState,
      inLibrary,
      mangaId,
      sourceDisplay,
      store,
      strings.sourceManga.actionFailedDetail,
    ],
  );

  const openLibraryOptions = useCallback(() => {
    const guardedActionState = {
      adding: addingRef.current || adding,
      removing: removingRef.current || removing,
      inLibrary,
      detailReady: detailState.status === "ready",
      openingReader: openingReaderRef.current || openingReader,
    };
    if (!canPressMobileSourceMangaLibraryAction(guardedActionState)) return;

    setActionError(null);
    libraryOptionsNextSheetRef.current = null;
    setLibraryOptionsPresentationMode(inLibrary ? "in-library" : "add");
    setLibraryOptionsOpen(true);
  }, [adding, detailState.status, inLibrary, openingReader, removing]);

  const closeLibraryOptionsTo = useCallback(
    (nextSheet: "collections" | "remove-confirm") => {
      if (libraryActionBusy) return;
      if (libraryOptionsNextSheetRef.current) return;
      setActionError(null);
      libraryOptionsNextSheetRef.current = nextSheet;
      setLibraryOptionsOpen(false);
    },
    [libraryActionBusy],
  );

  const handleLibraryOptionsClosed = useCallback(() => {
    setLibraryOptionsOpen(false);
    const nextSheet = libraryOptionsNextSheetRef.current;
    libraryOptionsNextSheetRef.current = null;
    setLibraryOptionsPresentationMode(null);
    if (nextSheet === "collections") {
      const libraryItemId = localState.libraryEntry?.item.libraryItemId;
      if (libraryItemId) {
        setCollectionSheetPresentation({ libraryItemId, title });
        setCollectionSheetOpen(true);
      }
    } else if (nextSheet === "remove-confirm") {
      setRemoveConfirmOpen(true);
    } else if (
      nextSheet !== null &&
      typeof nextSheet === "object" &&
      nextSheet.kind === "reader"
    ) {
      openReader(nextSheet.chapter);
    }
  }, [localState.libraryEntry?.item.libraryItemId, openReader, title]);

  const addToLibraryAndRead = useCallback(async () => {
    if (!continueChapter) {
      await hapticError();
      return;
    }
    await addToLibrary({ kind: "reader", chapter: continueChapter });
  }, [addToLibrary, continueChapter]);

  const removeFromLibrary = useCallback(async () => {
    if (openingReaderRef.current || addingRef.current || removingRef.current)
      return;

    if (!localState.libraryEntry) {
      setActionError(strings.sourceManga.actionFailedDetail);
      await hapticError();
      return;
    }
    removingRef.current = true;
    setRemoving(true);
    setActionError(null);
    try {
      await store.removeLibraryItem(localState.libraryEntry.item.libraryItemId);
      emitMobileLibraryDataChanged({ collectionsChanged: true });
      setLocalState((current) => ({
        ...current,
        libraryEntry: null,
      }));
      setCollectionSheetOpen(false);
      setLibraryOptionsOpen(false);
      if (
        getMobileSourceMangaMutationResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        setRemoveConfirmOpen(false);
      }
      await hapticConfirm();
    } catch (error) {
      if (
        getMobileSourceMangaMutationResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setRemoveConfirmOpen(false);
      }
      setActionError(
        describeMobileErrorDetail(
          error,
          strings.sourceManga.actionFailedDetail,
        ),
      );
      await hapticError();
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  }, [localState.libraryEntry, store, strings.sourceManga.actionFailedDetail]);

  const retrySourceMangaDetails = () => {
    if (retryDataGuardRef.current) return;
    retryDataGuardRef.current = true;
    setRetryingData(true);
    setRetryRun((current) => current + 1);
  };
  const cloudflareSheet = useNemuAgentSheet({
    onSuccess: retrySourceMangaDetails,
  });
  cloudflareSheetRef.current = cloudflareSheet;
  const nativeHeaderOptions = createNemuNativeScreenOptions(tokens, sourceName);
  const navigateBack = useCallback(() => {
    const action = getMobileSourceMangaBackAction({
      canGoBack: router.canGoBack(),
      registryId: routeRef.registryId,
      sourceId: routeRef.sourceId,
    });
    if (action.type === "back") {
      router.back();
      return;
    }
    router.replace(action.href);
  }, [routeRef.registryId, routeRef.sourceId]);
  const nativeBackToolbar = (
    <Stack.Toolbar placement="left" tintColor={tokens.foreground}>
      {renderNemuNativeToolbarButtons(
        [
          {
            icon: "chevron.left",
            label: strings.common.back,
            onPress: navigateBack,
          },
        ],
        tokens.foreground,
      )}
    </Stack.Toolbar>
  );

  if (showLoadError) {
    return (
      <>
        <Stack.Screen options={nativeHeaderOptions} />
        {nativeBackToolbar}
        <PageScaffold nativeHeader>
          <EmptyLibrary
            title={strings.sourceManga.sourceDetailsUnavailable}
            description={detailState.detail}
            actionLabel={strings.common.retry}
            actionDisabled={retryingData}
            actionLoading={retryingData}
            onActionPress={retrySourceMangaDetails}
          />
        </PageScaffold>
      </>
    );
  }

  if (showSkeleton) {
    return (
      <>
        <Stack.Screen options={nativeHeaderOptions} />
        {nativeBackToolbar}
        <PageScaffold nativeHeader>
          <MobileMangaPageSkeleton
            accessibilityLabel={strings.sourceManga.loadingDetails}
            actionsPlacement="copy"
          />
        </PageScaffold>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={nativeHeaderOptions} />
      {nativeBackToolbar}
      <PageListScaffold
        nativeHeader
        data={chapterRows}
        keyExtractor={(row) => row.key}
        initialNumToRender={MOBILE_CHAPTER_LIST_PERFORMANCE.initialNumToRender}
        maxToRenderPerBatch={
          MOBILE_CHAPTER_LIST_PERFORMANCE.maxToRenderPerBatch
        }
        windowSize={MOBILE_CHAPTER_LIST_PERFORMANCE.windowSize}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={({ item, index }) => (
          <MobileMangaChapterRow
            busy={readerActionBusy}
            chapters={item.chapters}
            first={index === 0}
            openChapterTemplate={strings.sourceManga.openChapter}
            progressByChapterId={localState.chapterProgress}
            strings={strings}
            onPressChapter={openReader}
            appLanguage={appLanguage}
            showLanguage={showChapterLanguage}
          />
        )}
        ListHeaderComponent={
          <>
            {collectionSheetPresentation ? (
              <MobileCollectionMembershipSheet
                visible={collectionSheetOpen}
                libraryItemId={collectionSheetPresentation.libraryItemId}
                title={collectionSheetPresentation.title}
                onClose={() => setCollectionSheetOpen(false)}
                onDismiss={() => setCollectionSheetPresentation(null)}
              />
            ) : null}
            <MobileConfirmationSheet
              visible={removeConfirmOpen}
              title={strings.sourceManga.removeTitle}
              description={formatMobileString(
                strings.sourceManga.removeDescription,
                {
                  name: title,
                },
              )}
              subject={title}
              iconName="trash-outline"
              cancelLabel={strings.common.cancel}
              confirmLabel={strings.common.remove}
              confirmAccessibilityLabel={strings.sourceManga.removeFromLibrary}
              loading={removing}
              destructive
              onCancel={() => setRemoveConfirmOpen(false)}
              onConfirm={() => {
                void removeFromLibrary();
              }}
            >
              {actionError ? (
                <MobileInlineErrorBanner
                  title={strings.sourceManga.actionFailed}
                  detail={actionError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setActionError(null)}
                />
              ) : null}
            </MobileConfirmationSheet>
            <MobileNativeSheetScaffold
              visible={libraryOptionsOpen}
              onClose={() => setLibraryOptionsOpen(false)}
              onDismiss={handleLibraryOptionsClosed}
              title={
                libraryOptionsPresentationMode === "in-library"
                  ? strings.sourceManga.libraryOptionsTitle
                  : strings.sourceManga.addOptionsTitle
              }
              subtitle={
                libraryOptionsPresentationMode === "in-library"
                  ? strings.sourceManga.libraryOptionsDescription
                  : strings.sourceManga.addOptionsDescription
              }
              dismissLabel={strings.common.done}
              dismissDisabled={libraryActionBusy}
              enablePanDownToClose={!libraryActionBusy}
              contentStyle={styles.libraryOptionsSheet}
              testID="SourceMangaLibraryOptionsSheet"
            >
              <View style={styles.libraryOptionsList}>
                {libraryOptionsPresentationMode === "in-library" ? (
                  <>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.sourceManga.manageCollections}
                      accessibilityHint={
                        strings.sourceManga.manageCollectionsHint
                      }
                      accessibilityState={{ disabled: libraryActionBusy }}
                      disabled={libraryActionBusy}
                      onPress={() => {
                        closeLibraryOptionsTo("collections");
                      }}
                      pressedScale={0.985}
                      style={[
                        styles.libraryOptionRow,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.libraryOptionIcon,
                          { backgroundColor: tokens.card },
                        ]}
                      >
                        <Ionicons
                          name="albums-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.libraryOptionCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.libraryOptionTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.sourceManga.manageCollections}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.libraryOptionDescription,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.sourceManga.manageCollectionsHint}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward-outline"
                        size={18}
                        color={tokens.mutedForeground}
                      />
                    </NemuPressable>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.sourceManga.removeFromLibrary}
                      accessibilityHint={
                        strings.sourceManga.removeFromLibraryHint
                      }
                      accessibilityState={{ disabled: libraryActionBusy }}
                      disabled={libraryActionBusy}
                      hapticFeedback="warning"
                      onPress={() => {
                        closeLibraryOptionsTo("remove-confirm");
                      }}
                      pressedScale={0.985}
                      style={[
                        styles.libraryOptionRow,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.libraryOptionIcon,
                          { backgroundColor: tokens.card },
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={tokens.danger}
                        />
                      </View>
                      <View style={styles.libraryOptionCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.libraryOptionTitle,
                            { color: tokens.danger },
                          ]}
                        >
                          {strings.sourceManga.removeFromLibrary}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.libraryOptionDescription,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.sourceManga.removeFromLibraryHint}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward-outline"
                        size={18}
                        color={tokens.mutedForeground}
                      />
                    </NemuPressable>
                  </>
                ) : (
                  <>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.sourceManga.addToLibrary}
                      accessibilityHint={strings.sourceManga.addToLibraryHint}
                      accessibilityState={{
                        busy: adding || undefined,
                        disabled: libraryActionBusy,
                      }}
                      disabled={libraryActionBusy}
                      onPress={() => {
                        void addToLibrary();
                      }}
                      pressedScale={0.985}
                      style={[
                        styles.libraryOptionRow,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.libraryOptionIcon,
                          { backgroundColor: tokens.card },
                        ]}
                      >
                        {adding ? (
                          <ActivityIndicator
                            size="small"
                            color={tokens.primary}
                          />
                        ) : (
                          <Ionicons
                            name="bookmark-outline"
                            size={20}
                            color={tokens.primary}
                          />
                        )}
                      </View>
                      <View style={styles.libraryOptionCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.libraryOptionTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.sourceManga.addToLibrary}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.libraryOptionDescription,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.sourceManga.addToLibraryHint}
                        </Text>
                      </View>
                    </NemuPressable>
                    {continueChapter ? (
                      <NemuPressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          strings.sourceManga.addAndStartReading
                        }
                        accessibilityHint={
                          strings.sourceManga.addAndStartReadingHint
                        }
                        accessibilityState={{
                          busy: adding || undefined,
                          disabled: libraryActionBusy,
                        }}
                        disabled={libraryActionBusy}
                        onPress={() => {
                          void addToLibraryAndRead();
                        }}
                        pressedScale={0.985}
                        style={[
                          styles.libraryOptionRow,
                          {
                            backgroundColor: tokens.primary,
                            borderColor: tokens.primary,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.libraryOptionIcon,
                            {
                              backgroundColor: `${tokens.primaryForeground}22`,
                            },
                          ]}
                        >
                          {adding ? (
                            <ActivityIndicator
                              size="small"
                              color={tokens.primaryForeground}
                            />
                          ) : (
                            <Ionicons
                              name="play-outline"
                              size={20}
                              color={tokens.primaryForeground}
                            />
                          )}
                        </View>
                        <View style={styles.libraryOptionCopy}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.libraryOptionTitle,
                              { color: tokens.primaryForeground },
                            ]}
                          >
                            {strings.sourceManga.addAndStartReading}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.libraryOptionDescription,
                              { color: `${tokens.primaryForeground}CC` },
                            ]}
                          >
                            {strings.sourceManga.addAndStartReadingHint}
                          </Text>
                        </View>
                      </NemuPressable>
                    ) : null}
                  </>
                )}
              </View>
              {actionError ? (
                <MobileInlineErrorBanner
                  title={strings.sourceManga.actionFailed}
                  detail={actionError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setActionError(null)}
                  variant="embedded"
                />
              ) : null}
            </MobileNativeSheetScaffold>

            <View style={styles.stack}>
              <MobileMangaDetailSurface
                title={title}
                authors={metadata?.authors}
                coverSource={
                  cover
                    ? {
                        uri: coverRequest?.url ?? cover,
                        headers: coverRequest?.headers,
                      }
                    : null
                }
                status={metadata?.status}
                strings={strings}
                badges={[
                  ...(librarySource && sourceHasUpdate(librarySource)
                    ? [
                        {
                          key: "updated",
                          label: strings.sourceManga.updated,
                          tone: "primary" as const,
                        },
                      ]
                    : []),
                ]}
                primaryAction={
                  showReaderAction
                    ? {
                        label: continueActionLabel,
                        accessibilityLabel: continueActionLabel,
                        accessibilityHint: strings.sourceManga.readActionHint,
                        available: continueActionAvailable,
                        disabled: !canOpenContinueChapter,
                        iconName: isContinuation
                          ? "play-forward-outline"
                          : "play-outline",
                        onPress: () => openReader(continueChapter),
                      }
                    : null
                }
                secondaryActions={[
                  {
                    key: "library",
                    accessibilityLabel: inLibrary
                      ? strings.sourceManga.libraryOptionsTitle
                      : strings.sourceManga.addToLibrary,
                    accessibilityHint: inLibrary
                      ? strings.sourceManga.libraryOptionsDescription
                      : strings.sourceManga.addToLibraryHint,
                    busy: libraryActionBusy,
                    disabled: libraryActionDisabled,
                    iconName: inLibrary ? "bookmark-outline" : "add-outline",
                    color: inLibrary ? tokens.mutedForeground : tokens.primary,
                    onPress: openLibraryOptions,
                  },
                ]}
                actionsPlacement="copy"
                tags={metadata?.tags}
                description={metadata?.description}
              />

              {actionError ? (
                <MobileInlineErrorBanner
                  title={strings.sourceManga.actionFailed}
                  detail={actionError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setActionError(null)}
                />
              ) : null}

              {detailState.status === "blocked" ||
              detailState.status === "error" ? (
                <MobileSourceErrorNotice
                  title={detailState.title}
                  detail={detailState.detail}
                  error={detailState.status === "error"}
                  actionLabel={detailState.recoveryAction?.label}
                  onActionPress={() => {
                    router.navigate("/settings?focus=agent");
                  }}
                />
              ) : null}

              <MobileMangaChapterSectionHeader
                title={strings.sourceManga.chapters}
                loading={detailState.status === "loading"}
                hasChapters={visibleChapters.length > 0}
                sortAction={
                  chapters.length > 0 ? (
                    <MobileMangaChapterSortAction
                      preference={effectiveChapterListPreference}
                      strings={strings}
                      onChange={changeChapterListPreference}
                    />
                  ) : null
                }
                toolbar={
                  chapters.length > 0 ? (
                    <MobileMangaChapterToolbar
                      appLanguage={appLanguage}
                      languages={chapterLanguages}
                      preference={effectiveChapterListPreference}
                      strings={strings}
                      unreadCount={unreadChapterCount}
                      onChange={changeChapterListPreference}
                    />
                  ) : null
                }
                emptyTitle={
                  detailState.status === "loading"
                    ? detailState.detail
                    : strings.sourceManga.noChapters
                }
              />
            </View>
          </>
        }
      />
      <MobileNemuAgentSheet
        visible={cloudflareSheet.visible}
        status={cloudflareSheet.status}
        url={cloudflareSheet.url}
        onVerify={cloudflareSheet.verify}
        onDismiss={cloudflareSheet.dismiss}
      />
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 18,
  },
  libraryOptionsSheet: {
    gap: 16,
  },
  libraryOptionsList: {
    gap: 10,
  },
  libraryOptionRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  libraryOptionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  libraryOptionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  libraryOptionTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: nemuFontWeight.semibold,
  },
  libraryOptionDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    gap: 10,
  },
});
