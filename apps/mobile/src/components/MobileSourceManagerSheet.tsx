import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuTextFieldClearAction,
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
  NemuButton,
} from "@/design-system";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileLibraryDataChanged,
} from "@/data/mobileDataEvents";
import {
  useInstalledSources,
  useLibraryEntries,
  useMangaProgress,
  useMobileLanguageSettings,
} from "@/data/mobileHooks";
import {
  getEntryCover,
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalSourceLink,
} from "@/data/schema";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import { getMobileInstalledSourceRegistryDisplayName } from "@/lib/mobileBrowseSources";
import {
  buildMobileProgressIndex,
  paginateMobileLibraryMergeCandidates,
  sortMobileLibraryMergeCandidates,
} from "@/lib/mobileLibraryPresentation";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesLink,
} from "@/lib/mobileInstalledSourceKeys";
import { sortSourcesByLanguagePriority } from "@/lib/mobileLanguageSettings";
import {
  findMobileJapaneseTitleFallback,
  isMobileMetadataExactTitleMatch,
  searchMobileMetadataMatches,
  type MobileMetadataMatchResult,
} from "@/lib/mobileMetadataMatch";
import { toSearchSourceDisplay } from "@/lib/mobileSearch";
import {
  addMobileSourceLinkToEntry,
  canRunMobileSourceManagerSearch,
  canSelectMobileSourceManagerAddMode,
  canSelectMobileSourceManagerSourceRow,
  canStartMobileSourceManagerAction,
  collectionIdsToTransferForMobileMerge,
  findMobileSourceLinkForInput,
  formatAddSourceResultAccessibilityLabel,
  formatMergeCandidateAccessibilityLabel,
  formatMobileSourceCountText,
  formatSourceManagerSelectAccessibilityLabel,
  getMobileSourceManagerAddPanelToggleAction,
  getMobileSourceAddResultSourceKey,
  isMobileSourceManagerActionBusy,
  mergeMobileRetargetedChapterProgress,
  mergeMobileRetargetedMangaProgress,
  mergeMobileLibraryEntries,
  makeMobileSourceAddResultKey,
  moveMobileSourceLink,
  removeMobileSourceLinkFromEntry,
  retargetMobileMergeProgress,
  sortMobileSourceLinks,
  type MobileSourceManagerActionState,
} from "@/lib/mobileSourceLinks";
import {
  getMobileSourceManagerMutationResultAction,
  getMobileSourceManagerRequestCloseAction,
} from "@/lib/mobileSourceManagerBackBehavior";
import { getMobileSourceManagerSheetLayout } from "@/lib/mobileSourceManagerLayout";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
} from "@/lib/mobileSourceErrors";
import { resolveMobileSheetHeaderMetrics } from "@/lib/mobileNativeSheet";
import {
  buildMobileLiveSearchProgressGroups,
  buildMobileSourceTitlePool,
  getMobileSearchQueryForSource,
  presentMobileLiveSearchGroup,
  searchMobileSource,
  type MobileLiveSearchDisplayGroup,
  type MobileLiveSearchGroup,
  type MobileLiveSearchManga,
} from "@/sources/mobileSourceSearch";
import { retargetMobileCloudHistoryLibraryItem } from "@/sync/mobileSyncDataStore";
import { getMobileSyncEpoch } from "@/sync/mobileSyncRuntime";
import { nextSyncTimestamp } from "@nemu/core";
import { refreshMobileSourceMetadata } from "@/sources/mobileSourceDetails";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";

type MobileSourceManagerSheetProps = {
  visible: boolean;
  entry: LibraryEntry;
  selectedSourceId?: string | null;
  onClose: () => void;
  /** Called after the native sheet has fully finished dismissing. */
  onDismiss?: () => void;
  onSelectSource: (sourceId: string | null) => void;
  onEntryChange: (entry: LibraryEntry) => void;
};

type AddMode = "search" | "merge";

type SourceManagerConfirmation =
  | { type: "merge-entry"; sourceEntry: LibraryEntry; sourceTitle: string }
  | { type: "remove-source"; source: LocalSourceLink; name: string };

type AddSearchState =
  | { status: "idle"; detail: string }
  | { status: "loading"; detail: string }
  | { status: "ready"; query: string; groups: MobileLiveSearchDisplayGroup[] }
  | { status: "error"; title?: string; detail: string };

const ADD_RESULTS_PER_SOURCE_PAGE = 4;
const MERGE_CANDIDATES_PER_PAGE = 8;

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

function sourceKeyForSearchGroup(
  group: Extract<MobileLiveSearchGroup, { status: "ready" }>,
): string {
  return `${group.source.registryId}:${group.source.rawSourceId}`;
}

function exactMetadataTitleAliases(
  query: string,
  results: MobileMetadataMatchResult[],
): string[] {
  return results
    .filter((result) => isMobileMetadataExactTitleMatch(query, result))
    .flatMap((result) => [result.title, ...result.alternativeTitles]);
}

function sourceCountText(count: number, strings: MobileStrings): string {
  return formatMobileSourceCountText(count, strings);
}

