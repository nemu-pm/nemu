import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatList,
  type ViewInstance,
  type ListRenderItemInfo,
} from "react-native";

/** Column geometry the result grids share (see useMobileFoldAwareGrid). */
type SearchResultGrid = Pick<MobileFoldAwareGridLayout, "columns" | "itemWidth" | "columnMargins">;
import { LinearGradient } from "expo-linear-gradient";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import {
  QuickActionSheet,
  type QuickAction,
} from "@/components/QuickActionSheet";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileListFooter } from "@/components/MobileListFooter";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { MobileSearchSkeleton } from "@/components/MobileSearchSkeleton";
import { MobileSourceChip } from "@/components/MobileSourceChip";
import { MobileSearchSidebar } from "@/components/search/MobileSearchSidebar";
import { MobileSearchSourceIcon } from "@/components/search/MobileSearchSourceIcon";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import { useMobileToast } from "@/components/MobileToastContext";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileLibraryDataChanged,
} from "@/data/mobileDataEvents";
import {
  useInstalledSources,
  useLibraryEntries,
  useMobileLanguageSettings,
} from "@/data/mobileHooks";
import {
  entryHasAnyUpdate,
  getEntryCover,
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
} from "@/data/schema";
import {
  MangaCard,
  MobileCachedImage,
  NemuText,
  NemuNativeSearchField,
  NemuPressable,
  NemuInlineEmptyState,
  PageHeader,
  PageListScaffold,
  PageScaffold,
  createNemuShadowStyle,
  nemuColorWithAlpha,
  nemuText,
  radius,
  nemuFontWeight,
  spacing,
  useMobilePageBleedStyles,
  useMobilePageGutters,
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
import { MOBILE_MANGA_GRID_GAP } from "@/lib/mobileAdaptiveGrid";
import {
  chunkMobileGridRows,
  mobileFoldAwareGridCellStyle,
  type MobileFoldAwareGridLayout,
} from "@/lib/mobileFoldAwareGrid";
import { MobilePaneAlignedView } from "@/lib/MobilePaneAlignedView";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { getMobileSplitPanePadding } from "@/lib/mobileSplitPaneLayout";
import { useMobileSplitPaneLayout } from "@/lib/useMobileSplitPaneLayout";
import {
  MOBILE_SEARCH_SPLIT_OPTIONS,
  resolveMobileSearchSidebarStatuses,
  summarizeMobileSearchSidebarStatuses,
  type MobileSearchSidebarGroupInput,
  type MobileSearchSidebarMemory,
} from "@/lib/mobileSearchLayout";
import {
  addMobileSearchRecent,
  loadMobileSearchRecents,
  saveMobileSearchRecents,
} from "@/lib/mobileSearchRecents";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";
import { findInstalledSourceForLink } from "@/lib/mobileLibraryRefresh";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import {
  coerceMobileNativeSearchText,
  resolveMobileNativeSearchSubmitText,
} from "@/lib/mobileNativeSearchText";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
  sanitizeMobileErrorDiagnostic,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import type { NemuAgentSheetContext } from "@/lib/nemuAgentSheetReducer";
import { readMobileCloudflareUserAgent } from "@/sources/mobileAidokuUserAgent";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  getMobileSourceBrowseSearchHref,
  getMobileSourceMangaHref,
} from "@/lib/mobileSourceRoutes";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { useStableList } from "@/lib/useStableList";
import {
  groupLocalSearchResults,
  canClearMobileSearchQuery,
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
import {
  filterEnabledMobileInstalledSources,
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
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
  onViewAll: (source: SearchSourceDisplay) => void;
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

const SOURCE_FILTER_EDGE_FADE_WIDTH = 24;
/**
 * The source chip row bleeds 2pt past the screen edges (its portrait tuning);
 * the overscan keeps that while the gutters follow the safe area.
 */
const SOURCE_FILTER_BLEED_OVERSCAN = 2;
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

function SourceFilterBar({
  sources,
  strings,
  selectedSourceIds,
  disabled = false,
  onChangeSelection,
  containLeading = false,
}: {
  sources: SearchSourceDisplay[];
  strings: MobileStrings;
  selectedSourceIds: SearchSourceSelection;
  disabled?: boolean;
  onChangeSelection: (selection: SearchSourceSelection) => void;
  /** The row starts at a fold pane edge, not the page edge: no leading bleed. */
  containLeading?: boolean;
}) {
  const { tokens: themeTokens } = useNemuTheme();
  const pageGutters = useMobilePageGutters();
  const pageBleed = useMobilePageBleedStyles(SOURCE_FILTER_BLEED_OVERSCAN);
  const bleed = useMemo(
    () =>
      containLeading
        ? {
            frame: { ...pageBleed.frame, marginLeft: 0 },
            content: { ...pageBleed.content, paddingLeft: 0 },
          }
        : pageBleed,
    [containLeading, pageBleed],
  );
  // The fades cover the edge gutter too, so in landscape a scrolled chip has
  // faded out before it slides under the Dynamic Island. Portrait keeps 24pt.
  // On the side of a vertical system bar column the row no longer bleeds, so
  // its fade is the plain 24pt one at the safe edge.
  const bleedLeft = -bleed.frame.marginLeft;
  const bleedRight = -bleed.frame.marginRight;
  const leadingFadeStyle = useMemo(
    () => ({
      width: SOURCE_FILTER_EDGE_FADE_WIDTH + Math.max(0, Math.min(pageGutters.left, bleedLeft) - spacing.pageX),
    }),
    [bleedLeft, pageGutters.left],
  );
  const trailingFadeStyle = useMemo(
    () => ({
      width: SOURCE_FILTER_EDGE_FADE_WIDTH + Math.max(0, Math.min(pageGutters.right, bleedRight) - spacing.pageX),
    }),
    [bleedRight, pageGutters.right],
  );
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
    <View style={[styles.sourceFilterFrame, bleed.frame]}>
      <ScrollView
        horizontal
        onContentSizeChange={(width) => setContentWidth(width)}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.sourceFilterContent, bleed.content]}
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
          style={[
            styles.sourceFilterFade,
            styles.sourceFilterFadeLeading,
            leadingFadeStyle,
          ]}
        />
      ) : null}
      {showTrailingFade ? (
        <LinearGradient
          pointerEvents="none"
          colors={[fadeTransparent, fadeColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.sourceFilterFade,
            styles.sourceFilterFadeTrailing,
            trailingFadeStyle,
          ]}
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
  grid,
}: {
  group: MobileLiveSearchDisplayGroup;
  strings: MobileStrings;
  action: LiveResultAction;
  grid: SearchResultGrid;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.resultSection}>
      <View style={styles.resultHeader}>
        <MobileSearchSourceIcon source={group.source} size={20} />
        <Text
          numberOfLines={1}
          style={[styles.resultTitle, { color: tokens.mutedForeground }]}
        >
          {group.status === "ready"
            ? `${group.source.name} · ${group.items.length}${group.hasMore ? "+" : ""}`
            : group.source.name}
        </Text>
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
        <>
          <View style={styles.resultsRows}>
            {chunkMobileGridRows(group.items, grid.columns).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.resultsRow}>
                {row.map((item, column) => {
                  const resultKey = `${group.source.id}:${item.id}`;
                  return (
                    <View
                      key={resultKey}
                      style={[styles.resultItem, mobileFoldAwareGridCellStyle(grid, column)]}
                    >
                      <LiveMangaCard
                        item={item}
                        strings={strings}
                        onPress={() => action.onPressResult(group.source, item)}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {group.hasMore ? (
            <NemuPressable
              accessibilityLabel={formatMobileString(
                strings.feedback.viewAllInSource,
                { source: group.source.name },
              )}
              accessibilityRole="button"
              hapticFeedback="selection"
              onPress={() => action.onViewAll(group.source)}
              pressProfile="row"
              style={styles.viewAllAction}
            >
              <NemuText
                variant="actionLabel"
                color={tokens.primary}
                numberOfLines={1}
                style={styles.viewAllText}
              >
                {formatMobileString(strings.feedback.viewAllInSource, {
                  source: group.source.name,
                })}
              </NemuText>
              <Ionicons name="chevron-forward" size={16} color={tokens.primary} />
            </NemuPressable>
          ) : null}
        </>
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
  grid,
}: {
  state: LiveSearchState;
  strings: MobileStrings;
  action: LiveResultAction;
  grid: SearchResultGrid;
}) {
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
              grid={grid}
            />
          ))}
          {hasLoadingGroups ? (
            <MobileListFooter
              loadingLabel={strings.search.searchingSelectedSources}
              state="loading"
              strings={strings}
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
      <MobileSearchSourceIcon source={group.source} size={20} />
      <Text
        numberOfLines={1}
        style={[styles.resultTitle, { color: tokens.mutedForeground }]}
      >
        {`${group.source.name} · ${count}`}
      </Text>
    </View>
  );
});

