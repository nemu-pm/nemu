import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { MobileSearchSkeleton } from "@/components/MobileSearchSkeleton";
import { MobileSourceChip } from "@/components/MobileSourceChip";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
  useInstalledSources,
  useLibraryEntries,
  useMobileLanguageSettings,
} from "@/data/mobileHooks";
import { entryHasAnyUpdate, getEntryCover, getEntryTitle, type InstalledSource } from "@/data/schema";
import {
  GlassSurface,
  MangaCard,
  MobileCachedImage,
  NemuPressable,
  NemuInlineEmptyState,
  PageHeader,
  PageListScaffold,
  PageScaffold,
  createNemuShadowStyle,
  nemuColorWithAlpha,
  radius,
  nemuFontWeight,
  useNemuTheme,
  usesNemuNativeHeader,
  type MangaCardModel,
} from "@/design-system";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileMangaGridItemWidth,
  MOBILE_MANGA_GRID_GAP,
} from "@/lib/mobileAdaptiveGrid";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import {
  coerceMobileNativeSearchText,
  resolveMobileNativeSearchSubmitText,
} from "@/lib/mobileNativeSearchText";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import { getMobileSourceMangaHref } from "@/lib/mobileSourceRoutes";
import {
  groupLocalSearchResults,
  canClearMobileSearchQuery,
  canChangeMobileSearchSourceSelection,
  normalizeMobileSearchRouteQuery,
  normalizeSearchSelectionForSources,
  resolveSearchSourcePressSelection,
  selectMobileLiveSearchSources,
  shouldRenderMobileSearchSkeleton,
  shouldRunMobileSearchSubmitFeedback,
  shouldShowMobileSearchNoSourcesEmpty,
  toggleAllSearchSources,
  toSearchSourceDisplay,
  type LocalSearchResultGroup,
  type SearchSourceDisplay,
  type SearchSourcePressState,
  type SearchSourceSelection,
} from "@/lib/mobileSearch";
import {
  buildMobileLiveSearchProgressGroups,
  MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY,
  presentMobileLiveSearchGroup,
  searchMobileSource,
  type MobileLiveSearchDisplayGroup,
  type MobileLiveSearchGroup,
  type MobileLiveSearchManga,
} from "@/sources/mobileSourceSearch";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";

type LiveSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; groups: MobileLiveSearchDisplayGroup[] }
  | { status: "error"; detail: string };

type LiveSearchResult = {
  key: string;
  state: Exclude<LiveSearchState, { status: "idle" | "loading" }>;
};

type LiveResultAction = {
  onPressResult: (source: SearchSourceDisplay, manga: MobileLiveSearchManga) => void;
};

type LocalSearchResultRow =
  | {
      type: "header";
      key: string;
      group: LocalSearchResultGroup;
      count: number;
    }
  | {
      type: "items";
      key: string;
      items: MangaCardModel[];
    };

const PAGE_HORIZONTAL_PADDING = 32;
const SOURCE_FILTER_EDGE_FADE_WIDTH = 24;
const LIVE_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_SEARCH_CACHE_LIMIT = 50;
const liveSearchCache = new Map<
  string,
  { result: LiveSearchResult; updatedAt: number }
>();

function readLiveSearchCache(key: string): LiveSearchResult | null {
  const cached = liveSearchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > LIVE_SEARCH_CACHE_TTL_MS) {
    liveSearchCache.delete(key);
    return null;
  }
  return cached.result;
}

function writeLiveSearchCache(result: LiveSearchResult) {
  liveSearchCache.set(result.key, { result, updatedAt: Date.now() });
  while (liveSearchCache.size > LIVE_SEARCH_CACHE_LIMIT) {
    const firstKey = liveSearchCache.keys().next().value;
    if (!firstKey) break;
    liveSearchCache.delete(firstKey);
  }
}

function clearMobileLiveSearchCache(): void {
  liveSearchCache.clear();
}

registerMobileSourceProfileTransitionHandler(
  "live-source-search-cache",
  clearMobileLiveSearchCache,
);

function liveSearchResultIsComplete(result: LiveSearchResult): boolean {
  return (
    result.state.status !== "ready" ||
    result.state.groups.every((group) => group.status !== "loading")
  );
}

function toMangaCard(
  entry: LocalSearchResultGroup["entries"][number],
  strings: MobileStrings
): MangaCardModel {
  return {
    id: entry.item.libraryItemId,
    title: getEntryTitle(entry),
    subtitle: entry.item.metadata.authors?.join(", "),
    badge: entryHasAnyUpdate(entry) ? strings.search.updated : undefined,
    cover: getEntryCover(entry),
  };
}

