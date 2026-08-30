import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileMangaChapterRow,
  MobileMangaChapterSectionHeader,
} from "@/components/MobileMangaChapterSection";
import {
  MobileSourceSelector,
  type MobileSourceSelectorItem,
} from "@/components/MobileSourceSelector";
import { MobileMangaDetailSurface } from "@/components/MobileMangaDetailSurface";
import { MobileMangaPageSkeleton } from "@/components/MobileMangaPageSkeleton";
import { MobileMetadataEditorSheet } from "@/components/MobileMetadataEditorSheet";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobileSourceManagerSheet } from "@/components/MobileSourceManagerSheet";
import { MobileSourceErrorNotice } from "@/components/MobileSourceErrorNotice";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileLibraryDataChanged,
} from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  getEntryCover,
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
  PageListScaffold,
  PageScaffold,
  createNemuNativeScreenOptions,
  renderNemuNativeToolbarButtons,
  useNemuTheme,
  usesNemuNativeHeader,
  type NemuNativeHeaderAction,
} from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  MOBILE_CHAPTER_LIST_PERFORMANCE,
  buildMobileChapterRows,
} from "@/lib/mobileChapterRows";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesLink,
} from "@/lib/mobileInstalledSourceKeys";
import { applyMobileSourceDetailsRefresh } from "@/lib/mobileLibraryDetails";
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
  type MobileSourceErrorRecoveryAction,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import {
  refreshMobileSourceChapters,
  refreshMobileSourceDetails,
  refreshMobileSourceMetadata,
} from "@/sources/mobileSourceDetails";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  applyMobileSourcePackageHydration,
  type MobileSourcePackageHydration,
} from "@/sources/mobileSourcePackageLoader";

type DetailState = {
  entry: LibraryEntry | null;
  installedSources: InstalledSource[];
  progress: LocalMangaProgress[];
  selectedChapterProgress: Record<string, LocalChapterProgress>;
};

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

type SourceChapterListState = {
  status: "cached" | "loading" | "ready" | "blocked" | "error";
  chapters: ChapterSummary[];
};

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
  const add = (chapter: ChapterSummary | null | undefined) => {
    if (!chapter?.id) return;
    byId.set(chapter.id, chapter);
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

  return [...byId.values()].sort((a, b) => {
    const aNum = a.chapterNumber ?? Number.NEGATIVE_INFINITY;
    const bNum = b.chapterNumber ?? Number.NEGATIVE_INFINITY;
    if (aNum !== bNum) return bNum - aNum;
    return a.id.localeCompare(b.id);
  });
}

function cachedChaptersForSource(source: LocalSourceLink): ChapterSummary[] {
  return uniqueChapters(source, undefined, {});
}

