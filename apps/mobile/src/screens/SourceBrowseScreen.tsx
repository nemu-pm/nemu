import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  FilterType,
  type GroupFilter,
  type Listing,
  type MultiSelectValue,
} from "@/sources/aidokuContract";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import { nextSyncTimestamp } from "@nemu/core";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import {
  SourceHomeSkeletonView,
  SourceHomeView,
} from "@/components/SourceHomeView";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileSettingsDataChanged } from "@/data/mobileDataEvents";
import {
  useInstalledSources,
  useMobileLanguageSettings,
  useSourceSettings,
} from "@/data/mobileHooks";
import {
  type SourcePackageListing,
  type SourcePackageMetadata,
  type SourcePackageSetting,
  type InstalledSource,
} from "@/data/schema";
import {
  GlassSurface,
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuButton,
  NemuInlineEmptyState,
  NemuNativeProgressView,
  NemuPressable,
  PageListScaffold,
  PageScaffold,
  createNemuNativeScreenOptions,
  createNemuShadowStyle,
  nemuColorWithAlpha,
  radius,
  renderNemuNativeToolbarButtons,
  nemuFontWeight,
  useNemuTheme,
  type NemuNativeHeaderAction,
} from "@/design-system";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  getMobileMangaGridColumns,
  MOBILE_MANGA_GRID_GAP,
} from "@/lib/mobileAdaptiveGrid";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesRoute,
} from "@/lib/mobileInstalledSourceKeys";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import { coerceMobileNativeSearchText } from "@/lib/mobileNativeSearchText";
import {
  createMobileIdleTaskCoordinator,
  type MobileIdleTaskCoordinator,
} from "@/lib/mobileIdleTask";
import {
  describeMobileErrorDetail,
  getMobileRuntimeUnavailableDetail,
  getMobileSourceErrorPresentation,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import {
  toSearchSourceDisplay,
  type SearchSourceDisplay,
} from "@/lib/mobileSearch";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import {
  canLoadMoreMobileSourceBrowseResults,
  isMobileSourceBrowseLoadMoreBusy,
} from "@/lib/mobileSourceBrowsePagination";
import {
  compactMobileSourceFilterValues,
  canSelectMobileSourceSortFilterOption,
  getMobileActiveSourceFilterCount,
  getMobileInlineSourceFilters,
  getMobileCheckFilterState,
  getNextMobileCheckFilterValue,
  getMobileSortFilterSelection,
  updateMobileSourceFilterValues,
} from "@/lib/mobileSourceFilterValues";
import {
  loadMobileSourceSettingsByKeys,
  makeMobileSourceKey,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  canSelectMobileSourceBrowseTab,
  getDefaultMobileSourceBrowseListingId,
  getMobileSourceBrowseListingIdForRouteTab,
  getMobileSourceBrowseListingTabCount,
  getMobileSourceBrowseRouteTabForListingId,
  makeMobileSourceHomeGenerationKey,
  hasMobileSourceBrowseRouteQuery,
  isMobileSourceBrowseHomeTabPending,
  normalizeMobileSourceBrowseRouteQuery,
  normalizeMobileSourceBrowseRouteTab,
  shouldPreserveSourceBrowseSearchItemsOnDeactivate,
  shouldRenderMobileSourceBrowseSearchHeader,
  shouldRunMobileSourceBrowseSearchSubmitFeedback,
  shouldShowCenterSourceBrowseSearchProgress,
  shouldShowMobileSourceBrowseListingTabBar,
  shouldShowMobileSourceBrowseNotInstalled,
  shouldShowSourceBrowseBootstrapping,
  shouldShowSourceBrowseHomeSkeleton,
  shouldFetchMobileSourceHome,
} from "@/lib/mobileSourceBrowseRoute";
import {
  getMobileSourceMangaHref,
  normalizeMobileSourceRouteParam,
} from "@/lib/mobileSourceRoutes";
import type { NemuPressableHapticFeedback } from "@/lib/nemuPressable";
import {
  getMobileSourceListingEmptyTitle,
  getMobileSourceListingLabel,
  mergeMobileSourceListingTabs,
} from "@/lib/mobileSourceListingsPresentation";
import type {
  Filter,
  FilterValue,
  HomeLayout,
} from "@/sources/mobileSourceExecutor";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import {
  fetchMobileSourceListing,
  type MobileSourceListingResult,
} from "@/sources/mobileSourceListings";
import {
  fetchMobileSourceFilters,
  type MobileSourceFiltersResult,
} from "@/sources/mobileSourceFilters";
import { hashSettings } from "@/sources/mobileSourceExecutorCache";
import {
  fetchMobileSourceBrowseMetadata,
  type MobileSourceBrowseMetadataResult,
} from "@/sources/mobileSourceBrowseMetadata";
import {
  fetchMobileSourceHome,
  type MobileSourceHomeResult,
} from "@/sources/mobileSourceHome";
import {
  searchMobileSource,
  type MobileLiveSearchGroup,
  type MobileLiveSearchManga,
} from "@/sources/mobileSourceSearch";
import {
  DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS,
  isMobileSourceOperationTimeoutError,
  withMobileSourceOperationTimeout,
} from "@/sources/mobileSourceOperationTimeout";

const EMPTY_SOURCE_SETTINGS: SourcePackageSetting[] = [];
const INLINE_SOURCE_FILTER_LIMIT = 8;
const INLINE_FILTER_OPTION_LIMIT = 8;
const INLINE_GENRE_OPTION_LIMIT = 10;
const SOURCE_BROWSE_HORIZONTAL_PADDING = 32;
const SOURCE_BROWSE_TAB_EDGE_FADE_WIDTH = 26;
const SOURCE_OPERATION_TIMEOUT_MS = DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS;

function withSourceOperationTimeout<T>(
  operation: Promise<T>,
  message: string,
): Promise<T> {
  return withMobileSourceOperationTimeout(operation, {
    timeoutMs: SOURCE_OPERATION_TIMEOUT_MS,
    message,
  });
}

function sameSourcePackageMetadata(
  left: SourcePackageMetadata | null | undefined,
  right: SourcePackageMetadata | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

type ListingBrowseState =
  | { status: "idle"; items: MobileLiveSearchManga[]; detail: string }
  | { status: "loading"; items: MobileLiveSearchManga[]; detail: string }
  | {
      status: "ready";
      result: Extract<MobileSourceListingResult, { status: "ready" }>;
      items: MobileLiveSearchManga[];
    }
  | {
      status: "blocked";
      result: Extract<MobileSourceListingResult, { status: "blocked" }>;
      items: MobileLiveSearchManga[];
    }
  | { status: "error"; items: MobileLiveSearchManga[]; detail: string };

const SOURCE_LISTING_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_LISTING_CACHE_LIMIT = 80;
const sourceListingCache = new Map<
  string,
  { state: ListingBrowseState; updatedAt: number }
>();

function readSourceListingCache(key: string): ListingBrowseState | null {
  const cached = sourceListingCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > SOURCE_LISTING_CACHE_TTL_MS) {
    sourceListingCache.delete(key);
    return null;
  }
  return cached.state;
}

function writeSourceListingCache(key: string, state: ListingBrowseState) {
  if (state.status === "idle" || state.status === "loading") return;
  sourceListingCache.set(key, { state, updatedAt: Date.now() });
  while (sourceListingCache.size > SOURCE_LISTING_CACHE_LIMIT) {
    const firstKey = sourceListingCache.keys().next().value;
    if (!firstKey) break;
    sourceListingCache.delete(firstKey);
  }
}

function clearSourceListingCacheForRuntime(
  sourceRuntimeKey: string | null,
  profileScope = getActiveMobileSourceProfileScope(),
) {
  if (!sourceRuntimeKey) return;
  const prefix = `${profileScope}:${sourceRuntimeKey}:`;
  for (const key of sourceListingCache.keys()) {
    if (key.startsWith(prefix)) sourceListingCache.delete(key);
  }
}

function clearMobileSourceListingCache(): void {
  sourceListingCache.clear();
}

registerMobileSourceProfileTransitionHandler(
  "source-listing-cache",
  clearMobileSourceListingCache,
);

type SourceFiltersState =
  | { status: "idle"; filters: Filter[]; detail: string }
  | { status: "loading"; filters: Filter[]; detail: string }
  | {
      status: "ready";
      result: Extract<MobileSourceFiltersResult, { status: "ready" }>;
      filters: Filter[];
    }
  | {
      status: "blocked";
      result: Extract<MobileSourceFiltersResult, { status: "blocked" }>;
      filters: Filter[];
    }
  | { status: "error"; filters: Filter[]; detail: string };

type SourceBrowseMetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      result: Extract<MobileSourceBrowseMetadataResult, { status: "ready" }>;
    }
  | {
      status: "blocked";
      result: Extract<MobileSourceBrowseMetadataResult, { status: "blocked" }>;
    }
  | { status: "error"; detail: string };

type SourceSearchState =
  | { status: "idle"; items: MobileLiveSearchManga[]; detail: string }
  | { status: "loading"; items: MobileLiveSearchManga[]; detail: string }
  | {
      status: "ready";
      result: Extract<MobileLiveSearchGroup, { status: "ready" }>;
      items: MobileLiveSearchManga[];
      page: number;
    }
  | {
      status: "blocked";
      result: Extract<MobileLiveSearchGroup, { status: "blocked" }>;
      items: MobileLiveSearchManga[];
    }
  | { status: "error"; items: MobileLiveSearchManga[]; detail: string };

type SourceHomeState =
  | { status: "idle"; home: null; detail: string }
  | { status: "loading"; home: HomeLayout | null; detail: string }
  | {
      status: "ready";
      result: Extract<MobileSourceHomeResult, { status: "ready" }>;
      home: HomeLayout | null;
    }
  | {
      status: "blocked";
      result: Extract<MobileSourceHomeResult, { status: "blocked" }>;
      home: null;
    }
  | { status: "error"; home: HomeLayout | null; detail: string };

function filterSourceBrowseControls(filters: Filter[]): Filter[] {
  return filters.filter(
    (filter) =>
      filter.type !== FilterType.Title && filter.type !== FilterType.Author,
  );
}

function sourceFiltersFromBrowseMetadata(
  result: Extract<MobileSourceBrowseMetadataResult, { status: "ready" }>,
): SourceFiltersState {
  return {
    status: "ready",
    result: {
      status: "ready",
      source: result.source,
      runtime: result.runtime,
      filters: result.filters,
    },
    filters: filterSourceBrowseControls(result.filters),
  };
}

function sourceFiltersBlockedFromBrowseMetadata(
  result: Extract<MobileSourceBrowseMetadataResult, { status: "blocked" }>,
): SourceFiltersState {
  return {
    status: "blocked",
    result: {
      status: "blocked",
      source: result.source,
      reason: result.reason,
      detail: result.detail,
    },
    filters: [],
  };
}

function formatSourceBrowseCount(
  count: number,
  singularTemplate: string,
  pluralTemplate: string,
) {
  return formatMobileString(count === 1 ? singularTemplate : pluralTemplate, {
    count,
  });
}

function liveMangaSubtitle(item: MobileLiveSearchManga): string | undefined {
  return item.authors?.join(", ") ?? item.tags?.slice(0, 3).join(", ");
}

