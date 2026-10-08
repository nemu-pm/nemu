import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileMangaChapterRow,
  MobileMangaChapterSectionHeader,
  MobileMangaChapterSortAction,
  MobileMangaChapterToolbar,
} from "@/components/MobileMangaChapterSection";
import {
  MobileSourceSelector,
  type MobileSourceSelectorItem,
} from "@/components/MobileSourceSelector";
import { MobileMangaDetailSplitLayout } from "@/components/MobileMangaDetailSplitLayout";
import { MobileMangaDetailSurface } from "@/components/MobileMangaDetailSurface";
import {
  MobileChapterGridSkeleton,
  MobileMangaPageSkeleton,
} from "@/components/MobileMangaPageSkeleton";
import { MobileMetadataEditorSheet } from "@/components/MobileMetadataEditorSheet";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobileSourceManagerSheet } from "@/components/MobileSourceManagerSheet";
import { MobileSourceErrorNotice } from "@/components/MobileSourceErrorNotice";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileLibraryDataChanged,
} from "@/data/mobileDataEvents";
import {
  isMobileSourceInstallCancellation,
  useAvailableSources,
  useMobileLanguageSettings,
  useSourceInstaller,
} from "@/data/mobileHooks";
import {
  sourceHasUpdate,
  type ChapterSummary,
  type InstalledSource,
  type LibraryEntry,
  type LocalChapterProgress,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import {
  PageHeader,
  PageScaffold,
  createNemuSoftEdgeScreenOptions,
  renderNemuNativeToolbarButtons,
  useNemuTheme,
  usesNemuNativeHeader,
  type NemuNativeHeaderAction,
} from "@/design-system";
import { formatContinueActionLabel } from "@/lib/formatChapter";
import {
  formatMobileExploreChapterLabel,
  withoutMobileZeroVolume,
} from "@/lib/mobileContinueReadingCopy";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  MOBILE_CHAPTER_LIST_PERFORMANCE,
  buildMobileChapterRows,
  mobileChapterRowKeyExtractor,
  type MobileChapterRow,
} from "@/lib/mobileChapterRows";
import {
  DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
  filterAndSortMobileChapters,
  getMobileChapterLanguages,
  normalizeMobileChapterListPreference,
  type MobileChapterListPreference,
} from "@/lib/mobileChapterFilters";
import { mergeMobileChapterRecord, orderMobileKnownChapters } from "@/lib/mobileChapterOrder";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesLink,
} from "@/lib/mobileInstalledSourceKeys";
import {
  applyMobileSourceChaptersRefresh,
  applyMobileSourceDetailsRefresh,
} from "@/lib/mobileLibraryDetails";
import { createMobileKeyedRefreshGate } from "@/lib/mobileKeyedRefreshGate";
import { getMobileMissingSourceState } from "@/lib/mobileMissingSourceInstall";
import {
  buildMobileEntryProgressMap,
  getMobileEntryMostRecentSource,
} from "@/lib/mobileLibraryPresentation";
import {
  findMobileMangaProgressForSource,
  loadMobileChapterProgressForSource,
} from "@/lib/mobileMangaDetailProgress";
import {
  canOpenMobileMangaDetailReader,
  canStartMobileMangaDetailAction,
  getMobileMangaDetailMutationResultAction,
  isMobileMangaDetailActionBusy,
  shouldRenderMobileMangaDetailSkeleton,
  shouldShowMobileMangaDetailLoadError,
  type MobileMangaDetailActionState,
} from "@/lib/mobileMangaDetailActions";
import { getMobileSourceReaderHref } from "@/lib/mobileSourceRoutes";
import { mobileDesignExploreFlag, useMobileDesignExplore } from "@/lib/mobileDesignExplore";
import { MobileExploreBarTitle } from "@/components/explore/MobileExploreBarTitle";
import {
  getMobileExploreBarTitleShown,
  MOBILE_EXPLORE_BAR_TITLE_FADE_MS,
} from "@/lib/mobileExploreBarTitle";
import { useSharedValue, withTiming } from "react-native-reanimated";
import {
  MobileExploreChapterRow,
  type MobileExploreChapterAction,
} from "@/components/explore/MobileExploreChapterRow";
import { MobileExploreChapterMenu } from "@/components/explore/MobileExploreChapterMenu";
import {
  buildMobileExploreChapterRows,
  findMobileUpNextIndex,
  getMobileChapterListCommonGroup,
  getMobileChapterVolumeHeaders,
} from "@/lib/mobileExploreChapterList";
import {
  mobileExploreDetailBarMode,
  renderExploreDetailBarMenu,
} from "@/components/explore/ExploreDetailBarMenu";
import { hasMobileUserCover, mobileExploreCoverOwnerUrl, withMobileExploreZoom } from "@/components/explore/mobileExploreCover";
import { useMobileExploreZoomLanded } from "@/components/explore/mobileExploreZoomLanded";
import { peekMobileExploreDetailHandoff } from "@/lib/mobileExploreDetailHandoff";
import { dissolveExploreTitle } from "@/components/explore/mobileExploreDissolve";
import { getMobileMetadataEditorSaveResultAction } from "@/lib/mobileMetadataEditorBackBehavior";
import { nextSyncTimestamp } from "@nemu/core";
import {
  getMobileMangaDetailContinueAction,
  getMobileMangaDetailEmptyChapterMessage,
  getMobileMangaDetailSourceTabBadge,
} from "@/lib/mobileMangaDetailPresentation";
import {
  getMobileMangaDetailRouteIdCandidates,
  getMobileMangaDetailRouteSourceParam,
  normalizeMobileMangaDetailSourceParam,
  resolveMobileMangaDetailExitAction,
  resolveMobileMangaDetailSelectedSourceId,
  shouldRedirectMissingMobileMangaDetailEntry,
} from "@/lib/mobileMangaDetailRoute";
import {
  buildMobileMetadataEditedItem,
  type MobileMetadataFormValues,
} from "@/lib/mobileMetadataOverrides";
import { sortMobileSourceLinks } from "@/lib/mobileSourceLinks";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
  getMobileSourceErrorRecoveryAction,
  getMobileSourceErrorRecoveryHref,
  type MobileSourceErrorRecoveryAction,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import { markMobilePerformance } from "@/lib/mobilePerformance";
import type { NemuAgentSheetContext } from "@/lib/nemuAgentSheetReducer";
import { readMobileCloudflareUserAgent } from "@/sources/mobileAidokuUserAgent";
import { useMobileStickySourceCover } from "@/lib/useMobileSourceImageRequest";
import { ExploreSharperCoverProbe } from "@/components/explore/ExploreSharperCoverProbe";
import { useMobileExploreCoverPreference } from "@/components/explore/mobileExploreCoverPreference";
import { withMobileSourceOperationTimeout } from "@/sources/mobileSourceOperationTimeout";
import { normalizeReaderProcessPageImages } from "@/lib/mobileReaderSettings";
import { refreshMobileReaderPages } from "@/sources/mobileSourcePages";
import {
  disposeMobileReaderPagesPrefetchResult,
  makeMobileReaderPagesPrefetchKey,
  mobileReaderPagesPrefetchCache,
} from "@/sources/mobileReaderPagesPrefetch";
import {
  refreshMobileSourceChapters,
  refreshMobileSourceMetadata,
} from "@/sources/mobileSourceDetails";
import type { MobileSourceTaskPriority } from "@/sources/mobileSourceRuntimeScheduler";
import {
  getCachedMobileSourceDetail,
  getMobileSourceDetailMetadataAgeMs,
  makeMobileSourceDetailCacheKey,
  setCachedMobileSourceDetail,
  setCachedMobileSourceDetailChapters,
  type MobileSourceDetailCachePayload,
} from "@/lib/mobileSourceDetailCache";
import {
  MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS,
  MOBILE_MANGA_DETAIL_METADATA_REVALIDATE_MS,
  MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
  MOBILE_MANGA_DETAIL_SLOW_LOAD_MS,
  mobileSourceChapterRequests,
  mobileSourceMetadataRequests,
  shouldRevalidateMobileSourceDetail,
  withMobileSourceDetailSnapshot,
  type MobileSourceChapterListRefresh,
  type MobileSourceChapterListState,
} from "@/lib/mobileSourceDetailRevalidation";
import {
  rememberMobileSourceCoverOwner,
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
  type MobileKnownSourceCovers,
} from "@/lib/mobileEntryCover";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  applyMobileSourcePackageHydration,
  type MobileSourcePackageHydration,
} from "@/sources/mobileSourcePackageLoader";

/** Design-explore: the sort direction is a glass capsule like the list's other controls. */

type DetailState = {
  entry: LibraryEntry | null;
  installedSources: InstalledSource[];
  progress: LocalMangaProgress[];
  /**
   * Chapter progress per linked source, kept across tab switches so a switch
   * paints the new tab with its own read marks (and never the previous tab's
   * progress rows as extra chapters) before the local reload lands.
   */
  chapterProgressBySourceId: Record<
    string,
    Record<string, LocalChapterProgress>
  >;
};

const EMPTY_CHAPTER_PROGRESS: Record<string, LocalChapterProgress> = {};

type LiveDetailState =
  | { status: "idle"; detail: string }
  | { status: "loading"; detail: string }
  | { status: "ready"; detail: string }
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

/**
 * The selected tab's refresh failed while a complete list is on screen: the
 * list stays, and only a compact "couldn't refresh" line with Retry shows.
 */
function isStaleRefreshFailure(
  state: LiveDetailState,
  hasFullList: boolean,
): boolean {
  return hasFullList && (state.status === "error" || state.status === "blocked");
}

type SourceChapterListState = MobileSourceChapterListState;

const EMPTY_CHAPTERS: ChapterSummary[] = [];
/** The remove confirmation's dismissal, before the hero cover turns to dust (design-explore). */
const EXPLORE_SHEET_DISMISS_MS = 380;
/** The chapter list of a page that is still zooming in (design-explore). */
const NO_CHAPTER_ROWS: ReturnType<typeof buildMobileChapterRows> = [];

function sourceDetailCacheKeyForLink(link: LocalSourceLink): string {
  return makeMobileSourceDetailCacheKey(
    link.registryId,
    link.sourceId,
    link.sourceMangaId,
  );
}

function sourceDisplayName(source: LocalSourceLink): string {
  return source.sourceId.split(".").slice(1).join(".") || source.sourceId;
}

function sourceInfoForLink(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): InstalledSource | undefined {
  return installedSources.find((installed) =>
    mobileInstalledSourceMatchesLink(installed, source),
  );
}

function sourcePresentationForLink(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): { name: string; detail: string; icon?: string } {
  const info = sourceInfoForLink(source, installedSources);
  return {
    name: info?.name ?? sourceDisplayName(source),
    detail: source.sourceId,
    icon: info?.icon,
  };
}

function refreshChapterCountText(
  count: number,
  strings: MobileStrings,
): string {
  return formatMobileString(
    count === 1
      ? strings.mangaDetail.refreshChapterCountOne
      : strings.mangaDetail.refreshChapterCountOther,
    { count },
  );
}

function uniqueChapters(
  source: LocalSourceLink | undefined,
  progress: LocalMangaProgress | undefined,
  chapterProgress: Record<string, LocalChapterProgress>,
  refreshedChapters: ChapterSummary[] = [],
): ChapterSummary[] {
  const byId = new Map<string, ChapterSummary>();
  // The first record for an id wins (the source list comes first); later
  // progress/link records only fill fields it lacks, so a read chapter keeps
  // its language, scanlator and lock state.
  const add = (chapter: ChapterSummary | null | undefined) => {
    if (!chapter?.id) return;
    const existing = byId.get(chapter.id);
    byId.set(
      chapter.id,
      existing ? mergeMobileChapterRecord(existing, chapter) : chapter,
    );
  };

  for (const chapter of refreshedChapters) {
    add(chapter);
  }
  add(source?.latestChapter);
  add(source?.updateAckChapter);
  add(
    progress?.lastReadSourceChapterId
      ? {
          id: progress.lastReadSourceChapterId,
          title: progress.lastReadChapterTitle,
          chapterNumber: progress.lastReadChapterNumber,
          volumeNumber: progress.lastReadVolumeNumber,
        }
      : null,
  );

  for (const item of Object.values(chapterProgress)) {
    add({
      id: item.sourceChapterId,
      title: item.chapterTitle,
      chapterNumber: item.chapterNumber,
      volumeNumber: item.volumeNumber,
    });
  }

  return orderMobileKnownChapters(
    [...byId.values()],
    new Set(refreshedChapters.map((chapter) => chapter.id)),
  );
}