function SourceManagerRow({
  source,
  strings,
  index,
  total,
  selected,
  mangaTitle,
  sourceInfo,
  busy,
  disabled,
  onSelect,
  onMove,
  onRemove,
}: {
  source: LocalSourceLink;
  strings: MobileStrings;
  index: number;
  total: number;
  selected: boolean;
  mangaTitle?: string;
  sourceInfo?: InstalledSource;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { tokens } = useNemuTheme();
  const canMoveUp = index > 0 && !disabled;
  const canMoveDown = index < total - 1 && !disabled;
  const canRemove = total > 1 && !disabled;
  const canSelect = canSelectMobileSourceManagerSourceRow({
    selected,
    disabled,
  });
  const name = sourceInfo?.name ?? sourceDisplayName(source);
  const positionLabel = formatMobileString(strings.sourceManager.position, {
    position: index + 1,
    total,
  });
  const subtitle = mangaTitle ?? `${source.registryId} / ${source.sourceMangaId}`;

  return (
    <View
      style={[
        styles.rowShell,
        {
          backgroundColor: tokens.card,
          borderColor: selected ? tokens.primary : tokens.border,
        },
      ]}
    >
      <View style={styles.row}>
      {/* Drag handle: stacked up/down chevrons act as the reorder affordance. */}
      <View
        style={[
          styles.rowHandle,
          { borderColor: tokens.border, opacity: disabled ? 0.5 : 1 },
        ]}
      >
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={formatMobileString(strings.sourceManager.moveUp, {
            name,
          })}
          accessibilityState={{ disabled: !canMoveUp }}
          disabled={!canMoveUp}
          hapticFeedback={canMoveUp ? "selection" : "none"}
          onPress={() => onMove(-1)}
          pressedScale={0.9}
          style={styles.handleButton}
        >
          <Ionicons
            name="chevron-up"
            size={14}
            color={canMoveUp ? tokens.foreground : tokens.mutedForeground}
          />
        </NemuPressable>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={formatMobileString(
            strings.sourceManager.moveDown,
            { name },
          )}
          accessibilityState={{ disabled: !canMoveDown }}
          disabled={!canMoveDown}
          hapticFeedback={canMoveDown ? "selection" : "none"}
          onPress={() => onMove(1)}
          pressedScale={0.9}
          style={styles.handleButton}
        >
          <Ionicons
            name="chevron-down"
            size={14}
            color={canMoveDown ? tokens.foreground : tokens.mutedForeground}
          />
        </NemuPressable>
      </View>

      {/* Source info: tappable to select as the active source. */}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={formatSourceManagerSelectAccessibilityLabel(
          name,
          positionLabel,
          selected,
          strings,
          subtitle,
        )}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hapticFeedback={canSelect ? "press" : "none"}
        onPress={() => {
          if (canSelect) {
            onSelect();
          }
        }}
        pressedScale={0.985}
        containerStyle={[
          styles.rowMain,
          { opacity: disabled ? 0.68 : 1 },
        ]}
        style={styles.rowMainPressable}
      >
        <View
          style={[
            styles.sourceIcon,
            {
              backgroundColor: tokens.sourceIconGlass,
              borderColor: tokens.border,
            },
          ]}
        >
          {sourceInfo?.icon ? (
            <MobileCachedImage
              fallback={
                <Ionicons
                  name="globe-outline"
                  size={20}
                  color={tokens.mutedForeground}
                />
              }
              uriOwnership="source"
              source={{ uri: sourceInfo.icon }}
              style={styles.sourceIconImage}
            />
          ) : (
            <Ionicons
              name="globe-outline"
              size={20}
              color={tokens.mutedForeground}
            />
          )}
        </View>
        <View style={styles.rowText}>
          <View style={styles.titleLine}>
            <Text
              numberOfLines={1}
              style={[styles.rowTitle, { color: tokens.foreground }]}
            >
              {name}
            </Text>
            {selected ? (
              <View
                style={[
                  styles.selectedBadge,
                  { backgroundColor: tokens.primary },
                ]}
              >
                <Text
                  style={[
                    styles.selectedText,
                    { color: tokens.primaryForeground },
                  ]}
                >
                  {strings.sourceManager.active}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={[styles.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </Text>
        </View>
      </NemuPressable>

      {/* Delete button. */}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={formatMobileString(
          strings.sourceManager.removeSourceConfirm,
          { name },
        )}
        accessibilityState={{ disabled: !canRemove }}
        disabled={!canRemove}
        hapticFeedback={canRemove ? "press" : "none"}
        onPress={onRemove}
        pressedScale={0.9}
        style={[
          styles.deleteButton,
          { opacity: canRemove ? 1 : 0.4 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={tokens.danger} />
        ) : (
          <Ionicons name="trash-outline" size={18} color={tokens.danger} />
        )}
      </NemuPressable>
      </View>
    </View>
  );
}

function AddSearchResultRow({
  manga,
  strings,
  sourceName,
  added,
  adding,
  disabled,
  onAdd,
}: {
  manga: MobileLiveSearchManga;
  strings: MobileStrings;
  sourceName: string;
  added: boolean;
  adding: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { tokens } = useNemuTheme();
  const title = manga.title || manga.id;
  const actionDisabled = added || adding || disabled;

  return (
    <View style={[styles.addResultRow, { backgroundColor: tokens.muted }]}>
      <View style={[styles.resultCover, { backgroundColor: tokens.card }]}>
        {manga.cover ? (
          <MobileCachedImage
            fallback={
              <Ionicons
                name="book-outline"
                size={18}
                color={tokens.mutedForeground}
              />
            }
            uriOwnership="source"
            source={{ uri: manga.cover, headers: manga.coverHeaders }}
            style={styles.resultCoverImage}
          />
        ) : (
          <Ionicons
            name="book-outline"
            size={18}
            color={tokens.mutedForeground}
          />
        )}
      </View>
      <View style={styles.resultText}>
        <Text
          numberOfLines={1}
          style={[styles.resultTitle, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.resultSubtitle, { color: tokens.mutedForeground }]}
        >
          {sourceName}
          {manga.authors?.length ? ` / ${manga.authors.join(", ")}` : ""}
        </Text>
      </View>
      <NemuButton
        accessibilityLabel={formatAddSourceResultAccessibilityLabel({
          title,
          sourceName,
          authors: manga.authors,
          added,
          strings,
        })}
        disabled={actionDisabled}
        label={added ? strings.sourceManager.added : strings.common.add}
        loading={adding}
        onPress={onAdd}
        size="sm"
        style={styles.smallActionButton}
        variant={added ? "secondary" : "default"}
      />
    </View>
  );
}

function MergeCandidateRow({
  entry,
  strings,
  similarity,
  busy,
  disabled,
  onMerge,
}: {
  entry: LibraryEntry;
  strings: MobileStrings;
  similarity: number;
  busy: boolean;
  disabled: boolean;
  onMerge: () => void;
}) {
  const { tokens } = useNemuTheme();
  const cover = getEntryCover(entry);
  const title = getEntryTitle(entry);

  return (
    <View style={[styles.addResultRow, { backgroundColor: tokens.muted }]}>
      <View style={[styles.resultCover, { backgroundColor: tokens.card }]}>
        {cover ? (
          <MobileCachedImage
            fallback={
              <Ionicons
                name="library-outline"
                size={18}
                color={tokens.mutedForeground}
              />
            }
            uriOwnership="source"
            source={{ uri: cover }}
            style={styles.resultCoverImage}
          />
        ) : (
          <Ionicons
            name="library-outline"
            size={18}
            color={tokens.mutedForeground}
          />
        )}
      </View>
      <View style={styles.resultText}>
        <Text
          numberOfLines={1}
          style={[styles.resultTitle, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.resultSubtitle, { color: tokens.mutedForeground }]}
        >
          {sourceCountText(entry.sources.length, strings)}
          {similarity > 0.3 ? ` / ${strings.sourceManager.likelyMatch}` : ""}
        </Text>
      </View>
      <NemuButton
        accessibilityLabel={formatMergeCandidateAccessibilityLabel({
          title,
          sourceCount: entry.sources.length,
          likelyMatch: similarity > 0.3,
          strings,
        })}
        disabled={busy || disabled}
        label={strings.common.merge}
        loading={busy}
        onPress={onMerge}
        size="sm"
        style={styles.smallActionButton}
        variant="default"
      />
    </View>
  );
}

export function MobileSourceManagerSheet({
  visible,
  entry,
  selectedSourceId,
  onClose,
  onDismiss,
  onSelectSource,
  onEntryChange,
}: MobileSourceManagerSheetProps) {
  const { tokens } = useNemuTheme();
  const store = useMobileDataStore();
  const installedSources = useInstalledSources();
  const library = useLibraryEntries();
  const progress = useMangaProgress();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const { fontScale, height, width } = useWindowDimensions();
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const busySourceIdRef = useRef<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("search");
  const [addQuery, setAddQuery] = useState(getEntryTitle(entry));
  const addSearchInFlightRef = useRef(false);
  const addSearchRunRef = useRef(0);
  const [addSearchState, setAddSearchState] = useState<AddSearchState>({
    status: "idle",
    detail: strings.sourceManager.addPanelIdle,
  });
  const [addResultPages, setAddResultPages] = useState<Record<string, number>>(
    {},
  );
  const [mergeCandidatePage, setMergeCandidatePage] = useState(0);
  const [sourceTitles, setSourceTitles] = useState<Record<string, string>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const addingKeyRef = useRef<string | null>(null);
  const [mergingLibraryItemId, setMergingLibraryItemId] = useState<
    string | null
  >(null);
  const mergingLibraryItemIdRef = useRef<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<SourceManagerConfirmation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const wasVisibleRef = useRef(false);
  const visibleLibraryItemIdRef = useRef<string | null>(null);
  const entryTitle = getEntryTitle(entry);
  const sources = useMemo(
    () => sortMobileSourceLinks(entry.sources, entry.item.sourceOrder),
    [entry],
  );
  const searchableSources = useMemo(
    () => {
      const unlinkedSources = installedSources.data
        .filter(
          (source) =>
            !entry.sources.some((link) =>
              mobileInstalledSourceMatchesLink(source, link),
            ),
        )
        .map((source) => ({
          ...source,
          languages: source.languages ?? source.packageMetadata?.languages,
        }));

      return sortSourcesByLanguagePriority(unlinkedSources, appLanguage);
    },
    [appLanguage, entry.sources, installedSources.data],
  );
  const progressIndex = useMemo(
    () => buildMobileProgressIndex(progress.data),
    [progress.data],
  );
  const addSearchLoading =
    addSearchState.status === "loading" ||
    (addSearchState.status === "ready" &&
      addSearchState.groups.some((group) => group.status === "loading"));
  const sourceManagerActionState: MobileSourceManagerActionState = {
    searching: addSearchLoading,
    adding: addingKey !== null,
    merging: mergingLibraryItemId !== null,
    sourceMutating: busySourceId !== null,
  };
  const sourceManagerActionBusy =
    isMobileSourceManagerActionBusy(sourceManagerActionState);
  const getGuardedSourceManagerActionState = (): MobileSourceManagerActionState => ({
    searching: addSearchInFlightRef.current || addSearchLoading,
    adding: addingKeyRef.current !== null || addingKey !== null,
    merging:
      mergingLibraryItemIdRef.current !== null || mergingLibraryItemId !== null,
    sourceMutating: busySourceIdRef.current !== null || busySourceId !== null,
  });
  const canSearchSources = canRunMobileSourceManagerSearch(
    addQuery,
    sourceManagerActionState,
  );
  const mergeCandidates = useMemo(() => {
    const normalizedQuery = addQuery.trim().toLowerCase();
    return sortMobileLibraryMergeCandidates(entry, library.data, progressIndex)
      .filter(({ entry: candidate }) => {
        if (!normalizedQuery) return true;
        return getEntryTitle(candidate).toLowerCase().includes(normalizedQuery);
      });
  }, [addQuery, entry, library.data, progressIndex]);

  useEffect(() => {
    setMergeCandidatePage(0);
  }, [addMode, addQuery, entry.item.libraryItemId]);

  const pagedMergeCandidates = useMemo(
    () =>
      paginateMobileLibraryMergeCandidates(
        mergeCandidates,
        mergeCandidatePage,
        MERGE_CANDIDATES_PER_PAGE,
      ),
    [mergeCandidatePage, mergeCandidates],
  );
  const confirmationDetails = useMemo(() => {
    if (!confirmation) return null;
    if (confirmation.type === "merge-entry") {
      return {
        title: strings.sourceManager.mergeLibraryTitle,
        description: formatMobileString(
          strings.sourceManager.mergeLibraryTitleConfirm,
          {
            sourceTitle: confirmation.sourceTitle,
            targetTitle: getEntryTitle(entry),
          },
        ),
        subject: confirmation.sourceTitle,
        iconName: "git-merge-outline" as const,
        confirmLabel: strings.common.merge,
        confirmAccessibilityLabel: formatMobileString(
          strings.sourceManager.mergeWithTitle,
          { title: confirmation.sourceTitle },
        ),
        destructive: false,
        loading:
          mergingLibraryItemId ===
          confirmation.sourceEntry.item.libraryItemId,
      };
    }

    return {
      title: strings.sourceManager.removeSource,
      description: formatMobileString(
        strings.sourceManager.removeSourceConfirm,
        { name: confirmation.name },
      ),
      subject: confirmation.name,
      iconName: "trash-outline" as const,
      confirmLabel: strings.common.remove,
      confirmAccessibilityLabel: `${strings.sourceManager.removeSource}: ${confirmation.name}`,
      destructive: true,
      loading: busySourceId === confirmation.source.id,
    };
  }, [busySourceId, confirmation, entry, mergingLibraryItemId, strings]);

  useEffect(() => {
    const itemChanged = visibleLibraryItemIdRef.current !== entry.item.libraryItemId;
    if (visible && (!wasVisibleRef.current || itemChanged)) {
      setAddQuery(entryTitle);
      setAddPanelOpen(false);
      setAddMode("search");
      setAddSearchState({
        status: "idle",
        detail: strings.sourceManager.addPanelIdle,
      });
      setAddResultPages({});
      setMergeCandidatePage(0);
      setSourceTitles({});
      setAddingKey(null);
      addingKeyRef.current = null;
      setMergingLibraryItemId(null);
      mergingLibraryItemIdRef.current = null;
      setBusySourceId(null);
      busySourceIdRef.current = null;
      addSearchInFlightRef.current = false;
      addSearchRunRef.current += 1;
      setConfirmation(null);
      setActionError(null);
    }
    wasVisibleRef.current = visible;
    visibleLibraryItemIdRef.current = visible ? entry.item.libraryItemId : null;
  }, [
    entry.item.libraryItemId,
    entryTitle,
    strings.sourceManager.addPanelIdle,
    visible,
  ]);

  useEffect(() => {
    setMergeCandidatePage(0);
  }, [addMode, addQuery, entry.item.libraryItemId]);

  useEffect(() => {
    if (!visible || addPanelOpen || sources.length === 0) return;
    let cancelled = false;

    const loadTitles = async () => {
      const nextTitles: Record<string, string> = {};

      await Promise.all(
        sources.map(async (source) => {
          const sourceInfo = sourceInfoForLink(source, installedSources.data);
          if (!sourceInfo) return;

          try {
            const refreshed = await refreshMobileSourceMetadata(
              sourceInfo,
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
              },
            );

            if (refreshed.status === "ready" && refreshed.metadata.title) {
              nextTitles[source.id] = refreshed.metadata.title;
            }
          } catch {
            // Source titles are presentation context; unavailable sources keep the stable ID fallback.
          }
        }),
      );

      if (!cancelled) {
        setSourceTitles(nextTitles);
      }
    };

    void loadTitles();

    return () => {
      cancelled = true;
    };
  }, [addPanelOpen, installedSources.data, sources, store, visible]);

  const updateEntry = (nextEntry: LibraryEntry) => {
    onEntryChange(nextEntry);
  };

  const reportSourceActionError = async (error: unknown) => {
    await hapticError();
    setActionError(
      describeMobileErrorDetail(
        error,
        strings.sourceManager.sourceActionFailedDetail,
      ),
    );
  };

  const openAddPanel = () => {
    setActionError(null);
    setAddQuery(entryTitle);
    setAddMode("search");
    setAddSearchState({
      status: "idle",
      detail: strings.sourceManager.addPanelIdle,
    });
    setAddResultPages({});
    setMergeCandidatePage(0);
    setAddPanelOpen(true);
  };

  const closeAddPanel = () => {
    setActionError(null);
    setAddPanelOpen(false);
  };

  const handleToggleAddPanel = () => {
    const action = getMobileSourceManagerAddPanelToggleAction({
      addPanelOpen,
      state: getGuardedSourceManagerActionState(),
    });

    if (action === "ignore") return;
    if (action === "open-add-panel") {
      openAddPanel();
      return;
    }
    closeAddPanel();
  };

  const runAddSearch = async () => {
    const query = addQuery.trim();
    if (
      !canRunMobileSourceManagerSearch(
        query,
        getGuardedSourceManagerActionState(),
      )
    ) {
      if (!query) await hapticError();
      return;
    }
    if (searchableSources.length === 0) {
      await hapticError();
      return;
    }

    addSearchInFlightRef.current = true;
    const runId = (addSearchRunRef.current += 1);
    setAddSearchState({
      status: "loading",
      detail: strings.sourceManager.matchingTitles,
    });
    setAddResultPages({});

    try {
      const metadataMatches = await searchMobileMetadataMatches(query);
      let matchedTitleAliases = exactMetadataTitleAliases(
        query,
        metadataMatches.results,
      );

      if (matchedTitleAliases.length === 0) {
        const fallbackTitle = await findMobileJapaneseTitleFallback(
          query,
          entry.item.metadata.authors,
        );

        if (fallbackTitle && fallbackTitle !== query) {
          const fallbackMatches = await searchMobileMetadataMatches(fallbackTitle);
          matchedTitleAliases = exactMetadataTitleAliases(
            fallbackTitle,
            fallbackMatches.results,
          );
        }
      }

      const titlePool = buildMobileSourceTitlePool([
        query,
        ...matchedTitleAliases,
      ]);

      setAddQuery(titlePool.en[0] ?? titlePool.all[0] ?? query);

      setAddSearchState({
        status: "loading",
        detail: formatMobileString(
          searchableSources.length === 1
            ? strings.sourceManager.searchSourceCountOne
            : strings.sourceManager.searchSourceCountOther,
          { count: searchableSources.length },
        ),
      });

      const compareTitles = titlePool.all.length ? titlePool.all : [query];
      const completedGroups = new Map<string, MobileLiveSearchGroup>();
      const getSourceSettings = async (
        _sourceKey: string,
        sourceRecord: InstalledSource,
      ) => {
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
      };

      setAddSearchState({
        status: "ready",
        query,
        groups: buildMobileLiveSearchProgressGroups(
          searchableSources,
          [],
          compareTitles,
        ),
      });

      for (const source of searchableSources) {
        if (addSearchRunRef.current !== runId) return;
        const sourceQuery =
          getMobileSearchQueryForSource(source, titlePool) ?? query;

        const group = await searchMobileSource(source, sourceQuery, {
          titlePool,
          compareTitles,
          getSourceSettings,
        }).catch((error): MobileLiveSearchGroup => {
          const presentation = getMobileSourceErrorPresentation(error, strings);
          return {
            status: "blocked",
            source: toSearchSourceDisplay(source),
            reason: "search-failed",
            title: presentation.title,
            detail: presentation.detail,
          };
        });
        if (addSearchRunRef.current !== runId) return;
        const displayGroup = presentMobileLiveSearchGroup(group, strings);
        completedGroups.set(displayGroup.source.id, displayGroup);
        setAddSearchState({
          status: "ready",
          query,
          groups: buildMobileLiveSearchProgressGroups(
            searchableSources,
            [...completedGroups.values()],
            compareTitles,
          ),
        });
      }
      setAddSearchState({
        status: "ready",
        query,
        groups: buildMobileLiveSearchProgressGroups(
          searchableSources,
          [...completedGroups.values()],
          compareTitles,
        ),
      });
    } catch (error) {
      const presentation = getMobileSourceErrorPresentation(error, strings);
      setAddSearchState({
        status: "error",
        title: presentation.title,
        detail: presentation.detail,
      });
      await hapticError();
    } finally {
      addSearchInFlightRef.current = false;
    }
  };

  const addSearchResult = async (
    group: Extract<MobileLiveSearchGroup, { status: "ready" }>,
    manga: MobileLiveSearchManga,
  ) => {
    const key = makeMobileSourceAddResultKey(
      group.source.registryId,
      group.source.rawSourceId,
      manga.id,
    );
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    addingKeyRef.current = key;
    setAddingKey(key);
    setActionError(null);
    try {
      const next = addMobileSourceLinkToEntry(
        entry,
        {
          registryId: group.source.registryId,
          sourceId: group.source.rawSourceId,
          sourceMangaId: manga.id,
          sourceKeys: group.source.sourceKeys,
        },
        nextSyncTimestamp(
          entry.item.updatedAt,
          ...entry.sources.map((source) => source.updatedAt),
        ),
      );
      if (next.added) {
        await store.saveSourceLink(next.sourceLink);
        await store.saveLibraryItem(next.entry.item);
        updateEntry(next.entry);
        emitMobileDataChanged("library");
      }
      onSelectSource(next.sourceLink.id);
      await hapticConfirm();
    } catch (error) {
      await reportSourceActionError(error);
    } finally {
      addingKeyRef.current = null;
      setAddingKey(null);
    }
  };

  const performMergeEntry = async (sourceEntry: LibraryEntry) => {
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    mergingLibraryItemIdRef.current = sourceEntry.item.libraryItemId;
    setMergingLibraryItemId(sourceEntry.item.libraryItemId);
    setActionError(null);
    const now = nextSyncTimestamp(
      entry.item.updatedAt,
      sourceEntry.item.updatedAt,
      ...entry.sources.map((source) => source.updatedAt),
      ...sourceEntry.sources.map((source) => source.updatedAt),
    );
    const syncEpoch = getMobileSyncEpoch();
    try {
      const next = mergeMobileLibraryEntries(
        entry,
        sourceEntry,
        now,
        installedSources.data,
      );
      for (const source of next.movedSources) {
        await store.saveSourceLink(source);
      }
      if (next.movedSources.length > 0) {
        await store.saveLibraryItem(next.entry.item);
      }
      if (next.shouldRemoveSourceEntry) {
        const collectionIds = collectionIdsToTransferForMobileMerge(
          await store.getCollectionItems(),
          entry.item.libraryItemId,
          sourceEntry.item.libraryItemId,
        );
        for (const collectionId of collectionIds) {
          await store.addCollectionItems(collectionId, [entry.item.libraryItemId]);
        }
        const [chapterProgress, mangaProgress] = await Promise.all([
          store.getAllChapterProgress(),
          store.getAllMangaProgress(),
        ]);
        const retargetedChapterProgress = retargetMobileMergeProgress(
          chapterProgress,
          entry.item.libraryItemId,
          sourceEntry.item.libraryItemId,
          now,
        );
        const retargetedMangaProgress = retargetMobileMergeProgress(
          mangaProgress,
          entry.item.libraryItemId,
          sourceEntry.item.libraryItemId,
          now,
        );
        const mergedChapterProgress = mergeMobileRetargetedChapterProgress(
          retargetedChapterProgress,
          chapterProgress,
        );
        const mergedMangaProgress = mergeMobileRetargetedMangaProgress(
          mergedChapterProgress,
          retargetedMangaProgress,
          mangaProgress,
        );
        if (mergedChapterProgress.length > 0) {
          await store.saveChapterProgressBatch(mergedChapterProgress);
        }
        if (mergedMangaProgress.length > 0) {
          await store.saveMangaProgressBatch(mergedMangaProgress);
        }
        await retargetMobileCloudHistoryLibraryItem(
          sourceEntry.item.libraryItemId,
          entry.item.libraryItemId,
          syncEpoch,
          store,
        );
        await store.removeLibraryItem(sourceEntry.item.libraryItemId);
      }
      updateEntry(next.entry);
      onSelectSource(next.movedSources[0]?.id ?? selectedSourceId ?? null);
      emitMobileLibraryDataChanged({
        collectionsChanged: next.shouldRemoveSourceEntry,
      });
      setAddPanelOpen(false);
      if (getMobileSourceManagerMutationResultAction({ succeeded: true }) === "close-confirmation") {
        setConfirmation(null);
      }
      await hapticConfirm();
    } catch (error) {
      if (getMobileSourceManagerMutationResultAction({ succeeded: false }) === "close-confirmation") {
        setConfirmation(null);
      }
      await reportSourceActionError(error);
    } finally {
      mergingLibraryItemIdRef.current = null;
      setMergingLibraryItemId(null);
    }
  };

  const confirmMergeEntry = (sourceEntry: LibraryEntry) => {
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    setActionError(null);
    setConfirmation({
      type: "merge-entry",
      sourceEntry,
      sourceTitle: getEntryTitle(sourceEntry),
    });
  };

  const moveSource = async (source: LocalSourceLink, direction: -1 | 1) => {
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    busySourceIdRef.current = source.id;
    setBusySourceId(source.id);
    setActionError(null);
    try {
      const sourceOrder = moveMobileSourceLink(entry, source.id, direction);
      const item = {
        ...entry.item,
        sourceOrder,
        updatedAt: nextSyncTimestamp(entry.item.updatedAt),
      };
      await store.saveLibraryItem(item);
      updateEntry({ item, sources: entry.sources });
      emitMobileDataChanged("library");
      await hapticConfirm();
    } catch (error) {
      await reportSourceActionError(error);
    } finally {
      busySourceIdRef.current = null;
      setBusySourceId(null);
    }
  };

  const removeSource = async (source: LocalSourceLink) => {
    if (entry.sources.length <= 1) return;
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    busySourceIdRef.current = source.id;
    setBusySourceId(source.id);
    setActionError(null);
    try {
      const next = removeMobileSourceLinkFromEntry(
        entry,
        source.id,
        nextSyncTimestamp(entry.item.updatedAt, source.updatedAt),
      );
      await store.removeSourceLink(
        source.registryId,
        source.sourceId,
        source.sourceMangaId,
      );
      await store.saveLibraryItem(next.item);
      const nextSelectedSource =
        selectedSourceId === source.id
          ? (sortMobileSourceLinks(next.sources, next.item.sourceOrder)[0]
              ?.id ?? null)
          : (selectedSourceId ?? null);
      updateEntry(next);
      onSelectSource(nextSelectedSource);
      emitMobileDataChanged("library");
      if (getMobileSourceManagerMutationResultAction({ succeeded: true }) === "close-confirmation") {
        setConfirmation(null);
      }
      await hapticConfirm();
    } catch (error) {
      if (getMobileSourceManagerMutationResultAction({ succeeded: false }) === "close-confirmation") {
        setConfirmation(null);
      }
      await reportSourceActionError(error);
    } finally {
      busySourceIdRef.current = null;
      setBusySourceId(null);
    }
  };

  const confirmRemoveSource = (source: LocalSourceLink) => {
    if (!canStartMobileSourceManagerAction(getGuardedSourceManagerActionState())) {
      return;
    }
    const sourceInfo = sourceInfoForLink(source, installedSources.data);
    const name = sourceInfo?.name ?? sourceDisplayName(source);
    setActionError(null);
    setConfirmation({ type: "remove-source", source, name });
  };

  const setAddResultPage = (
    group: Extract<MobileLiveSearchGroup, { status: "ready" }>,
    page: number,
  ) => {
    const sourceKey = sourceKeyForSearchGroup(group);
    const totalPages = Math.max(
      1,
      Math.ceil(group.items.length / ADD_RESULTS_PER_SOURCE_PAGE),
    );
    const nextPage = Math.max(0, Math.min(page, totalPages - 1));
    setAddResultPages((current) => ({
      ...current,
      [sourceKey]: nextPage,
    }));
  };

  const setMergeCandidateResultPage = (page: number) => {
    const nextPage = Math.max(
      0,
      Math.min(page, pagedMergeCandidates.totalPages - 1),
    );
    setMergeCandidatePage(nextPage);
  };

  const runConfirmedAction = () => {
    if (!confirmation) return;
    if (confirmation.type === "merge-entry") {
      void performMergeEntry(confirmation.sourceEntry);
      return;
    }
    void removeSource(confirmation.source);
  };

  const handleRequestClose = () => {
    const action = getMobileSourceManagerRequestCloseAction({
      addPanelOpen,
      confirmationLoading: Boolean(confirmationDetails?.loading),
      confirmationOpen: confirmation !== null,
    });

    if (action === "ignore") return;
    void hapticPress();

    if (action === "close-confirmation") {
      setConfirmation(null);
      return;
    }
    if (action === "close-add-panel") {
      closeAddPanel();
      return;
    }
    onClose();
  };
  const canNativeDismissSheet = !addPanelOpen && confirmation === null;
  const addPanelRowCount =
    addMode === "merge"
      ? pagedMergeCandidates.items.length
      : addSearchState.status === "ready"
        ? addSearchState.groups.reduce((count, group) => {
            if (group.status !== "ready") return count + 1;
            return count + Math.min(group.items.length, ADD_RESULTS_PER_SOURCE_PAGE);
          }, 0)
        : 1;
  const sheetLayout = getMobileSourceManagerSheetLayout({
    addPanelOpen,
    addPanelRowCount,
    fontScale,
    height,
    sourceCount: sources.length,
    width,
  });
  const headerMetrics = resolveMobileSheetHeaderMetrics(Platform.OS);
  const headerActionLabel = addPanelOpen
    ? strings.common.back
    : strings.settings.addSource;
  const confirmationAccentColor = confirmationDetails?.destructive
    ? tokens.danger
    : tokens.primary;

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={handleRequestClose}
      onDismiss={onDismiss}
      onHardwareBackPress={() => {
        if (!addPanelOpen && confirmation === null) return false;
        handleRequestClose();
        return true;
      }}
      title={
        confirmationDetails?.title ??
        (addPanelOpen
          ? strings.sourceManager.modeSearch
          : strings.sourceManager.manageSources)
      }
      subtitle={
        confirmationDetails?.description ??
        (addPanelOpen
          ? strings.sourceManager.addPanelIdle
          : strings.sourceManager.subtitle)
      }
      headerLeading={
        confirmationDetails ? (
          <View
            style={[
              styles.confirmationIconShell,
              { backgroundColor: `${confirmationAccentColor}18` },
            ]}
          >
            <Ionicons
              name={confirmationDetails.iconName}
              size={22}
              color={confirmationAccentColor}
            />
          </View>
        ) : undefined
      }
      headerTrailing={
        confirmationDetails ? undefined : (
          <NemuButton
            accessibilityLabel={
              addPanelOpen
                ? strings.sourceManager.backToSourceList
                : strings.settings.addSource
            }
            disabled={sourceManagerActionBusy}
            icon={addPanelOpen ? "arrow-back-outline" : "add-outline"}
            label={
              headerMetrics.showActionLabels ? headerActionLabel : undefined
            }
            onPress={handleToggleAddPanel}
            size={headerMetrics.showActionLabels ? "sm" : "icon-sm"}
            variant="secondary"
          />
        )
      }
      snapPoints={confirmationDetails ? undefined : sheetLayout.snapPoints}
      scroll={confirmationDetails ? false : sheetLayout.fillContent}
      enablePanDownToClose={canNativeDismissSheet}
      contentStyle={styles.sheet}
    >
      {confirmationDetails ? (
        <View style={styles.confirmationPanel}>
          {confirmationDetails.subject ? (
            <View
              style={[
                styles.confirmationSubject,
                { backgroundColor: tokens.muted },
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.confirmationSubjectText,
                  { color: tokens.foreground },
                ]}
              >
                {confirmationDetails.subject}
              </Text>
            </View>
          ) : null}
          {actionError ? (
            <MobileInlineErrorBanner
              title={strings.sourceManager.sourceActionFailed}
              detail={actionError}
              dismissLabel={strings.common.clear}
              onDismiss={() => setActionError(null)}
              variant="embedded"
            />
          ) : null}
          <View style={styles.confirmationActions}>
            <NemuButton
              accessibilityLabel={strings.common.cancel}
              containerStyle={styles.confirmationAction}
              disabled={confirmationDetails.loading}
              label={strings.common.cancel}
              onPress={() => setConfirmation(null)}
              variant="secondary"
            />
            <NemuButton
              accessibilityLabel={
                confirmationDetails.confirmAccessibilityLabel
              }
              containerStyle={styles.confirmationAction}
              disabled={confirmationDetails.loading}
              label={confirmationDetails.confirmLabel}
              loading={confirmationDetails.loading}
              onPress={runConfirmedAction}
              variant={
                confirmationDetails.destructive ? "destructive" : "default"
              }
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.listContent}>
        {actionError ? (
          <MobileInlineErrorBanner
            title={strings.sourceManager.sourceActionFailed}
            detail={actionError}
            dismissLabel={strings.common.clear}
            onDismiss={() => setActionError(null)}
            variant="embedded"
          />
        ) : null}

        {addPanelOpen ? (
          <View style={styles.addPanel}>
            <View accessibilityRole="tablist" style={styles.modeRow}>
              {(["search", "merge"] as const).map((nextMode) => {
                const selected = addMode === nextMode;
                const canSelect = canSelectMobileSourceManagerAddMode({
                  selected,
                  disabled: sourceManagerActionBusy,
                  hasActionError: actionError !== null,
                });
                return (
                  <NemuPressable
                    key={nextMode}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      nextMode === "search"
                        ? strings.sourceManager.modeSearch
                        : strings.sourceManager.modeMerge
                    }
                    accessibilityState={{
                      selected,
                      disabled: sourceManagerActionBusy,
                    }}
                    disabled={sourceManagerActionBusy}
                    hapticFeedback={canSelect ? "selection" : "none"}
                    onPress={() => {
                      if (canSelect) {
                        setActionError(null);
                        setAddMode(nextMode);
                      }
                    }}
                    pressedScale={0.98}
                    style={[
                      styles.modeButton,
                      {
                        backgroundColor: selected
                          ? tokens.primary
                          : tokens.muted,
                        opacity: sourceManagerActionBusy ? 0.64 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        nextMode === "search"
                          ? "search-outline"
                          : "git-merge-outline"
                      }
                      size={16}
                      color={
                        selected
                          ? tokens.primaryForeground
                          : tokens.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        styles.modeText,
                        {
                          color: selected
                            ? tokens.primaryForeground
                            : tokens.mutedForeground,
                        },
                      ]}
                    >
                      {nextMode === "search"
                        ? strings.sourceManager.modeSearch
                        : strings.sourceManager.modeMerge}
                    </Text>
                  </NemuPressable>
                );
              })}
            </View>

            <View style={styles.searchRow}>
              <View
                style={[
                  styles.searchInputShell,
                  {
                    backgroundColor: tokens.muted,
                    opacity: sourceManagerActionBusy ? 0.72 : 1,
                  },
                ]}
              >
                <TextInput
                  accessibilityLabel={strings.sourceManager.searchSources}
                  accessibilityRole="search"
                  autoCapitalize="none"
                  editable={!sourceManagerActionBusy}
                  enterKeyHint="search"
                  onChangeText={setAddQuery}
                  onSubmitEditing={() => {
                    if (addMode === "search" && canSearchSources) {
                      void runAddSearch();
                    }
                  }}
                  placeholder={
                    addMode === "search"
                      ? strings.sourceManager.sourceSearchPlaceholder
                      : strings.sourceManager.librarySearchPlaceholder
                  }
                  placeholderTextColor={tokens.mutedForeground}
                  returnKeyType="search"
                  selectionColor={tokens.primary}
                  value={addQuery}
                  style={[styles.searchInput, { color: tokens.foreground }]}
                />
                {addQuery.length > 0 ? (
                  <NemuTextFieldClearAction
                    accessibilityLabel={strings.common.clear}
                    disabled={sourceManagerActionBusy}
                    onPress={() => setAddQuery("")}
                    testID="SourceManagerSearchClearAction"
                    trailingInset={12}
                  />
                ) : null}
              </View>
              {addMode === "search" ? (
                <NemuButton
                  accessibilityLabel={strings.sourceManager.searchSources}
                  disabled={!canSearchSources}
                  icon="search-outline"
                  loading={addSearchLoading}
                  onPress={() => {
                    void runAddSearch();
                  }}
                  size="icon-lg"
                  style={styles.searchButton}
                  variant="default"
                />
              ) : null}
            </View>

            {addMode === "search" ? (
              <View style={styles.addResults}>
                {searchableSources.length === 0 ? (
                  <View
                    style={[
                      styles.notice,
                      { backgroundColor: tokens.muted },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={17}
                      color={tokens.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.noticeText,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {strings.sourceManager.allInstalledLinked}
                    </Text>
                  </View>
                ) : addSearchState.status === "ready" ? (
                  addSearchState.groups.some(
                    (group) =>
                      group.status === "loading" ||
                      group.status === "blocked" ||
                      (group.status === "ready" && group.items.length > 0),
                  ) ? (
                    addSearchState.groups.map((group) => {
                      const sourceName =
                        getMobileInstalledSourceRegistryDisplayName(
                          installedSources.data,
                          {
                            id: group.source.rawSourceId,
                            registryId: group.source.registryId,
                            name: group.source.name,
                          },
                        );

                      if (group.status === "loading") {
                        return (
                          <View
                            key={group.source.id}
                            style={styles.resultGroup}
                          >
                            <View style={styles.resultGroupHeader}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.resultGroupTitle,
                                  { color: tokens.mutedForeground },
                                ]}
                              >
                                {sourceName}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.notice,
                                { backgroundColor: tokens.muted },
                              ]}
                            >
                              <ActivityIndicator
                                size="small"
                                color={tokens.primary}
                              />
                              <Text
                                style={[
                                  styles.noticeText,
                                  { color: tokens.mutedForeground },
                                ]}
                              >
                                {strings.search.searching}
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      if (group.status === "blocked") {
                        return (
                          <View
                            key={group.source.id}
                            style={styles.resultGroup}
                          >
                            <View style={styles.resultGroupHeader}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.resultGroupTitle,
                                  { color: tokens.mutedForeground },
                                ]}
                              >
                                {sourceName}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.notice,
                                { backgroundColor: tokens.muted },
                              ]}
                            >
                              <Ionicons
                                name="alert-circle-outline"
                                size={17}
                                color={tokens.mutedForeground}
                              />
                              <View style={styles.noticeCopy}>
                                {group.title ? (
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.noticeTitle,
                                      { color: tokens.foreground },
                                    ]}
                                  >
                                    {group.title}
                                  </Text>
                                ) : null}
                                <Text
                                  numberOfLines={group.title ? 2 : 3}
                                  style={[
                                    styles.noticeDetail,
                                    { color: tokens.mutedForeground },
                                  ]}
                                >
                                  {group.detail}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      }

                      if (group.items.length === 0) {
                        return null;
                      }
                      const groupKey = sourceKeyForSearchGroup(group);
                      const addingSourceKey =
                        getMobileSourceAddResultSourceKey(addingKey);
                      const sourceAdding = groupKey === addingSourceKey;
                      const addedManga = group.items.find((manga) => {
                        return Boolean(
                          findMobileSourceLinkForInput(entry, {
                            registryId: group.source.registryId,
                            sourceId: group.source.rawSourceId,
                            sourceMangaId: manga.id,
                            sourceKeys: group.source.sourceKeys,
                          }),
                        );
                      });
                      const totalPages = Math.ceil(
                        group.items.length / ADD_RESULTS_PER_SOURCE_PAGE,
                      );
                      const page = Math.max(
                        0,
                        Math.min(
                          addResultPages[groupKey] ?? 0,
                          Math.max(0, totalPages - 1),
                        ),
                      );
                      const visibleItems = addedManga
                        ? [addedManga]
                        : group.items.slice(
                            page * ADD_RESULTS_PER_SOURCE_PAGE,
                            page * ADD_RESULTS_PER_SOURCE_PAGE +
                              ADD_RESULTS_PER_SOURCE_PAGE,
                          );
                      return (
                        <View
                          key={group.source.id}
                          style={styles.resultGroup}
                        >
                          <View style={styles.resultGroupHeader}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.resultGroupTitle,
                                { color: tokens.mutedForeground },
                              ]}
                            >
                              {sourceName}
                            </Text>
                            {!addedManga && totalPages > 1 ? (
                              <View style={styles.resultPager}>
                                <NemuPressable
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    strings.sourceManager.previousResults
                                  }
                                  accessibilityState={{
                                    disabled: page === 0 || sourceManagerActionBusy,
                                  }}
                                  disabled={page === 0 || sourceManagerActionBusy}
                                  onPress={() =>
                                    setAddResultPage(group, page - 1)
                                  }
                                  pressedScale={0.94}
                                  style={[
                                    styles.resultPagerButton,
                                    {
                                      backgroundColor: tokens.muted,
                                      opacity:
                                        page === 0 || sourceManagerActionBusy
                                          ? 0.45
                                          : 1,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="chevron-back-outline"
                                    size={16}
                                    color={tokens.mutedForeground}
                                  />
                                </NemuPressable>
                                <NemuPressable
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    strings.sourceManager.nextResults
                                  }
                                  accessibilityState={{
                                    disabled:
                                      page >= totalPages - 1 ||
                                      sourceManagerActionBusy,
                                  }}
                                  disabled={
                                    page >= totalPages - 1 ||
                                    sourceManagerActionBusy
                                  }
                                  onPress={() =>
                                    setAddResultPage(group, page + 1)
                                  }
                                  pressedScale={0.94}
                                  style={[
                                    styles.resultPagerButton,
                                    {
                                      backgroundColor: tokens.muted,
                                      opacity:
                                        page >= totalPages - 1 ||
                                        sourceManagerActionBusy
                                          ? 0.45
                                          : 1,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="chevron-forward-outline"
                                    size={16}
                                    color={tokens.mutedForeground}
                                  />
                                </NemuPressable>
                              </View>
                            ) : null}
                          </View>
                          {visibleItems.map((manga) => {
                            const key = makeMobileSourceAddResultKey(
                              group.source.registryId,
                              group.source.rawSourceId,
                              manga.id,
                            );
                            const added = Boolean(
                              findMobileSourceLinkForInput(entry, {
                                registryId: group.source.registryId,
                                sourceId: group.source.rawSourceId,
                                sourceMangaId: manga.id,
                                sourceKeys: group.source.sourceKeys,
                              }),
                            );
                            return (
                              <AddSearchResultRow
                                key={manga.id}
                                manga={manga}
                                strings={strings}
                                sourceName={sourceName}
                                added={added}
                                adding={addingKey === key}
                                disabled={
                                  (sourceAdding && addingKey !== key) ||
                                  (sourceManagerActionBusy && addingKey !== key)
                                }
                                onAdd={() => {
                                  void addSearchResult(group, manga);
                                }}
                              />
                            );
                          })}
                        </View>
                      );
                    })
                  ) : (
                    <View
                      style={[
                        styles.notice,
                        { backgroundColor: tokens.muted },
                      ]}
                    >
                      <Ionicons
                        name="search-outline"
                        size={17}
                        color={tokens.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.noticeText,
                          { color: tokens.mutedForeground },
                        ]}
                      >
                        {formatMobileString(
                          strings.sourceManager.noSourceResults,
                          {
                            query: addSearchState.query,
                          },
                        )}
                      </Text>
                    </View>
                  )
                ) : (
                  <View
                    style={[
                      styles.notice,
                      { backgroundColor: tokens.muted },
                    ]}
                  >
                    <Ionicons
                      name={
                        addSearchState.status === "error"
                          ? "alert-circle-outline"
                          : "search-outline"
                      }
                      size={17}
                      color={tokens.mutedForeground}
                    />
                    {addSearchState.status === "error" &&
                    addSearchState.title ? (
                      <View style={styles.noticeCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.noticeTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {addSearchState.title}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.noticeDetail,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {addSearchState.detail}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.noticeText,
                          { color: tokens.mutedForeground },
                        ]}
                      >
                        {addSearchState.detail}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.addResults}>
                {library.loading ? (
                  <View
                    style={[
                      styles.notice,
                      { backgroundColor: tokens.muted },
                    ]}
                  >
                    <ActivityIndicator
                      size="small"
                      color={tokens.primary}
                    />
                    <Text
                      style={[
                        styles.noticeText,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {strings.sourceManager.loadingLibraryTitles}
                    </Text>
                  </View>
                ) : mergeCandidates.length ? (
                  <>
                    {pagedMergeCandidates.totalPages > 1 ? (
                      <View style={styles.resultPager}>
                        <NemuPressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            strings.sourceManager.previousResults
                          }
                          accessibilityState={{
                            disabled:
                              pagedMergeCandidates.page === 0 ||
                              sourceManagerActionBusy,
                          }}
                          disabled={
                            pagedMergeCandidates.page === 0 ||
                            sourceManagerActionBusy
                          }
                          onPress={() =>
                            setMergeCandidateResultPage(
                              pagedMergeCandidates.page - 1,
                            )
                          }
                          pressedScale={0.94}
                          style={[
                            styles.resultPagerButton,
                            {
                              backgroundColor: tokens.muted,
                              opacity:
                                pagedMergeCandidates.page === 0 ||
                                sourceManagerActionBusy
                                  ? 0.45
                                  : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name="chevron-back-outline"
                            size={16}
                            color={tokens.mutedForeground}
                          />
                        </NemuPressable>
                        <NemuPressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            strings.sourceManager.nextResults
                          }
                          accessibilityState={{
                            disabled:
                              pagedMergeCandidates.page >=
                                pagedMergeCandidates.totalPages - 1 ||
                              sourceManagerActionBusy,
                          }}
                          disabled={
                            pagedMergeCandidates.page >=
                              pagedMergeCandidates.totalPages - 1 ||
                            sourceManagerActionBusy
                          }
                          onPress={() =>
                            setMergeCandidateResultPage(
                              pagedMergeCandidates.page + 1,
                            )
                          }
                          pressedScale={0.94}
                          style={[
                            styles.resultPagerButton,
                            {
                              backgroundColor: tokens.muted,
                              opacity:
                                pagedMergeCandidates.page >=
                                  pagedMergeCandidates.totalPages - 1 ||
                                sourceManagerActionBusy
                                  ? 0.45
                                  : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name="chevron-forward-outline"
                            size={16}
                            color={tokens.mutedForeground}
                          />
                        </NemuPressable>
                      </View>
                    ) : null}
                    {pagedMergeCandidates.items.map(
                      ({ entry: candidate, similarity }) => (
                        <MergeCandidateRow
                          key={candidate.item.libraryItemId}
                          entry={candidate}
                          strings={strings}
                          similarity={similarity}
                          busy={
                            mergingLibraryItemId ===
                            candidate.item.libraryItemId
                          }
                          disabled={
                            sourceManagerActionBusy &&
                            mergingLibraryItemId !==
                              candidate.item.libraryItemId
                          }
                          onMerge={() => confirmMergeEntry(candidate)}
                        />
                      )
                    )}
                  </>
                ) : (
                  <View
                    style={[
                      styles.notice,
                      { backgroundColor: tokens.muted },
                    ]}
                  >
                    <Ionicons
                      name="library-outline"
                      size={17}
                      color={tokens.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.noticeText,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {strings.sourceManager.noLibraryMatches}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <>
            {sources.length === 0 ? (
              <View
                style={[styles.notice, { backgroundColor: tokens.muted }]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color={tokens.mutedForeground}
                />
                <Text
                  style={[
                    styles.noticeText,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {strings.sourceManager.everyTitleNeedsSource}
                </Text>
              </View>
            ) : (
              <>
                {sources.map((source, index) => (
                  <SourceManagerRow
                    key={source.id}
                    source={source}
                    strings={strings}
                    index={index}
                    total={sources.length}
                    selected={source.id === selectedSourceId}
                    mangaTitle={sourceTitles[source.id]}
                    sourceInfo={sourceInfoForLink(
                      source,
                      installedSources.data,
                    )}
                    busy={busySourceId === source.id}
                    disabled={sourceManagerActionBusy}
                    onSelect={() => onSelectSource(source.id)}
                    onMove={(direction) => {
                      void moveSource(source, direction);
                    }}
                    onRemove={() => confirmRemoveSource(source)}
                  />
                ))}
                {sources.length > 1 ? (
                  <Text
                    style={[
                      styles.dragToReorderHint,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {strings.sourceManager.dragToReorder}
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
          </View>

          {!addPanelOpen ? (
            <NemuButton
              accessibilityLabel={strings.common.done}
              containerStyle={styles.footerButton}
              disabled={sourceManagerActionBusy}
              icon="checkmark-outline"
              label={strings.common.done}
              onPress={handleRequestClose}
              variant="default"
            />
          ) : null}
        </>
      )}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "100%",
    gap: 14,
  },
  listContent: {
    gap: 10,
    paddingBottom: 2,
  },
  confirmationPanel: {
    gap: 14,
  },
  confirmationIconShell: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  confirmationSubject: {
    minHeight: 42,
    justifyContent: "center",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmationSubjectText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  confirmationActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmationAction: {
    flex: 1,
  },
  addPanel: {
    gap: 10,
  },
  modeRow: {
    minHeight: 38,
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    minHeight: 38,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
  },
  modeText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  searchRow: {
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
  },
  searchInputShell: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  searchInput: {
    minHeight: 48,
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  searchButton: {
    width: 48,
    height: 48,
  },
  addResults: {
    gap: 10,
  },
  resultGroup: {
    gap: 7,
  },
  resultGroupHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultGroupTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
  },
  resultPager: {
    flexDirection: "row",
    gap: 6,
  },
  resultPagerButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  addResultRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    padding: 9,
  },
  resultCover: {
    width: 38,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
  },
  resultCoverImage: {
    width: "100%",
    height: "100%",
  },
  resultText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  resultTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  resultSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  smallActionButton: {
    minWidth: 62,
  },
  rowShell: {
    width: "100%",
    minHeight: 64,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  rowHandle: {
    width: 26,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  handleButton: {
    width: 24,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowMainPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceIconImage: {
    width: "100%",
    height: "100%",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  selectedBadge: {
    minHeight: 20,
    flexShrink: 0,
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
  },
  selectedText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  rowSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dragToReorderHint: {
    textAlign: "center",
    fontSize: 11,
    lineHeight: 15,
    paddingTop: 4,
    paddingBottom: 2,
  },
  footerButton: {
    minHeight: 46,
  },
  notice: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  noticeCopy: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
  },
  noticeDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
});