function SourceBrowseBlockedNotice({
  detail,
  strings,
}: {
  detail: string;
  strings: MobileStrings;
}) {
  const presentation = getMobileSourceErrorPresentation(detail, strings);

  return (
    <NemuInlineEmptyState
      icon="hardware-chip-outline"
      title={presentation.title}
      description={presentation.detail}
    />
  );
}

function filterValueKey(filter: Filter): string {
  return filter.name;
}

function filterOptionValue(filter: Filter, index: number): string {
  if (filter.type !== FilterType.Select && filter.type !== FilterType.Genre) {
    return String(index);
  }
  return filter.ids?.[index] ?? filter.options[index] ?? String(index);
}

function filterLabel(filter: Filter): string {
  return filter.name;
}

function describeFilterValue(
  filter: Filter,
  value: FilterValue | undefined,
  strings: MobileStrings,
): string {
  if (!value) return strings.sourceBrowse.anyFilter;
  if (
    filter.type === FilterType.Sort &&
    value.value &&
    typeof value.value === "object"
  ) {
    const sort = getMobileSortFilterSelection(filter, value);
    const option =
      filter.options[sort.index] ?? strings.sourceBrowse.defaultFilter;
    return `${option} ${sort.ascending ? "↑" : "↓"}`;
  }
  if (filter.type === FilterType.Select) {
    const selectedIndex = filter.options.findIndex(
      (_option, index) => filterOptionValue(filter, index) === value.value,
    );
    return selectedIndex >= 0
      ? filter.options[selectedIndex]
      : strings.sourceBrowse.customFilter;
  }
  if (filter.type === FilterType.Check) {
    const state = getMobileCheckFilterState(filter, value);
    return state === 2
      ? strings.sourceBrowse.excludeFilter
      : state === 1
        ? strings.sourceBrowse.includeFilter
        : strings.sourceBrowse.anyFilter;
  }
  if (
    filter.type === FilterType.Genre &&
    value.value &&
    typeof value.value === "object"
  ) {
    const multi = value.value as MultiSelectValue;
    const count = (multi.included?.length ?? 0) + (multi.excluded?.length ?? 0);
    return count
      ? formatMobileString(strings.sourceBrowse.selectedFilterCount, { count })
      : strings.sourceBrowse.anyFilter;
  }
  if (filter.type === FilterType.Text) {
    return typeof value.value === "string" && value.value.trim()
      ? value.value
      : strings.sourceBrowse.anyFilter;
  }
  return strings.sourceBrowse.customFilter;
}

function sourceFilterOptionAccessibilityLabel(
  filter: Filter,
  option: string,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.sourceFilterOption, {
    filter: filterLabel(filter),
    option,
  });
}

function sourceFilterTextAccessibilityLabel(
  filter: Filter,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.sourceFilterTextInput, {
    filter: filterLabel(filter),
  });
}