const LocalSearchResultCard = memo(function LocalSearchResultCard({
  item,
  onLongPressItem,
}: {
  item: MangaCardModel;
  onLongPressItem: (libraryItemId: string) => void;
}) {
  // Keeps the card's callback identity tied to the row, not to the render, so
  // `memo(MangaCard)` can actually hold.
  const handleLongPress = useCallback(() => {
    onLongPressItem(item.id);
  }, [item.id, onLongPressItem]);

  return <MangaCard item={item} onLongPress={handleLongPress} />;
});

const LocalSearchResultItems = memo(function LocalSearchResultItems({
  items,
  grid,
  onLongPressItem,
}: {
  items: MangaCardModel[];
  grid: SearchResultGrid;
  onLongPressItem: (libraryItemId: string) => void;
}) {
  return (
    <View style={styles.resultsRow}>
      {items.map((item, column) => (
        <View key={item.id} style={[styles.resultItem, mobileFoldAwareGridCellStyle(grid, column)]}>
          {/*
            MangaCard's own NemuPressable fires the long-press haptic, so the
            quick menu must not play a second one on the way up.
          */}
          <LocalSearchResultCard
            item={item}
            onLongPressItem={onLongPressItem}
          />
        </View>
      ))}
      {items.length === 1 ? (
        <View
          pointerEvents="none"
          style={[styles.resultItem, mobileFoldAwareGridCellStyle(grid, 1), styles.resultItemSpacer]}
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
  const store = useMobileDataStore();
  const toast = useMobileToast();
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
  const [retryingData, setRetryingData] = useState(false);
  const retryDataGuardRef = useRef(false);
  const [quickActionEntry, setQuickActionEntry] = useState<LibraryEntry | null>(
    null,
  );
  const [membershipSheetEntry, setMembershipSheetEntry] =
    useState<LibraryEntry | null>(null);
  // Bumped by the Nemu Agent sheet's onSuccess to force the live-search effect
  // to re-run after a Cloudflare challenge is solved.
  const [searchRefreshNonce, setSearchRefreshNonce] = useState(0);
  const cloudflareSheetRef = useRef<{
    reportError: (
      error: unknown,
      context?: NemuAgentSheetContext,
    ) => boolean;
  } | null>(null);
  const installed = useInstalledSources();
  const library = useLibraryEntries();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const usesNativeHeader = usesNemuNativeHeader;
  const adaptive = useMobileAdaptiveLayout();
  // Regular widths (Duo inner display, tablets, unfolded foldables): the
  // system would put a header search field in the navigation bar's trailing
  // corner, far from the chips and results. Mirror the web page instead — an
  // in-content field with the source chips right under it. Compact widths
  // (phones, Duo outer display) keep the native header field.
  const usesNativeSearchBar = usesNativeHeader && !adaptive.regularWidth;
  const {
    ref: searchHeaderRef,
    onLayout: onSearchHeaderLayout,
    split: searchHeaderSplit,
  } = useMobileContainerFold<ViewInstance>();
  // Book posture: one header row — field in the leading pane, chips in the
  // trailing pane — so nothing interactive spans the fold.
  const searchHeaderBook = searchHeaderSplit?.axis === "horizontal" ? searchHeaderSplit : null;
  // Wide enough (Duo inner landscape, tablets, unfolded foldables): the Mail /
  // Notes split — search field, sources and recent searches in a sidebar,
  // results beside it; in book posture the panes are the fold halves.
  // Narrower regular widths (Duo inner portrait, notebook) keep the in-content
  // field + chip row above; compact widths keep the native header field.
  const {
    containerRef: splitContainerRef,
    onContainerLayout: onSplitContainerLayout,
    layout: splitLayout,
  } = useMobileSplitPaneLayout(MOBILE_SEARCH_SPLIT_OPTIONS);
  const split = splitLayout.mode === "split" ? splitLayout : null;
  const pageGutters = useMobilePageGutters();
  const splitPadding = useMemo(
    () => getMobileSplitPanePadding({ pageGutters, innerGutter: spacing.pageX }),
    [pageGutters],
  );
  const pose = useMobilePoseTransition();

  const sources = useMemo(
    () =>
      filterEnabledMobileInstalledSources(installed.data).map(
        toSearchSourceDisplay,
      ),
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
  // Stable while the selected subset is unchanged, so another source's
  // package hydration cannot abort and restart a running live search.
  const selectedInstalledSources = useStableList(
    useMemo(
      () => installed.data.filter((source) => selectedLiveSourceIdSet.has(source.id)),
      [installed.data, selectedLiveSourceIdSet],
    ),
  );
  const showSourceFilter = sources.length > 1;
  const resultsListRef = useRef<FlatList<LocalSearchResultRow> | null>(null);
  // The native header field remounts when the window returns to compact
  // width (Duo closed); it is uncontrolled, so hand it the kept query.
  useEffect(() => {
    if (!usesNativeSearchBar || !queryRef.current) return;
    // The bar is attached through the header options after this commit, so
    // its ref can still be empty here: retry briefly until it exists.
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const restore = () => {
      const bar = nativeSearchRef.current;
      if (!bar) {
        attempts += 1;
        if (attempts < 12) timer = setTimeout(restore, 50);
        return;
      }
      // Android's toolbar SearchView remounts iconified (just a search icon),
      // so the kept query would be invisible above its results. Expand it
      // (focus) and drop focus again in the same frame: the field stays open
      // with the query and the keyboard never shows. iOS's bar is always open.
      if (Platform.OS === "android") bar.focus();
      bar.setText(queryRef.current);
      if (Platform.OS === "android") bar.blur();
    };
    timer = setTimeout(restore, 0);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [usesNativeSearchBar]);
  // Result grids size from the list's measured width (Duo's trailing system
  // bars, split panes) with an even column count on regular widths; in book
  // posture the middle gutter sits on the fold.
  const resultGrid = useMobileFoldAwareGrid({
    insets: split
      ? { left: splitPadding.trailing.paddingLeft, right: splitPadding.trailing.paddingRight }
      : undefined,
    getNode: () =>
      resultsListRef.current?.getNativeScrollRef?.() as
        | { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void }
        | null
        | undefined,
  });
  const resultColumns = resultGrid.columns;
  const resultGridItemWidth = resultGrid.itemWidth;
  const resultGridColumnMargins = resultGrid.columnMargins;
  const resultGridCells = useMemo<SearchResultGrid>(
    () => ({ columns: resultColumns, itemWidth: resultGridItemWidth, columnMargins: resultGridColumnMargins }),
    [resultColumns, resultGridColumnMargins, resultGridItemWidth],
  );
  const trimmedQuery = submittedQuery.trim();
  const retainedLiveSearchRef = useRef<{
    query: string;
    result: LiveSearchResult;
  } | null>(null);
  if (liveSearchResult?.state.status === "ready") {
    retainedLiveSearchRef.current = {
      query: trimmedQuery,
      result: liveSearchResult,
    };
  }
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
    const retainedResult = retainedLiveSearchRef.current;
    if (
      retainedResult?.query === trimmedQuery &&
      retainedResult.result.state.status === "ready"
    ) {
      const selectedIds = new Set(
        selectedInstalledSources.map((source) => source.id),
      );
      for (const group of retainedResult.result.state.groups) {
        if (group.status !== "loading" && selectedIds.has(group.source.id)) {
          completedGroups.set(group.source.id, group);
        }
      }
    }
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
              cloudflareSheetRef.current?.reportError(nextError, {
                sourceKey: makeMobileRuntimeSourceKey(
                  normalizeInstalledSource(source),
                ),
                userAgent: readMobileCloudflareUserAgent(nextError),
              });
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
  // Sidebar rows: each source's live-result count (or its searching / failed
  // state) for the current query. Sources outside the scope keep their last
  // answer for the same query, so narrowing to one source never blanks the
  // others (Mail keeps every mailbox's count).
  const sidebarMemoryRef = useRef<MobileSearchSidebarMemory | null>(null);
  const sidebarStatuses = useMemo(() => {
    const groups: MobileSearchSidebarGroupInput[] | null =
      liveSearchState.status === "ready"
        ? liveSearchState.groups.map((group) =>
            group.status === "ready"
              ? { sourceId: group.source.id, status: "ready", count: group.items.length, hasMore: group.hasMore }
              : { sourceId: group.source.id, status: group.status },
          )
        : liveSearchState.status === "loading"
          ? selectedLiveSources.map((source) => ({ sourceId: source.id, status: "loading" as const }))
          : liveSearchState.status === "error"
            ? selectedLiveSources.map((source) => ({ sourceId: source.id, status: "blocked" as const }))
            : null;
    const resolved = resolveMobileSearchSidebarStatuses({
      query: trimmedQuery,
      groups,
      memory: sidebarMemoryRef.current,
    });
    sidebarMemoryRef.current = resolved.memory;
    return resolved.statuses;
  }, [liveSearchState, selectedLiveSources, trimmedQuery]);
  const sidebarAllStatus = useMemo(
    () => summarizeMobileSearchSidebarStatuses(sidebarStatuses, selectedLiveSources.map((source) => source.id)),
    [selectedLiveSources, sidebarStatuses],
  );
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    let mounted = true;
    void loadMobileSearchRecents().then((recents) => {
      if (mounted) setRecentSearches(recents);
    });
    return () => {
      mounted = false;
    };
  }, [sourceProfileScope]);
  const rememberSearch = useCallback((nextQuery: string) => {
    if (!nextQuery) return;
    setRecentSearches((previous) => {
      const next = addMobileSearchRecent(previous, nextQuery);
      void saveMobileSearchRecents(next).catch(() => undefined);
      return next;
    });
  }, []);
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    void saveMobileSearchRecents([]).catch(() => undefined);
  }, []);
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
      const normalized = normalizeSearchSelectionForSources(sources, selection);
      const previousSelection = selectedSourceIds;
      const saveRun = selectionSaveRun.current + 1;
      selectionSaveRun.current = saveRun;
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
        });
    },
    [
      saveSelection,
      selectedSourceIds,
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
    rememberSearch(nextQuery);
    if (options?.haptic && shouldRunFeedback) void hapticPress();
  }, [query, rememberSearch, routeQuery]);

  const clearSearch = useCallback(() => {
    if (!canClearMobileSearchQuery(query)) return;
    queryRef.current = "";
    setQuery("");
    setSubmittedQuery("");
    router.setParams({ q: undefined });
  }, [query]);

  // Sidebar field: clearing it (clear button or deleting every character)
  // returns to the idle page, like Mail's sidebar search.
  const changeSidebarQuery = useCallback((nextQuery: string) => {
    queryRef.current = nextQuery;
    setQuery(nextQuery);
    if (!nextQuery.trim()) {
      setSubmittedQuery("");
      if (routeQuery) router.setParams({ q: undefined });
    }
  }, [routeQuery]);
  const submitSidebarQuery = useCallback(() => {
    submitSearch({ haptic: true, query: queryRef.current });
  }, [submitSearch]);
  const pressRecentSearch = useCallback(
    (recent: string) => {
      Keyboard.dismiss();
      submitSearch({ haptic: true, query: recent });
    },
    [submitSearch],
  );

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
  const handleViewAllInSource = useCallback(
    (source: SearchSourceDisplay) => {
      router.push(
        getMobileSourceBrowseSearchHref({
          registryId: source.registryId,
          sourceId: source.rawSourceId,
          query: trimmedQuery,
        }),
      );
    },
    [trimmedQuery],
  );
  const libraryEntriesById = useMemo(
    () =>
      new Map(library.data.map((entry) => [entry.item.libraryItemId, entry])),
    [library.data],
  );
  const openQuickActionForItem = useCallback(
    (libraryItemId: string) => {
      // `toMangaCard` keys every saved-result card by its library item id, so
      // the pressed card always maps back to a full entry.
      const entry = libraryEntriesById.get(libraryItemId);
      if (entry) setQuickActionEntry(entry);
    },
    [libraryEntriesById],
  );
  const renderLocalSearchRow = useCallback(
    ({ item }: ListRenderItemInfo<LocalSearchResultRow>) => {
      if (item.type === "header") {
        return <LocalSearchResultHeader group={item.group} count={item.count} />;
      }
      return (
        <LocalSearchResultItems
          items={item.items}
          grid={resultGridCells}
          onLongPressItem={openQuickActionForItem}
        />
      );
    },
    [openQuickActionForItem, resultGridCells],
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

  const handleQuickActionMarkAllRead = useCallback(
    async (entry: LibraryEntry) => {
      const now = Date.now();
      let acked = 0;
      try {
        for (const link of entry.sources) {
          if (!link.latestChapter) continue;
          const latest = link.latestChapter.chapterNumber;
          const ack = link.updateAckChapter?.chapterNumber;
          if (latest == null || (ack != null && ack >= latest)) continue;
          await store.saveSourceLink({
            ...link,
            updateAckChapter: link.latestChapter,
            updateAckChapterSortKey: link.latestChapterSortKey,
            updateAckAt: now,
            updatedAt: now,
          });
          acked += 1;
        }
      } catch {
        toast.show({
          tone: "danger",
          title: strings.mangaDetail.actionFailedDetail,
        });
        return;
      }
      if (acked > 0) {
        emitMobileDataChanged("library");
        await hapticConfirm();
      }
      toast.show({
        tone: "success",
        title: strings.feedback.markedAllRead,
      });
    },
    [store, strings, toast],
  );

  const handleQuickActionRemove = useCallback(
    async (entry: LibraryEntry) => {
      try {
        await store.removeLibraryItem(entry.item.libraryItemId);
        emitMobileLibraryDataChanged({ collectionsChanged: true });
      } catch {
        toast.show({
          tone: "danger",
          title: strings.mangaDetail.actionFailedDetail,
        });
        return;
      }
      toast.show({
        tone: "info",
        title: strings.feedback.removedFromLibrary,
        detail: strings.feedback.removedFromLibraryHint,
        action: {
          label: strings.feedback.undo,
          onPress: () => {
            store
              .restoreLibraryItem(entry.item.libraryItemId)
              .then(() =>
                emitMobileLibraryDataChanged({ collectionsChanged: true }),
              )
              .catch(() =>
                toast.show({
                  tone: "danger",
                  title: strings.mangaDetail.actionFailedDetail,
                }),
              );
          },
        },
      });
    },
    [store, strings, toast],
  );

  const quickActionLink = quickActionEntry?.sources[0] ?? null;
  const quickActionSource = useMemo(
    () =>
      quickActionLink
        ? findInstalledSourceForLink(installed.data, quickActionLink)
        : null,
    [installed.data, quickActionLink],
  );
  const quickActionCoverRequest = useMobileSourceImageRequest(
    quickActionSource,
    quickActionEntry ? getEntryCover(quickActionEntry) : null,
  );
  const quickActions = useMemo<QuickAction[]>(() => {
    const entry = quickActionEntry;
    if (!entry) return [];
    const link = quickActionLink;
    const actions: QuickAction[] = [
      {
        id: "markAllRead",
        label: strings.feedback.quickMenuMarkAllRead,
        icon: "checkmark-done-outline",
        onPress: () => {
          setQuickActionEntry(null);
          void handleQuickActionMarkAllRead(entry);
        },
      },
      {
        id: "addToCollection",
        label: strings.feedback.quickMenuAddToCollection,
        icon: "albums-outline",
        onPress: () => {
          setQuickActionEntry(null);
          setMembershipSheetEntry(entry);
        },
      },
    ];
    if (link) {
      actions.push({
        id: "openInSource",
        label: formatMobileString(strings.feedback.quickMenuOpenInSource, {
          source: quickActionSource?.name ?? link.sourceId,
        }),
        icon: "open-outline",
        onPress: () => {
          setQuickActionEntry(null);
          router.push(
            getMobileSourceMangaHref({
              registryId: link.registryId,
              sourceId: link.sourceId,
              mangaId: link.sourceMangaId,
              mangaTitle: getEntryTitle(entry),
            }),
          );
        },
      });
    }
    actions.push({
      id: "remove",
      label: strings.mangaDetail.removeFromLibrary,
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        setQuickActionEntry(null);
        void handleQuickActionRemove(entry);
      },
    });
    return actions;
  }, [
    handleQuickActionMarkAllRead,
    handleQuickActionRemove,
    quickActionEntry,
    quickActionLink,
    quickActionSource,
    strings,
  ]);

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
          <MobilePaneAlignedView>
            {({ minHeight }) => (
              <MobilePageEmpty
                minHeight={minHeight}
                icon="search-outline"
                title={strings.search.noSourcesInstalled}
                description={strings.search.noSourcesDescription}
                actionLabel={strings.search.addSource}
                onActionPress={() => {
                router.navigate("/browse");
                }}
              />
            )}
          </MobilePaneAlignedView>
        </PageScaffold>
      </>
    );
  }

  const resultsList = (
    <PageListScaffold
      listRef={resultsListRef}
      contentContainerStyle={split ? splitPadding.trailing : undefined}
      onLayout={resultGrid.onLayout}
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
      headerSearchBar={usesNativeSearchBar}
      // The idle and no-source states are a fixed page under the pinned
      // header search field: scrolling them only strands the collapsing
      // title and chip row half under it. The in-content field (regular
      // widths, incl. phone landscape) has nothing pinned, and a short
      // window must be able to scroll the placeholder out from under the
      // floating tab bar (the list already pads for it).
      scrollEnabled={!(usesNativeSearchBar && !error && !showSkeleton && (selectedCount === 0 || !trimmedQuery))}
      ListHeaderComponent={
        <>
          {usesNativeHeader ? null : (
            <PageHeader title={strings.nav.search} loading={loading || retryingData} />
          )}
          {error ? (
            <MobilePaneAlignedView>
              {({ minHeight }) => (
                <EmptyLibrary
                  minHeight={minHeight}
                  title={strings.search.searchUnavailable}
                  description={strings.common.sourceErrorDescription}
                  diagnostic={
                    sanitizeMobileErrorDiagnostic(error) ?? error
                  }
                  diagnosticDetailsLabel={strings.errorBoundary.detailsLabel}
                  actionLabel={strings.common.retry}
                  actionDisabled={retryingData}
                  actionLoading={retryingData}
                  onActionPress={() => {
                    void retrySearchData();
                  }}
                />
              )}
            </MobilePaneAlignedView>
          ) : showSkeleton ? (
            <MobileSearchSkeleton
              accessibilityLabel={strings.search.searching}
            />
          ) : (
            <View
              style={[
                styles.sections,
                usesNativeSearchBar ? styles.nativeSearchSections : null,
              ]}
            >
              {split ? null : (
              <View
                ref={searchHeaderRef}
                onLayout={onSearchHeaderLayout}
                collapsable={false}
                style={searchHeaderBook ? styles.searchHeaderRow : styles.searchHeaderStack}
              >
              {usesNativeSearchBar ? null : (
                <View style={searchHeaderBook ? { width: searchHeaderBook.first.width } : null}>
                {/* The same capsule as the sidebar field (SwiftUI TextField on iOS). */}
                <NemuNativeSearchField
                  accessibilityLabel={strings.search.searchInstalledSources}
                  clearAccessibilityLabel={strings.common.clear}
                  clearActionTestID="InstalledSourceSearchClearAction"
                  onChangeText={changeSidebarQuery}
                  onSubmit={submitSidebarQuery}
                  placeholder={strings.search.searchInstalledSources}
                  testID="InstalledSourceSearchField"
                  value={query}
                />
                </View>
              )}

              {showSourceFilter ? (
                <View
                  style={
                    searchHeaderBook
                      ? {
                          width: searchHeaderBook.second.width,
                          marginLeft: searchHeaderBook.gutter.end - searchHeaderBook.first.width,
                          justifyContent: "center",
                        }
                      : null
                  }
                >
                  <SourceFilterBar
                    sources={sources}
                    strings={strings}
                    selectedSourceIds={effectiveSelectedSourceIds}
                    onChangeSelection={changeSelection}
                    containLeading={!!searchHeaderBook}
                  />
                </View>
              ) : null}
              </View>
              )}

              {preferenceError ? (
                <MobileInlineErrorBanner
                  title={strings.search.preferencesFailed}
                  detail={preferenceError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setPreferenceError(null)}
                />
              ) : null}

              {selectedCount === 0 ? (
                <MobilePaneAlignedView>
                  {({ minHeight }) => (
                    <MobilePageEmpty
                      minHeight={minHeight}
                      icon="globe-outline"
                      title={strings.search.noSourcesSelected}
                      description={strings.search.noSourcesSelectedDescription}
                      variant="inline"
                    />
                  )}
                </MobilePaneAlignedView>
              ) : !trimmedQuery ? (
                <MobilePaneAlignedView>
                  {({ minHeight }) => (
                    <MobilePageEmpty
                      minHeight={minHeight}
                      icon="search-outline"
                      title={strings.search.searchForManga}
                      description={strings.search.enterSearchTerm}
                      variant="inline"
                    />
                  )}
                </MobilePaneAlignedView>
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
              <MobilePaneAlignedView>
                {({ minHeight }) => (
                  <MobilePageEmpty
                    minHeight={minHeight}
                    icon="search-outline"
                    title={formatMobileString(strings.search.noSavedMatchesForQuery, {
                      query: trimmedQuery,
                    })}
                    variant="inline"
                  />
                )}
              </MobilePaneAlignedView>
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
                onViewAll: handleViewAllInSource,
              }}
              grid={resultGridCells}
            />
          </View>
        ) : null
      }
    />
  );

  return (
    <>
      {usesNativeHeader ? (
        <>
          <Stack.Screen options={{ title: strings.nav.search }} />
          {usesNativeSearchBar ? (
            <Stack.SearchBar
              ref={nativeSearchRef}
              autoCapitalize="none"
              barTintColor={tokens.card}
              headerIconColor={tokens.primary}
              hideWhenScrolling={false}
              hintTextColor={tokens.mutedForeground}
              obscureBackground={false}
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
          ) : null}
        </>
      ) : null}
      {usesNativeSearchBar ? (
        // Compact: the list stays the screen's direct content so iOS keeps
        // tracking it under the header search field (its inset adjustment
        // and pinned field depend on it).
        resultsList
      ) : (
      <LayoutAnimationConfig skipEntering skipExiting>
      <View
        ref={splitContainerRef}
        onLayout={onSplitContainerLayout}
        style={[
          styles.fill,
          { backgroundColor: tokens.background },
          split ? styles.splitRow : null,
        ]}
      >
      {split ? (
        <Animated.View
          key="sidebar"
          layout={pose.layout}
          entering={pose.entering}
          exiting={pose.exiting}
          style={[
            styles.pane,
            { width: split.leading.width },
            split.alignment === "flat"
              ? { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: tokens.border }
              : null,
          ]}
        >
          <PageListScaffold
            data={NO_SIDEBAR_ROWS}
            renderItem={renderNoSidebarRow}
            nativeHeader={usesNativeHeader}
            contentInsetAdjustmentBehavior={usesNativeHeader ? "automatic" : "never"}
            contentContainerStyle={splitPadding.leading}
            ListHeaderComponent={
              <MobileSearchSidebar
                strings={strings}
                query={query}
                onChangeQuery={changeSidebarQuery}
                onSubmitQuery={submitSidebarQuery}
                sources={sources}
                selection={effectiveSelectedSourceIds}
                statuses={sidebarStatuses}
                allStatus={sidebarAllStatus}
                onChangeSelection={changeSelection}
                recents={recentSearches}
                onPressRecent={pressRecentSearch}
                onClearRecents={clearRecentSearches}
              />
            }
          />
        </Animated.View>
      ) : null}
      {split && split.gutter > 0 ? (
        // The fold band: nothing is drawn or tappable on it.
        <View key="fold" style={{ width: split.gutter }} />
      ) : null}
      <Animated.View
        key="results"
        layout={pose.layout}
        style={split ? [styles.pane, { width: split.trailing.width }] : styles.fill}
      >
      {resultsList}
      </Animated.View>
      </View>
      </LayoutAnimationConfig>
      )}
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
      <QuickActionSheet
        visible={quickActionEntry !== null}
        variant="cover"
        title={quickActionEntry ? getEntryTitle(quickActionEntry) : ""}
        subtitle={quickActionSource?.name ?? quickActionLink?.sourceId}
        image={
          quickActionCoverRequest?.url ??
          (quickActionEntry ? getEntryCover(quickActionEntry) : undefined)
        }
        imageHeaders={quickActionCoverRequest?.headers}
        actions={quickActions}
        testID="MangaQuickActionSheet"
        onClose={() => setQuickActionEntry(null)}
        onDismiss={() => setQuickActionEntry(null)}
      />
      {membershipSheetEntry ? (
        <MobileCollectionMembershipSheet
          visible
          libraryItemId={membershipSheetEntry.item.libraryItemId}
          title={getEntryTitle(membershipSheetEntry)}
          onClose={() => setMembershipSheetEntry(null)}
        />
      ) : null}
    </>
  );
}