function SourceIcon({
  source,
  size = 20,
}: {
  source: SearchSourceDisplay;
  size?: number;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.sourceIcon,
        {
          width: size,
          height: size,
          borderRadius: Math.max(5, size * 0.24),
          backgroundColor: tokens.sourceIconGlass,
          borderColor: tokens.border,
        },
      ]}
    >
      {source.icon ? (
        <MobileCachedImage
          fallback={
            <Ionicons
              name="globe-outline"
              size={Math.max(13, size - 8)}
              color={tokens.mutedForeground}
            />
          }
          uriOwnership="source"
          source={{ uri: source.icon }}
          style={styles.sourceIconImage}
        />
      ) : (
        <Ionicons name="globe-outline" size={Math.max(13, size - 8)} color={tokens.mutedForeground} />
      )}
    </View>
  );
}

function SourceFilterBar({
  sources,
  strings,
  selectedSourceIds,
  disabled = false,
  onChangeSelection,
}: {
  sources: SearchSourceDisplay[];
  strings: MobileStrings;
  selectedSourceIds: SearchSourceSelection;
  disabled?: boolean;
  onChangeSelection: (selection: SearchSourceSelection) => void;
}) {
  const { tokens: themeTokens } = useNemuTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const lastPressRef = useRef<SearchSourcePressState>(null);
  const sourceIds = useMemo(() => sources.map((source) => source.id), [sources]);
  const allSelected = selectedSourceIds === null;
  const fadeColor = nemuColorWithAlpha(themeTokens.background, 1);
  const fadeTransparent = nemuColorWithAlpha(themeTokens.background, 0);
  const showLeadingFade = scrollX > 2;
  const showTrailingFade = contentWidth - viewportWidth - scrollX > 2;
  const selected = useMemo(
    () => (selectedSourceIds === null ? new Set(sourceIds) : new Set(selectedSourceIds)),
    [selectedSourceIds, sourceIds]
  );
  const handleSourcePress = useCallback(
    (sourceId: string) => {
      if (disabled) return;
      const result = resolveSearchSourcePressSelection(
        sourceIds,
        selectedSourceIds,
        sourceId,
        lastPressRef.current,
        Date.now()
      );

      lastPressRef.current = result.lastPress;
      onChangeSelection(result.selection);
    },
    [disabled, onChangeSelection, selectedSourceIds, sourceIds]
  );

  return (
    <View style={styles.sourceFilterFrame}>
      <ScrollView
        horizontal
        onContentSizeChange={(width) => setContentWidth(width)}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sourceFilterContent}
      >
        <MobileSourceChip
          accessibilityRole="checkbox"
          accessibilityLabel={strings.search.allSources}
          accessibilityHint={strings.search.allSourcesSelectionHint}
          disabled={disabled}
          fallbackIcon="apps-outline"
          label={strings.search.all}
          onPress={() => {
            if (disabled) return;
            onChangeSelection(toggleAllSearchSources(selectedSourceIds));
          }}
          selected={allSelected}
        />
        {sources.map((source) => (
          <MobileSourceChip
            key={source.id}
            accessibilityHint={
              source.unsupported
                ? strings.common.sourceUnsupportedTachiyomiDescription
                : strings.search.sourceSelectionHint
            }
            accessibilityLabel={
              source.unsupported
                ? `${source.name}. ${strings.common.sourceUnsupported}`
                : formatMobileString(strings.search.sourceAccessibility, {
                    name: source.name,
                  })
            }
            accessibilityRole="checkbox"
            badge={
              source.unsupported
                ? strings.common.sourceUnsupportedBadge
                : undefined
            }
            disabled={disabled || source.unsupported}
            icon={source.icon}
            label={source.name}
            onPress={() => handleSourcePress(source.id)}
            onLongPress={() => {
              if (disabled) return;
              lastPressRef.current = null;
              onChangeSelection([source.id]);
            }}
            selected={selected.has(source.id)}
          />
        ))}
      </ScrollView>
      {showLeadingFade ? (
        <LinearGradient
          pointerEvents="none"
          colors={[fadeColor, fadeTransparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.sourceFilterFade, styles.sourceFilterFadeLeading]}
        />
      ) : null}
      {showTrailingFade ? (
        <LinearGradient
          pointerEvents="none"
          colors={[fadeTransparent, fadeColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.sourceFilterFade, styles.sourceFilterFadeTrailing]}
        />
      ) : null}
    </View>
  );
}

function toLiveMangaSubtitle(item: MobileLiveSearchManga): string | undefined {
  return item.authors?.join(", ") ?? item.tags?.slice(0, 3).join(", ");
}