function ListingMangaCard({
  item,
  onPress,
  source,
  strings,
}: {
  item: MobileLiveSearchManga;
  onPress: () => void;
  source?: InstalledSource | null;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const subtitle = liveMangaSubtitle(item);
  const coverRequest = useMobileSourceImageRequest(source, item.cover);
  const coverSource = item.cover
    ? coverRequest
      ? {
          uri: coverRequest.url,
          headers: coverRequest.headers,
          cache: "force-cache" as const,
        }
      : {
          uri: item.cover,
          headers: item.coverHeaders,
          cache: "force-cache" as const,
        }
    : null;

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.sourceBrowse.openManga,
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
        {coverSource ? (
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
            source={coverSource}
            style={styles.sourceIconImage}
          />
        ) : (
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
        )}
      </View>
      <View style={styles.liveText}>
        <Text
          numberOfLines={2}
          style={[styles.liveTitle, { color: tokens.foreground }]}
        >
          {item.title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.liveSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </NemuPressable>
  );
}

function SourceListingTab({
  accessibilityLabel,
  canSelect,
  icon,
  label,
  onPress,
  selected,
}: {
  accessibilityLabel: string;
  canSelect: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const disabled = !canSelect && !selected;

  return (
    <NemuButton
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hapticFeedback={canSelect ? "selection" : "none"}
      icon={icon}
      label={label}
      onPress={onPress}
      size="sm"
      style={styles.listingTabButton}
      textStyle={styles.listingTabText}
      variant={selected ? "default" : "outline"}
    />
  );
}

function SourceBrowseProgress({ label }: { label: string }) {
  return (
    <View style={styles.sourceBrowseProgress}>
      <NemuNativeProgressView accessibilityLabel={label} />
    </View>
  );
}

function SourceFilterChip({
  label,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  selected,
  muted,
  hapticFeedback,
  onPress,
  onLongPress,
}: {
  label: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "checkbox" | "radio";
  accessibilityState?: { checked?: boolean; selected?: boolean };
  selected: boolean;
  muted?: boolean;
  hapticFeedback?: NemuPressableHapticFeedback;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const resolvedAccessibilityState = accessibilityState ?? { selected };
  return (
    <NemuPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={resolvedAccessibilityState}
      delayLongPress={260}
      hapticFeedback={
        hapticFeedback ??
        (accessibilityRole === "button" ? "press" : "selection")
      }
      onLongPress={onLongPress}
      onPress={onPress}
      pressedScale={0.98}
      style={[
        styles.sourceFilterChip,
        {
          backgroundColor: selected ? tokens.primary : tokens.muted,
          borderColor: selected ? tokens.primary : tokens.border,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.sourceFilterChipText,
          {
            color: selected
              ? tokens.primaryForeground
              : muted
                ? tokens.mutedForeground
                : tokens.foreground,
          },
        ]}
      >
        {label}
      </Text>
    </NemuPressable>
  );
}

function visibleFilterOptions(
  filter: Filter,
  optionLimit: number | null | undefined,
): string[] {
  if (!("options" in filter)) return [];
  const defaultOptionLimit =
    filter.type === FilterType.Genre
      ? INLINE_GENRE_OPTION_LIMIT
      : INLINE_FILTER_OPTION_LIMIT;
  const visibleOptionLimit =
    optionLimit === null
      ? filter.options.length
      : (optionLimit ?? defaultOptionLimit);
  return filter.options.slice(0, visibleOptionLimit);
}

function SourceFilterControl({
  filter,
  value,
  getValue,
  optionLimit,
  onChange,
  strings,
}: {
  filter: Filter;
  value?: FilterValue;
  getValue?: (filter: Filter) => FilterValue | undefined;
  optionLimit?: number | null;
  onChange: (filter: Filter, value: FilterValue["value"] | undefined) => void;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();

  if (filter.type === FilterType.Title || filter.type === FilterType.Author)
    return null;

  if (filter.type === FilterType.Group) {
    const group = filter as GroupFilter;
    const childFilters = group.filters.filter(
      (childFilter) =>
        childFilter.type !== FilterType.Title &&
        childFilter.type !== FilterType.Author,
    );

    if (!childFilters.length) return null;

    return (
      <View style={styles.sourceFilterGroup}>
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(group)}
        </Text>
        <View
          style={[
            styles.sourceNestedFilterRail,
            { borderColor: tokens.border },
          ]}
        >
          {childFilters.map((childFilter, index) => (
            <SourceFilterControl
              key={`${group.name}:${childFilter.name}:${childFilter.type}:${index}`}
              filter={childFilter}
              optionLimit={optionLimit}
              value={getValue?.(childFilter)}
              getValue={getValue}
              onChange={onChange}
              strings={strings}
            />
          ))}
        </View>
      </View>
    );
  }

  const visibleOptions = visibleFilterOptions(filter, optionLimit);

  if (filter.type === FilterType.Text) {
    return (
      <GlassSurface
        style={styles.sourceTextFilterShell}
        contentStyle={styles.sourceTextFilterContent}
      >
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(filter)}
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={filter.placeholder ?? strings.sourceBrowse.anyFilter}
          placeholderTextColor={tokens.mutedForeground}
          selectionColor={tokens.primary}
          accessibilityLabel={sourceFilterTextAccessibilityLabel(
            filter,
            strings,
          )}
          value={typeof value?.value === "string" ? value.value : ""}
          onChangeText={(text) =>
            onChange(filter, text.trim() ? text : undefined)
          }
          style={[styles.sourceTextFilterInput, { color: tokens.foreground }]}
        />
      </GlassSurface>
    );
  }

  if (filter.type === FilterType.Sort) {
    const selected = getMobileSortFilterSelection(filter, value);
    return (
      <View style={styles.sourceFilterGroup}>
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(filter)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            accessibilityLabel={filterLabel(filter)}
            accessibilityRole="radiogroup"
            style={styles.sourceFilterChipRow}
          >
            {visibleOptions.map((option, index) => {
              const selectedOption = selected.index === index;
              const ascending = selectedOption ? selected.ascending : false;
              const canSelect = canSelectMobileSourceSortFilterOption({
                selected: selectedOption,
                canAscend: filter.canAscend ?? true,
              });
              const optionLabel = selectedOption
                ? `${option}, ${
                    ascending
                      ? strings.sourceBrowse.sortAscending
                      : strings.sourceBrowse.sortDescending
                  }`
                : option;
              return (
                <SourceFilterChip
                  key={`${filter.name}:${option}:${index}`}
                  label={`${option}${selectedOption ? (ascending ? " ↑" : " ↓") : ""}`}
                  accessibilityLabel={sourceFilterOptionAccessibilityLabel(
                    filter,
                    optionLabel,
                    strings,
                  )}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedOption }}
                  selected={selectedOption}
                  hapticFeedback={canSelect ? "selection" : "none"}
                  onPress={() => {
                    if (!canSelect) return;
                    const nextAscending =
                      selectedOption && (filter.canAscend ?? true)
                        ? !selected.ascending
                        : false;
                    onChange(filter, { index, ascending: nextAscending });
                  }}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (filter.type === FilterType.Select) {
    return (
      <View style={styles.sourceFilterGroup}>
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(filter)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            accessibilityLabel={filterLabel(filter)}
            accessibilityRole="radiogroup"
            style={styles.sourceFilterChipRow}
          >
            {visibleOptions.map((option, index) => {
              const optionValue = filterOptionValue(filter, index);
              const selected = value?.value === optionValue;
              return (
                <SourceFilterChip
                  key={`${filter.name}:${optionValue}`}
                  label={option}
                  accessibilityLabel={sourceFilterOptionAccessibilityLabel(
                    filter,
                    option,
                    strings,
                  )}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  selected={selected}
                  onPress={() =>
                    onChange(filter, selected ? undefined : optionValue)
                  }
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (filter.type === FilterType.Check) {
    const state = getMobileCheckFilterState(filter, value);
    const selected = state !== 0;
    const optionLabel = describeFilterValue(filter, value, strings);
    return (
      <View style={styles.sourceFilterGroup}>
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(filter)}
        </Text>
        <View style={styles.sourceFilterChipRow}>
          <SourceFilterChip
            label={optionLabel}
            accessibilityLabel={sourceFilterOptionAccessibilityLabel(
              filter,
              optionLabel,
              strings,
            )}
            accessibilityHint={
              filter.canExclude
                ? strings.sourceBrowse.sourceFilterCycleHint
                : undefined
            }
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            selected={selected}
            onPress={() => {
              onChange(filter, getNextMobileCheckFilterValue(filter, value));
            }}
          />
        </View>
      </View>
    );
  }

  if (filter.type === FilterType.Genre) {
    const multi =
      value?.value && typeof value.value === "object"
        ? (value.value as MultiSelectValue)
        : { included: [], excluded: [] };
    const included = new Set(multi.included ?? []);
    const excluded = new Set(multi.excluded ?? []);

    const updateGenre = (optionValue: string, mode: "include" | "exclude") => {
      const nextIncluded = new Set(included);
      const nextExcluded = new Set(excluded);
      if (mode === "include") {
        if (nextIncluded.has(optionValue)) {
          nextIncluded.delete(optionValue);
        } else {
          nextIncluded.add(optionValue);
          nextExcluded.delete(optionValue);
        }
      } else if (filter.canExclude) {
        if (nextExcluded.has(optionValue)) {
          nextExcluded.delete(optionValue);
        } else {
          nextExcluded.add(optionValue);
          nextIncluded.delete(optionValue);
        }
      }
      const nextValue: MultiSelectValue = {
        included: [...nextIncluded],
        excluded: [...nextExcluded],
      };
      onChange(
        filter,
        nextValue.included.length || nextValue.excluded.length
          ? nextValue
          : undefined,
      );
    };

    return (
      <View style={styles.sourceFilterGroup}>
        <Text
          style={[styles.sourceFilterName, { color: tokens.mutedForeground }]}
        >
          {filterLabel(filter)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.sourceFilterChipRow}>
            {visibleOptions.map((option, index) => {
              const optionValue = filterOptionValue(filter, index);
              const selected =
                included.has(optionValue) || excluded.has(optionValue);
              const label = excluded.has(optionValue)
                ? formatMobileString(strings.sourceBrowse.notFilter, { option })
                : option;
              return (
                <SourceFilterChip
                  key={`${filter.name}:${optionValue}`}
                  label={label}
                  accessibilityLabel={sourceFilterOptionAccessibilityLabel(
                    filter,
                    label,
                    strings,
                  )}
                  accessibilityHint={
                    filter.canExclude
                      ? strings.sourceBrowse.sourceFilterExcludeHint
                      : undefined
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  selected={selected}
                  muted={excluded.has(optionValue)}
                  onLongPress={
                    filter.canExclude
                      ? () => {
                          updateGenre(optionValue, "exclude");
                        }
                      : undefined
                  }
                  onPress={() => updateGenre(optionValue, "include")}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  return null;
}

function SourceFilterPanel({
  filters,
  values,
  onClose,
  onApply,
  strings,
}: {
  filters: Filter[];
  values: FilterValue[];
  onClose: () => void;
  onApply: (values: FilterValue[]) => void;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const [draftValues, setDraftValues] = useState<FilterValue[]>(values);

  const valueMap = useMemo(() => {
    const map = new Map<string, FilterValue>();
    for (const value of draftValues) {
      map.set(value.name, value);
    }
    return map;
  }, [draftValues]);
  const draftActiveCount = useMemo(
    () => getMobileActiveSourceFilterCount(draftValues),
    [draftValues],
  );
  const changeDraftFilter = useCallback(
    (filter: Filter, value: FilterValue["value"] | undefined) => {
      setDraftValues((current) =>
        updateMobileSourceFilterValues(current, filter, value),
      );
    },
    [],
  );
  const resetDraftFilters = useCallback(() => {
    setDraftValues([]);
    onApply([]);
  }, [onApply]);
  const applyDraftFilters = useCallback(() => {
    onApply(draftValues);
  }, [draftValues, onApply]);

  return (
    <MobileNativeSheetScaffold
      visible
      onClose={onClose}
      snapPoints={["82%"]}
      contentStyle={styles.filterPanel}
      testID="SourceFilterSheet"
    >
      <View style={styles.filterPanelHeader}>
        <View style={styles.filterPanelTitleBlock}>
          <Text
            numberOfLines={1}
            style={[styles.filterPanelTitle, { color: tokens.foreground }]}
          >
            {strings.sourceBrowse.sourceFilters}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.filterPanelSubtitle,
              { color: tokens.mutedForeground },
            ]}
          >
            {draftActiveCount
              ? formatSourceBrowseCount(
                  draftActiveCount,
                  strings.sourceBrowse.activeFilterCountOne,
                  strings.sourceBrowse.activeFilterCountOther,
                )
              : formatSourceBrowseCount(
                  filters.length,
                  strings.sourceBrowse.availableFilterCountOne,
                  strings.sourceBrowse.availableFilterCountOther,
                )}
          </Text>
        </View>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.sourceBrowse.closeFilters}
          onPress={onClose}
          style={[
            styles.filterPanelCloseButton,
            { backgroundColor: tokens.muted },
          ]}
        >
          <Ionicons
            name="close-outline"
            size={20}
            color={tokens.mutedForeground}
          />
        </NemuPressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.filterPanelScrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.filterPanelScroll}
      >
        {filters.map((filter, index) => (
          <SourceFilterControl
            key={`${filter.name}:${filter.type}:${index}`}
            filter={filter}
            optionLimit={null}
            value={valueMap.get(filterValueKey(filter))}
            getValue={(filterForValue) =>
              valueMap.get(filterValueKey(filterForValue))
            }
            onChange={changeDraftFilter}
            strings={strings}
          />
        ))}
      </ScrollView>

      <View style={styles.filterPanelActions}>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.sourceBrowse.resetFilters}
          onPress={resetDraftFilters}
          style={[
            styles.filterPanelSecondaryButton,
            { backgroundColor: tokens.muted },
          ]}
        >
          <Text
            style={[
              styles.filterPanelSecondaryText,
              { color: tokens.mutedForeground },
            ]}
          >
            {strings.sourceBrowse.resetFilters}
          </Text>
        </NemuPressable>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.sourceBrowse.applyFilters}
          onPress={applyDraftFilters}
          style={[
            styles.filterPanelPrimaryButton,
            { backgroundColor: tokens.primary },
          ]}
        >
          <Text
            style={[
              styles.filterPanelPrimaryText,
              { color: tokens.primaryForeground },
            ]}
          >
            {strings.sourceBrowse.applyFilters}
          </Text>
        </NemuPressable>
      </View>
    </MobileNativeSheetScaffold>
  );
}

export function SourceBrowseScreen() {
  const sourceProfileScope = getActiveMobileSourceProfileScope();
  const params = useLocalSearchParams<{
    registryId: string;
    sourceId: string;
    q?: string | string[];
    tab?: string | string[];
  }>();
  const registryId = normalizeMobileSourceRouteParam(params.registryId);
  const sourceId = normalizeMobileSourceRouteParam(params.sourceId);
  const routeSourceSearchQuery = normalizeMobileSourceBrowseRouteQuery(
    params.q,
  );
  const routeSourceSearchActive = hasMobileSourceBrowseRouteQuery(params.q);
  const routeSourceListingTab = normalizeMobileSourceBrowseRouteTab(params.tab);
  const { tokens } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const sourceBrowseStringsRef = useRef(strings.sourceBrowse);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [selectedRuntimeListing, setSelectedRuntimeListing] =
    useState<SourcePackageListing | null>(null);
  const [listingState, setListingState] = useState<ListingBrowseState>({
    status: "idle",
    items: [],
    detail: strings.sourceBrowse.selectListingToBrowse,
  });
  const listingRequestRef = useRef(0);
  const listingItemsRef = useRef<MobileLiveSearchManga[]>([]);
  const listingPaginationRef = useRef({ hasMore: false, loading: false });
  const [listingLoadMoreInFlight, setListingLoadMoreInFlight] = useState(false);
  const listingLoadMoreInFlightRef = useRef(false);
  const [listingTabsViewportWidth, setListingTabsViewportWidth] = useState(0);
  const [listingTabsContentWidth, setListingTabsContentWidth] = useState(0);
  const [listingTabsScrollX, setListingTabsScrollX] = useState(0);
  const [runtimeRefreshKey, setRuntimeRefreshKey] = useState(0);
  const [sourceHomeState, setSourceHomeState] = useState<SourceHomeState>({
    status: "idle",
    home: null,
    detail: strings.sourceBrowse.sourceHomeIdle,
  });
  const sourceHomeRequestRef = useRef(0);
  const sourceHomeResultKeyRef = useRef<string | null>(null);
  const [refreshingSource, setRefreshingSource] = useState(false);
  const refreshSourceGuardRef = useRef(false);
  const cloudflareSheetRef = useRef<{
    reportError: (error: unknown) => boolean;
  } | null>(null);
  const sourceSearchInputRef = useRef<SearchBarCommands | null>(null);
  const sourceSearchIdleTasksRef = useRef<MobileIdleTaskCoordinator | null>(
    null,
  );
  if (sourceSearchIdleTasksRef.current === null) {
    sourceSearchIdleTasksRef.current = createMobileIdleTaskCoordinator();
  }
  const sourceSearchIdleTasks = sourceSearchIdleTasksRef.current;
  const [sourceSearchQuery, setSourceSearchQuery] = useState(
    routeSourceSearchQuery,
  );
  const [submittedSourceSearchQuery, setSubmittedSourceSearchQuery] = useState(
    routeSourceSearchQuery,
  );
  const [sourceFilterValues, setSourceFilterValues] = useState<FilterValue[]>(
    [],
  );
  const [sourceFilterPanelOpen, setSourceFilterPanelOpen] = useState(false);
  const [sourceFiltersState, setSourceFiltersState] =
    useState<SourceFiltersState>({
      status: "idle",
      filters: [],
      detail: strings.sourceBrowse.sourceFiltersIdle,
    });
  const [sourceSearchState, setSourceSearchState] = useState<SourceSearchState>(
    {
      status: "idle",
      items: [],
      detail: strings.sourceBrowse.searchOrChooseFilters,
    },
  );
  const sourceSearchItemsRef = useRef<MobileLiveSearchManga[]>([]);
  const sourceSearchPaginationRef = useRef({ hasMore: false, loading: false });
  const [sourceSearchLoadMoreInFlight, setSourceSearchLoadMoreInFlight] =
    useState(false);
  const sourceSearchLoadMoreInFlightRef = useRef(false);
  const sourceSearchRequestRef = useRef(0);
  const store = useMobileDataStore();
  const installed = useInstalledSources();

  useFocusEffect(
    useCallback(
      () => () => {
        sourceSearchIdleTasks.cancel();
      },
      [sourceSearchIdleTasks],
    ),
  );

  useEffect(() => {
    sourceBrowseStringsRef.current = strings.sourceBrowse;
  }, [strings.sourceBrowse]);

  useEffect(() => {
    setSourceSearchQuery(routeSourceSearchQuery);
    setSubmittedSourceSearchQuery(routeSourceSearchQuery);
  }, [routeSourceSearchQuery]);

  const installedSource = useMemo(() => {
    return installed.data.find((item) =>
      mobileInstalledSourceMatchesRoute(item, registryId, sourceId),
    );
  }, [installed.data, registryId, sourceId]);
  const installedSourceRef = useRef(installedSource);
  installedSourceRef.current = installedSource;

  const source = useMemo(
    () => (installedSource ? normalizeInstalledSource(installedSource) : null),
    [installedSource],
  );
  const listingSourceDisplay = useMemo(
    () => (installedSource ? toSearchSourceDisplay(installedSource) : null),
    [installedSource],
  );
  const [sourceBrowseMetadataState, setSourceBrowseMetadataState] =
    useState<SourceBrowseMetadataState>({ status: "idle" });
  const sourceBrowseMetadataRequestKeyRef = useRef<string | null>(null);
  const runtimePackageMetadata =
    sourceBrowseMetadataState.status === "ready" &&
    listingSourceDisplay?.id === sourceBrowseMetadataState.result.source.id
      ? sourceBrowseMetadataState.result.packageMetadata
      : null;
  const packageMetadata =
    runtimePackageMetadata ?? source?.packageMetadata ?? null;
  const settingsSchema = packageMetadata?.settings ?? EMPTY_SOURCE_SETTINGS;
  const sourceKey = source
    ? makeMobileSourceKey(source.registryId, source.sourceId)
    : null;
  const sourceSettingsKeys = useMemo(
    () =>
      installedSource
        ? getMobileInstalledSourceSettingsKeys(installedSource)
        : [],
    [installedSource],
  );
  const sourceSettings = useSourceSettings(
    sourceKey,
    settingsSchema,
    sourceSettingsKeys,
  );
  const sourceSettingsDataRef = useRef(sourceSettings.data);
  const sourceRuntimeKey = source ? makeMobileRuntimeSourceKey(source) : null;
  const sourceHomeSettingsSignature = useMemo(
    () => hashSettings(sourceSettings.data),
    [sourceSettings.data],
  );
  const sourceHomeGenerationKey = makeMobileSourceHomeGenerationKey({
    sourceRuntimeKey,
    packageUri: installedSource?.packageUri,
    packageCacheKey: installedSource?.packageCacheKey,
    sourceVersion: installedSource?.version,
    downloadUrl: installedSource?.downloadUrl,
    settingsSignature: sourceHomeSettingsSignature,
    runtimeRefreshKey,
  });
  const gridColumns = useMemo(
    () =>
      getMobileMangaGridColumns({
        windowWidth,
        horizontalPadding: SOURCE_BROWSE_HORIZONTAL_PADDING,
      }),
    [windowWidth],
  );
  const staticListings = useMemo(
    () => packageMetadata?.listings ?? [],
    [packageMetadata?.listings],
  );

  useEffect(() => {
    sourceSettingsDataRef.current = sourceSettings.data;
  }, [sourceSettings.data]);
  const runtimeBrowseMetadata =
    sourceBrowseMetadataState.status === "ready" &&
    listingSourceDisplay?.id === sourceBrowseMetadataState.result.source.id
      ? sourceBrowseMetadataState.result
      : null;
  const listings = useMemo(
    () => runtimeBrowseMetadata?.listings ?? staticListings,
    [runtimeBrowseMetadata?.listings, staticListings],
  );
  const selectedListing = useMemo(() => {
    if (!selectedListingId) return null;
    const staticListing = listings.find(
      (listing) => listing.id === selectedListingId,
    );
    if (staticListing) return staticListing;
    if (selectedRuntimeListing?.id === selectedListingId)
      return selectedRuntimeListing;
    return null;
  }, [listings, selectedListingId, selectedRuntimeListing]);
  const getListingCacheKey = useCallback(
    (listing: SourcePackageListing | null | undefined) =>
      sourceRuntimeKey && listing
        ? `${sourceProfileScope}:${sourceRuntimeKey}:${runtimeRefreshKey}:${listing.id}`
        : null,
    [runtimeRefreshKey, sourceProfileScope, sourceRuntimeKey],
  );
  const visibleListings = useMemo(
    () => mergeMobileSourceListingTabs(listings, selectedRuntimeListing),
    [listings, selectedRuntimeListing],
  );
  const sourceFilters = sourceFiltersState.filters;
  const sourceFilterValueMap = useMemo(() => {
    const map = new Map<string, FilterValue>();
    for (const value of sourceFilterValues) {
      map.set(value.name, value);
    }
    return map;
  }, [sourceFilterValues]);
  const inlineSourceFilters = useMemo(
    () =>
      getMobileInlineSourceFilters(
        sourceFilters,
        sourceFilterValues,
        INLINE_SOURCE_FILTER_LIMIT,
      ),
    [sourceFilterValues, sourceFilters],
  );
  const sourceFilterCount = useMemo(
    () => getMobileActiveSourceFilterCount(sourceFilterValues),
    [sourceFilterValues],
  );
  const sourceSearchTerm = submittedSourceSearchQuery.trim();
  const sourceHome = sourceHomeState.home;
  const sourceHomeHasComponents = !!sourceHome?.components.length;
  const sourceOnlySearch =
    runtimeBrowseMetadata?.onlySearch ??
    (sourceHomeState.status === "ready"
      ? sourceHomeState.result.onlySearch
      : false);
  const sourceSearchActive =
    sourceOnlySearch ||
    routeSourceSearchActive ||
    sourceSearchTerm.length > 0 ||
    sourceFilterCount > 0;
  const showSourceSearchControls = sourceFilters.length > 0;
  const sourceHomeProviderKnown =
    !!runtimeBrowseMetadata ||
    sourceHomeState.status === "ready" ||
    sourceHomeHasComponents;
  const sourceHasHomeProvider =
    runtimeBrowseMetadata?.hasHomeProvider ??
    (sourceHomeState.status === "ready"
      ? sourceHomeState.result.hasHomeProvider
      : sourceHomeHasComponents);
  const sourceHomeTabPending = isMobileSourceBrowseHomeTabPending({
    onlySearch: sourceOnlySearch,
    sourceHomeProviderKnown,
    metadataStatus: sourceBrowseMetadataState.status,
    homeStatus: sourceHomeState.status,
  });
  const sourceExpectsHomeTab = sourceHasHomeProvider || sourceHomeTabPending;
  const listingTabCount = getMobileSourceBrowseListingTabCount(
    sourceHasHomeProvider,
    visibleListings.length,
  );
  const showListingTabBar = shouldShowMobileSourceBrowseListingTabBar({
    listingTabCount,
    sourceHomeProviderKnown,
    onlySearch: sourceOnlySearch,
  });
  const showSourceSearchHeader = shouldRenderMobileSourceBrowseSearchHeader({
    showControls: showSourceSearchControls,
    filterCount: sourceFilterCount,
    filterCountKnown: sourceFilters.length > 0,
    filtersBlocked:
      sourceFiltersState.status === "blocked" &&
      Boolean(packageMetadata?.filters.length),
    filtersErrored: sourceFiltersState.status === "error",
  });
  const routeSelectedListingId = useMemo(() => {
    if (routeSourceListingTab !== null && !sourceHomeProviderKnown) {
      return null;
    }
    return getMobileSourceBrowseListingIdForRouteTab(
      routeSourceListingTab,
      listings,
      sourceHasHomeProvider,
    );
  }, [
    listings,
    routeSourceListingTab,
    sourceHasHomeProvider,
    sourceHomeProviderKnown,
  ]);
  const routeTabSelectionPending =
    routeSourceListingTab !== null && !sourceHomeProviderKnown;
  const routeTabTargetsHome =
    routeSourceListingTab !== null &&
    sourceExpectsHomeTab &&
    routeSourceListingTab === 0;
  const defaultSelectedListingId = useMemo(
    () => getDefaultMobileSourceBrowseListingId(listings, sourceExpectsHomeTab),
    [listings, sourceExpectsHomeTab],
  );
  const sourceHomeSelected =
    !sourceSearchActive && sourceExpectsHomeTab && !selectedListing;
  const showSourceHomeSection = !sourceSearchActive && sourceHomeSelected;
  const canSelectSourceHomeTab = canSelectMobileSourceBrowseTab({
    selected: sourceHomeSelected,
  });
  const showSourceHomeTab = showListingTabBar && sourceHasHomeProvider;
  const sourceHomeTabSelected =
    !sourceSearchActive && !selectedListing && sourceHomeSelected;
  const sourceHomeTabCanSelect =
    sourceHomeProviderKnown && canSelectSourceHomeTab;
  const sourceHomeDisplay =
    sourceHomeState.status === "ready"
      ? sourceHomeState.result.source
      : listingSourceDisplay;
  const sourceRuntimeUnavailableDetail = getMobileRuntimeUnavailableDetail([
    sourceBrowseMetadataState.status === "blocked"
      ? sourceBrowseMetadataState.result.detail
      : null,
    sourceHomeState.status === "blocked" ? sourceHomeState.result.detail : null,
    sourceFiltersState.status === "blocked"
      ? sourceFiltersState.result.detail
      : null,
    sourceSearchState.status === "blocked"
      ? sourceSearchState.result.detail
      : null,
    listingState.status === "blocked" ? listingState.result.detail : null,
  ]);
  const sourceRuntimeUnavailable = sourceRuntimeUnavailableDetail !== null;
  const showExecutableSourceSections = !sourceRuntimeUnavailable;
  const listingGridAttached =
    !sourceSearchActive &&
    showExecutableSourceSections &&
    Boolean(selectedListing) &&
    !showSourceHomeSection;
  const showSourceBrowseBootstrapping = shouldShowSourceBrowseBootstrapping({
    sourceSearchActive,
    showExecutableSourceSections,
    hasSource: Boolean(source),
    metadataStatus: sourceBrowseMetadataState.status,
    sourceHomeTabPending,
    showSourceHomeSection,
    homeStatus: sourceHomeState.status,
    sourceHomeHasComponents,
  });
  const showSourceBrowseHomeSkeleton = shouldShowSourceBrowseHomeSkeleton({
    showSourceHomeSection,
    sourceHasHomeProvider,
    homeStatus: sourceHomeState.status,
    sourceHomeHasComponents,
  });

  useEffect(() => {
    listingItemsRef.current = listingState.items;
    listingPaginationRef.current = {
      hasMore: listingState.status === "ready" && listingState.result.hasMore,
      loading: listingState.status === "loading",
    };
  }, [listingState]);

  useEffect(() => {
    listingRequestRef.current += 1;
  }, [runtimeRefreshKey, selectedListing?.id, sourceRuntimeKey]);

  useEffect(() => {
    setSourceBrowseMetadataState({ status: "idle" });
    setSourceFiltersState({
      status: "idle",
      filters: [],
      detail: sourceBrowseStringsRef.current.sourceFiltersIdle,
    });
    clearSourceListingCacheForRuntime(sourceRuntimeKey, sourceProfileScope);
    setListingTabsContentWidth(0);
    setListingTabsScrollX(0);
    setListingTabsViewportWidth(0);
  }, [sourceProfileScope, sourceRuntimeKey]);

  useEffect(() => {
    if (!listings.length && !selectedRuntimeListing) {
      listingRequestRef.current += 1;
      setSelectedListingId(null);
      setListingState({
        status: "idle",
        items: [],
        detail: strings.sourceBrowse.noPackageListings,
      });
      return;
    }

    if (routeTabSelectionPending) return;

    if (routeSelectedListingId) {
      if (
        selectedListingId !== routeSelectedListingId ||
        selectedRuntimeListing
      ) {
        setSelectedRuntimeListing(null);
        setSelectedListingId(routeSelectedListingId);
      }
      return;
    }

    if (routeTabTargetsHome) {
      if (selectedListingId || selectedRuntimeListing) {
        setSelectedRuntimeListing(null);
        setSelectedListingId(null);
      }
      listingRequestRef.current += 1;
      setListingState({
        status: "idle",
        items: [],
        detail: strings.sourceBrowse.selectListingToBrowse,
      });
      return;
    }

    if (
      routeSourceListingTab === null &&
      sourceExpectsHomeTab &&
      !selectedListingId &&
      !selectedRuntimeListing
    ) {
      listingRequestRef.current += 1;
      setListingState({
        status: "idle",
        items: [],
        detail: strings.sourceBrowse.selectListingToBrowse,
      });
      return;
    }

    if (!listings.length) return;

    const selectedStaticListing = listings.some(
      (listing) => listing.id === selectedListingId,
    );
    const selectedDynamicListing =
      selectedRuntimeListing?.id === selectedListingId;
    if (
      !selectedListingId ||
      (!selectedStaticListing && !selectedDynamicListing)
    ) {
      if (sourceHomeTabPending && routeSourceListingTab === null) return;
      setSelectedListingId(defaultSelectedListingId ?? listings[0].id);
    }
  }, [
    defaultSelectedListingId,
    listings,
    routeSelectedListingId,
    routeTabSelectionPending,
    routeTabTargetsHome,
    routeSourceListingTab,
    selectedListingId,
    selectedRuntimeListing,
    sourceExpectsHomeTab,
    sourceHomeTabPending,
    strings,
  ]);

  const resolveExecutorSourceSettings = useCallback(
    async (
      _sourceKey: string,
      sourceRecord: Parameters<typeof normalizeInstalledSource>[0],
    ) => {
      const normalized = normalizeInstalledSource(sourceRecord);
      const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
      if (sourceRuntimeKey && runtimeSourceKey === sourceRuntimeKey) {
        return mergeSourceSettingValues(
          sourceRecord.packageMetadata?.settings ?? [],
          sourceSettingsDataRef.current,
        );
      }

      const saved = await loadMobileSourceSettingsByKeys(store, [
        runtimeSourceKey,
        ...getMobileInstalledSourceSettingsKeys(sourceRecord),
      ]);
      return mergeSourceSettingValues(
        sourceRecord.packageMetadata?.settings ?? [],
        saved?.values,
      );
    },
    [sourceRuntimeKey, store],
  );

  useEffect(() => {
    let cancelled = false;
    const requestSource = installedSourceRef.current;

    if (
      !requestSource ||
      sourceSettings.loading ||
      sourceHomeGenerationKey === null ||
      sourceBrowseMetadataRequestKeyRef.current === sourceHomeGenerationKey
    ) {
      return () => {
        cancelled = true;
      };
    }
    sourceBrowseMetadataRequestKeyRef.current = sourceHomeGenerationKey;

    setSourceBrowseMetadataState({ status: "loading" });

    void withSourceOperationTimeout(
      fetchMobileSourceBrowseMetadata(requestSource, {
        getSourceSettings: resolveExecutorSourceSettings,
      }),
      strings.sourceBrowse.sourceOperationTimedOut,
    )
      .then((result) => {
        if (cancelled) return;
        if (result.status === "blocked") {
          setSourceBrowseMetadataState({
            status: "blocked",
            result,
          });
          setSourceFiltersState(sourceFiltersBlockedFromBrowseMetadata(result));
          return;
        }
        setSourceBrowseMetadataState({
          status: "ready",
          result,
        });
        setSourceFiltersState(sourceFiltersFromBrowseMetadata(result));
        if (
          !sameSourcePackageMetadata(
            requestSource.packageMetadata,
            result.packageMetadata,
          )
        ) {
          void (async () => {
            const saved = await store.saveInstalledSourceIfCurrent?.(
              {
                ...requestSource,
                packageMetadata: result.packageMetadata,
                updatedAt: nextSyncTimestamp(requestSource.updatedAt),
                removed: false,
              },
              requestSource.updatedAt,
            );
            if (saved) {
              emitMobileSettingsDataChanged();
            }
          })().catch(() => undefined);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        cloudflareSheetRef.current?.reportError(error);
        setSourceBrowseMetadataState({
          status: "error",
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.sourceUnavailable,
          ),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    resolveExecutorSourceSettings,
    // Live-query rows are value-equivalent but not referentially stable. Key
    // the request to the fields that can actually change source execution so
    // setting metadata state cannot recursively restart its own effect.
    sourceHomeGenerationKey,
    sourceSettings.loading,
    strings,
    store,
  ]);

  useEffect(() => {
    sourceSearchItemsRef.current = sourceSearchState.items;
    sourceSearchPaginationRef.current = {
      hasMore:
        sourceSearchState.status === "ready" &&
        sourceSearchState.result.hasMore,
      loading: sourceSearchState.status === "loading",
    };
  }, [sourceSearchState]);

  useEffect(() => {
    const sourceBrowseStrings = sourceBrowseStringsRef.current;
    sourceHomeRequestRef.current += 1;
    listingRequestRef.current += 1;
    setSelectedRuntimeListing(null);
    setSourceFilterValues([]);
    setSourceFilterPanelOpen(false);
    setSourceSearchQuery(routeSourceSearchQuery);
    setSubmittedSourceSearchQuery(routeSourceSearchQuery);
    setSourceHomeState({
      status: "idle",
      home: null,
      detail: sourceBrowseStrings.sourceHomeIdle,
    });
    setSourceSearchState({
      status: "idle",
      items: [],
      detail: sourceBrowseStrings.searchOrChooseFilters,
    });
  }, [routeSourceSearchQuery, sourceRuntimeKey]);

  useEffect(() => {
    setSourceSearchQuery(routeSourceSearchQuery);
    setSubmittedSourceSearchQuery(routeSourceSearchQuery);
  }, [routeSourceSearchQuery, sourceRuntimeKey]);

  useEffect(() => {
    const requestSource = installedSourceRef.current;
    if (!requestSource || sourceSettings.loading || !sourceHomeSelected) {
      return;
    }
    const resultKey = sourceHomeGenerationKey;
    if (
      !shouldFetchMobileSourceHome({
        completedGenerationKey: sourceHomeResultKeyRef.current,
        nextGenerationKey: resultKey,
      })
    ) {
      return;
    }
    let cancelled = false;
    const requestId = sourceHomeRequestRef.current + 1;
    sourceHomeRequestRef.current = requestId;
    const requestStartedAt = markMobilePerformance(
      "mobile.source.home.request.start",
      { requestId },
    );

    setSourceHomeState((current) => ({
      status: "loading",
      home: current.home,
      detail: strings.sourceBrowse.loadingHome,
    }));

    void withSourceOperationTimeout(
      fetchMobileSourceHome(requestSource, {
        getSourceSettings: resolveExecutorSourceSettings,
        onPartial: (home) => {
          if (cancelled || sourceHomeRequestRef.current !== requestId) return;
          setSourceHomeState({
            status: "loading",
            home,
            detail: strings.sourceBrowse.loadingHome,
          });
        },
      }),
      strings.sourceBrowse.sourceOperationTimedOut,
    )
      .then((result) => {
        if (cancelled || sourceHomeRequestRef.current !== requestId) {
          measureMobilePerformance(
            "mobile.source.home.request.stale",
            requestStartedAt,
            { requestId, status: result.status },
          );
          return;
        }
        measureMobilePerformance(
          "mobile.source.home.request.complete",
          requestStartedAt,
          { requestId, status: result.status },
        );
        if (result.status === "blocked") {
          sourceHomeResultKeyRef.current = resultKey;
          setSourceHomeState({
            status: "blocked",
            result,
            home: null,
          });
          return;
        }
        sourceHomeResultKeyRef.current = resultKey;
        setSourceHomeState({
          status: "ready",
          result,
          home: result.home,
        });
      })
      .catch((error) => {
        if (cancelled || sourceHomeRequestRef.current !== requestId) {
          measureMobilePerformance(
            "mobile.source.home.request.stale-failure",
            requestStartedAt,
            { requestId },
          );
          return;
        }
        measureMobilePerformance(
          "mobile.source.home.request.failed",
          requestStartedAt,
          { requestId },
        );
        if (isMobileSourceOperationTimeoutError(error)) {
          sourceHomeRequestRef.current += 1;
        }
        cloudflareSheetRef.current?.reportError(error);
        setSourceHomeState((current) => ({
          status: "error",
          home: current.home,
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.loadHomeFailed,
          ),
        }));
      });

    return () => {
      cancelled = true;
      measureMobilePerformance(
        "mobile.source.home.request.cancelled",
        requestStartedAt,
        { requestId },
      );
      if (sourceHomeRequestRef.current === requestId) {
        sourceHomeRequestRef.current += 1;
      }
    };
  }, [
    resolveExecutorSourceSettings,
    sourceHomeGenerationKey,
    sourceHomeSelected,
    sourceSettings.loading,
    strings,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (
      !installedSource ||
      sourceSettings.loading ||
      sourceBrowseMetadataState.status !== "error"
    ) {
      return () => {
        cancelled = true;
      };
    }

    setSourceFiltersState((current) => ({
      status: "loading",
      filters: current.filters,
      detail: strings.sourceBrowse.loadingFilters,
    }));

    void withSourceOperationTimeout(
      fetchMobileSourceFilters(installedSource, {
        getSourceSettings: resolveExecutorSourceSettings,
      }),
      strings.sourceBrowse.sourceOperationTimedOut,
    )
      .then((result) => {
        if (cancelled) return;
        if (result.status === "blocked") {
          setSourceFiltersState({
            status: "blocked",
            result,
            filters: [],
          });
          return;
        }
        setSourceFiltersState({
          status: "ready",
          result,
          filters: filterSourceBrowseControls(result.filters),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        cloudflareSheetRef.current?.reportError(error);
        setSourceFiltersState({
          status: "error",
          filters: [],
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.loadFiltersFailed,
          ),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    installedSource,
    resolveExecutorSourceSettings,
    runtimeRefreshKey,
    sourceBrowseMetadataState.status,
    sourceSettings.loading,
    strings,
  ]);

  const loadSourceSearch = useCallback(
    async (page = 1) => {
      if (!installedSource || !sourceSearchActive) return;
      const loadingMore = page > 1;
      if (loadingMore) {
        const pagination = sourceSearchPaginationRef.current;
        if (
          !canLoadMoreMobileSourceBrowseResults({
            hasMore: pagination.hasMore,
            loading: pagination.loading,
            inFlight: sourceSearchLoadMoreInFlightRef.current,
          })
        ) {
          return;
        }
        sourceSearchLoadMoreInFlightRef.current = true;
        setSourceSearchLoadMoreInFlight(true);
      }
      const requestId = sourceSearchRequestRef.current + 1;
      sourceSearchRequestRef.current = requestId;
      const previousItems = page > 1 ? sourceSearchItemsRef.current : [];
      setSourceSearchState({
        status: "loading",
        items: previousItems,
        detail:
          page > 1
            ? strings.sourceBrowse.loadingMoreSourceResults
            : strings.sourceBrowse.searchThisSource,
      });

      try {
        const result = await withSourceOperationTimeout(
          searchMobileSource(installedSource, sourceSearchTerm, {
            page,
            filters: compactMobileSourceFilterValues(sourceFilterValues),
            getSourceSettings: resolveExecutorSourceSettings,
          }),
          strings.sourceBrowse.sourceOperationTimedOut,
        );
        if (sourceSearchRequestRef.current !== requestId) return;

        if (result.status === "blocked") {
          setSourceSearchState({
            status: "blocked",
            result,
            items: previousItems,
          });
          return;
        }

        const items =
          page > 1 ? [...previousItems, ...result.items] : result.items;
        setSourceSearchState({
          status: "ready",
          result,
          items,
          page,
        });
      } catch (error) {
        if (sourceSearchRequestRef.current !== requestId) return;
        cloudflareSheetRef.current?.reportError(error);
        setSourceSearchState({
          status: "error",
          items: previousItems,
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.sourceSearchFailed,
          ),
        });
      } finally {
        if (loadingMore) {
          sourceSearchLoadMoreInFlightRef.current = false;
          setSourceSearchLoadMoreInFlight(false);
        }
      }
    },
    [
      installedSource,
      resolveExecutorSourceSettings,
      sourceFilterValues,
      sourceSearchActive,
      sourceSearchTerm,
      strings,
    ],
  );

  useEffect(() => {
    if (!installedSource || sourceSettings.loading) return;
    if (!sourceSearchActive) {
      sourceSearchRequestRef.current += 1;
      if (
        !shouldPreserveSourceBrowseSearchItemsOnDeactivate({
          sourceExpectsHomeTab,
        })
      ) {
        setSourceSearchState({
          status: "idle",
          items: [],
          detail: strings.sourceBrowse.searchOrChooseFilters,
        });
      }
      return;
    }
    void loadSourceSearch(1);
  }, [
    installedSource,
    loadSourceSearch,
    runtimeRefreshKey,
    sourceExpectsHomeTab,
    sourceSearchActive,
    sourceSettings.loading,
    strings,
  ]);

  const loadListing = useCallback(
    async (page = 1) => {
      if (!installedSource || !selectedListing) return;
      const cacheKey = getListingCacheKey(selectedListing);
      const loadingMore = page > 1;
      if (loadingMore) {
        const pagination = listingPaginationRef.current;
        if (
          !canLoadMoreMobileSourceBrowseResults({
            hasMore: pagination.hasMore,
            loading: pagination.loading,
            inFlight: listingLoadMoreInFlightRef.current,
          })
        ) {
          return;
        }
        listingLoadMoreInFlightRef.current = true;
        setListingLoadMoreInFlight(true);
      }
      const requestId = listingRequestRef.current + 1;
      listingRequestRef.current = requestId;
      const previousItems = page > 1 ? listingItemsRef.current : [];
      setListingState({
        status: "loading",
        items: previousItems,
        detail:
          page > 1
            ? strings.sourceBrowse.loadingMoreListing
            : strings.sourceBrowse.loadingListing,
      });

      try {
        const result = await withSourceOperationTimeout(
          fetchMobileSourceListing(installedSource, selectedListing, {
            page,
            getSourceSettings: resolveExecutorSourceSettings,
          }),
          strings.sourceBrowse.sourceOperationTimedOut,
        );

        if (listingRequestRef.current !== requestId) return;

        if (result.status === "blocked") {
          const nextState: ListingBrowseState = {
            status: "blocked",
            result,
            items: previousItems,
          };
          setListingState(nextState);
          if (page === 1 && cacheKey) {
            writeSourceListingCache(cacheKey, nextState);
          }
          return;
        }

        const items =
          page > 1 ? [...previousItems, ...result.items] : result.items;
        const nextState: ListingBrowseState = {
          status: "ready",
          result,
          items,
        };
        setListingState(nextState);
        if (cacheKey) {
          writeSourceListingCache(cacheKey, nextState);
        }
      } catch (error) {
        if (listingRequestRef.current !== requestId) return;
        cloudflareSheetRef.current?.reportError(error);
        setListingState({
          status: "error",
          items: previousItems,
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.listingLoadFailed,
          ),
        });
      } finally {
        if (loadingMore) {
          listingLoadMoreInFlightRef.current = false;
          setListingLoadMoreInFlight(false);
        }
      }
    },
    [
      getListingCacheKey,
      installedSource,
      resolveExecutorSourceSettings,
      selectedListing,
      strings,
    ],
  );

  useEffect(() => {
    if (!installedSource || !selectedListing || sourceSettings.loading) return;
    const cacheKey = getListingCacheKey(selectedListing);
    const cachedListingState = cacheKey
      ? readSourceListingCache(cacheKey)
      : null;
    if (
      cachedListingState &&
      cachedListingState.status !== "idle" &&
      cachedListingState.status !== "loading"
    ) {
      listingRequestRef.current += 1;
      setListingState(cachedListingState);
      return;
    }
    void loadListing(1);
  }, [
    getListingCacheKey,
    installedSource,
    loadListing,
    selectedListing,
    sourceSettings.loading,
  ]);

  const handleListingMangaPress = useCallback(
    (sourceDisplay: SearchSourceDisplay, manga: MobileLiveSearchManga) => {
      router.push(
        getMobileSourceMangaHref({
          registryId: sourceDisplay.registryId,
          sourceId: sourceDisplay.rawSourceId,
          mangaId: manga.id,
          mangaTitle: manga.title,
        }),
      );
    },
    [],
  );

  const submitSourceSearchText = useCallback(
    (text: string, options?: { haptic?: boolean }) => {
      const nextQuery = normalizeMobileSourceBrowseRouteQuery(text);
      const nextRouteQuery =
        nextQuery || (sourceFilterCount > 0 ? " " : undefined);
      const shouldRunFeedback = shouldRunMobileSourceBrowseSearchSubmitFeedback(
        {
          query: text,
          routeQuery: routeSourceSearchQuery,
          routeSearchActive: routeSourceSearchActive,
          activeFilterCount: sourceFilterCount,
        },
      );
      setSourceSearchQuery(nextQuery);
      setSubmittedSourceSearchQuery(nextQuery);
      if (
        nextQuery !== routeSourceSearchQuery ||
        Boolean(nextRouteQuery) !== routeSourceSearchActive
      ) {
        router.setParams({
          q: nextRouteQuery,
        });
      }
      if (options?.haptic && shouldRunFeedback) void hapticPress();
    },
    [routeSourceSearchActive, routeSourceSearchQuery, sourceFilterCount],
  );

  const clearSourceSearch = useCallback(() => {
    sourceSearchInputRef.current?.clearText();
    router.setParams({ q: undefined });
    sourceSearchIdleTasks.schedule(() => {
      setSourceSearchQuery("");
      setSubmittedSourceSearchQuery("");
      setSourceFilterValues([]);
      setSourceFilterPanelOpen(false);
    });
  }, [sourceSearchIdleTasks]);

  const enterSourceSearch = useCallback(() => {
    setSourceSearchQuery("");
    setSubmittedSourceSearchQuery("");
    router.setParams({ q: " " });
    sourceSearchIdleTasks.schedule(() => {
      sourceSearchInputRef.current?.focus();
    });
  }, [sourceSearchIdleTasks]);

  useEffect(() => {
    if (!sourceSearchActive) return;
    sourceSearchInputRef.current?.setText(routeSourceSearchQuery);
  }, [routeSourceSearchQuery, sourceRuntimeKey, sourceSearchActive]);

  const selectSourceHome = useCallback(() => {
    listingRequestRef.current += 1;
    setSelectedRuntimeListing(null);
    setSelectedListingId(null);
    setSourceSearchQuery("");
    setSubmittedSourceSearchQuery("");
    setSourceFilterValues([]);
    setSourceFilterPanelOpen(false);
    setListingState({
      status: "idle",
      items: [],
      detail: strings.sourceBrowse.selectListingToBrowse,
    });
    router.setParams({ tab: undefined, q: undefined });
  }, [strings]);

  const cloudflareSheet = useNemuAgentSheet({
    onSuccess: () => setRuntimeRefreshKey((current) => current + 1),
  });
  cloudflareSheetRef.current = cloudflareSheet;

  const refreshSourceData = useCallback(async () => {
    if (refreshSourceGuardRef.current) return;

    refreshSourceGuardRef.current = true;
    setRefreshingSource(true);
    setRuntimeRefreshKey((current) => current + 1);
    try {
      await installed.reload();
      await hapticConfirm();
    } catch {
      await hapticError();
    } finally {
      refreshSourceGuardRef.current = false;
      setRefreshingSource(false);
    }
  }, [installed]);

  const selectSourceListing = useCallback(
    (
      listing: SourcePackageListing,
      options: { runtimeListing?: SourcePackageListing | null } = {},
    ) => {
      const nextTab = getMobileSourceBrowseRouteTabForListingId(
        listing.id,
        listings,
        sourceHasHomeProvider,
      );

      listingRequestRef.current += 1;
      setSelectedRuntimeListing(options.runtimeListing ?? null);
      setSelectedListingId(listing.id);
      // Immediately switch the content area to a loading/progress state so the
      // tapped tab appears responsive: the selected tab updates and a progress
      // view shows right away, rather than the previous listing's grid
      // lingering (or the pressed animation hanging) while the async load
      // kicks off. The listing effect below will replace this with either the
      // cached state (instant) or the freshly fetched results.
      setListingState({
        status: "loading",
        items: [],
        detail: strings.sourceBrowse.loadingListing,
      });
      setSourceSearchQuery("");
      setSubmittedSourceSearchQuery("");
      setSourceFilterValues([]);
      setSourceFilterPanelOpen(false);
      router.setParams({
        tab: nextTab === null || nextTab === 0 ? undefined : String(nextTab),
        q: undefined,
      });
    },
    [listings, sourceHasHomeProvider, strings.sourceBrowse.loadingListing],
  );

  const changeSourceFilter = useCallback(
    (filter: Filter, value: FilterValue["value"] | undefined) => {
      const next = updateMobileSourceFilterValues(
        sourceFilterValues,
        filter,
        value,
      );
      const nextQuery =
        normalizeMobileSourceBrowseRouteQuery(sourceSearchQuery);
      setSourceFilterValues(next);
      setSubmittedSourceSearchQuery(nextQuery);
      router.setParams({
        q: next.length ? nextQuery || " " : nextQuery || undefined,
      });
    },
    [sourceFilterValues, sourceSearchQuery],
  );

  const applySourceFilters = useCallback(
    (values: FilterValue[]) => {
      const nextValues = compactMobileSourceFilterValues(values);
      const nextQuery =
        normalizeMobileSourceBrowseRouteQuery(sourceSearchQuery);
      setSourceFilterValues(nextValues);
      setSubmittedSourceSearchQuery(nextQuery);
      setSourceFilterPanelOpen(false);
      router.setParams({
        q: nextValues.length ? nextQuery || " " : nextQuery || undefined,
      });
    },
    [sourceSearchQuery],
  );

  const handleHomeListingPress = useCallback(
    (listing: Listing) => {
      const runtimeListing = {
        id: listing.id,
        name: getMobileSourceListingLabel(listing),
        kind: listing.kind,
      };
      selectSourceListing(runtimeListing, { runtimeListing });
    },
    [selectSourceListing],
  );

  const handleHomeFilterPress = useCallback(
    (values: FilterValue[]) => {
      const nextValues = compactMobileSourceFilterValues(values);
      const nextQuery =
        normalizeMobileSourceBrowseRouteQuery(sourceSearchQuery);
      setSourceFilterValues(nextValues);
      setSubmittedSourceSearchQuery(nextQuery);
      router.setParams({
        q: nextValues.length ? nextQuery || " " : nextQuery || undefined,
      });
    },
    [sourceSearchQuery],
  );

  const openSourceFilterPanel = useCallback(() => {
    setSourceFilterPanelOpen(true);
  }, []);

  const closeSourceFilterPanel = useCallback(() => {
    setSourceFilterPanelOpen(false);
  }, []);

  const sourceSearchLoadMoreBusy = isMobileSourceBrowseLoadMoreBusy({
    loading:
      sourceSearchState.status === "loading" &&
      sourceSearchState.items.length > 0,
    inFlight: sourceSearchLoadMoreInFlight,
  });
  const showSourceSearchLoadMore =
    sourceSearchState.items.length > 0 &&
    (sourceSearchLoadMoreBusy ||
      (sourceSearchState.status === "ready" &&
        sourceSearchState.result.hasMore));
  const listingLoadMoreBusy = isMobileSourceBrowseLoadMoreBusy({
    loading: listingState.status === "loading" && listingState.items.length > 0,
    inFlight: listingLoadMoreInFlight,
  });
  const showListingLoadMore =
    listingState.items.length > 0 &&
    (listingLoadMoreBusy ||
      (listingState.status === "ready" && listingState.result.hasMore));
  const listingTabFadeColor = nemuColorWithAlpha(tokens.background, 1);
  const listingTabFadeTransparent = nemuColorWithAlpha(tokens.background, 0);
  const showListingTabsLeadingFade = listingTabsScrollX > 2;
  const showListingTabsTrailingFade =
    listingTabsContentWidth - listingTabsViewportWidth - listingTabsScrollX > 2;

  const loading = installed.loading;
  const error = installed.error;
  const showSourceNotInstalled = shouldShowMobileSourceBrowseNotInstalled({
    loading,
    hasSource: Boolean(source),
    hasError: Boolean(error),
  });
  const screenTitle = source?.name ?? sourceId ?? strings.sourceBrowse.source;
  const nativeHeaderOptions = createNemuNativeScreenOptions(
    tokens,
    screenTitle,
  );
  const nativeHeaderActions: NemuNativeHeaderAction[] =
    source && !sourceSearchActive
      ? [
          {
            icon: "magnifyingglass",
            label: strings.sourceBrowse.searchSource,
            hint: strings.sourceBrowse.searchSourceHint,
            onPress: enterSourceSearch,
          },
        ]
      : [];

  // The virtualized grid's `data` is mode-aware: search results in search
  // mode, listing results when a listing tab is selected, and empty otherwise
  // (source-home mode, loading, empty, and error states are rendered by
  // ListHeaderComponent/ListEmptyComponent instead). Keeping this as a memo
  // means the FlatList only re-rows when the visible items actually change.
  // Defined before the `showSourceNotInstalled` early return so hooks run in
  // the same order on every render (rules-of-hooks).
  const listingGridItems = useMemo<MobileLiveSearchManga[]>(() => {
    if (!showExecutableSourceSections) return [];
    if (source && sourceSearchActive) return sourceSearchState.items;
    if (!sourceSearchActive && selectedListing) {
      return listingState.items;
    }
    return [];
  }, [
    source,
    sourceSearchActive,
    showExecutableSourceSections,
    selectedListing,
    sourceSearchState.items,
    listingState.items,
  ]);
  const showCenterSourceBrowseSearchProgress =
    shouldShowCenterSourceBrowseSearchProgress({
      sourceSearchActive,
      listingItemCount: listingGridItems.length,
      searchStatus: sourceSearchState.status,
      filtersStatus: sourceFiltersState.status,
    });

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [sourceSearchActive]);

  const listingGridSourceDisplay = useMemo<SearchSourceDisplay | null>(() => {
    if (source && sourceSearchActive) {
      return sourceSearchState.status === "ready"
        ? sourceSearchState.result.source
        : listingSourceDisplay;
    }
    if (
      !sourceSearchActive &&
      showExecutableSourceSections &&
      selectedListing
    ) {
      return listingState.status === "ready"
        ? listingState.result.source
        : listingSourceDisplay;
    }
    return null;
  }, [
    source,
    sourceSearchActive,
    showExecutableSourceSections,
    selectedListing,
    sourceSearchState,
    listingState,
    listingSourceDisplay,
  ]);
  const renderListingGridItem = useCallback(
    ({ item }: ListRenderItemInfo<MobileLiveSearchManga>) => {
      const sourceDisplay = listingGridSourceDisplay;
      if (!sourceDisplay) {
        return <View style={styles.gridItem} />;
      }
      return (
        <View style={styles.gridItem}>
          <ListingMangaCard
            item={item}
            onPress={() => handleListingMangaPress(sourceDisplay, item)}
            source={installedSource}
            strings={strings}
          />
        </View>
      );
    },
    [
      listingGridSourceDisplay,
      installedSource,
      strings,
      handleListingMangaPress,
    ],
  );

  if (showSourceNotInstalled) {
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeHeaderOptions,
            title: strings.sourceBrowse.source,
          }}
        />
        <PageScaffold nativeHeader>
          <EmptyLibrary
            title={strings.sourceBrowse.sourceNotInstalled}
            description={strings.sourceBrowse.installBeforeOpening}
            actionLabel={strings.sourceBrowse.browseSources}
            onActionPress={() => {
              router.replace("/browse");
            }}
          />
        </PageScaffold>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={nativeHeaderOptions} />
      {source && nativeHeaderActions.length ? (
        <Stack.Toolbar placement="right" tintColor={tokens.primary}>
          {renderNemuNativeToolbarButtons(nativeHeaderActions, tokens.primary)}
        </Stack.Toolbar>
      ) : null}
      {source && sourceSearchActive ? (
        <Stack.SearchBar
          ref={sourceSearchInputRef}
          autoCapitalize="none"
          autoFocus
          barTintColor={tokens.card}
          headerIconColor={tokens.primary}
          hideWhenScrolling={false}
          hintTextColor={tokens.mutedForeground}
          obscureBackground={false}
          onBlur={() => {
            submitSourceSearchText(sourceSearchQuery);
          }}
          onCancelButtonPress={clearSourceSearch}
          onChangeText={(event) => {
            setSourceSearchQuery(
              coerceMobileNativeSearchText(event.nativeEvent.text),
            );
          }}
          onClose={clearSourceSearch}
          onSearchButtonPress={(event) => {
            submitSourceSearchText(
              coerceMobileNativeSearchText(event.nativeEvent.text),
              { haptic: true },
            );
          }}
          placeholder={strings.sourceBrowse.searchSourcePlaceholder}
          placement="stacked"
          textColor={tokens.foreground}
          tintColor={tokens.primary}
        />
      ) : null}
      {error ? (
        <PageScaffold
          nativeHeader
          contentInsetAdjustmentBehavior="automatic"
          onRefresh={() => {
            void refreshSourceData();
          }}
          refreshDisabled={loading || !source}
          refreshLabel={strings.sourceBrowse.refreshSource}
          refreshing={refreshingSource}
        >
          <EmptyLibrary
            title={strings.sourceBrowse.sourceUnavailable}
            description={error}
            actionLabel={strings.common.retry}
            actionDisabled={refreshingSource}
            actionLoading={refreshingSource}
            onActionPress={() => {
              void refreshSourceData();
            }}
          />
        </PageScaffold>
      ) : (
        <PageListScaffold
          key={`source-browse-grid-${gridColumns}`}
          nativeHeader
          contentInsetAdjustmentBehavior="automatic"
          onRefresh={() => {
            void refreshSourceData();
          }}
          refreshDisabled={loading || !source}
          refreshLabel={strings.sourceBrowse.refreshSource}
          refreshing={refreshingSource}
          data={listingGridItems}
          keyExtractor={(item) =>
            `${listingGridSourceDisplay?.id ?? ""}:${item.id}`
          }
          numColumns={gridColumns}
          columnWrapperStyle={styles.gridRow}
          renderItem={renderListingGridItem}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={32}
          windowSize={7}
          ListHeaderComponentStyle={
            listingGridAttached ? styles.listingGridListHeader : undefined
          }
          ListHeaderComponent={
            <View style={styles.sections}>
              {sourceRuntimeUnavailableDetail ? (
                <SourceBrowseBlockedNotice
                  detail={sourceRuntimeUnavailableDetail}
                  strings={strings}
                />
              ) : null}
              {source && sourceSearchActive && showSourceSearchHeader ? (
                <View
                  style={[
                    styles.previewSection,
                    listingGridItems.length > 0
                      ? styles.gridHeaderSpacing
                      : null,
                  ]}
                >
                  {showSourceSearchControls ? (
                    <View style={styles.sourceSearchControls}>
                      {sourceFilters.length ? (
                        <NemuPressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            strings.sourceBrowse.openAllFilters
                          }
                          onPress={openSourceFilterPanel}
                          style={[
                            styles.iconButton,
                            { backgroundColor: tokens.muted },
                          ]}
                        >
                          <Ionicons
                            name="options-outline"
                            size={17}
                            color={tokens.mutedForeground}
                          />
                        </NemuPressable>
                      ) : null}
                    </View>
                  ) : null}

                  {sourceFilterCount > 0 ? (
                    <Text
                      style={[
                        styles.filterSummary,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {formatSourceBrowseCount(
                        sourceFilterCount,
                        strings.sourceBrowse.activeFilterCountOne,
                        strings.sourceBrowse.activeFilterCountOther,
                      )}
                    </Text>
                  ) : null}

                  {sourceFilters.length ? (
                    <View style={styles.sourceFilterList}>
                      {inlineSourceFilters.map((filter, index) => (
                        <SourceFilterControl
                          key={`${filter.name}:${filter.type}:${index}`}
                          filter={filter}
                          value={sourceFilterValueMap.get(
                            filterValueKey(filter),
                          )}
                          onChange={changeSourceFilter}
                          strings={strings}
                        />
                      ))}
                      {sourceFilters.length > inlineSourceFilters.length ? (
                        <NemuPressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            strings.sourceBrowse.openAllFilters
                          }
                          onPress={openSourceFilterPanel}
                          style={[
                            styles.allFiltersButton,
                            { backgroundColor: tokens.muted },
                          ]}
                        >
                          <Ionicons
                            name="options-outline"
                            size={18}
                            color={tokens.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.allFiltersText,
                              { color: tokens.mutedForeground },
                            ]}
                          >
                            {formatMobileString(
                              strings.sourceBrowse.allFilters,
                              {
                                count: sourceFilters.length,
                              },
                            )}
                          </Text>
                        </NemuPressable>
                      ) : null}
                    </View>
                  ) : sourceFiltersState.status === "blocked" &&
                    packageMetadata?.filters.length ? (
                    <SourceBrowseBlockedNotice
                      detail={sourceFiltersState.result.detail}
                      strings={strings}
                    />
                  ) : sourceFiltersState.status === "error" ? (
                    <NemuInlineEmptyState
                      icon="alert-circle-outline"
                      title={sourceFiltersState.detail}
                      tone="danger"
                    />
                  ) : null}

                  {sourceFilterPanelOpen ? (
                    <SourceFilterPanel
                      filters={sourceFilters}
                      values={sourceFilterValues}
                      onClose={closeSourceFilterPanel}
                      onApply={applySourceFilters}
                      strings={strings}
                    />
                  ) : null}
                </View>
              ) : null}

              {!sourceSearchActive &&
              showExecutableSourceSections &&
              showListingTabBar ? (
                <View
                  style={[
                    styles.previewSection,
                    listingGridAttached
                      ? styles.previewSectionListingGrid
                      : null,
                  ]}
                >
                  <View
                    style={[
                      styles.listingTabsFrame,
                      listingGridAttached
                        ? styles.listingTabsFrameGridAttached
                        : null,
                    ]}
                  >
                    <ScrollView
                      accessibilityRole="tablist"
                      horizontal
                      onContentSizeChange={(width) =>
                        setListingTabsContentWidth(width)
                      }
                      onLayout={(event) =>
                        setListingTabsViewportWidth(
                          event.nativeEvent.layout.width,
                        )
                      }
                      onScroll={(event) =>
                        setListingTabsScrollX(event.nativeEvent.contentOffset.x)
                      }
                      scrollEventThrottle={16}
                      showsHorizontalScrollIndicator={false}
                      style={styles.listingTabsScroller}
                      contentContainerStyle={styles.listingTabs}
                    >
                      {showSourceHomeTab ? (
                        <SourceListingTab
                          accessibilityLabel={strings.sourceBrowse.sourceHome}
                          canSelect={sourceHomeTabCanSelect}
                          icon={sourceHomeTabSelected ? "home" : "home-outline"}
                          label={strings.sourceBrowse.sourceHome}
                          onPress={() => {
                            if (!sourceHomeTabCanSelect) return;
                            selectSourceHome();
                          }}
                          selected={sourceHomeTabSelected}
                        />
                      ) : null}
                      {visibleListings.map((listing) => {
                        const selected = listing.id === selectedListing?.id;
                        const canSelect = canSelectMobileSourceBrowseTab({
                          selected,
                        });
                        return (
                          <SourceListingTab
                            key={listing.id}
                            accessibilityLabel={getMobileSourceListingLabel(
                              listing,
                            )}
                            canSelect={canSelect}
                            label={getMobileSourceListingLabel(listing)}
                            onPress={() => {
                              if (!canSelect) return;
                              selectSourceListing(listing);
                            }}
                            selected={selected}
                          />
                        );
                      })}
                    </ScrollView>
                    {showListingTabsLeadingFade ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={[
                          listingTabFadeColor,
                          listingTabFadeTransparent,
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.listingTabsFade,
                          styles.listingTabsFadeLeading,
                        ]}
                      />
                    ) : null}
                    {showListingTabsTrailingFade ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={[
                          listingTabFadeTransparent,
                          listingTabFadeColor,
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.listingTabsFade,
                          styles.listingTabsFadeTrailing,
                        ]}
                      />
                    ) : null}
                  </View>

                  {showSourceHomeSection &&
                  sourceHomeHasComponents &&
                  sourceHome &&
                  sourceHomeDisplay ? (
                    <View style={styles.previewSection}>
                      <SourceHomeView
                        home={sourceHome}
                        source={sourceHomeDisplay}
                        importingKey={null}
                        strings={strings}
                        onPressManga={handleListingMangaPress}
                        onListingPress={handleHomeListingPress}
                        onFilterPress={handleHomeFilterPress}
                        installedSource={installedSource}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          }
          ListFooterComponent={
            source && sourceSearchActive && showSourceSearchLoadMore ? (
              <NemuButton
                accessibilityLabel={strings.sourceBrowse.loadMore}
                disabled={sourceSearchLoadMoreBusy}
                icon="add-outline"
                label={strings.sourceBrowse.loadMore}
                loading={sourceSearchLoadMoreBusy}
                onPress={() => {
                  if (sourceSearchState.status !== "ready") return;
                  void loadSourceSearch(sourceSearchState.page + 1);
                }}
                style={styles.loadMoreButton}
                variant="secondary"
              />
            ) : !sourceSearchActive &&
              showExecutableSourceSections &&
              selectedListing &&
              showListingLoadMore ? (
              <NemuButton
                accessibilityLabel={strings.sourceBrowse.loadMore}
                disabled={listingLoadMoreBusy}
                icon="add-outline"
                label={strings.sourceBrowse.loadMore}
                loading={listingLoadMoreBusy}
                onPress={() => {
                  if (listingState.status !== "ready") return;
                  void loadListing(listingState.result.page + 1);
                }}
                style={styles.loadMoreButton}
                variant="secondary"
              />
            ) : null
          }
          ListEmptyComponent={
            sourceRuntimeUnavailable ? null : source && sourceSearchActive ? (
              sourceSearchState.status === "blocked" ? (
                <SourceBrowseBlockedNotice
                  detail={sourceSearchState.result.detail}
                  strings={strings}
                />
              ) : sourceSearchState.status === "error" ? (
                <NemuInlineEmptyState
                  icon="alert-circle-outline"
                  title={sourceSearchState.detail}
                  tone="danger"
                />
              ) : showCenterSourceBrowseSearchProgress ? (
                <SourceBrowseProgress
                  label={
                    sourceFiltersState.status === "loading"
                      ? strings.sourceBrowse.loadingFilters
                      : sourceSearchState.status === "loading"
                        ? sourceSearchState.detail
                        : strings.sourceBrowse.searchOrChooseFilters
                  }
                />
              ) : (
                <NemuInlineEmptyState
                  icon="search-outline"
                  title={strings.sourceBrowse.noLiveMatches}
                />
              )
            ) : !sourceSearchActive &&
              showExecutableSourceSections &&
              selectedListing ? (
              listingState.status === "blocked" ? (
                <SourceBrowseBlockedNotice
                  detail={listingState.result.detail}
                  strings={strings}
                />
              ) : listingState.status === "error" ? (
                <NemuInlineEmptyState
                  icon="alert-circle-outline"
                  title={listingState.detail}
                  tone="danger"
                />
              ) : listingState.status === "loading" ? (
                <SourceBrowseProgress label={listingState.detail} />
              ) : (
                <NemuInlineEmptyState
                  icon="albums-outline"
                  title={getMobileSourceListingEmptyTitle(
                    listingState.status === "ready" ? "ready" : "idle",
                    strings.sourceBrowse,
                  )}
                />
              )
            ) : !sourceSearchActive &&
              showExecutableSourceSections &&
              showSourceHomeSection ? (
              showSourceBrowseHomeSkeleton ? (
                <SourceHomeSkeletonView
                  accessibilityLabel={
                    sourceHomeState.status === "loading"
                      ? sourceHomeState.detail
                      : strings.sourceBrowse.loadingHome
                  }
                />
              ) : sourceHomeState.status === "blocked" ? (
                <SourceBrowseBlockedNotice
                  detail={sourceHomeState.result.detail}
                  strings={strings}
                />
              ) : sourceHomeState.status === "error" ? (
                <NemuInlineEmptyState
                  icon="alert-circle-outline"
                  title={sourceHomeState.detail}
                  tone="danger"
                />
              ) : sourceHomeHasComponents ? null : (
                <NemuInlineEmptyState
                  icon="home-outline"
                  title={strings.sourceBrowse.noSourceHome}
                />
              )
            ) : showSourceBrowseBootstrapping ? (
              <SourceHomeSkeletonView
                accessibilityLabel={strings.sourceBrowse.loadingHome}
              />
            ) : null
          }
        />
      )}
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
  previewSection: {
    gap: 9,
  },
  previewSectionListingGrid: {
    gap: 0,
    marginBottom: 9,
  },
  listingGridListHeader: {
    paddingBottom: 0,
  },
  sourceSearchControls: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  filterSummary: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  sourceFilterList: {
    gap: 10,
  },
  sourceFilterGroup: {
    gap: 7,
  },
  sourceNestedFilterRail: {
    gap: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
  },
  sourceFilterName: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sourceFilterChipRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceFilterChip: {
    minHeight: 34,
    maxWidth: 168,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
  },
  sourceFilterChipText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
  },
  allFiltersButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  allFiltersText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
  },
  sourceTextFilterShell: {
    minHeight: 54,
    borderRadius: radius.lg,
  },
  sourceTextFilterContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  sourceTextFilterInput: {
    flex: 1,
    minHeight: 42,
    fontSize: 13,
    lineHeight: 17,
  },
  listingTabsFrame: {
    position: "relative",
    zIndex: 1,
    overflow: "visible",
  },
  listingTabsFrameGridAttached: {
    marginBottom: 6,
  },
  listingTabsScroller: {
    marginHorizontal: -2,
  },
  listingTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    paddingTop: 4,
    // Room for web-parity box-shadow halo (up to ~8px blur below the chip).
    paddingBottom: 10,
  },
  listingTabButton: {
    flexShrink: 0,
  },
  listingTabText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  listingTabsFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: SOURCE_BROWSE_TAB_EDGE_FADE_WIDTH,
  },
  listingTabsFadeLeading: {
    left: 0,
  },
  listingTabsFadeTrailing: {
    right: 0,
  },
  sourceBrowseProgress: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  filterPanel: {
    gap: 13,
    paddingTop: 6,
  },
  filterPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterPanelTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  filterPanelTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  filterPanelSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  filterPanelCloseButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  filterPanelScroll: {
    maxHeight: 440,
  },
  filterPanelScrollContent: {
    gap: 14,
    paddingBottom: 2,
  },
  filterPanelActions: {
    flexDirection: "row",
    gap: 10,
  },
  filterPanelSecondaryButton: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  filterPanelPrimaryButton: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  filterPanelSecondaryText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  filterPanelPrimaryText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  // Virtualized grid (FlatList numColumns). `gridRow` is the per-row gap
  // (columnWrapperStyle); `gridItem` fills one column. `gridHeaderSpacing`
  // reproduces the `previewSection` gap that used to sit between the
  // controls/tabs and the grid when the grid was inlined in the section.
  gridRow: {
    gap: MOBILE_MANGA_GRID_GAP,
    marginBottom: MOBILE_MANGA_GRID_GAP,
  },
  gridItem: {
    flex: 1,
    minWidth: 0,
  },
  gridHeaderSpacing: {
    marginBottom: 9,
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
  sourceIconImage: {
    width: "100%",
    height: "100%",
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
  loadMoreButton: {
    width: "100%",
  },
});