function cachedChaptersForSource(source: LocalSourceLink): ChapterSummary[] {
  return uniqueChapters(source, undefined, {});
}

export function MangaDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string | string[];
    /** Zoom source of the cover this page grows out of (design-explore). */
    zoom?: string;
  }>();
  const idCandidates = useMemo(
    () => getMobileMangaDetailRouteIdCandidates(params.id),
    [params.id],
  );
  const routeSourceId = normalizeMobileMangaDetailSourceParam(params.source);
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const usesNativeHeader = usesNemuNativeHeader;
  const booksHero = useMobileDesignExplore();
  // Books: the bar shows the title only once the hero's title has scrolled
  // under it (the native bar title; no custom fade).
  const [heroTitleScrolledAway, setHeroTitleScrolledAway] = useState(false);
  // In the regular-width info pane the hero does not scroll with the list,
  // so the bar keeps the title there.
  const [heroInPane, setHeroInPane] = useState(false);
  // Where the hero's title block ends, as the hero measured it (the hero is
  // sized from its own column, so no window arithmetic here). Until then the
  // title is treated as on screen.
  const [heroTitleBottom, setHeroTitleBottom] = useState<number | null>(null);
  const heroTitleThreshold = heroTitleBottom ?? Number.POSITIVE_INFINITY;
  // The bar's title fades in as the hero's title passes under the bar and
  // out again as it comes back, both ways, with a little hysteresis so a
  // finger resting on the line never flickers it.
  const barTitleShown = useSharedValue(0);
  const onDetailScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      const y = contentOffset.y + (contentInset?.top ?? 0);
      setHeroTitleScrolledAway((current) => {
        const past = getMobileExploreBarTitleShown(current, y, heroTitleThreshold);
        if (past !== current) {
          barTitleShown.value = withTiming(past ? 1 : 0, { duration: MOBILE_EXPLORE_BAR_TITLE_FADE_MS });
        }
        return past;
      });
    },
    [barTitleShown, heroTitleThreshold],
  );
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
  const [state, setState] = useState<DetailState>({
    entry: null,
    installedSources: [],
    progress: [],
    chapterProgressBySourceId: {},
  });
  // Design-explore, a page opened by a cover zoom: what the tapped cover
  // already knew about the title (its record and its cover), and whether the
  // zoom has landed. The stack pushes this screen's first commit, and the
  // local record only arrives after it, so the first commit draws the hero's
  // cover and title from the handoff; everything else on the page waits for
  // the zoom to land, because mounting it mid-flight freezes the zoom.
  const [zoomSeed] = useState(() =>
    booksHero && params.zoom ? peekMobileExploreDetailHandoff(idCandidates) : null,
  );
  const zoomLanded = useMobileExploreZoomLanded();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);
  const removeRouteAfterDismissRef = useRef(false);
  const exitingDetailRef = useRef(false);
  // Leave a detail whose title is gone by popping back to what pushed it,
  // never by replacing it with a second library index (duplicate Library
  // screen with a Back button). Runs at most once per screen instance.
  const exitDetailToLibrary = useCallback(() => {
    const action = resolveMobileMangaDetailExitAction({
      alreadyExiting: exitingDetailRef.current,
      canDismiss: router.canDismiss(),
    });
    if (action === "none") return;
    exitingDetailRef.current = true;
    if (action === "back") router.back();
    else router.replace("/library");
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterListPreference, setChapterListPreference] =
    useState<MobileChapterListPreference>(
      DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE,
    );
  const [sourceChapterLists, setSourceChapterLists] = useState<
    Record<string, SourceChapterListState>
  >({});
  const sourceChapterListsRef = useRef<Record<string, SourceChapterListState>>(
    {},
  );
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false);
  const [metadataEditorPresentation, setMetadataEditorPresentation] =
    useState<LibraryEntry | null>(null);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  const [collectionSheetPresentation, setCollectionSheetPresentation] =
    useState<{ libraryItemId: string; title: string } | null>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [sourceManagerPresentation, setSourceManagerPresentation] =
    useState<LibraryEntry | null>(null);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const savingMetadataRef = useRef(false);
  const [openingReader, setOpeningReader] = useState(false);
  const openingReaderRef = useRef(false);
  const [retryingData, setRetryingData] = useState(false);
  const retryDataGuardRef = useRef(false);
  // Bumped by the Nemu Agent sheet's onSuccess to force the source-detail
  // refresh effect to re-run after a Cloudflare challenge is solved.
  const [detailRefreshNonce, setDetailRefreshNonce] = useState(0);
  // Pull-to-refresh re-reads the local record and replays the source-detail
  // effect. The spinner is released on the loading -> settled transition that
  // replay produces, so it tracks the real work instead of the local read.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullRefreshGuardRef = useRef(false);
  const cloudflareSheetRef = useRef<{
    reportError: (
      error: unknown,
      context?: NemuAgentSheetContext,
    ) => boolean;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveDetailState, setLiveDetailState] = useState<LiveDetailState>({
    status: "idle",
    detail: strings.mangaDetail.fullRefreshNotStarted,
  });
  const detailRefreshGate = useRef(createMobileKeyedRefreshGate());
  // The selected tab's interest in its in-flight request. Aborted when the
  // run is superseded or the screen goes away, so a request nobody waits for
  // any more drops to `background` and never holds up the next title opened.
  const selectedRunAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const gate = detailRefreshGate.current;
    return () => {
      gate.reset();
      selectedRunAbortRef.current?.abort();
      selectedRunAbortRef.current = null;
    };
  }, []);

  const reloadLocalDetailState = useCallback(async () => {
    if (!idCandidates.length) return null;
    let item = null;
    let libraryItemId = idCandidates[0] ?? "";
    for (const candidate of idCandidates) {
      item = await store.getLibraryItem(candidate);
      if (item) {
        libraryItemId = item.libraryItemId;
        break;
      }
    }
    const [sources, progress, installedSources] = await Promise.all([
      item ? store.getSourceLinksForItem(libraryItemId) : Promise.resolve([]),
      store.getMangaProgress(),
      store.getInstalledSources(),
    ]);
    // Design-explore: a page opened without a source (the shelf, a search
    // result, a link) starts on the source the title was last read on, so the
    // chapter list, its facts ("Source", "Latest") and Continue name one
    // source; the first link stays the choice for a title never read.
    const readSourceId =
      mobileDesignExploreFlag && !routeSourceId && !selectedSourceId && item
        ? (getMobileEntryMostRecentSource(
            { item, sources },
            buildMobileEntryProgressMap({ item, sources }, new Map(progress.map((entry) => [entry.id, entry]))),
          )?.id ?? null)
        : null;
    const resolvedSelectedSourceId = resolveMobileMangaDetailSelectedSourceId(
      sources,
      routeSourceId,
      selectedSourceId ?? readSourceId,
    );
    const selected = resolvedSelectedSourceId
      ? sources.find((source) => source.id === resolvedSelectedSourceId)
      : undefined;
    // The selected tab's persisted details are read alongside its progress
    // so the first painted frame already has the complete chapter list (no
    // partial list of progress-known chapters flashing first).
    const [selectedChapterProgress, selectedCachedDetail] = await Promise.all([
      selected
        ? loadMobileChapterProgressForSource(store, selected, installedSources)
        : Promise.resolve({}),
      selected
        ? getCachedMobileSourceDetail(sourceDetailCacheKeyForLink(selected))
            .then((hit) => hit?.payload ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      entry: item ? { item, sources } : null,
      installedSources,
      selectedCachedDetail,
      progress,
      selected,
      selectedChapterProgress,
      sources,
    };
  }, [idCandidates, routeSourceId, selectedSourceId, store]);

  const applyLocalDetailState = useCallback(
    (
      nextState: NonNullable<
        Awaited<ReturnType<typeof reloadLocalDetailState>>
      >,
    ) => {
      setState((current) => ({
        entry: nextState.entry,
        installedSources: nextState.installedSources,
        progress: nextState.progress,
        chapterProgressBySourceId: nextState.selected
          ? {
              ...current.chapterProgressBySourceId,
              [nextState.selected.id]: nextState.selectedChapterProgress,
            }
          : current.chapterProgressBySourceId,
      }));
      if (
        routeSourceId &&
        !nextState.sources.some((source) => source.id === routeSourceId)
      ) {
        router.setParams({ source: undefined });
      }
      if (
        nextState.selected?.id &&
        selectedSourceId !== nextState.selected.id
      ) {
        setSelectedSourceId(nextState.selected.id);
      }
      if (nextState.selected && nextState.selectedCachedDetail) {
        rememberMobileSourceCoverOwner(
          nextState.selectedCachedDetail.metadata.cover,
          nextState.selected,
        );
      }
      setSourceChapterLists((current) => {
        const next: Record<string, SourceChapterListState> = { ...current };
        let changed = false;
        const selected = nextState.selected;
        const cachedDetail = nextState.selectedCachedDetail;
        if (selected && cachedDetail) {
          const merged = withMobileSourceDetailSnapshot(
            next[selected.id],
            cachedDetail,
            "cache",
          );
          if (merged !== next[selected.id]) {
            next[selected.id] = merged;
            changed = true;
          }
        }
        for (const source of nextState.sources) {
          const existing = next[source.id];
          if (
            existing?.full ||
            existing?.status === "ready" ||
            existing?.status === "loading"
          ) {
            continue;
          }
          const cached = cachedChaptersForSource(source);
          if (!cached.length) continue;
          next[source.id] = { status: "cached", chapters: cached };
          changed = true;
        }
        if (!changed) return current;
        sourceChapterListsRef.current = next;
        return next;
      });
    },
    [routeSourceId, selectedSourceId],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      openingReaderRef.current = false;
      setOpeningReader(false);
      void reloadLocalDetailState()
        .then((nextState) => {
          if (!active || !nextState) return;
          applyLocalDetailState(nextState);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [applyLocalDetailState, reloadLocalDetailState]),
  );

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!idCandidates.length) return;
      markMobilePerformance("mangaDetail.open");
      setLoading(true);
      setError(null);
      try {
        const nextState = await reloadLocalDetailState();
        if (!nextState) return;
        if (!mounted) return;
        markMobilePerformance("mangaDetail.local-ready");
        applyLocalDetailState(nextState);
      } catch (nextError) {
        if (!mounted) return;
        setError(
          describeMobileErrorDetail(
            nextError,
            strings.mangaDetail.actionFailedDetail,
          ),
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [
    applyLocalDetailState,
    idCandidates,
    reloadLocalDetailState,
    strings.mangaDetail.actionFailedDetail,
  ]);

  const entry = state.entry;
  useEffect(() => {
    let active = true;
    const libraryItemId = entry?.item.libraryItemId;
    if (!libraryItemId) {
      setChapterListPreference(DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE);
      return () => {
        active = false;
      };
    }
    void store
      .getSettings()
      .then((settings) => {
        if (!active) return;
        setChapterListPreference(
          normalizeMobileChapterListPreference(
            settings.mobileChapterListPreferences?.[libraryItemId],
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [entry?.item.libraryItemId, store]);
  useEffect(() => {
    if (
      shouldRedirectMissingMobileMangaDetailEntry({
        loading,
        error,
        hasEntry: Boolean(entry),
      })
    ) {
      // A removal still showing its confirmation leaves after the sheet
      // dismisses (handleRemoveConfirmationDismissed); exiting here as well
      // navigated twice.
      if (removingRef.current || removeRouteAfterDismissRef.current) return;
      exitDetailToLibrary();
    }
  }, [entry, error, exitDetailToLibrary, loading]);

  const effectiveMetadata = useMemo(
    () =>
      entry
        ? { ...entry.item.metadata, ...entry.item.overrides?.metadata }
        : null,
    [entry],
  );
  const title = effectiveMetadata?.title ?? strings.mangaDetail.manga;
  // The handed-over title stands in only until the local record is read; a
  // title that turns out to be gone falls through to the usual empty state.
  const seedEntry = !entry && loading && zoomSeed ? zoomSeed.entry : null;
  const heroMetadata =
    effectiveMetadata ??
    (seedEntry ? { ...seedEntry.item.metadata, ...seedEntry.item.overrides?.metadata } : null);
  const sources = useMemo(
    () =>
      entry ? sortMobileSourceLinks(entry.sources, entry.item.sourceOrder) : [],
    [entry],
  );
  // Covers each linked source reported with its full details. Keyed by a
  // string signature so the cover resolution below only re-runs when a cover
  // actually changes, not on every chapter-list update.
  const knownSourceCoversSignature = sources
    .map((source) => {
      const known = sourceChapterLists[source.id]?.metadata?.cover ?? "";
      return `${source.id}\u0000${known}`;
    })
    .join("\u0001");
  const knownSourceCovers = useMemo((): MobileKnownSourceCovers => {
    const covers: Record<string, string> = {};
    for (const part of knownSourceCoversSignature.split("\u0001")) {
      const separator = part.indexOf("\u0000");
      if (separator <= 0) continue;
      const cover = part.slice(separator + 1);
      if (cover) covers[part.slice(0, separator)] = cover;
    }
    return covers;
  }, [knownSourceCoversSignature]);
  // The library title's own cover (override > stored > best known source
  // cover). The selected tab never changes it.
  // Design-explore: a clearly sharper cover from another linked source (the
  // one the card and shelf show too; never over a cover the user set).
  const preferredCover = useMobileExploreCoverPreference(entry?.item.libraryItemId);
  const cover = entry
    ? ((booksHero && preferredCover && !hasMobileUserCover(entry) ? preferredCover : null) ??
      resolveMobileEntryDisplayCover(entry, knownSourceCovers))
    : undefined;
  const metadataSourceChoices = useMemo(
    () =>
      sources.map((source) => {
        const sourceInfo = sourcePresentationForLink(
          source,
          state.installedSources,
        );
        const installedSource = sourceInfoForLink(
          source,
          state.installedSources,
        );
        return {
          id: source.id,
          label: sourceInfo.name,
          detail: sourceInfo.detail,
          icon: sourceInfo.icon,
          installedSource,
        };
      }),
    [sources, state.installedSources],
  );
  const selectSource = useCallback(
    (sourceId: string | null) => {
      setSelectedSourceId(sourceId);
      router.setParams({
        source: getMobileMangaDetailRouteSourceParam(sourceId, sources),
      });
    },
    [sources],
  );
  useEffect(() => {
    if (!routeSourceId || !sources.length) return;
    const resolvedSelectedSourceId = resolveMobileMangaDetailSelectedSourceId(
      sources,
      routeSourceId,
      selectedSourceId,
    );
    if (
      resolvedSelectedSourceId === routeSourceId &&
      getMobileMangaDetailRouteSourceParam(routeSourceId, sources) === undefined
    ) {
      router.setParams({ source: undefined });
    }
  }, [routeSourceId, selectedSourceId, sources]);
  const selectedSource = useMemo(() => {
    const resolvedSelectedSourceId = resolveMobileMangaDetailSelectedSourceId(
      sources,
      routeSourceId,
      selectedSourceId,
    );
    return resolvedSelectedSourceId
      ? sources.find((source) => source.id === resolvedSelectedSourceId)
      : undefined;
  }, [routeSourceId, selectedSourceId, sources]);
  // A synced item can point at a source this device has no install for (it
  // was uninstalled on another device, or the item predates installed-source
  // sync). Load the registry catalog only in that case so the blocked notice
  // can offer a one-tap install instead of a dead end.
  const selectedSourceMissing =
    getMobileMissingSourceState(selectedSource, state.installedSources, [])
      ?.status === "missing";
  const missingSourceCatalog = useAvailableSources({
    enabled: selectedSourceMissing,
  });
  const missingSourceInstallCandidate = useMemo(() => {
    if (!selectedSourceMissing) return null;
    const missing = getMobileMissingSourceState(
      selectedSource,
      state.installedSources,
      missingSourceCatalog.data,
    );
    return missing?.status === "missing" ? missing.candidate : null;
  }, [
    missingSourceCatalog.data,
    selectedSource,
    selectedSourceMissing,
    state.installedSources,
  ]);
  const missingSourceInstaller = useSourceInstaller();
  const installingMissingSourceRef = useRef(false);
  const installMissingSource = () => {
    const candidate = missingSourceInstallCandidate;
    if (!candidate || installingMissingSourceRef.current) return;
    installingMissingSourceRef.current = true;
    setLiveDetailState({
      status: "loading",
      detail: strings.mangaDetail.refreshingSource,
    });
    void (async () => {
      try {
        await missingSourceInstaller.installSource(candidate);
        const nextState = await reloadLocalDetailState();
        if (nextState) applyLocalDetailState(nextState);
        setDetailRefreshNonce((value) => value + 1);
        await hapticConfirm();
      } catch (installError) {
        if (!isMobileSourceInstallCancellation(installError)) {
          setLiveDetailState({
            status: "error",
            detail: describeMobileErrorDetail(
              installError,
              strings.mangaDetail.actionFailedDetail,
            ),
          });
          await hapticError();
        }
      } finally {
        installingMissingSourceRef.current = false;
      }
    })();
  };
  // The cover is requested through the source that owns its URL, never the
  // selected tab's source: another source's Referer on a MangaDex cover gets
  // MangaDex's "read this at mangadex.org" placeholder, and a Referer-less
  // request for a Manhuagui cover gets a 403 (no cover at all). Later
  // candidates are fallbacks the sticky hook tries when a request fails.
  const coverSources = useMemo(
    () =>
      entry
        ? resolveMobileEntryCoverSources(entry, state.installedSources, {
            cover:
              booksHero && preferredCover
                ? mobileExploreCoverOwnerUrl(entry, cover, knownSourceCovers)
                : cover,
            knownSourceCovers,
          })
        : [],
    [booksHero, cover, entry, knownSourceCovers, preferredCover, state.installedSources],
  );
  const coverSource = coverSources[0] ?? null;
  // Same protection as the source manga screen: a metadata refresh can change
  // the cover identity, and painting the bare URL while the source rewrite is
  // in flight is what drops referer-gated covers into `MobileCachedImage`'s
  // failed state.
  const coverImage = useMobileStickySourceCover({
    sources: coverSources,
    cover,
  });
  const progressBySource = useMemo(() => {
    return new Map(state.progress.map((item) => [item.id, item]));
  }, [state.progress]);
  const entryProgressMap = useMemo(() => {
    if (!entry) return new Map<string, LocalMangaProgress>();
    return buildMobileEntryProgressMap(
      { item: entry.item, sources },
      progressBySource,
    );
  }, [entry, progressBySource, sources]);
  const selectedChapterProgress =
    (selectedSource
      ? state.chapterProgressBySourceId[selectedSource.id]
      : undefined) ?? EMPTY_CHAPTER_PROGRESS;
  const selectedProgress = selectedSource
    ? findMobileMangaProgressForSource(
        selectedSource,
        state.installedSources,
        progressBySource,
      )
    : undefined;
  const continueSource = entry
    ? getMobileEntryMostRecentSource(
        { item: entry.item, sources },
        entryProgressMap,
      )
    : undefined;
  const continueProgress = continueSource
    ? entryProgressMap.get(continueSource.id)
    : undefined;
  const continueSourceInfo = continueSource
    ? sourcePresentationForLink(continueSource, state.installedSources)
    : null;
  const liveDetailRefreshKey = selectedSource
    ? `${selectedSource.registryId}:${selectedSource.sourceId}:${selectedSource.sourceMangaId}:${detailRefreshNonce}`
    : null;
  const detailActionState: MobileMangaDetailActionState = {
    openingReader,
    savingMetadata,
    removing,
  };
  const detailActionBusy = isMobileMangaDetailActionBusy(detailActionState);
  const getGuardedDetailActionState = useCallback(
    (): MobileMangaDetailActionState => ({
      openingReader: openingReaderRef.current || openingReader,
      savingMetadata: savingMetadataRef.current || savingMetadata,
      removing: removingRef.current || removing,
    }),
    [openingReader, removing, savingMetadata],
  );
  const openMetadataEditor = () => {
    if (detailActionBusy || !entry) return;
    setActionError(null);
    setMetadataEditorPresentation(entry);
    setMetadataEditorOpen(true);
  };
  const openSourceManager = () => {
    if (detailActionBusy || !entry) return;
    setActionError(null);
    setSourceManagerPresentation(entry);
    setSourceManagerOpen(true);
  };
  const openCollectionMembership = () => {
    if (detailActionBusy || !entry) return;
    setActionError(null);
    setCollectionSheetPresentation({
      libraryItemId: entry.item.libraryItemId,
      title,
    });
    setCollectionSheetOpen(true);
  };
  const confirmRemoveFromLibrary = () => {
    if (detailActionBusy) return;
    setActionError(null);
    removeRouteAfterDismissRef.current = false;
    setRemoveConfirmOpen(true);
  };

  const getDetailSourceSettings = useCallback(
    async (_sourceKey: string, sourceRecord: InstalledSource) => {
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
    [store],
  );

  // The fallback title for a chapter-only cache entry (see
  // `setCachedChapters`); read through a ref so the fetchers keep their
  // identity while the entry reloads.
  const entryTitleRef = useRef("");
  entryTitleRef.current = effectiveMetadata?.title ?? "";

  /**
   * One network fetch of a linked source's chapter list, shared by every
   * caller that asks for the same source manga while it is in flight (the
   * selected tab, the other-tab sweep), and folded into the persisted detail
   * cache so the next open (or tab switch) paints it without touching the
   * source runtime. A later caller with a higher priority promotes the
   * request in place.
   *
   * Chapters only: the library row already knows the header (title, cover,
   * description), so the list never waits for `getMangaDetails`; metadata is
   * refreshed separately in the background (`refreshSourceMetadataForLink`).
   */
  const fetchSourceChaptersForLink = useCallback(
    (
      installedSource: InstalledSource,
      link: LocalSourceLink,
      priority: MobileSourceTaskPriority,
      signal?: AbortSignal,
    ) => {
      const cacheKey = sourceDetailCacheKeyForLink(link);
      return mobileSourceChapterRequests.run(
        cacheKey,
        async (ticket): Promise<MobileSourceChapterListRefresh> => {
          const refreshed = await refreshMobileSourceChapters(
            installedSource,
            link.sourceMangaId,
            {
              getSourceSettings: getDetailSourceSettings,
              onSourcePackageHydrated: saveSourcePackageHydration,
              priority: ticket,
              timeoutMessage: strings.sourceBrowse.sourceOperationTimedOut,
            },
          );
          if (refreshed.status !== "ready") return refreshed;
          const title = entryTitleRef.current || link.sourceMangaId;
          const stored = await setCachedMobileSourceDetailChapters(cacheKey, {
            chapters: refreshed.chapters,
            fetchedAt: refreshed.fetchedAt,
            fallbackTitle: title,
          }).catch(() => null);
          return {
            ...refreshed,
            payload: stored ?? {
              metadata: { title },
              chapters: refreshed.chapters,
              fetchedAt: refreshed.fetchedAt,
              partialMetadata: true,
            },
          };
        },
        priority,
        signal,
      );
    },
    [
      getDetailSourceSettings,
      saveSourcePackageHydration,
      strings.sourceBrowse.sourceOperationTimedOut,
    ],
  );

  /**
   * The selected source's metadata, refreshed in the background when the
   * cached copy is older than `MOBILE_MANGA_DETAIL_METADATA_REVALIDATE_MS`
   * (or was never fetched). Nobody waits on it: it runs at `background`
   * priority after the chapters, updates the cache, the source's cover
   * ownership and the library row, and never touches the list.
   */
  const refreshSourceMetadataForLink = useCallback(
    async (
      installedSource: InstalledSource,
      link: LocalSourceLink,
      payload: MobileSourceDetailCachePayload,
    ): Promise<MobileSourceDetailCachePayload | null> => {
      if (
        getMobileSourceDetailMetadataAgeMs(payload) <
        MOBILE_MANGA_DETAIL_METADATA_REVALIDATE_MS
      ) {
        return null;
      }
      const cacheKey = sourceDetailCacheKeyForLink(link);
      const refreshed = await mobileSourceMetadataRequests.run(
        cacheKey,
        (ticket) =>
          refreshMobileSourceMetadata(installedSource, link.sourceMangaId, {
            getSourceSettings: getDetailSourceSettings,
            onSourcePackageHydrated: saveSourcePackageHydration,
            priority: ticket,
          }),
        "background",
      );
      if (refreshed.status !== "ready") return null;
      rememberMobileSourceCoverOwner(refreshed.metadata.cover, link);
      // Fold into whatever list is cached now (a chapter refresh may have
      // landed meanwhile); the chapter fetch time stays the list's own.
      const current = await getCachedMobileSourceDetail(cacheKey).catch(
        () => null,
      );
      const base = current?.payload ?? payload;
      const next: MobileSourceDetailCachePayload = {
        metadata: refreshed.metadata,
        chapters: base.chapters,
        fetchedAt: base.fetchedAt,
        metadataFetchedAt: refreshed.fetchedAt,
      };
      await setCachedMobileSourceDetail(cacheKey, next).catch(() => undefined);
      return next;
    },
    [getDetailSourceSettings, saveSourcePackageHydration],
  );

  const updateSourceChapterList = useCallback(
    (
      linkId: string,
      update: (
        existing: SourceChapterListState | undefined,
      ) => SourceChapterListState | undefined,
    ) => {
      setSourceChapterLists((current) => {
        const existing = current[linkId];
        const nextState = update(existing);
        if (!nextState || nextState === existing) return current;
        const next = { ...current, [linkId]: nextState };
        sourceChapterListsRef.current = next;
        return next;
      });
    },
    [],
  );

  /**
   * Paints a complete chapter list for one linked source. A cached copy never
   * replaces a newer list already on screen, and a fresher list is merged by
   * chapter id so unchanged rows keep their identity (no flicker, no jump).
   */
  const applySourceDetailSnapshot = useCallback(
    (
      link: LocalSourceLink,
      payload: MobileSourceDetailCachePayload,
      origin: "cache" | "network",
    ) => {
      rememberMobileSourceCoverOwner(payload.metadata.cover, link);
      updateSourceChapterList(link.id, (existing) =>
        withMobileSourceDetailSnapshot(existing, payload, origin),
      );
    },
    [updateSourceChapterList],
  );

  // Every linked source's cached details paint as soon as the links are
  // known: the selected tab shows its full list immediately, the other tabs
  // show their counts, and switching tabs never waits on a source runtime.
  const sourceLinksSignature = sources
    .map((source) => `${source.id}\u0000${sourceDetailCacheKeyForLink(source)}`)
    .join("\u0001");
  useEffect(() => {
    let cancelled = false;
    const pending = sources.filter(
      (source) => !sourceChapterListsRef.current[source.id]?.full,
    );
    if (!pending.length) return;
    void Promise.all(
      pending.map(async (source) => {
        const cached = await getCachedMobileSourceDetail(
          sourceDetailCacheKeyForLink(source),
        ).catch(() => null);
        if (cancelled || !cached) return;
        applySourceDetailSnapshot(source, cached.payload, "cache");
      }),
    );
    return () => {
      cancelled = true;
    };
    // `sources` is captured through its signature: entry reloads re-create
    // the array without changing which source manga are linked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySourceDetailSnapshot, sourceLinksSignature]);

  // The background sweep of the other linked sources waits until the selected
  // tab's own refresh has settled. It runs at `background` priority anyway (a
  // tap always goes first on the source runtime), but starting it later keeps
  // the runtime idle for the chapter the user is most likely to open next.
  const [selectedRefreshSettledKey, setSelectedRefreshSettledKey] = useState<
    string | null
  >(null);
  const lastHandledRefreshNonceRef = useRef(detailRefreshNonce);
  // The refresh key whose first load (nothing painted yet) has run past
  // `MOBILE_MANGA_DETAIL_SLOW_LOAD_MS`; the skeleton then says so.
  const [slowRefreshKey, setSlowRefreshKey] = useState<string | null>(null);

  /**
   * Persists what a refresh of `link` learned (latest chapter, update ack,
   * library metadata) against the rows as they are now: the run outlives
   * entry reloads (see the gate below), and a removal or edit that landed
   * while the request was in flight (locally or from another device via
   * sync) must not be overwritten by the entry captured at start.
   */
  const persistSelectedSourceRefresh = useCallback(
    async (
      capturedEntry: LibraryEntry,
      link: LocalSourceLink,
      apply: (
        baseEntry: LibraryEntry,
        sourceLink: LocalSourceLink,
      ) => { item: LibraryEntry["item"]; sourceLink: LocalSourceLink },
      isCancelled: () => boolean,
    ) => {
      const [latestItem, latestLink] = await Promise.all([
        store.getLibraryItem(capturedEntry.item.libraryItemId),
        store.getSourceLink(link.id),
      ]);
      const persistable =
        latestItem !== null &&
        latestItem.inLibrary !== false &&
        latestLink !== null &&
        latestLink.removed !== true;
      const baseEntry = persistable
        ? { ...capturedEntry, item: latestItem }
        : capturedEntry;
      const applied = apply(baseEntry, persistable ? latestLink : link);
      if (persistable) {
        await Promise.all([
          // A refresh that does not change the library title's own metadata
          // (any non-primary source, or an unchanged primary) leaves the row
          // alone: no write, no sync round-trip.
          applied.item === baseEntry.item
            ? Promise.resolve()
            : store.saveLibraryItem(applied.item),
          applied.sourceLink === (persistable ? latestLink : link)
            ? Promise.resolve()
            : store.saveSourceLink(applied.sourceLink),
        ]);
        emitMobileDataChanged("library");
      }
      if (isCancelled()) return;
      setState((current) => {
        if (
          !current.entry ||
          current.entry.item.libraryItemId !== capturedEntry.item.libraryItemId
        ) {
          return current;
        }
        return {
          ...current,
          entry: {
            item: applied.item,
            sources: current.entry.sources.map((source) =>
              source.id === applied.sourceLink.id ? applied.sourceLink : source,
            ),
          },
        };
      });
    },
    [store],
  );

  /**
   * Refreshes the selected source's metadata when it is stale, off the
   * critical path: the list is already painted, nothing here blocks it, and
   * the result only feeds cover ownership and the library row.
   */
  const refreshSelectedMetadataInBackground = useCallback(
    async (
      capturedEntry: LibraryEntry,
      link: LocalSourceLink,
      installedSource: InstalledSource | null,
      payload: MobileSourceDetailCachePayload,
      isCancelled: () => boolean,
    ) => {
      try {
        let source = installedSource;
        if (!source) {
          const installedSources = await store.getInstalledSources();
          source =
            installedSources.find((item) =>
              mobileInstalledSourceMatchesLink(item, link),
            ) ?? null;
        }
        if (!source) return;
        const next = await refreshSourceMetadataForLink(source, link, payload);
        if (!next) return;
        if (!isCancelled()) {
          updateSourceChapterList(link.id, (existing) =>
            existing?.full && existing.metadata !== next.metadata
              ? { ...existing, metadata: next.metadata }
              : existing,
          );
        }
        await persistSelectedSourceRefresh(
          capturedEntry,
          link,
          (baseEntry, sourceLink) => ({
            item: applyMobileSourceDetailsRefresh(baseEntry, sourceLink, {
              status: "ready",
              runtime: "native-aidoku",
              metadata: next.metadata,
              chapters: next.chapters,
              latestChapter: next.chapters[0],
              fetchedAt: next.metadataFetchedAt ?? next.fetchedAt,
            }).item,
            sourceLink,
          }),
          isCancelled,
        );
      } catch {
        // Background metadata is best-effort; the next open retries.
      }
    },
    [
      persistSelectedSourceRefresh,
      refreshSourceMetadataForLink,
      store,
      updateSourceChapterList,
    ],
  );

  useEffect(() => {
    if (!entry || !selectedSource || !liveDetailRefreshKey) {
      detailRefreshGate.current.reset();
      selectedRunAbortRef.current?.abort();
      selectedRunAbortRef.current = null;
      setLiveDetailState({
        status: "idle",
        detail: strings.mangaDetail.selectSourceRefresh,
      });
      return;
    }

    // One run per refresh key. `entry` and the other dependencies change
    // identity while the request is in flight (sync snapshots, data events),
    // so a same-key re-run must leave the in-flight run alone; only a new key
    // or unmount cancels it.
    const run = detailRefreshGate.current.begin(liveDetailRefreshKey);
    if (!run) return;
    selectedRunAbortRef.current?.abort();
    const runAbort = new AbortController();
    selectedRunAbortRef.current = runAbort;
    const isCancelled = run.isCancelled;
    const runKey = liveDetailRefreshKey;
    // Pull-to-refresh, a solved challenge, Retry and a source install bump
    // the nonce; those always go to the network. A tab switch does not.
    const force = lastHandledRefreshNonceRef.current !== detailRefreshNonce;
    lastHandledRefreshNonceRef.current = detailRefreshNonce;
    const link = selectedSource;
    const capturedEntry = entry;
    const cacheKey = sourceDetailCacheKeyForLink(link);
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      if (slowTimer) {
        clearTimeout(slowTimer);
        slowTimer = null;
      }
      if (isCancelled()) return;
      setSelectedRefreshSettledKey(runKey);
      setSlowRefreshKey((current) => (current === runKey ? null : current));
    };

    // Already painted and fresh (e.g. switching back to a tab loaded a moment
    // ago): no loading state, no source call.
    const painted = sourceChapterListsRef.current[link.id];
    if (
      !force &&
      painted?.full &&
      painted.fetchedAt !== undefined &&
      !shouldRevalidateMobileSourceDetail({
        cachedAgeMs: Date.now() - painted.fetchedAt,
        force: false,
        maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
      })
    ) {
      setLiveDetailState({
        status: "ready",
        detail: refreshChapterCountText(painted.chapters.length, strings),
      });
      settle();
      return;
    }

    setLiveDetailState({
      status: "loading",
      detail: strings.mangaDetail.refreshingSource,
    });
    markMobilePerformance("mangaDetail.refresh.start", {
      source: link.sourceId,
      force,
    });

    void (async () => {
      // Hoisted so the catch below can tell the Nemu Agent sheet which source
      // jar a solved clearance cookie belongs in. The link's own
      // registryId:sourceId can differ from the installed record's under alias
      // matching, so only the resolved record produces the runtime key.
      let requestSourceKey: string | undefined;
      try {
        // Stale-while-revalidate: paint the persisted copy first, then decide
        // whether the source needs to run at all.
        const cached = await getCachedMobileSourceDetail(cacheKey).catch(
          () => null,
        );
        if (isCancelled()) return;
        if (cached) {
          markMobilePerformance("mangaDetail.cache-paint", {
            source: link.sourceId,
            count: cached.payload.chapters.length,
            ageMs: Math.round(cached.ageMs),
          });
          applySourceDetailSnapshot(link, cached.payload, "cache");
          if (
            !shouldRevalidateMobileSourceDetail({
              cachedAgeMs: cached.ageMs,
              force,
              maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
            })
          ) {
            setLiveDetailState({
              status: "ready",
              detail: refreshChapterCountText(
                cached.payload.chapters.length,
                strings,
              ),
            });
            void refreshSelectedMetadataInBackground(
              capturedEntry,
              link,
              null,
              cached.payload,
              isCancelled,
            );
            return;
          }
        }

        // Nothing complete on screen: after a few seconds the skeleton says
        // the source is slow (the request keeps running either way).
        if (!sourceChapterListsRef.current[link.id]?.full) {
          slowTimer = setTimeout(() => {
            slowTimer = null;
            if (!isCancelled()) setSlowRefreshKey(runKey);
          }, MOBILE_MANGA_DETAIL_SLOW_LOAD_MS);
        }

        const installedSources = await store.getInstalledSources();
        const installedSource = installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, link),
        );
        if (installedSource) {
          requestSourceKey = makeMobileRuntimeSourceKey(
            normalizeInstalledSource(installedSource),
          );
        }

        if (!installedSource) {
          // No install row at all (as opposed to an install whose package
          // bytes are missing, which the runtime repairs): say so, and let the
          // notice offer the registry install when the catalog has it.
          if (!isCancelled()) {
            setLiveDetailState({
              status: "blocked",
              title: strings.sourceBrowse.sourceNotInstalled,
              detail: strings.sourceManga.installSourceBeforeDetails,
            });
          }
          return;
        }

        const refreshed = await fetchSourceChaptersForLink(
          installedSource,
          link,
          "user",
          runAbort.signal,
        );

        if (isCancelled()) return;
        if (refreshed.status === "blocked") {
          // Same contract as the error path below: `detail` is an untranslated
          // technical sentence, and only the presentation layer turns a marked
          // one into localized copy. A cached list stays on screen under the
          // notice.
          const blocked = getMobileSourceErrorPresentation(
            refreshed.detail,
            strings,
          );
          setLiveDetailState({
            status: "blocked",
            title: blocked.title,
            detail: blocked.detail,
            recoveryAction: getMobileSourceErrorRecoveryAction(
              blocked,
              strings,
            ),
          });
          return;
        }

        // Paint first: persisting the library rows is bookkeeping the list
        // does not need to wait for.
        markMobilePerformance("mangaDetail.refresh.done", {
          source: link.sourceId,
          count: refreshed.chapters.length,
        });
        applySourceDetailSnapshot(link, refreshed.payload, "network");
        setLiveDetailState({
          status: "ready",
          detail: refreshChapterCountText(refreshed.chapters.length, strings),
        });
        settle();

        await persistSelectedSourceRefresh(
          capturedEntry,
          link,
          (baseEntry, sourceLink) => ({
            item: baseEntry.item,
            sourceLink: applyMobileSourceChaptersRefresh(sourceLink, refreshed),
          }),
          isCancelled,
        );
        void refreshSelectedMetadataInBackground(
          capturedEntry,
          link,
          installedSource,
          refreshed.payload,
          isCancelled,
        );
      } catch (nextError) {
        if (isCancelled()) return;
        const presentation = getMobileSourceErrorPresentation(
          nextError,
          strings,
        );
        cloudflareSheetRef.current?.reportError(nextError, {
          sourceKey: requestSourceKey,
          userAgent: readMobileCloudflareUserAgent(nextError),
        });
        setLiveDetailState({
          status: "error",
          title: presentation.title,
          detail: presentation.detail,
          recoveryAction: getMobileSourceErrorRecoveryAction(
            presentation,
            strings,
          ),
        });
      } finally {
        settle();
      }
    })();
  }, [
    applySourceDetailSnapshot,
    detailRefreshNonce,
    entry,
    fetchSourceChaptersForLink,
    liveDetailRefreshKey,
    persistSelectedSourceRefresh,
    refreshSelectedMetadataInBackground,
    selectedSource,
    store,
    strings,
  ]);

  const previousLiveDetailStatusRef = useRef(liveDetailState.status);
  useEffect(() => {
    const previousStatus = previousLiveDetailStatusRef.current;
    previousLiveDetailStatusRef.current = liveDetailState.status;
    // Only the loading -> settled edge ends a pull. Releasing on the local
    // read alone would retract the spinner while the source refresh is still
    // in flight.
    if (previousStatus !== "loading" || liveDetailState.status === "loading") {
      return;
    }
    setPullRefreshing((refreshing) => (refreshing ? false : refreshing));
  }, [liveDetailState.status]);

  useEffect(() => {
    // Wait for the selected tab's refresh (see `selectedRefreshSettledKey`).
    if (!liveDetailRefreshKey || selectedRefreshSettledKey !== liveDetailRefreshKey) {
      return;
    }
    let cancelled = false;
    const pendingSources = sources.filter((source) => {
      if (source.id === selectedSource?.id) return false;
      const state = sourceChapterListsRef.current[source.id];
      return state?.status !== "ready" && state?.status !== "blocked";
    });
    if (!pendingSources.length) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      let installedSources: InstalledSource[];
      try {
        installedSources = await store.getInstalledSources();
      } catch {
        return;
      }
      // Sequential on purpose: the source runtime runs one operation at a
      // time, so a parallel fan-out would only queue behind itself. Each
      // request runs at `background` priority; the user opening one of these
      // tabs promotes it (see `fetchSourceChaptersForLink`).
      for (const source of pendingSources) {
        if (cancelled) return;
        const cached = await getCachedMobileSourceDetail(
          sourceDetailCacheKeyForLink(source),
        ).catch(() => null);
        if (cancelled) return;
        if (cached) applySourceDetailSnapshot(source, cached.payload, "cache");
        if (
          !shouldRevalidateMobileSourceDetail({
            cachedAgeMs: cached?.ageMs ?? null,
            force: false,
            maxAgeMs: MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS,
          })
        ) {
          // Fresh enough (possibly written by a sweep this effect restarted
          // mid-flight): settle any leftover loading state on the cache.
          updateSourceChapterList(source.id, (existing) =>
            existing?.status === "loading" && existing.full
              ? { ...existing, status: "cached" }
              : existing,
          );
          continue;
        }

        const installedSource = installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, source),
        );
        if (!installedSource) {
          updateSourceChapterList(source.id, (existing) =>
            existing?.full
              ? existing
              : { status: "blocked", chapters: EMPTY_CHAPTERS },
          );
          continue;
        }

        updateSourceChapterList(source.id, (existing) =>
          existing?.status === "loading"
            ? existing
            : { ...existing, status: "loading", chapters: existing?.chapters ?? [] },
        );
        let refreshed: MobileSourceChapterListRefresh | null = null;
        try {
          refreshed = await fetchSourceChaptersForLink(
            installedSource,
            source,
            "background",
          );
        } catch {
          refreshed = null;
        }
        if (cancelled) return;
        if (refreshed?.status === "ready") {
          applySourceDetailSnapshot(source, refreshed.payload, "network");
          continue;
        }
        const failedStatus = refreshed?.status === "blocked" ? "blocked" : "error";
        // A failed refresh keeps whatever complete list is already painted.
        updateSourceChapterList(source.id, (existing) =>
          existing?.full
            ? { ...existing, status: failedStatus }
            : { status: failedStatus, chapters: EMPTY_CHAPTERS },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applySourceDetailSnapshot,
    fetchSourceChaptersForLink,
    liveDetailRefreshKey,
    selectedRefreshSettledKey,
    selectedSource?.id,
    sources,
    store,
    updateSourceChapterList,
  ]);

  // The selected tab's complete list (persisted cache or network), merged
  // with the chapters known locally from progress rows.
  const selectedChapterListState = selectedSource
    ? sourceChapterLists[selectedSource.id]
    : undefined;
  const selectedFullChapters = selectedChapterListState?.full
    ? selectedChapterListState.chapters
    : EMPTY_CHAPTERS;
  const selectedChaptersComplete = Boolean(selectedChapterListState?.full);
  const chapters = useMemo(
    () =>
      uniqueChapters(
        selectedSource,
        selectedProgress,
        selectedChapterProgress,
        selectedFullChapters,
      ),
    [
      selectedFullChapters,
      selectedProgress,
      selectedSource,
      selectedChapterProgress,
    ],
  );
  // First load with nothing complete to show: the grid shows skeleton cells
  // instead of the one or two chapters known from progress rows, so the real
  // list replaces placeholders rather than reshuffling a partial list. The
  // Continue button keeps using those known chapters meanwhile.
  // (`idle` is the first frame, before the refresh effect has run.)
  const awaitingFirstList =
    Boolean(selectedSource) &&
    !selectedChaptersComplete &&
    (liveDetailState.status === "loading" || liveDetailState.status === "idle");
  const listChapters = awaitingFirstList ? EMPTY_CHAPTERS : chapters;
  const chapterLanguages = useMemo(
    () => getMobileChapterLanguages(listChapters),
    [listChapters],
  );
  const headerRendered = Boolean(entry);
  useEffect(() => {
    if (headerRendered) markMobilePerformance("mangaDetail.header-rendered");
  }, [headerRendered]);
  useEffect(() => {
    markMobilePerformance("mangaDetail.chapters-rendered", {
      count: listChapters.length,
      full: selectedChaptersComplete,
      source: selectedSource?.sourceId,
    });
  }, [listChapters.length, selectedChaptersComplete, selectedSource?.sourceId]);
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
        listChapters,
        selectedChapterProgress,
        effectiveChapterListPreference,
      ),
    [listChapters, effectiveChapterListPreference, selectedChapterProgress],
  );
  const unreadChapterCount = useMemo(
    () =>
      listChapters.reduce(
        (count, chapter) =>
          count + (selectedChapterProgress[chapter.id]?.completed ? 0 : 1),
        0,
      ),
    [listChapters, selectedChapterProgress],
  );
  // Design-explore: one chapter per row, headed by volume where the source
  // numbers volumes (see MobileExploreChapterRow).
  const chapterRows = useMemo(
    () => (booksHero ? buildMobileExploreChapterRows(visibleChapters) : buildMobileChapterRows(visibleChapters)),
    [booksHero, visibleChapters],
  );
  const chapterVolumeHeaders = useMemo(
    () => (booksHero ? getMobileChapterVolumeHeaders(visibleChapters) : null),
    [booksHero, visibleChapters],
  );
  // …and the group most chapters share, named once above the list.
  const chapterCommonGroup = useMemo(
    () => (booksHero ? getMobileChapterListCommonGroup(visibleChapters) : null),
    [booksHero, visibleChapters],
  );
  const chapterListRef = useRef<FlatList<MobileChapterRow> | null>(null);
  const changeChapterListPreference = useCallback(
    (nextPreference: MobileChapterListPreference) => {
      const libraryItemId = entry?.item.libraryItemId;
      setChapterListPreference(nextPreference);
      if (!libraryItemId) return;
      void store
        .updateSettings((settings) => ({
          ...settings,
          mobileChapterListPreferences: {
            ...settings.mobileChapterListPreferences,
            [libraryItemId]: nextPreference,
          },
        }))
        .then(() => emitMobileDataChanged("settings"))
        .catch(() => undefined);
    },
    [entry?.item.libraryItemId, store],
  );
  const sourceSelectorItems = useMemo((): MobileSourceSelectorItem[] => {
    return sources.map((source) => {
      const selected = source.id === selectedSource?.id;
      const sourceInfo = sourcePresentationForLink(
        source,
        state.installedSources,
      );
      const chapterListState = sourceChapterLists[source.id];
      const chapterListHasCachedCount =
        Boolean(chapterListState?.chapters.length) &&
        (chapterListState?.status === "cached" ||
          chapterListState?.status === "loading" ||
          chapterListState?.status === "ready");
      const sourceChapterCountIsLive =
        selected && liveDetailState.status === "ready"
          ? true
          : chapterListState?.status === "ready";
      const sourceChapterCount =
        selected && liveDetailState.status === "ready" && chapterListState?.full
          ? chapterListState.chapters.length
          : chapterListHasCachedCount
            ? chapterListState.chapters.length
            : 0;
      const badge = getMobileMangaDetailSourceTabBadge({
        source,
        chapterCount: sourceChapterCount,
        chapterCountIsLive: sourceChapterCountIsLive,
        strings,
      });
      const accessibilityLabel = formatMobileString(
        strings.mangaDetail.selectSource,
        {
          source: sourceInfo.name,
        },
      );

      return {
        id: source.id,
        name: sourceInfo.name,
        iconUri: sourceInfo.icon,
        count: badge?.text ?? null,
        hasUpdate: badge?.updated,
        accessibilityLabel: [
          accessibilityLabel,
          badge?.detail,
          badge?.updated ? strings.mangaDetail.updated : null,
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
  }, [
    liveDetailState.status,
    selectedSource?.id,
    sourceChapterLists,
    sources,
    state.installedSources,
    strings,
  ]);
  const continueActionChapters =
    continueSource?.id === selectedSource?.id && selectedChaptersComplete
      ? selectedFullChapters
      : chapters;
  const continueSourceChapterState = continueSource
    ? (sourceChapterLists[continueSource.id] ?? null)
    : null;
  const continueAction = getMobileMangaDetailContinueAction({
    continueSource,
    selectedSource,
    selectedChapters: continueActionChapters,
    selectedChaptersLoaded:
      continueSource?.id === selectedSource?.id && selectedChaptersComplete,
    continueChapters:
      continueSource?.id !== selectedSource?.id
        ? continueSourceChapterState?.chapters
        : undefined,
    continueChaptersLoaded:
      continueSource?.id !== selectedSource?.id &&
      (continueSourceChapterState?.status === "ready" ||
        Boolean(continueSourceChapterState?.full)),
    progress: continueProgress,
  });
  const continueChapter = continueAction.chapter;
  const isContinuation = continueAction.isContinuation;
  // Design-explore: the hero cover the reader zooms out of.
  // (Named from the handoff too, so the cover's zoom wrapper is the same
  // element before and after the record arrives and is not remounted.)
  const readerZoomEntry = entry ?? seedEntry;
  const readerZoomSourceId =
    booksHero && readerZoomEntry ? `detail:${readerZoomEntry.item.libraryItemId}` : null;
  const openReader = useCallback(
    (
      chapter: ChapterSummary | null,
      source: LocalSourceLink | undefined = selectedSource,
      // Design-explore "Read from the beginning": the reader opens on this page.
      page?: number,
    ) => {
      if (!source || !chapter) {
        void hapticError();
        return;
      }
      if (
        !canOpenMobileMangaDetailReader({
          hasSource: Boolean(source),
          hasChapter: Boolean(chapter),
          state: getGuardedDetailActionState(),
        })
      ) {
        return;
      }

      openingReaderRef.current = true;
      setOpeningReader(true);
      const installedSource = sourceInfoForLink(source, state.installedSources);
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
            registryId: source.registryId,
            sourceId: source.sourceId,
            mangaId: source.sourceMangaId,
            chapterId: chapter.id,
            processPageImages,
          });
          mobileReaderPagesPrefetchCache.start(
            key,
            () =>
              refreshMobileReaderPages(
                installedSource,
                source.sourceMangaId,
                chapter,
                {
                  processPageImages,
                  getSourceSettings: async () =>
                    mergeSourceSettingValues(
                      installedSource.packageMetadata?.settings ?? [],
                      saved?.values,
                    ),
                  onSourcePackageHydrated: saveSourcePackageHydration,
                },
              ),
            disposeMobileReaderPagesPrefetchResult,
          );
        }).catch(() => undefined);
      }
      try {
        router.push(
          withMobileExploreZoom(
            getMobileSourceReaderHref({
              registryId: source.registryId,
              sourceId: source.sourceId,
              mangaId: source.sourceMangaId,
              chapter,
              page,
              // Never the generic placeholder: the reader would show "Manga".
              mangaTitle: effectiveMetadata?.title ?? null,
            }),
            readerZoomSourceId,
          ),
        );
      } catch {
        openingReaderRef.current = false;
        setOpeningReader(false);
        void hapticError();
      }
    },
    [
      effectiveMetadata?.title,
      getGuardedDetailActionState,
      readerZoomSourceId,
      saveSourcePackageHydration,
      selectedSource,
      state.installedSources,
      store,
    ],
  );
  // The row is memoized, so its props have to keep their identity across a
  // re-render of this screen; an inline `renderItem` re-rendered every mounted
  // chapter row on each state change.
  const renderChapterRow = useCallback(
    ({ item, index }: ListRenderItemInfo<MobileChapterRow>) => (
      <MobileMangaChapterRow
        busy={detailActionBusy}
        chapters={item.chapters}
        first={index === 0}
        openChapterTemplate={strings.mangaDetail.openChapter}
        progressByChapterId={selectedChapterProgress}
        strings={strings}
        onPressChapter={openReader}
        appLanguage={appLanguage}
        showLanguage={showChapterLanguage}
      />
    ),
    [
      appLanguage,
      detailActionBusy,
      openReader,
      showChapterLanguage,
      selectedChapterProgress,
      strings,
    ],
  );

  // Design-explore: the list's "Up next" is always where Continue goes (on
  // another source: this source's chapter of the same number).
  const upNextChapterIndex = useMemo(
    () =>
      booksHero
        ? findMobileUpNextIndex(visibleChapters, selectedChapterProgress, {
            chapter: continueChapter,
            sameSource: !continueSource || continueSource.id === selectedSource?.id,
          })
        : null,
    [booksHero, continueChapter, continueSource, selectedChapterProgress, selectedSource?.id, visibleChapters],
  );
  const upNextChapterId =
    upNextChapterIndex !== null ? (visibleChapters[upNextChapterIndex]?.id ?? null) : null;
  const onExploreChapterAction = useCallback(
    (chapter: ChapterSummary, action: MobileExploreChapterAction) => {
      openReader(chapter, selectedSource, action === "start" ? 1 : undefined);
    },
    [openReader, selectedSource],
  );
  const renderExploreChapterRow = useCallback(
    ({ item, index }: ListRenderItemInfo<MobileChapterRow>) => {
      const chapter = item.chapters[0];
      return (
        <MobileExploreChapterRow
          chapter={chapter}
          progress={selectedChapterProgress[chapter.id]}
          header={chapterVolumeHeaders?.get(chapter.id) ?? null}
          commonGroup={chapterCommonGroup}
          caption={
            index === 0 && chapterCommonGroup
              ? formatMobileString(strings.designExplore.chapterListGroup, { group: chapterCommonGroup })
              : null
          }
          upNext={chapter.id === upNextChapterId}
          dropVolume={Boolean(chapterVolumeHeaders?.size)}
          busy={detailActionBusy}
          strings={strings}
          onAction={onExploreChapterAction}
        />
      );
    },
    [
      chapterCommonGroup,
      chapterVolumeHeaders,
      detailActionBusy,
      onExploreChapterAction,
      selectedChapterProgress,
      strings,
      upNextChapterId,
    ],
  );
  const jumpToUpNext = useCallback(() => {
    if (upNextChapterIndex === null) return;
    chapterListRef.current?.scrollToIndex({ index: upNextChapterIndex, viewPosition: 0.3, animated: true });
  }, [upNextChapterIndex]);
  // Rows above the target are not measured yet: get close, then land on it.
  const onChapterScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      chapterListRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      setTimeout(() => {
        chapterListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: true });
      }, 120);
    },
    [],
  );

  const fetchMetadataFromSource = useCallback(
    async (sourceId: string) => {
      const sourceLink = sources.find((source) => source.id === sourceId);
      if (!sourceLink) {
        throw new Error(strings.mangaDetail.sourcePackageUnavailable);
      }

      const installedSource = sourceInfoForLink(
        sourceLink,
        state.installedSources,
      );
      if (!installedSource) {
        throw new Error(strings.mangaDetail.sourcePackageUnavailable);
      }

      const refreshed = await withMobileSourceOperationTimeout(
        refreshMobileSourceMetadata(
          installedSource,
          sourceLink.sourceMangaId,
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

      if (refreshed.status === "blocked") {
        throw new Error(refreshed.detail);
      }

      return refreshed.metadata;
    },
    [
      saveSourcePackageHydration,
      sources,
      state.installedSources,
      store,
      strings.mangaDetail.sourcePackageUnavailable,
      strings.sourceBrowse.sourceOperationTimedOut,
    ],
  );

  const saveMetadata = async (form: MobileMetadataFormValues) => {
    if (
      !entry ||
      !canStartMobileMangaDetailAction(getGuardedDetailActionState())
    ) {
      return;
    }
    savingMetadataRef.current = true;
    setSavingMetadata(true);
    setActionError(null);
    try {
      const updated = buildMobileMetadataEditedItem(
        entry,
        form,
        nextSyncTimestamp(entry.item.updatedAt),
      );
      await store.saveLibraryItem(updated);
      emitMobileDataChanged("library");
      setState((current) => {
        if (
          !current.entry ||
          current.entry.item.libraryItemId !== updated.libraryItemId
        ) {
          return current;
        }
        return {
          ...current,
          entry: {
            ...current.entry,
            item: updated,
          },
        };
      });
      if (
        getMobileMetadataEditorSaveResultAction({ saved: true }) ===
        "close-sheet"
      ) {
        setMetadataEditorOpen(false);
      }
      await hapticConfirm();
    } catch (error) {
      if (
        getMobileMetadataEditorSaveResultAction({ saved: false }) ===
        "close-sheet"
      ) {
        setMetadataEditorOpen(false);
      }
      setActionError(
        describeMobileErrorDetail(error, strings.mangaDetail.actionFailedDetail),
      );
      await hapticError();
    } finally {
      savingMetadataRef.current = false;
      setSavingMetadata(false);
    }
  };

  const removeFromLibrary = async () => {
    if (
      !entry ||
      !canStartMobileMangaDetailAction(getGuardedDetailActionState())
    ) {
      return;
    }
    removingRef.current = true;
    setRemoving(true);
    setActionError(null);
    // Design-explore: the sheet slides away and the hero cover turns to dust
    // where it stands; the title is removed and the page closes once the dust
    // has lifted off (it keeps drifting over the library). Nothing to
    // dissolve (Reduce Motion, no dust host): removed as before.
    // The sheet is closed here, so this path leaves the page itself (the
    // sheet's dismissal callback has nothing left to do), dust or not.
    const closedSheet = booksHero && !heroInPane;
    if (closedSheet) {
      setRemoveConfirmOpen(false);
      await dissolveExploreTitle(entry.item.libraryItemId, EXPLORE_SHEET_DISMISS_MS);
    }
    try {
      await store.removeLibraryItem(entry.item.libraryItemId);
      emitMobileLibraryDataChanged({ collectionsChanged: true });
      if (closedSheet) {
        await hapticConfirm();
        exitDetailToLibrary();
        return;
      }
      if (
        getMobileMangaDetailMutationResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        await hapticConfirm();
        removeRouteAfterDismissRef.current = true;
        setRemoveConfirmOpen(false);
      }
    } catch (error) {
      setActionError(
        describeMobileErrorDetail(error, strings.mangaDetail.actionFailedDetail),
      );
      await hapticError();
      removingRef.current = false;
      setRemoving(false);
      if (
        getMobileMangaDetailMutationResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setRemoveConfirmOpen(false);
      }
    }
  };

  const cancelRemoveFromLibrary = () => {
    if (removingRef.current) return;
    removeRouteAfterDismissRef.current = false;
    setRemoveConfirmOpen(false);
  };

  const handleRemoveConfirmationDismissed = () => {
    if (!removeRouteAfterDismissRef.current) return;
    removeRouteAfterDismissRef.current = false;
    exitDetailToLibrary();
  };

  const canOpenContinueChapter = canOpenMobileMangaDetailReader({
    hasSource: Boolean(continueSource),
    hasChapter: Boolean(continueChapter),
    state: detailActionState,
  });
  const continueActionAvailable =
    Boolean(continueSource) &&
    Boolean(continueChapter) &&
    !savingMetadata &&
    !removing;
  const continueActionLabel = continueChapter
    ? formatContinueActionLabel({
        // Design-explore: a placeholder volume of 0 is never shown.
        chapter: booksHero ? withoutMobileZeroVolume(continueChapter) : continueChapter,
        isContinuation,
        strings,
        labels: strings.mangaDetail,
      })
    : strings.mangaDetail.noChapterYet;
  const showSkeleton = shouldRenderMobileMangaDetailSkeleton({
    loading,
    hasEntry: Boolean(entry),
  });
  const showLoadError = shouldShowMobileMangaDetailLoadError({
    loading,
    hasError: Boolean(error),
  });

  // Retry after a failed refresh: the same path as pull-to-refresh, minus
  // the local reload (the rows are already current).
  const retrySelectedRefresh = () => {
    if (!selectedSource) return;
    setDetailRefreshNonce((value) => value + 1);
  };

  const pullRefreshDetail = () => {
    if (pullRefreshGuardRef.current || !selectedSource) return;
    pullRefreshGuardRef.current = true;
    setPullRefreshing(true);
    setDetailRefreshNonce((value) => value + 1);
    void (async () => {
      try {
        const nextState = await reloadLocalDetailState();
        if (nextState) applyLocalDetailState(nextState);
      } catch {
        await hapticError();
      } finally {
        pullRefreshGuardRef.current = false;
      }
    })();
  };

  const retryLocalDetailData = async () => {
    if (retryDataGuardRef.current) return;

    retryDataGuardRef.current = true;
    setRetryingData(true);
    try {
      const nextState = await reloadLocalDetailState();
      if (!nextState) return;
      applyLocalDetailState(nextState);
      setError(null);
      await hapticConfirm();
    } catch (nextError) {
      setError(
        describeMobileErrorDetail(
          nextError,
          strings.mangaDetail.actionFailedDetail,
        ),
      );
      await hapticError();
    } finally {
      retryDataGuardRef.current = false;
      setRetryingData(false);
    }
  };
  const cloudflareSheet = useNemuAgentSheet({
    onSuccess: () => setDetailRefreshNonce((value) => value + 1),
  });
  cloudflareSheetRef.current = cloudflareSheet;
  const nativeHeaderOptions = (screenTitle: string) =>
    createNemuSoftEdgeScreenOptions(tokens, screenTitle);
  // Books-style hero: once its title has scrolled away the bar shows the
  // title with a small cover beside it.
  const barCover = coverImage.source ?? zoomSeed?.cover ?? null;
  const missingSourceNativeHeaderActions: NemuNativeHeaderAction[] = [
    {
      icon: "trash",
      label: strings.mangaDetail.removeFromLibrary,
      hint: strings.mangaDetail.removeFromLibraryHint,
      disabled: detailActionBusy,
      onPress: confirmRemoveFromLibrary,
    },
  ];
  // A page opened by the cover zoom has its bar items from the first frame,
  // so they slide in with the push like any bar's (they used to wait for the
  // zoom to land and then pop in). The handlers wait for the record.
  const nativeHeaderActions: NemuNativeHeaderAction[] = entry || (booksHero && seedEntry)
    ? [
        {
          icon: "pencil",
          label: strings.mangaDetail.editMetadata,
          disabled: detailActionBusy,
          onPress: openMetadataEditor,
        },
        {
          icon: "square.stack.3d.up",
          label: strings.mangaDetail.manageSources,
          hint: strings.mangaDetail.manageSourcesHint,
          disabled: detailActionBusy,
          onPress: openSourceManager,
        },
        {
          icon: "trash",
          label: strings.mangaDetail.removeFromLibrary,
          hint: strings.mangaDetail.removeFromLibraryHint,
          disabled: detailActionBusy,
          onPress: confirmRemoveFromLibrary,
        },
      ]
    : [];
  // Design-explore: the three actions collapse into one menu so the bar's
  // title can sit centred (EXPO_PUBLIC_NEMU_DETAIL_BAR=buttons keeps three).
  const barMenu = booksHero && mobileExploreDetailBarMode === "menu";
  const barTrailingItems = barMenu ? Math.min(1, nativeHeaderActions.length) : nativeHeaderActions.length;
  const renderExploreBarTitle = useCallback(
    () => (
      <MobileExploreBarTitle
        title={heroMetadata?.title ?? title}
        cover={barCover}
        trailingItems={barTrailingItems}
        centred={barMenu}
        shown={barTitleShown}
        hidden={!heroTitleScrolledAway}
      />
    ),
    [barCover, barMenu, barTitleShown, barTrailingItems, heroMetadata?.title, heroTitleScrolledAway, title],
  );

  if (showLoadError) {
    return (
      <>
        {usesNativeHeader ? (
          <Stack.Screen
            options={nativeHeaderOptions(strings.mangaDetail.manga)}
          />
        ) : null}
        <PageScaffold nativeHeader={usesNativeHeader}>
          {usesNativeHeader ? null : (
            <PageHeader
              title={strings.mangaDetail.manga}
              loading={retryingData}
              leadingIcon="chevron-back-outline"
              onLeadingPress={() => router.back()}
            />
          )}
          <EmptyLibrary
            title={strings.mangaDetail.mangaUnavailable}
            description={error ?? strings.mangaDetail.actionFailedDetail}
            actionLabel={strings.common.retry}
            actionDisabled={retryingData}
            actionLoading={retryingData}
            onActionPress={() => {
              void retryLocalDetailData();
            }}
          />
        </PageScaffold>
      </>
    );
  }

  if (showSkeleton && !seedEntry) {
    return (
      <>
        {usesNativeHeader ? (
          <Stack.Screen options={nativeHeaderOptions(strings.nav.library)} />
        ) : null}
        {/* Laid out by the loaded page's split layout, so its panes hand off in place. */}
        <MobileMangaPageSkeleton
          nativeHeader={usesNativeHeader}
          header={
            usesNativeHeader ? null : (
              <PageHeader
                title={strings.nav.library}
                loading
                leadingIcon="chevron-back-outline"
                onLeadingPress={() => router.back()}
              />
            )
          }
          accessibilityLabel={strings.mangaDetail.loadingManga}
          actionsPlacement="copy"
        />
      </>
    );
  }

  if (entry && sources.length === 0) {
    return (
      <>
        {usesNativeHeader ? (
          <>
            <Stack.Screen options={nativeHeaderOptions(title)} />
            <Stack.Toolbar placement="right">
              {renderNemuNativeToolbarButtons(missingSourceNativeHeaderActions)}
            </Stack.Toolbar>
          </>
        ) : null}
        <PageScaffold nativeHeader={usesNativeHeader}>
          {usesNativeHeader ? null : (
            <PageHeader
              title={title}
              loading={loading}
              leadingIcon="chevron-back-outline"
              onLeadingPress={() => router.back()}
            />
          )}
          <View style={styles.stack}>
            <MobileConfirmationSheet
              visible={removeConfirmOpen}
              title={strings.mangaDetail.removeTitle}
              description={strings.mangaDetail.removeDescription}
              subject={title}
              iconName="trash-outline"
              cancelLabel={strings.common.cancel}
              confirmLabel={strings.common.remove}
              confirmAccessibilityLabel={strings.mangaDetail.removeFromLibrary}
              loading={removing}
              destructive
              onCancel={cancelRemoveFromLibrary}
              onDismiss={handleRemoveConfirmationDismissed}
              onConfirm={() => {
                void removeFromLibrary();
              }}
            >
              {actionError ? (
                <MobileInlineErrorBanner
                  title={strings.mangaDetail.actionFailed}
                  detail={actionError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setActionError(null)}
                />
              ) : null}
            </MobileConfirmationSheet>
            {actionError ? (
              <MobileInlineErrorBanner
                title={strings.mangaDetail.actionFailed}
                detail={actionError}
                dismissLabel={strings.common.clear}
                onDismiss={() => setActionError(null)}
              />
            ) : null}
            <EmptyLibrary
              title={strings.mangaDetail.missingSourceLinksTitle}
              description={strings.mangaDetail.missingSourceLinksDescription}
              actionLabel={strings.mangaDetail.removeFromLibrary}
              onActionPress={confirmRemoveFromLibrary}
            />
          </View>
        </PageScaffold>
      </>
    );
  }

  return (
    <>
      {usesNativeHeader ? (
        <>
          {/* The Books-style hero carries the title; the bar stays clear. */}
          <Stack.Screen
            options={
              booksHero && (entry || seedEntry) && !heroInPane
                ? { ...nativeHeaderOptions(title), headerTitle: renderExploreBarTitle }
                : nativeHeaderOptions(title)
            }
          />
          {nativeHeaderActions.length && (zoomLanded || barMenu) ? (
            <Stack.Toolbar placement="right">
              {barMenu
                ? renderExploreDetailBarMenu(nativeHeaderActions, strings.designExplore.moreActions)
                : renderNemuNativeToolbarButtons(nativeHeaderActions)}
            </Stack.Toolbar>
          ) : null}
        </>
      ) : null}
      {metadataEditorPresentation ? (
        <MobileMetadataEditorSheet
          visible={metadataEditorOpen}
          entry={
            entry?.item.libraryItemId ===
            metadataEditorPresentation.item.libraryItemId
              ? entry
              : metadataEditorPresentation
          }
          saving={savingMetadata}
          coverSource={coverSource}
          sourceChoices={metadataSourceChoices}
          onClose={() => setMetadataEditorOpen(false)}
          onDismiss={() => setMetadataEditorPresentation(null)}
          onFetchFromSource={fetchMetadataFromSource}
          onSave={saveMetadata}
        />
      ) : null}
      {sourceManagerPresentation ? (
        <MobileSourceManagerSheet
          visible={sourceManagerOpen}
          entry={
            entry?.item.libraryItemId ===
            sourceManagerPresentation.item.libraryItemId
              ? entry
              : sourceManagerPresentation
          }
          selectedSourceId={selectedSource?.id ?? null}
          onClose={() => setSourceManagerOpen(false)}
          onDismiss={() => setSourceManagerPresentation(null)}
          onSelectSource={selectSource}
          onEntryChange={(nextEntry) => {
            setSourceManagerPresentation(nextEntry);
            setState((current) => ({
              ...current,
              entry: nextEntry,
            }));
          }}
        />
      ) : null}
      {booksHero && entry ? (
        <ExploreSharperCoverProbe
          entry={entry}
          installedSources={state.installedSources}
          known={knownSourceCovers}
        />
      ) : null}
      {collectionSheetPresentation ? (
        <MobileCollectionMembershipSheet
          visible={collectionSheetOpen}
          libraryItemId={collectionSheetPresentation.libraryItemId}
          title={collectionSheetPresentation.title}
          onClose={() => setCollectionSheetOpen(false)}
          onDismiss={() => setCollectionSheetPresentation(null)}
        />
      ) : null}
      {entry ? (
        <>
          <MobileConfirmationSheet
            visible={removeConfirmOpen}
            title={strings.mangaDetail.removeTitle}
            description={strings.mangaDetail.removeDescription}
            subject={title}
            iconName="trash-outline"
            cancelLabel={strings.common.cancel}
            confirmLabel={strings.common.remove}
            confirmAccessibilityLabel={strings.mangaDetail.removeFromLibrary}
            loading={removing}
            destructive
            onCancel={cancelRemoveFromLibrary}
            onDismiss={handleRemoveConfirmationDismissed}
            onConfirm={() => {
              void removeFromLibrary();
            }}
          >
            {actionError ? (
              <MobileInlineErrorBanner
                title={strings.mangaDetail.actionFailed}
                detail={actionError}
                dismissLabel={strings.common.clear}
                onDismiss={() => setActionError(null)}
              />
            ) : null}
          </MobileConfirmationSheet>
        </>
      ) : null}
      <MobileMangaDetailSplitLayout
        nativeHeader={usesNativeHeader}
        data={zoomLanded ? chapterRows : NO_CHAPTER_ROWS}
        keyExtractor={mobileChapterRowKeyExtractor}
        onRefresh={pullRefreshDetail}
        onScroll={booksHero ? onDetailScroll : undefined}
        // The throttled handler can miss a scroll's last offset: settle on it.
        onScrollEndDrag={booksHero ? onDetailScroll : undefined}
        onMomentumScrollEnd={booksHero ? onDetailScroll : undefined}
        scrollEventThrottle={booksHero ? 64 : undefined}
        refreshDisabled={!selectedSource}
        refreshLabel={strings.sourceBrowse.refreshSource}
        refreshing={pullRefreshing}
        initialNumToRender={MOBILE_CHAPTER_LIST_PERFORMANCE.initialNumToRender}
        maxToRenderPerBatch={
          MOBILE_CHAPTER_LIST_PERFORMANCE.maxToRenderPerBatch
        }
        windowSize={MOBILE_CHAPTER_LIST_PERFORMANCE.windowSize}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={booksHero ? renderExploreChapterRow : renderChapterRow}
        listRef={booksHero ? chapterListRef : undefined}
        onScrollToIndexFailed={booksHero ? onChapterScrollToIndexFailed : undefined}
        splitEnabled={Boolean(entry || seedEntry)}
        leading={
          <>
            {usesNativeHeader ? null : (
              <PageHeader
                title={title}
                loading={loading}
                leadingIcon="chevron-back-outline"
                onLeadingPress={() => router.back()}
                actions={
                  entry
                    ? [
                        {
                          icon: "create-outline",
                          label: strings.mangaDetail.editMetadata,
                          disabled: detailActionBusy,
                          onPress: openMetadataEditor,
                        },
                        {
                          icon: "layers-outline",
                          label: strings.mangaDetail.manageSources,
                          hint: strings.mangaDetail.manageSourcesHint,
                          disabled: detailActionBusy,
                          onPress: openSourceManager,
                        },
                        {
                          icon: "trash-outline",
                          label: strings.mangaDetail.removeFromLibrary,
                          hint: strings.mangaDetail.removeFromLibraryHint,
                          color: tokens.danger,
                          disabled: detailActionBusy,
                          loading: removing,
                          onPress: confirmRemoveFromLibrary,
                        },
                      ]
                    : undefined
                }
              />
            )}
            {entry || seedEntry ? (
              <>
                <MobileMangaDetailSurface
                  title={heroMetadata?.title ?? title}
                  authors={heroMetadata?.authors}
                  coverSource={coverImage.source}
                  // The cover the tapped cell painted (same URL and source
                  // headers) holds the hero while the page's own cover
                  // request is still being resolved.
                  heldCoverSource={zoomSeed?.cover ?? null}
                  onCoverError={coverImage.onCoverError}
                  onCoverLoad={coverImage.onCoverLoad}
                  status={heroMetadata?.status}
                  deferBody={!zoomLanded || !entry}
                  dissolveId={booksHero && entry ? entry.item.libraryItemId : null}
                  strings={strings}
                  actionsPlacement="copy"
                  badges={
                    selectedSource && sourceHasUpdate(selectedSource)
                      ? [
                          {
                            key: "updated",
                            label: strings.mangaDetail.updated,
                            tone: "primary" as const,
                          },
                        ]
                      : []
                  }
                  primaryAction={{
                    label: continueActionLabel,
                    compactLabel: isContinuation ? strings.mangaDetail.continueReading : undefined,
                    accessibilityLabel: continueActionLabel,
                    accessibilityHint: continueChapter
                      ? strings.mangaDetail.readActionHint
                      : undefined,
                    available: continueActionAvailable,
                    busy: openingReader,
                    disabled: !canOpenContinueChapter,
                    iconName: isContinuation
                      ? "play-forward-outline"
                      : "play-outline",
                    iconUri: continueSourceInfo?.icon,
                    onPress: () => openReader(continueChapter, continueSource),
                  }}
                  secondaryActions={[
                    {
                      key: "collections",
                      accessibilityLabel: strings.mangaDetail.manageCollections,
                      accessibilityHint:
                        strings.mangaDetail.manageCollectionsHint,
                      disabled: detailActionBusy,
                      iconName: "albums-outline",
                      color: tokens.mutedForeground,
                      onPress: openCollectionMembership,
                    },
                    ...(!usesNativeHeader
                      ? [
                          {
                            key: "sources",
                            accessibilityLabel:
                              strings.mangaDetail.manageSources,
                            accessibilityHint:
                              strings.mangaDetail.manageSourcesHint,
                            disabled: detailActionBusy,
                            iconName: "layers-outline" as const,
                            color: tokens.mutedForeground,
                            onPress: openSourceManager,
                          },
                          {
                            key: "remove",
                            accessibilityLabel:
                              strings.mangaDetail.removeFromLibrary,
                            accessibilityHint:
                              strings.mangaDetail.removeFromLibraryHint,
                            busy: removing,
                            disabled: detailActionBusy,
                            iconName: "trash-outline" as const,
                            color: tokens.danger,
                            onPress: confirmRemoveFromLibrary,
                          },
                        ]
                      : []),
                  ]}
                  tags={effectiveMetadata?.tags}
                  description={effectiveMetadata?.description}
                  onHeroPaneChange={setHeroInPane}
                  onHeroTitleBottom={setHeroTitleBottom}
                  zoomId={booksHero ? (params.zoom ?? null) : null}
                  readerZoomId={readerZoomSourceId}
                  infoTitle={
                    selectedSource
                      ? sourcePresentationForLink(selectedSource, state.installedSources).name
                      : null
                  }
                  infoChapters={chapters.length || null}
                  infoLatest={
                    selectedSource?.latestChapter
                      ? formatMobileExploreChapterLabel(selectedSource.latestChapter, strings)
                      : null
                  }
                />

                {actionError ? (
                  <MobileInlineErrorBanner
                    title={strings.mangaDetail.actionFailed}
                    detail={actionError}
                    dismissLabel={strings.common.clear}
                    onDismiss={() => setActionError(null)}
                  />
                ) : null}

              </>
            ) : (
              <EmptyLibrary
                title={
                  loading
                    ? strings.mangaDetail.loadingManga
                    : strings.mangaDetail.mangaNotFound
                }
                description={strings.mangaDetail.titleNotAvailable}
                actionLabel={strings.mangaDetail.backToLibrary}
                onActionPress={exitDetailToLibrary}
              />
            )}
          </>
        }
        chapterHeader={
          entry && zoomLanded ? (
            <MobileMangaChapterSectionHeader
              title={strings.mangaDetail.chapters}
              // A refresh behind a painted list is silent: the list is
              // already right, and the sort action keeps its place.
              loading={awaitingFirstList}
              loadingLabel={strings.mangaDetail.refreshingSource}
              loadingPlaceholder={
                <MobileChapterGridSkeleton
                  accessibilityLabel={strings.mangaDetail.loadingChapters}
                  caption={
                    slowRefreshKey !== null &&
                    slowRefreshKey === liveDetailRefreshKey &&
                    selectedSource
                      ? formatMobileString(
                          strings.mangaDetail.sourceSlowToRespond,
                          {
                            source: sourcePresentationForLink(
                              selectedSource,
                              state.installedSources,
                            ).name,
                          },
                        )
                      : null
                  }
                />
              }
              sourceSelector={
                // Design-explore: the sources sit in the controls row below.
                sources.length > 0 && !booksHero ? (
                  <MobileSourceSelector
                    items={sourceSelectorItems}
                    selectedId={selectedSource?.id ?? null}
                    disabled={detailActionBusy}
                    onSelect={selectSource}
                  />
                ) : null
              }
              alignedControl={booksHero}
              sortAction={
                listChapters.length > 0 ? (
                  booksHero ? (
                    <MobileExploreChapterMenu
                      fallbackCount={listChapters.length}
                      appLanguage={appLanguage}
                      languages={chapterLanguages}
                      preference={effectiveChapterListPreference}
                      strings={strings}
                      unreadCount={unreadChapterCount}
                      onChange={changeChapterListPreference}
                      sources={{ items: sourceSelectorItems, selectedId: selectedSource?.id ?? null, disabled: detailActionBusy, onSelect: selectSource }}
                      jump={upNextChapterIndex !== null ? { label: formatMobileExploreChapterLabel(visibleChapters[upNextChapterIndex]!, strings), onPress: jumpToUpNext } : null}
                    />
                  ) : (
                    <MobileMangaChapterSortAction
                      preference={effectiveChapterListPreference}
                      strings={strings}
                      onChange={changeChapterListPreference}
                    />
                  )
                ) : null
              }
              toolbar={
                listChapters.length > 0 && !booksHero ? (
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
              notice={
                isStaleRefreshFailure(liveDetailState, selectedChaptersComplete) &&
                (liveDetailState.status === "error" ||
                  liveDetailState.status === "blocked") ? (
                  // The saved list stays; one quiet line says it could not
                  // be refreshed, with the way forward.
                  <MobileSourceErrorNotice
                    title={strings.mangaDetail.refreshFailedTitle}
                    detail={strings.mangaDetail.showingSavedChapters}
                    actionLabel={
                      liveDetailState.recoveryAction?.label ??
                      strings.common.retry
                    }
                    onActionPress={() => {
                      const action = liveDetailState.recoveryAction;
                      if (action) {
                        router.navigate(
                          getMobileSourceErrorRecoveryHref(action),
                        );
                        return;
                      }
                      retrySelectedRefresh();
                    }}
                  />
                ) : liveDetailState.status === "blocked" ||
                  liveDetailState.status === "error" ? (
                  <MobileSourceErrorNotice
                    title={liveDetailState.title}
                    detail={liveDetailState.detail}
                    error={liveDetailState.status === "error"}
                    actionLabel={
                      liveDetailState.recoveryAction?.label ??
                      (liveDetailState.status === "blocked" &&
                      missingSourceInstallCandidate
                        ? formatMobileString(
                            strings.browse.installSourceNamed,
                            { name: missingSourceInstallCandidate.name },
                          )
                        : liveDetailState.status === "error"
                          ? strings.common.retry
                          : undefined)
                    }
                    onActionPress={() => {
                      const action = liveDetailState.recoveryAction;
                      if (action) {
                        router.navigate(
                          getMobileSourceErrorRecoveryHref(action),
                        );
                        return;
                      }
                      if (liveDetailState.status === "blocked") {
                        installMissingSource();
                        return;
                      }
                      retrySelectedRefresh();
                    }}
                  />
                ) : null
              }
              hasChapters={visibleChapters.length > 0}
              emptyTitle={getMobileMangaDetailEmptyChapterMessage({
                liveStatus: liveDetailState.status,
                liveDetail: liveDetailState.detail,
                strings,
              })}
            />
          ) : null
        }
      />
      <MobileNemuAgentSheet
        visible={cloudflareSheet.visible}
        status={cloudflareSheet.status}
        url={cloudflareSheet.url}
        failureReason={cloudflareSheet.failureReason}
        interactive={cloudflareSheet.interactive}
        failedAt={cloudflareSheet.failedAt}
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
});