function LiveMangaCard({
  item,
  strings,
  onPress,
}: {
  item: MobileLiveSearchManga;
  strings: MobileStrings;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  const subtitle = toLiveMangaSubtitle(item);

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.search.openItem,
        title: item.title,
        subtitle,
      })}
      onPress={onPress}
      pressedScale={0.98}
      style={styles.liveCard}
    >
      <View
        style={[
          styles.liveCover,
          {
            backgroundColor: tokens.muted,
            borderColor: tokens.coverBorder,
            ...createNemuShadowStyle({
              color: tokens.shadow,
              offsetY: 3,
              radius: 14,
              elevation: 4,
            }),
          },
        ]}
      >
        {item.cover ? (
          <MobileCachedImage
            fallback={
              <View
                style={[
                  styles.liveCoverPlaceholder,
                  { backgroundColor: tokens.muted },
                ]}
              >
                <Ionicons
                  name="book-outline"
                  size={18}
                  color={tokens.mutedForeground}
                />
              </View>
            }
            uriOwnership="source"
            source={{ uri: item.cover, headers: item.coverHeaders }}
            style={styles.sourceIconImage}
          />
        ) : (
          <View style={[styles.liveCoverPlaceholder, { backgroundColor: tokens.muted }]}>
            <Ionicons name="book-outline" size={18} color={tokens.mutedForeground} />
          </View>
        )}
      </View>
      <View style={styles.liveText}>
        <Text numberOfLines={2} style={[styles.liveTitle, { color: tokens.foreground }]}>
          {item.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.liveSubtitle, { color: tokens.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </NemuPressable>
  );
}