const NO_SIDEBAR_ROWS: readonly never[] = [];
function renderNoSidebarRow() {
  return null;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  splitRow: {
    flexDirection: "row",
  },
  pane: {
    height: "100%",
  },
  sections: {
    gap: 14,
  },
  nativeSearchSections: {
    // iOS insets the list for the in-header search bar and adds its own bottom
    // padding under the field; pull the chip row up so it sits ~14pt below the
    // search bar instead of ~30pt. Android lays content out below the toolbar
    // and needs no correction.
    marginTop: Platform.OS === "ios" ? -16 : 0,
  },
  searchHeaderStack: {
    gap: 14,
  },
  searchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Horizontal bleed comes from `useMobilePageBleedStyles` (safe-area aware).
  sourceFilterFrame: {
    position: "relative",
    zIndex: 1,
    overflow: "visible",
  },
  sourceFilterContent: {
    alignItems: "center",
    gap: 8,
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
    ...nemuText.label,
    letterSpacing: 0.48,
    textTransform: "uppercase",
  },
  // Explicit rows (no flex-wrap); column spacing is each cell's marginLeft
  // from mobileFoldAwareGridCellStyle so the fold gutter can differ.
  resultsRows: {
    gap: MOBILE_MANGA_GRID_GAP,
  },
  resultsRow: {
    flexDirection: "row",
  },
  viewAllAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  viewAllText: {
    flexShrink: 1,
    minWidth: 0,
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