export function MangaDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string | string[];
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
      emitMobileDataChanged("settings");
    },
    [store],
  );
  const [state, setState] = useState<DetailState>({
    entry: null,
    installedSources: [],
    progress: [],
    selectedChapterProgress: {},
  });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);
  const removeRouteAfterDismissRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveChapters, setLiveChapters] = useState<ChapterSummary[]>([]);
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
  const cloudflareSheetRef = useRef<{
    reportError: (error: unknown) => boolean;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveDetailState, setLiveDetailState] = useState<LiveDetailState>({
    status: "idle",
    detail: strings.mangaDetail.fullRefreshNotStarted,
  });
  const lastDetailRefreshKey = useRef<string | null>(null);

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
    const resolvedSelectedSourceId = resolveMobileMangaDetailSelectedSourceId(
      sources,
      routeSourceId,
      selectedSourceId,
    );
    const selected = resolvedSelectedSourceId
      ? sources.find((source) => source.id === resolvedSelectedSourceId)
      : undefined;
    const selectedChapterProgress = selected
      ? await loadMobileChapterProgressForSource(
          store,
          selected,
          installedSources,
        )
      : {};

    return {
      entry: item ? { item, sources } : null,
      installedSources,
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
      setState({
        entry: nextState.entry,
        installedSources: nextState.installedSources,
        progress: nextState.progress,
        selectedChapterProgress: nextState.selectedChapterProgress,
      });
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
      setSourceChapterLists((current) => {
        const next: Record<string, SourceChapterListState> = { ...current };
        let changed = false;
        for (const source of nextState.sources) {
          const existing = next[source.id];
          if (existing?.status === "ready" || existing?.status === "loading") {
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
      setLoading(true);
      setError(null);
      try {
        const nextState = await reloadLocalDetailState();
        if (!nextState) return;
        if (!mounted) return;
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
    if (
      shouldRedirectMissingMobileMangaDetailEntry({
        loading,
        error,
        hasEntry: Boolean(entry),
      })
    ) {
      router.replace("/library");
    }
  }, [entry, error, loading]);

  const effectiveMetadata = useMemo(
    () =>
      entry
        ? { ...entry.item.metadata, ...entry.item.overrides?.metadata }
        : null,
    [entry],
  );
  const title = effectiveMetadata?.title ?? strings.mangaDetail.manga;
  const cover = entry ? getEntryCover(entry) : undefined;
  const sources = useMemo(
    () =>
      entry ? sortMobileSourceLinks(entry.sources, entry.item.sourceOrder) : [],
    [entry],
  );
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
  const coverSource = useMemo(() => {
    const source = selectedSource ?? sources[0];
    return source
      ? (sourceInfoForLink(source, state.installedSources) ?? null)
      : null;
  }, [selectedSource, sources, state.installedSources]);
  const coverRequest = useMobileSourceImageRequest(coverSource, cover);
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

  useEffect(() => {
    let cancelled = false;

    if (!entry || !selectedSource || !liveDetailRefreshKey) {
      setLiveChapters([]);
      setLiveDetailState({
        status: "idle",
        detail: strings.mangaDetail.selectSourceRefresh,
      });
      return () => {
        cancelled = true;
      };
    }

    if (lastDetailRefreshKey.current === liveDetailRefreshKey) {
      return () => {
        cancelled = true;
      };
    }
    lastDetailRefreshKey.current = liveDetailRefreshKey;
    setLiveChapters([]);
    setLiveDetailState({
      status: "loading",
      detail: strings.mangaDetail.refreshingSource,
    });

    void (async () => {
      try {
        const installedSources = await store.getInstalledSources();
        const installedSource = installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, selectedSource),
        );

        if (!installedSource) {
          if (!cancelled) {
            setLiveDetailState({
              status: "blocked",
              detail: strings.mangaDetail.sourcePackageUnavailable,
            });
          }
          return;
        }

        const refreshed = await refreshMobileSourceDetails(
          installedSource,
          selectedSource.sourceMangaId,
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
        );

        if (cancelled) return;
        if (refreshed.status === "blocked") {
          setLiveDetailState({
            status: "blocked",
            detail: refreshed.detail,
          });
          return;
        }

        const applied = applyMobileSourceDetailsRefresh(
          entry,
          selectedSource,
          refreshed,
        );
        await Promise.all([
          store.saveLibraryItem(applied.item),
          store.saveSourceLink(applied.sourceLink),
        ]);
        emitMobileDataChanged("library");
        if (cancelled) return;

        setLiveChapters(refreshed.chapters);
        setSourceChapterLists((current) => {
          const next: Record<string, SourceChapterListState> = {
            ...current,
            [selectedSource.id]: {
              status: "ready",
              chapters: refreshed.chapters,
            },
          };
          sourceChapterListsRef.current = next;
          return next;
        });
        setState((current) => {
          if (
            !current.entry ||
            current.entry.item.libraryItemId !== entry.item.libraryItemId
          ) {
            return current;
          }
          return {
            ...current,
            entry: {
              item: applied.item,
              sources: current.entry.sources.map((source) =>
                source.id === applied.sourceLink.id
                  ? applied.sourceLink
                  : source,
              ),
            },
          };
        });
        setLiveDetailState({
          status: "ready",
          detail: refreshChapterCountText(refreshed.chapters.length, strings),
        });
      } catch (nextError) {
        if (cancelled) return;
        const presentation = getMobileSourceErrorPresentation(
          nextError,
          strings,
        );
        cloudflareSheetRef.current?.reportError(nextError);
        setLiveDetailState({
          status: "error",
          title: presentation.title,
          detail: presentation.detail,
          recoveryAction: getMobileSourceErrorRecoveryAction(
            presentation,
            strings,
          ),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    entry,
    liveDetailRefreshKey,
    saveSourcePackageHydration,
    selectedSource,
    store,
    strings,
  ]);

  useEffect(() => {
    let cancelled = false;
    const pendingSources = sources.filter((source) => {
      if (source.id === selectedSource?.id) return false;
      const state = sourceChapterListsRef.current[source.id];
      return state?.status !== "ready" && state?.status !== "loading";
    });

    if (!pendingSources.length) {
      return () => {
        cancelled = true;
      };
    }

    setSourceChapterLists((current) => {
      const next: Record<string, SourceChapterListState> = { ...current };
      for (const source of pendingSources) {
        const state = next[source.id];
        if (state?.status === "ready" || state?.status === "loading") continue;
        next[source.id] = {
          status: "loading",
          chapters: state?.chapters ?? [],
        };
      }
      sourceChapterListsRef.current = next;
      return next;
    });

    void (async () => {
      try {
        const installedSources = await store.getInstalledSources();
        await Promise.all(
          pendingSources.map(async (source) => {
            const installedSource = installedSources.find((item) =>
              mobileInstalledSourceMatchesLink(item, source),
            );

            if (!installedSource) {
              if (!cancelled) {
                setSourceChapterLists((current) => {
                  const next: Record<string, SourceChapterListState> = {
                    ...current,
                    [source.id]: { status: "blocked", chapters: [] },
                  };
                  sourceChapterListsRef.current = next;
                  return next;
                });
              }
              return;
            }

            try {
              const refreshed = await refreshMobileSourceChapters(
                installedSource,
                source.sourceMangaId,
                {
                  getSourceSettings: async (_sourceKey, sourceRecord) => {
                    const normalized = normalizeInstalledSource(sourceRecord);
                    const runtimeSourceKey =
                      makeMobileRuntimeSourceKey(normalized);
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
              );

              if (cancelled) return;
              setSourceChapterLists((current) => {
                const next: Record<string, SourceChapterListState> = {
                  ...current,
                  [source.id]:
                    refreshed.status === "blocked"
                      ? { status: "blocked", chapters: [] }
                      : { status: "ready", chapters: refreshed.chapters },
                };
                sourceChapterListsRef.current = next;
                return next;
              });
            } catch {
              if (cancelled) return;
              setSourceChapterLists((current) => {
                const next: Record<string, SourceChapterListState> = {
                  ...current,
                  [source.id]: { status: "error", chapters: [] },
                };
                sourceChapterListsRef.current = next;
                return next;
              });
            }
          }),
        );
      } catch {
        if (!cancelled) {
          setSourceChapterLists((current) => {
            const next: Record<string, SourceChapterListState> = { ...current };
            for (const source of pendingSources) {
              if (next[source.id]?.status === "loading") {
                next[source.id] = { status: "error", chapters: [] };
              }
            }
            sourceChapterListsRef.current = next;
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [saveSourcePackageHydration, selectedSource?.id, sources, store]);

  const chapters = useMemo(
    () =>
      uniqueChapters(
        selectedSource,
        selectedProgress,
        state.selectedChapterProgress,
        liveChapters,
      ),
    [
      liveChapters,
      selectedProgress,
      selectedSource,
      state.selectedChapterProgress,
    ],
  );
  const chapterRows = useMemo(
    () => buildMobileChapterRows(chapters),
    [chapters],
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
        selected && liveDetailState.status === "ready"
          ? liveChapters.length
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
    liveChapters.length,
    liveDetailState.status,
    selectedSource?.id,
    sourceChapterLists,
    sources,
    state.installedSources,
    strings,
  ]);
  const continueActionChapters =
    continueSource?.id === selectedSource?.id &&
    liveDetailState.status === "ready"
      ? liveChapters
      : chapters;
  const continueSourceChapterState = continueSource
    ? (sourceChapterLists[continueSource.id] ?? null)
    : null;
  const continueAction = getMobileMangaDetailContinueAction({
    continueSource,
    selectedSource,
    selectedChapters: continueActionChapters,
    selectedChaptersLoaded:
      continueSource?.id === selectedSource?.id &&
      liveDetailState.status === "ready",
    continueChapters:
      continueSource?.id !== selectedSource?.id
        ? continueSourceChapterState?.chapters
        : undefined,
    continueChaptersLoaded:
      continueSource?.id !== selectedSource?.id &&
      continueSourceChapterState?.status === "ready",
    progress: continueProgress,
  });
  const continueChapter = continueAction.chapter;
  const isContinuation = continueAction.isContinuation;
  const openReader = useCallback(
    (
      chapter: ChapterSummary | null,
      source: LocalSourceLink | undefined = selectedSource,
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
      try {
        router.push(
          getMobileSourceReaderHref({
            registryId: source.registryId,
            sourceId: source.sourceId,
            mangaId: source.sourceMangaId,
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
    [getGuardedDetailActionState, selectedSource, title],
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

      const refreshed = await refreshMobileSourceMetadata(
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
    try {
      await store.removeLibraryItem(entry.item.libraryItemId);
      emitMobileLibraryDataChanged({ collectionsChanged: true });
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
    router.replace("/library");
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
  const continueActionLabel =
    isContinuation && continueChapter
      ? formatMobileString(strings.mangaDetail.continueChapter, {
          chapter: formatChapterTitle(continueChapter, strings),
        })
      : continueChapter
        ? strings.mangaDetail.startReading
        : strings.mangaDetail.noChapterYet;
  const showSkeleton = shouldRenderMobileMangaDetailSkeleton({
    loading,
    hasEntry: Boolean(entry),
  });
  const showLoadError = shouldShowMobileMangaDetailLoadError({
    loading,
    hasError: Boolean(error),
  });

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
    createNemuNativeScreenOptions(tokens, screenTitle);
  const missingSourceNativeHeaderActions: NemuNativeHeaderAction[] = [
    {
      icon: "trash",
      label: strings.mangaDetail.removeFromLibrary,
      hint: strings.mangaDetail.removeFromLibraryHint,
      disabled: detailActionBusy,
      tintColor: tokens.danger,
      onPress: confirmRemoveFromLibrary,
    },
  ];
  const nativeHeaderActions: NemuNativeHeaderAction[] = entry
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

  if (showSkeleton) {
    return (
      <>
        {usesNativeHeader ? (
          <Stack.Screen options={nativeHeaderOptions(strings.nav.library)} />
        ) : null}
        <PageScaffold nativeHeader={usesNativeHeader}>
          {usesNativeHeader ? null : (
            <PageHeader
              title={strings.nav.library}
              loading
              leadingIcon="chevron-back-outline"
              onLeadingPress={() => router.back()}
            />
          )}
          <MobileMangaPageSkeleton
            accessibilityLabel={strings.mangaDetail.loadingManga}
            actionsPlacement="copy"
          />
        </PageScaffold>
      </>
    );
  }

  if (entry && sources.length === 0) {
    return (
      <>
        {usesNativeHeader ? (
          <>
            <Stack.Screen options={nativeHeaderOptions(title)} />
            <Stack.Toolbar placement="right" tintColor={tokens.danger}>
              {renderNemuNativeToolbarButtons(
                missingSourceNativeHeaderActions,
                tokens.danger,
              )}
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
          <Stack.Screen options={nativeHeaderOptions(title)} />
          {nativeHeaderActions.length ? (
            <Stack.Toolbar placement="right" tintColor={tokens.primary}>
              {renderNemuNativeToolbarButtons(
                nativeHeaderActions,
                tokens.primary,
              )}
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
      <PageListScaffold
        nativeHeader={usesNativeHeader}
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
            busy={detailActionBusy}
            chapters={item.chapters}
            first={index === 0}
            openChapterTemplate={strings.mangaDetail.openChapter}
            progressByChapterId={state.selectedChapterProgress}
            strings={strings}
            onPressChapter={openReader}
          />
        )}
        ListHeaderComponent={
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
            {entry ? (
              <View style={styles.stack}>
                <MobileMangaDetailSurface
                  title={title}
                  authors={effectiveMetadata?.authors}
                  coverSource={
                    cover
                      ? {
                          uri: coverRequest?.url ?? cover,
                          headers: coverRequest?.headers,
                        }
                      : null
                  }
                  status={effectiveMetadata?.status}
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
                />

                {actionError ? (
                  <MobileInlineErrorBanner
                    title={strings.mangaDetail.actionFailed}
                    detail={actionError}
                    dismissLabel={strings.common.clear}
                    onDismiss={() => setActionError(null)}
                  />
                ) : null}

                <MobileMangaChapterSectionHeader
                  title={strings.mangaDetail.chapters}
                  loading={liveDetailState.status === "loading"}
                  sourceSelector={
                    sources.length > 0 ? (
                      <MobileSourceSelector
                        items={sourceSelectorItems}
                        selectedId={selectedSource?.id ?? null}
                        disabled={detailActionBusy}
                        onSelect={selectSource}
                      />
                    ) : null
                  }
                  notice={
                    liveDetailState.status === "blocked" ||
                    liveDetailState.status === "error" ? (
                      <MobileSourceErrorNotice
                        title={liveDetailState.title}
                        detail={liveDetailState.detail}
                        error={liveDetailState.status === "error"}
                        actionLabel={liveDetailState.recoveryAction?.label}
                        onActionPress={() => {
                          router.navigate("/settings?focus=agent");
                        }}
                      />
                    ) : null
                  }
                  hasChapters={chapters.length > 0}
                  emptyTitle={getMobileMangaDetailEmptyChapterMessage({
                    liveStatus: liveDetailState.status,
                    liveDetail: liveDetailState.detail,
                    strings,
                  })}
                />
              </View>
            ) : (
              <EmptyLibrary
                title={
                  loading
                    ? strings.mangaDetail.loadingManga
                    : strings.mangaDetail.mangaNotFound
                }
                description={strings.mangaDetail.titleNotAvailable}
                actionLabel={strings.mangaDetail.backToLibrary}
                onActionPress={() => router.replace("/library")}
              />
            )}
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
});