function LiveSourceResultSection({
  group,
  strings,
  action,
  resultItemStyle,
}: {
  group: MobileLiveSearchDisplayGroup;
  strings: MobileStrings;
  action: LiveResultAction;
  resultItemStyle: StyleProp<ViewStyle>;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.resultSection}>
      <View style={styles.resultHeader}>
        <SourceIcon source={group.source} size={24} />
        <Text numberOfLines={1} style={[styles.resultTitle, { color: tokens.foreground }]}>
          {group.source.name}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: tokens.muted }]}>
          <Text style={[styles.countText, { color: tokens.mutedForeground }]}>
            {group.status === "loading"
              ? "..."
              : group.status === "ready"
                ? group.items.length
                : "!"}
          </Text>
        </View>
      </View>

      {group.status === "loading" ? (
        <NemuInlineEmptyState
          icon="search-outline"
          title={strings.search.searching}
        />
      ) : group.status === "blocked" ? (
        <NemuInlineEmptyState
          icon="hardware-chip-outline"
          title={group.title ?? group.detail}
          description={group.title ? group.detail : undefined}
        />
      ) : group.items.length ? (
        <View style={styles.resultsGrid}>
          {group.items.map((item) => {
            const resultKey = `${group.source.id}:${item.id}`;
            return (
              <View key={resultKey} style={[styles.resultItem, resultItemStyle]}>
                <LiveMangaCard
                  item={item}
                  strings={strings}
                  onPress={() => action.onPressResult(group.source, item)}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <NemuInlineEmptyState
          icon="search-outline"
          title={strings.search.noLiveMatches}
        />
      )}
    </View>
  );
}

function LiveSearchResults({
  state,
  strings,
  action,
  resultItemStyle,
}: {
  state: LiveSearchState;
  strings: MobileStrings;
  action: LiveResultAction;
  resultItemStyle: StyleProp<ViewStyle>;
}) {
  const { tokens } = useNemuTheme();

  if (state.status === "idle") return null;
  const hasLoadingGroups =
    state.status === "ready" && state.groups.some((group) => group.status === "loading");

  return (
    <View style={styles.resultSection}>
      {state.status === "loading" ? (
        <NemuInlineEmptyState
          icon="search-outline"
          title={strings.search.searchingSelectedSources}
        />
      ) : state.status === "error" ? (
        <NemuInlineEmptyState
          icon="alert-circle-outline"
          title={state.detail}
          tone="danger"
        />
      ) : (
        <View style={styles.resultStack}>
          {state.groups.map((group) => (
            <LiveSourceResultSection
              key={group.source.id}
              group={group}
              strings={strings}
              action={action}
              resultItemStyle={resultItemStyle}
            />
          ))}
          {hasLoadingGroups ? (
            <ActivityIndicator
              accessibilityLabel={strings.search.searchingSelectedSources}
              color={tokens.primary}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const LocalSearchResultHeader = memo(function LocalSearchResultHeader({
  group,
  count,
}: {
  group: LocalSearchResultGroup;
  count: number;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.resultHeader}>
      <SourceIcon source={group.source} size={24} />
      <Text numberOfLines={1} style={[styles.resultTitle, { color: tokens.foreground }]}>
        {group.source.name}
      </Text>
      <View style={[styles.countBadge, { backgroundColor: tokens.muted }]}>
        <Text style={[styles.countText, { color: tokens.mutedForeground }]}>
          {count}
        </Text>
      </View>
    </View>
  );
});

const LocalSearchResultItems = memo(function LocalSearchResultItems({
  items,
  resultItemStyle,
}: {
  items: MangaCardModel[];
  resultItemStyle: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.resultsGrid}>
      {items.map((item) => (
        <View key={item.id} style={[styles.resultItem, resultItemStyle]}>
          <MangaCard item={item} />
        </View>
      ))}
      {items.length === 1 ? (
        <View
          pointerEvents="none"
          style={[styles.resultItem, resultItemStyle, styles.resultItemSpacer]}
        />
      ) : null}
    </View>
  );
});

function LocalSearchRowSeparator() {
  return <View style={styles.virtualResultSeparator} />;
}

function localSearchRowKey(item: LocalSearchResultRow) {
  return item.key;
}

export function SearchScreen() {
  const sourceProfileScope = getActiveMobileSourceProfileScope();
  const { tokens } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const store = useMobileDataStore();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const routeQuery = normalizeMobileSearchRouteQuery(params.q);
  const [query, setQuery] = useState(routeQuery);
  const queryRef = useRef(routeQuery);
  const nativeSearchRef = useRef<SearchBarCommands | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState(routeQuery);
  const [selectedSourceIds, setSelectedSourceIds] = useState<SearchSourceSelection>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [liveSearchResult, setLiveSearchResult] = useState<LiveSearchResult | null>(null);
  const selectionSaveRun = useRef(0);
  const selectionSavingRef = useRef(false);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [retryingData, setRetryingData] = useState(false);
  const retryDataGuardRef = useRef(false);
  // Bumped by the Nemu Agent sheet's onSuccess to force the live-search effect
  // to re-run after a Cloudflare challenge is solved.
  const [searchRefreshNonce, setSearchRefreshNonce] = useState(0);
  const cloudflareSheetRef = useRef<{ reportError: (error: unknown) => boolean } | null>(null);
  const installed = useInstalledSources();
  const library = useLibraryEntries();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const usesNativeHeader = usesNemuNativeHeader;

  const sources = useMemo(
    () => installed.data.map(toSearchSourceDisplay),
    [installed.data]
  );
  const effectiveSelectedSourceIds = useMemo(
    () => normalizeSearchSelectionForSources(sources, selectedSourceIds),
    [selectedSourceIds, sources]
  );
  const selectedCount = effectiveSelectedSourceIds?.length ?? sources.length;
  const selectedLiveSources = useMemo(
    () => selectMobileLiveSearchSources(sources, effectiveSelectedSourceIds),
    [effectiveSelectedSourceIds, sources],
  );
  const selectedLiveSourceIdSet = useMemo(
    () => new Set(selectedLiveSources.map((source) => source.id)),
    [selectedLiveSources],
  );
  const selectedInstalledSources = useMemo(
    () => installed.data.filter((source) => selectedLiveSourceIdSet.has(source.id)),
    [installed.data, selectedLiveSourceIdSet],
  );
  const showSourceFilter = sources.length > 1;
  const resultItemWidth = useMemo(
    () =>
      getMobileMangaGridItemWidth({
        windowWidth,
        horizontalPadding: PAGE_HORIZONTAL_PADDING,
      }),
    [windowWidth],
  );
  const resultItemStyle = useMemo(
    () => ({
      width: resultItemWidth,
    }),
    [resultItemWidth],
  );
  const resultColumns = useMemo(() => {
    const contentWidth = Math.max(0, windowWidth - PAGE_HORIZONTAL_PADDING);
    return Math.max(
      1,
      Math.floor(
        (contentWidth + MOBILE_MANGA_GRID_GAP) /
          (resultItemWidth + MOBILE_MANGA_GRID_GAP),
      ),
    );
  }, [resultItemWidth, windowWidth]);
  const trimmedQuery = submittedQuery.trim();
  const resultGroups = useMemo(
    () => groupLocalSearchResults(library.data, sources, effectiveSelectedSourceIds, trimmedQuery),
    [effectiveSelectedSourceIds, library.data, sources, trimmedQuery]
  );
  const totalResults = resultGroups.reduce((sum, group) => sum + group.entries.length, 0);
  const visibleLocalResultGroups = useMemo(
    () => resultGroups.filter((group) => group.entries.length > 0),
    [resultGroups],
  );
  const localSearchRows = useMemo<LocalSearchResultRow[]>(() => {
    const rows: LocalSearchResultRow[] = [];
    for (const group of visibleLocalResultGroups) {
      const items = group.entries.map((entry) => toMangaCard(entry, strings));
      if (!items.length) continue;
      rows.push({
        type: "header",
        key: `${group.source.id}:header`,
        group,
        count: items.length,
      });
      for (let index = 0; index < items.length; index += resultColumns) {
        rows.push({
          type: "items",
          key: `${group.source.id}:items:${index}`,
          items: items.slice(index, index + resultColumns),
        });
      }
    }
    return rows;
  }, [resultColumns, strings, visibleLocalResultGroups]);
  const loading = installed.loading || library.loading || !settingsLoaded;
  const error = installed.error ?? library.error;
  const showSkeleton = shouldRenderMobileSearchSkeleton({
    loading,
    settingsLoaded,
    installedCount: installed.data.length,
    libraryCount: library.data.length,
    hasError: Boolean(error),
  });
  const canChangeSourceSelection = canChangeMobileSearchSourceSelection({
    savingSelection: selectionSaving,
  });
  const liveSearchKey = useMemo(() => {
    if (
      !trimmedQuery ||
      selectedInstalledSources.length === 0 ||
      installed.loading ||
      !settingsLoaded
    ) {
      return null;
    }
    const selectionKey = effectiveSelectedSourceIds?.join(",") ?? "*";
    const sourceKey = selectedInstalledSources
      .map((source) => `${source.id}:${source.updatedAt ?? 0}:${source.packageCacheKey ?? ""}`)
      .join("|");
    return `${sourceProfileScope}:${trimmedQuery}:${selectionKey}:${sourceKey}:${searchRefreshNonce}`;
  }, [
    effectiveSelectedSourceIds,
    installed.loading,
    searchRefreshNonce,
    selectedInstalledSources,
    settingsLoaded,
    sourceProfileScope,
    trimmedQuery,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!liveSearchKey) {
      setLiveSearchResult(null);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const cachedResult = readLiveSearchCache(liveSearchKey);
    if (cachedResult) {
      setLiveSearchResult(cachedResult);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const completedGroups = new Map<string, MobileLiveSearchGroup>();
    const compareTitles = trimmedQuery ? [trimmedQuery] : [];
    const publishProgress = () => {
      const result: LiveSearchResult = {
        key: liveSearchKey,
        state: {
          status: "ready",
          groups: buildMobileLiveSearchProgressGroups(
            selectedInstalledSources,
            Array.from(completedGroups.values()),
            compareTitles,
          ),
        },
      };
      setLiveSearchResult(result);
      if (liveSearchResultIsComplete(result)) {
        writeLiveSearchCache(result);
      }
    };
    const getSourceSettings = async (
      _sourceKey: string,
      source: InstalledSource,
    ) => {
      const normalized = normalizeInstalledSource(source);
      const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
      const saved = await loadMobileSourceSettingsByKeys(store, [
        runtimeSourceKey,
        ...getMobileInstalledSourceSettingsKeys(source),
      ]);
      return mergeSourceSettingValues(
        source.packageMetadata?.settings ?? [],
        saved?.values,
      );
    };

    publishProgress();

    void (async () => {
      let nextSourceIndex = 0;
      const searchNextSource = async () => {
        while (!cancelled) {
          const source = selectedInstalledSources[nextSourceIndex];
          nextSourceIndex += 1;
          if (!source) return;
          const group = await searchMobileSource(source, trimmedQuery, {
            getSourceSettings,
            signal: controller.signal,
          }).catch((nextError): MobileLiveSearchGroup => {
            const presentation = getMobileSourceErrorPresentation(
              nextError,
              strings,
            );
            // A prior query may reject after its effect has been replaced.
            // Never let that stale failure open an auth/bypass sheet over the
            // current query (or after this screen has unmounted).
            if (!cancelled && !controller.signal.aborted) {
              cloudflareSheetRef.current?.reportError(nextError);
            }
            return {
              status: "blocked",
              source: toSearchSourceDisplay(source),
              reason: "search-failed",
              title: presentation.title,
              detail: presentation.detail,
            };
          });
          if (cancelled) break;
          const displayGroup = presentMobileLiveSearchGroup(group, strings);
          completedGroups.set(source.id, displayGroup);
          publishProgress();
        }
      };
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY,
              selectedInstalledSources.length,
            ),
          },
          () => searchNextSource(),
        ),
      );
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    liveSearchKey,
    selectedInstalledSources,
    store,
    strings,
    trimmedQuery,
  ]);

  const liveSearchState = useMemo<LiveSearchState>(() => {
    if (!liveSearchKey) return { status: "idle" };
    if (liveSearchResult?.key !== liveSearchKey) return { status: "loading" };
    return liveSearchResult.state;
  }, [liveSearchKey, liveSearchResult]);
  const showSavedEmptyState =
    trimmedQuery.length > 0 &&
    totalResults === 0 &&
    liveSearchState.status === "idle";

  useEffect(() => {
    queryRef.current = routeQuery;
    setQuery(routeQuery);
    setSubmittedQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        setSelectedSourceIds(settings.searchSelectedSourceIds ?? null);
        setPreferenceError(null);
      })
      .catch((nextError) => {
        if (!mounted) return;
        setPreferenceError(
          describeMobileErrorDetail(
            nextError,
            strings.search.preferencesLoadFailedDetail,
          ),
        );
        void hapticError();
      })
      .finally(() => {
        if (mounted) setSettingsLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [store, strings.search.preferencesLoadFailedDetail]);

  const saveSelection = useCallback(
    async (selection: SearchSourceSelection) => {
      await store.updateSettings((settings) => ({
        ...settings,
        searchSelectedSourceIds: selection ?? undefined,
      }));
      emitMobileDataChanged("settings");
    },
    [store]
  );

  const changeSelection = useCallback(
    (selection: SearchSourceSelection) => {
      if (
        !canChangeMobileSearchSourceSelection({
          savingSelection: selectionSavingRef.current || selectionSaving,
        })
      ) {
        return;
      }

      const normalized = normalizeSearchSelectionForSources(sources, selection);
      const previousSelection = selectedSourceIds;
      const saveRun = selectionSaveRun.current + 1;
      selectionSaveRun.current = saveRun;
      selectionSavingRef.current = true;
      setSelectionSaving(true);
      setPreferenceError(null);
      setSelectedSourceIds(normalized);
      void saveSelection(normalized)
        .then(() => {
          if (selectionSaveRun.current === saveRun) {
            setPreferenceError(null);
          }
        })
        .catch((nextError) => {
          if (selectionSaveRun.current !== saveRun) return;
          setSelectedSourceIds(previousSelection);
          setPreferenceError(
            describeMobileErrorDetail(
              nextError,
              strings.search.preferencesSaveFailedDetail,
            ),
          );
          void hapticError();
        })
        .finally(() => {
          if (selectionSaveRun.current === saveRun) {
            selectionSavingRef.current = false;
            setSelectionSaving(false);
          }
        });
    },
    [
      saveSelection,
      selectedSourceIds,
      selectionSaving,
      sources,
      strings.search.preferencesSaveFailedDetail,
    ]
  );

  const submitSearch = useCallback((options?: { haptic?: boolean; query?: string }) => {
    const rawQuery = options?.query ?? query;
    const nextQuery = normalizeMobileSearchRouteQuery(rawQuery);
    const shouldRunFeedback = shouldRunMobileSearchSubmitFeedback(rawQuery, routeQuery);
    queryRef.current = nextQuery;
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
    if (nextQuery !== routeQuery) {
      router.setParams({ q: nextQuery });
    }
    if (options?.haptic && shouldRunFeedback) void hapticPress();
  }, [query, routeQuery]);

  const clearSearch = useCallback(() => {
    if (!canClearMobileSearchQuery(query)) return;
    queryRef.current = "";
    setQuery("");
    setSubmittedQuery("");
    router.setParams({ q: undefined });
    void hapticPress();
  }, [query]);

  const handleLiveResultPress = useCallback(
    (source: SearchSourceDisplay, manga: MobileLiveSearchManga) => {
      router.push(
        getMobileSourceMangaHref({
          registryId: source.registryId,
          sourceId: source.rawSourceId,
          mangaId: manga.id,
          mangaTitle: manga.title,
        }),
      );
    },
    []
  );
  const renderLocalSearchRow = useCallback(
    ({ item }: ListRenderItemInfo<LocalSearchResultRow>) => {
      if (item.type === "header") {
        return <LocalSearchResultHeader group={item.group} count={item.count} />;
      }
      return (
        <LocalSearchResultItems
          items={item.items}
          resultItemStyle={resultItemStyle}
        />
      );
    },
    [resultItemStyle],
  );

  const retrySearchData = async () => {
    if (retryDataGuardRef.current) return;

    retryDataGuardRef.current = true;
    setRetryingData(true);
    try {
      await Promise.all([installed.reload(), library.reload()]);
      await hapticConfirm();
    } catch {
      await hapticError();
    } finally {
      retryDataGuardRef.current = false;
      setRetryingData(false);
    }
  };

  const cloudflareSheet = useNemuAgentSheet({
    onSuccess: () => setSearchRefreshNonce((value) => value + 1),
  });
  cloudflareSheetRef.current = cloudflareSheet;

  if (
    shouldShowMobileSearchNoSourcesEmpty({
      loading,
      installedCount: installed.data.length,
      hasError: Boolean(error),
    })
  ) {
    return (
      <>
        {usesNativeHeader ? (
          <Stack.Screen options={{ title: strings.nav.search }} />
        ) : null}
        <PageScaffold nativeHeader={usesNativeHeader}>
          {usesNativeHeader ? null : <PageHeader title={strings.nav.search} />}
          <MobilePageEmpty
            icon="search-outline"
            title={strings.search.noSourcesInstalled}
            description={strings.search.noSourcesDescription}
            actionLabel={strings.search.addSource}
            onActionPress={() => {
              router.navigate("/browse");
            }}
          />
        </PageScaffold>
      </>
    );
  }

  return (
    <>
      {usesNativeHeader ? (
        <>
          <Stack.Screen options={{ title: strings.nav.search }} />
          <Stack.SearchBar
            ref={nativeSearchRef}
            autoCapitalize="none"
            barTintColor={tokens.card}
            headerIconColor={tokens.primary}
            hideWhenScrolling={false}
            hintTextColor={tokens.mutedForeground}
            obscureBackground={false}
            onBlur={() =>
              submitSearch({
                query: resolveMobileNativeSearchSubmitText(
                  undefined,
                  queryRef.current,
                ),
              })
            }
            onCancelButtonPress={clearSearch}
            onChangeText={(event) => {
              const nextQuery = coerceMobileNativeSearchText(
                event.nativeEvent.text,
              );
              queryRef.current = nextQuery;
              setQuery(nextQuery);
            }}
            onClose={clearSearch}
            onSearchButtonPress={(event) => {
              nativeSearchRef.current?.blur();
              submitSearch({
                haptic: true,
                query: resolveMobileNativeSearchSubmitText(
                  event.nativeEvent.text,
                  queryRef.current,
                ),
              });
            }}
            placeholder={strings.search.searchInstalledSources}
            placement="automatic"
            textColor={tokens.foreground}
            tintColor={tokens.primary}
          />
        </>
      ) : null}
      <PageListScaffold
        data={!error && !showSkeleton && selectedCount > 0 && trimmedQuery ? localSearchRows : []}
        keyExtractor={localSearchRowKey}
        renderItem={renderLocalSearchRow}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={32}
        windowSize={7}
        ItemSeparatorComponent={LocalSearchRowSeparator}
        nativeHeader={usesNativeHeader}
        contentInsetAdjustmentBehavior={usesNativeHeader ? "automatic" : "never"}
        ListHeaderComponent={
          <>
            {usesNativeHeader ? null : (
              <PageHeader title={strings.nav.search} loading={loading || retryingData} />
            )}
            {error ? (
              <EmptyLibrary
                title={strings.search.searchUnavailable}
                description={error}
                actionLabel={strings.common.retry}
                actionDisabled={retryingData}
                actionLoading={retryingData}
                onActionPress={() => {
                  void retrySearchData();
                }}
              />
            ) : showSkeleton ? (
              <MobileSearchSkeleton
                accessibilityLabel={strings.search.searching}
              />
            ) : (
              <View
                style={[
                  styles.sections,
                  usesNativeHeader ? styles.nativeSearchSections : null,
                ]}
              >
                {usesNativeHeader ? null : (
                  <GlassSurface style={styles.searchShell} contentStyle={styles.searchContent}>
                  <Ionicons name="search-outline" size={20} color={tokens.mutedForeground} />
                  <TextInput
                    accessibilityLabel={strings.search.searchInstalledSources}
                    accessibilityRole="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                    enterKeyHint="search"
                    placeholder={strings.search.searchInstalledSources}
                    placeholderTextColor={tokens.mutedForeground}
                    returnKeyType="search"
                    selectionColor={tokens.primary}
                    value={query}
                    onBlur={() =>
                      submitSearch({ query: queryRef.current })
                    }
                    onChangeText={(nextQuery) => {
                      queryRef.current = nextQuery;
                      setQuery(nextQuery);
                    }}
                    onSubmitEditing={() =>
                      submitSearch({
                        haptic: true,
                        query: queryRef.current,
                      })
                    }
                    style={[styles.input, { color: tokens.foreground }]}
                  />
                  {canClearMobileSearchQuery(query) ? (
                    <NemuPressable
                      accessibilityLabel={strings.common.clear}
                      accessibilityRole="button"
                      onPress={clearSearch}
                      pressedScale={0.94}
                      style={[styles.clearButton, { backgroundColor: tokens.muted }]}
                    >
                      <Ionicons
                        name="close-outline"
                        size={17}
                        color={tokens.mutedForeground}
                      />
                    </NemuPressable>
                  ) : null}
                  {loading ? <ActivityIndicator color={tokens.primary} /> : null}
                  </GlassSurface>
                )}

                {showSourceFilter ? (
                  <SourceFilterBar
                    sources={sources}
                    strings={strings}
                    selectedSourceIds={effectiveSelectedSourceIds}
                    disabled={!canChangeSourceSelection}
                    onChangeSelection={changeSelection}
                  />
                ) : null}

                {preferenceError ? (
                  <MobileInlineErrorBanner
                    title={strings.search.preferencesFailed}
                    detail={preferenceError}
                    dismissLabel={strings.common.clear}
                    onDismiss={() => setPreferenceError(null)}
                  />
                ) : null}

                {selectedCount === 0 ? (
                  <MobilePageEmpty
                    icon="globe-outline"
                    title={strings.search.noSourcesSelected}
                    description={strings.search.noSourcesSelectedDescription}
                    variant="inline"
                  />
                ) : !trimmedQuery ? (
                  <MobilePageEmpty
                    icon="search-outline"
                    title={strings.search.searchForManga}
                    description={strings.search.enterSearchTerm}
                    variant="inline"
                  />
                ) : null}

                {trimmedQuery && localSearchRows.length > 0 ? (
                  <View style={styles.resultKindHeader}>
                    <Ionicons
                      name="library-outline"
                      size={18}
                      color={tokens.mutedForeground}
                    />
                    <Text
                      accessibilityRole="header"
                      style={[
                        styles.resultKindTitle,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {strings.nav.library}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </>
        }
        ListFooterComponent={
          !error && !showSkeleton && selectedCount > 0 && trimmedQuery ? (
            <View style={styles.resultFooter}>
              {showSavedEmptyState ? (
                <MobilePageEmpty
                  icon="search-outline"
                  title={formatMobileString(strings.search.noSavedMatchesForQuery, {
                    query: trimmedQuery,
                  })}
                  variant="inline"
                />
              ) : null}

              {liveSearchState.status !== "idle" ? (
                <View style={styles.resultKindHeader}>
                  <Ionicons
                    name="globe-outline"
                    size={18}
                    color={tokens.mutedForeground}
                  />
                  <Text
                    accessibilityRole="header"
                    style={[
                      styles.resultKindTitle,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {strings.search.liveSourceResults}
                  </Text>
                </View>
              ) : null}

              <LiveSearchResults
                state={liveSearchState}
                strings={strings}
                action={{
                  onPressResult: handleLiveResultPress,
                }}
                resultItemStyle={resultItemStyle}
              />
            </View>
          ) : null
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
  sections: {
    gap: 14,
  },
  nativeSearchSections: {
    marginTop: 0,
  },
  searchShell: {
    minHeight: 52,
    borderRadius: radius.xl,
  },
  searchContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    lineHeight: 20,
  },
  clearButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  sourceFilterFrame: {
    marginHorizontal: -18,
    position: "relative",
    zIndex: 1,
    overflow: "visible",
  },
  sourceFilterContent: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 10,
  },
  sourceFilterFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: SOURCE_FILTER_EDGE_FADE_WIDTH,
  },
  sourceFilterFadeLeading: {
    left: 0,
  },
  sourceFilterFadeTrailing: {
    right: 0,
  },
  sourceIcon: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceIconImage: {
    width: "100%",
    height: "100%",
  },
  resultStack: {
    gap: 18,
  },
  resultFooter: {
    gap: 18,
    marginTop: 18,
  },
  resultKindHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultKindTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  virtualResultSeparator: {
    height: 10,
  },
  resultSection: {
    gap: 10,
  },
  resultHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  resultTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.semibold,
  },
  countBadge: {
    minWidth: 28,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  resultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: MOBILE_MANGA_GRID_GAP,
  },
  resultItem: {
    minWidth: 0,
  },
  resultItemSpacer: {
    opacity: 0,
  },
  liveCard: {
    flex: 1,
    minWidth: 0,
  },
  liveCover: {
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveCoverPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  liveText: {
    // `minHeight` keeps the grid rows aligned while letting wrapped CJK titles
    // grow instead of being clipped by a fixed box.
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  liveTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  liveSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
  },
});
