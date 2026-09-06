import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type FlatList,
  type ListRenderItemInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
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
import { MobileListFooter } from "@/components/MobileListFooter";
import { MobileSourceGridSkeleton } from "@/components/MobileSourceGridSkeleton";
import { setMobileSourceDetailSeed } from "@/lib/mobileSourceDetailSeed";
import {
  SourceHomeSkeletonView,
  SourceHomeView,
} from "@/components/SourceHomeView";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
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
  MobileChip,
  MobileNativeSheetScaffold,
  NemuButton,
  NemuInlineEmptyState,
  NemuPressable,
  NemuTextFieldClearAction,
  PageListScaffold,
  PageScaffold,
  createNemuNativeScreenOptions,
  createNemuShadowStyle,
  nemuColorWithAlpha,
  radius,
  renderNemuNativeToolbarButtons,
  nemuFontWeight,
  spacing,
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
import { MobileSourceMultiSelectSheet } from "@/components/MobileSourceSettingsSubSheets";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import {
  coerceMobileNativeSearchText,
  resolveMobileNativeSearchSubmitText,
} from "@/lib/mobileNativeSearchText";
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
  resolveMobileSourceBrowsePagination,
} from "@/lib/mobileSourceBrowsePagination";
import { resolveMobileListFooterState } from "@/lib/mobileListFooter";
import {
  compactMobileSourceFilterValues,
  canSelectMobileSourceSortFilterOption,
  getMobileActiveSourceFilterCount,
  getMobileInlineSourceFilters,
  getMobileCheckFilterState,
  getNextMobileCheckFilterValue,
  getMobileSortFilterSelection,
  resolveMobileSourceBrowseFilters,
  updateMobileSourceFilterValues,
} from "@/lib/mobileSourceFilterValues";
import {
  getMobileSourceFilterChipModels,
  getMobileSourceFilterChipOptions,
  getMobileSourceFilterChipSelectedValues,
  getNextMobileSourceFilterChipValue,
  shouldCloseMobileSourceFilterChipSheet,
  type MobileSourceFilterChipModel,
} from "@/lib/mobileSourceFilterChips";
import { getMobileSourceFilterSheetLayout } from "@/lib/mobileSourceFilterSheetLayout";
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
  makeMobileSourceBrowseSearchRouteQuery,
  isMobileSourceBrowseHomeTabPending,
  isMobileSourceBrowseSearchRequestPending,
  normalizeMobileSourceBrowseRouteQuery,
  normalizeMobileSourceBrowseRouteTab,
  shouldPreserveSourceBrowseSearchItemsOnDeactivate,
  shouldRenderMobileSourceBrowseSearchHeader,
  shouldRunMobileSourceBrowseSearchSubmitFeedback,
  shouldShowCenterSourceBrowseSearchProgress,
  shouldShowMobileSourceBrowseListingTabBar,
  shouldShowMobileSourceBrowseNoMatches,
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
import { getActiveMobileSourceProfileScope } from "@/sources/mobileSourceProfileScope";
import { fetchMobileSourceListing } from "@/sources/mobileSourceListings";
import {
  captureMobileGridScrollRatio,
  resolveMobileGridScrollRestoreOffset,
  shouldRestoreMobileGridScroll,
  type MobileGridScrollSnapshot,
} from "@/lib/mobileGridScrollRestore";
import {
  clearMobileSourceListingCacheForRuntime,
  readMobileSourceListingCache,
  writeMobileSourceListingCache,
  type MobileSourceListingBrowseState,
} from "@/lib/mobileSourceListingCache";
import {
  fetchMobileSourceFilters,
  type MobileSourceFiltersResult,
} from "@/sources/mobileSourceFilters";
import { hashSettings } from "@/sources/mobileSourceExecutorCache";
import {
  fetchMobileSourceBrowseMetadata,
  mergeRuntimeAndPackageFilters,
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
/**
 * Wide enough that a partially-scrolled tab's label sits fully inside the
 * opaque tail of the gradient; the ramp itself only occupies the outer half.
 */
const SOURCE_BROWSE_TAB_EDGE_FADE_WIDTH = 40;
const SOURCE_BROWSE_TAB_EDGE_FADE_OPAQUE_AT = 0.45;
const SOURCE_OPERATION_TIMEOUT_MS = DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS;
// The tab-strip edge fades ride the scroll offset on the UI thread; the
// gradients themselves never re-render.
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

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

type ListingBrowseState = MobileSourceListingBrowseState;

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
    (filter) => filter.type !== FilterType.Title,
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
  const displayName = (filter as Filter & { displayName?: unknown }).displayName;
  return typeof displayName === "string" && displayName.trim()
    ? displayName
    : filter.name;
}

function checkFilterOptionName(filter: Filter): string {
  const optionName = (filter as Filter & { optionName?: unknown }).optionName;
  return typeof optionName === "string" && optionName.trim()
    ? optionName.trim()
    : filter.name;
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
  const coverRequestAlreadyResolved = item.coverHeaders !== undefined;
  const coverRequest = useMobileSourceImageRequest(
    coverRequestAlreadyResolved ? null : source,
    coverRequestAlreadyResolved ? null : item.cover,
  );
  const coverSource = item.cover
    ? coverRequestAlreadyResolved
      ? {
          uri: item.cover,
          headers: item.coverHeaders,
          cache: "force-cache" as const,
        }
      : coverRequest
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

/**
 * One option inside the expanded filter panel. The panel's options are the
 * same pill as the chip row above it, so this is a thin `MobileChip` wrapper
 * that only defaults the accessibility label to the visible one.
 */
function SourceFilterChip({
  label,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  selected,
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
  hapticFeedback?: NemuPressableHapticFeedback;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <MobileChip
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      hapticFeedback={
        hapticFeedback ??
        (accessibilityRole === "button" ? "press" : "selection")
      }
      label={label}
      onLongPress={onLongPress}
      onPress={onPress}
      selected={selected}
      variant="toggle"
    />
  );
}

/**
 * The whole browse filter surface in one row: a funnel that opens the full
 * panel, then one compact chip per top-level group. Menu chips summarise their
 * current value and hand off to a picker sheet; check groups stay in-place
 * toggles because a tri-state boolean has nothing to pick from. This replaced
 * the stacked per-group chip rows, which pushed the first cover off-screen on
 * a phone.
 */
function SourceFilterChipRow({
  chips,
  activeFilterCount,
  strings,
  onOpenPanel,
  onOpenGroup,
  onToggleCheck,
}: {
  chips: MobileSourceFilterChipModel[];
  activeFilterCount: number;
  strings: MobileStrings;
  onOpenPanel: () => void;
  onOpenGroup: (filter: Filter) => void;
  onToggleCheck: (filter: Filter) => void;
}) {
  return (
    <View style={styles.sourceFilterChipRowFrame}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sourceFilterChipRowContent}
      >
        <MobileChip
          accessibilityLabel={strings.sourceBrowse.openAllFilters}
          accessibilityHint={strings.sourceBrowse.openAllFilters}
          badge={activeFilterCount ? String(activeFilterCount) : undefined}
          fallbackIcon="funnel-outline"
          hapticFeedback="press"
          onPress={onOpenPanel}
          selected={activeFilterCount > 0}
          testID="SourceFilterFunnelChip"
          variant="icon"
        />
        {chips.map((chip, index) =>
          chip.kind === "toggle" ? (
            <MobileChip
              key={`${chip.filter.name}:${chip.filter.type}:${index}`}
              accessibilityHint={
                "canExclude" in chip.filter && chip.filter.canExclude
                  ? strings.sourceBrowse.sourceFilterCycleHint
                  : undefined
              }
              accessibilityLabel={sourceFilterOptionAccessibilityLabel(
                chip.filter,
                chip.label,
                strings,
              )}
              accessibilityRole="checkbox"
              label={chip.label}
              onPress={() => onToggleCheck(chip.filter)}
              selected={chip.active}
              variant="toggle"
            />
          ) : (
            <MobileChip
              key={`${chip.filter.name}:${chip.filter.type}:${index}`}
              accessibilityHint={strings.sourceBrowse.sourceFilterChipHint}
              accessibilityLabel={chip.label}
              accessibilityRole="button"
              hapticFeedback="press"
              label={chip.label}
              onPress={() => onOpenGroup(chip.filter)}
              selected={chip.active}
              variant="menu"
            />
          ),
        )}
      </ScrollView>
    </View>
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

  if (filter.type === FilterType.Title) return null;

  if (filter.type === FilterType.Group) {
    const group = filter as GroupFilter;
    const childFilters = group.filters.filter(
      (childFilter) =>
        childFilter.type !== FilterType.Title,
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

  if (filter.type === FilterType.Text || filter.type === FilterType.Author) {
    const textValue = typeof value?.value === "string" ? value.value : "";
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
          placeholder={
            ("placeholder" in filter ? filter.placeholder : undefined) ??
            strings.sourceBrowse.anyFilter
          }
          placeholderTextColor={tokens.mutedForeground}
          selectionColor={tokens.primary}
          accessibilityLabel={sourceFilterTextAccessibilityLabel(
            filter,
            strings,
          )}
          value={textValue}
          onChangeText={(text) =>
            onChange(filter, text.trim() ? text : undefined)
          }
          style={[styles.sourceTextFilterInput, { color: tokens.foreground }]}
        />
        {textValue.length > 0 ? (
          <NemuTextFieldClearAction
            accessibilityLabel={strings.common.clear}
            onPress={() => onChange(filter, undefined)}
            testID={`SourceTextFilterClearAction:${filter.name}`}
            trailingInset={12}
          />
        ) : null}
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
    const choiceLabel = checkFilterOptionName(filter);
    const optionLabel =
      state === 2
        ? formatMobileString(strings.sourceBrowse.notFilter, {
            option: choiceLabel,
          })
        : choiceLabel;
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

/**
 * One filter group presented as the same selection sub-sheet the source
 * settings card uses, so a picker looks identical wherever it is opened from.
 * Every tap applies immediately through the screen's existing debounce/abort
 * path — there is no confirm step, matching the retired inline chips.
 *
 * Single-choice groups (select/sort) lead with a synthetic "any" row so the
 * filter can still be cleared; sort groups additionally allow re-tapping the
 * current option to flip the direction. Genre groups keep the tri-state
 * semantics of the old chips: tap includes, long press excludes.
 */
function SourceFilterGroupSheet({
  filter,
  value,
  visible,
  strings,
  onChange,
  onClose,
  onDismiss,
}: {
  filter: Filter;
  value?: FilterValue;
  visible: boolean;
  strings: MobileStrings;
  onChange: (filter: Filter, value: FilterValue["value"] | undefined) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const multiSelect = filter.type === FilterType.Genre;
  const canExclude =
    multiSelect && "canExclude" in filter && Boolean(filter.canExclude);

  return (
    <MobileSourceMultiSelectSheet
      allowReselect={filter.type === FilterType.Sort}
      disabled={false}
      formatOptionAccessibilityLabel={(option) =>
        sourceFilterOptionAccessibilityLabel(filter, option.label, strings)
      }
      optionHint={
        canExclude ? strings.sourceBrowse.sourceFilterExcludeHint : undefined
      }
      options={getMobileSourceFilterChipOptions(filter, value, strings)}
      selectedValues={getMobileSourceFilterChipSelectedValues(filter, value)}
      setting={{ title: filterLabel(filter) }}
      single={!multiSelect}
      strings={strings}
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      onLongPressOption={
        canExclude
          ? (optionValue) => {
              onChange(
                filter,
                getNextMobileSourceFilterChipValue({
                  filter,
                  value,
                  optionValue,
                  mode: "exclude",
                }),
              );
            }
          : undefined
      }
      onToggle={(optionValue) => {
        onChange(
          filter,
          getNextMobileSourceFilterChipValue({
            filter,
            value,
            optionValue,
            mode: "select",
          }),
        );
        if (
          shouldCloseMobileSourceFilterChipSheet({ filter, value, optionValue })
        ) {
          onClose();
        }
      }}
    />
  );
}

function SourceFilterPanel({
  visible,
  filters,
  values,
  onClose,
  onDismiss,
  onApply,
  strings,
}: {
  visible: boolean;
  filters: Filter[];
  values: FilterValue[];
  onClose: () => void;
  onDismiss: () => void;
  onApply: (values: FilterValue[]) => void;
  strings: MobileStrings;
}) {
  const { fontScale, height, width } = useWindowDimensions();
  const [draftValues, setDraftValues] = useState<FilterValue[]>(values);
  const wasVisibleRef = useRef(false);
  const sheetLayout = getMobileSourceFilterSheetLayout({
    fontScale,
    height,
    width,
  });

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      // The native host survives its dismissal animation, so reset the draft
      // only when a new controlled presentation session actually begins.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftValues(values);
    }
    wasVisibleRef.current = visible;
  }, [values, visible]);

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
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.sourceBrowse.sourceFilters}
      subtitle={
        draftActiveCount
          ? formatSourceBrowseCount(
              draftActiveCount,
              strings.sourceBrowse.activeFilterCountOne,
              strings.sourceBrowse.activeFilterCountOther,
            )
          : formatSourceBrowseCount(
              filters.length,
              strings.sourceBrowse.availableFilterCountOne,
              strings.sourceBrowse.availableFilterCountOther,
            )
      }
      dismissLabel={strings.sourceBrowse.closeFilters}
      snapPoints={sheetLayout.snapPoints}
      contentStyle={styles.filterPanel}
      testID="SourceFilterSheet"
    >
      <ScrollView
        contentContainerStyle={styles.filterPanelScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={
          sheetLayout.bounded
            ? styles.filterPanelScrollBounded
            : styles.filterPanelScroll
        }
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
        <NemuButton
          accessibilityLabel={strings.sourceBrowse.resetFilters}
          containerStyle={styles.filterPanelActionContainer}
          label={strings.sourceBrowse.resetFilters}
          onPress={resetDraftFilters}
          size="lg"
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.sourceBrowse.applyFilters}
          containerStyle={styles.filterPanelActionContainer}
          label={strings.sourceBrowse.applyFilters}
          onPress={applyDraftFilters}
          size="lg"
          variant="default"
        />
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
  const listingLastPageRef = useRef(1);
  const [listingTabsViewportWidth, setListingTabsViewportWidth] = useState(0);
  const [listingTabsContentWidth, setListingTabsContentWidth] = useState(0);
  // The tab strip's scroll offset only decides whether the two edge fades are
  // shown. Holding it in JS state re-rendered this screen on every 16ms scroll
  // frame; the offset now lives on the UI thread and the fades follow it there.
  const listingTabsScrollX = useSharedValue(0);
  const handleListingTabsScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      listingTabsScrollX.value = event.contentOffset.x;
    },
  });
  const [runtimeRefreshKey, setRuntimeRefreshKey] = useState(0);
  const [sourceHomeState, setSourceHomeState] = useState<SourceHomeState>({
    status: "idle",
    home: null,
    detail: strings.sourceBrowse.sourceHomeIdle,
  });
  const sourceHomeRequestRef = useRef(0);
  const sourceHomeResultKeyRef = useRef<string | null>(null);
  /** Retrying the home rails re-runs only the home fetch. Bumping
   * `runtimeRefreshKey` instead would rotate the listing cache key and throw
   * away every cached listing page the user already paid for. */
  const [sourceHomeRetryKey, setSourceHomeRetryKey] = useState(0);
  const gridScrollSnapshotRef = useRef<MobileGridScrollSnapshot>({
    offset: 0,
    contentHeight: 0,
    viewportHeight: 0,
  });
  const gridScrollRef = useRef<FlatList<MobileLiveSearchManga> | null>(null);
  const pendingGridScrollRatioRef = useRef<number | null>(null);
  const gridColumnsRef = useRef(0);
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
  const sourceSearchQueryRef = useRef(routeSourceSearchQuery);
  const [submittedSourceSearchQuery, setSubmittedSourceSearchQuery] = useState(
    routeSourceSearchQuery,
  );
  const [sourceFilterValues, setSourceFilterValues] = useState<FilterValue[]>(
    [],
  );
  const [sourceFilterPanelOpen, setSourceFilterPanelOpen] = useState(false);
  // The per-group picker is addressed by filter name, not by object, so a
  // filters refetch that rebuilds the `Filter[]` cannot strand an open sheet
  // on a stale group.
  const [sourceFilterGroupName, setSourceFilterGroupName] = useState<
    string | null
  >(null);
  const [sourceFilterGroupOpen, setSourceFilterGroupOpen] = useState(false);
  const [sourceFilterPresentation, setSourceFilterPresentation] = useState<{
    filters: Filter[];
    values: FilterValue[];
  } | null>(null);
  const pendingSourceFilterApplyRef = useRef<{
    values: FilterValue[];
    query: string;
  } | null>(null);
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
  const sourceSearchLastPageRef = useRef(1);
  const sourceSearchRequestRef = useRef(0);
  const sourceSearchAbortRef = useRef<AbortController | null>(null);
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
    sourceSearchQueryRef.current = routeSourceSearchQuery;
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
  // `FlatList` throws when `numColumns` changes on a mounted list, so a
  // rotation has to remount the grid. Capture the scroll proportion in the
  // same pass that changes the key — the remounted list reports its new
  // content size before effects run.
  if (gridColumnsRef.current !== 0 && gridColumnsRef.current !== gridColumns) {
    pendingGridScrollRatioRef.current = captureMobileGridScrollRatio(
      gridScrollSnapshotRef.current,
    );
  }
  gridColumnsRef.current = gridColumns;
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
  // Filters shipped with the installed package, shaped exactly the way the
  // runtime metadata will shape them. They stand in for the runtime answer
  // while it is in flight so the chip row and the filter toolbar button are
  // part of the first paint instead of arriving a metadata fetch later.
  const packageSourceFilters = useMemo(
    () =>
      filterSourceBrowseControls(
        mergeRuntimeAndPackageFilters([], packageMetadata?.filters ?? []),
      ),
    [packageMetadata?.filters],
  );
  const sourceFilters = resolveMobileSourceBrowseFilters({
    filtersStatus: sourceFiltersState.status,
    runtimeFilters: sourceFiltersState.filters,
    packageFilters: packageSourceFilters,
  });
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
  const sourceFilterChips = useMemo(
    () =>
      getMobileSourceFilterChipModels(
        inlineSourceFilters,
        sourceFilterValues,
        strings,
      ),
    [inlineSourceFilters, sourceFilterValues, strings],
  );
  const sourceFilterGroup = useMemo(
    () =>
      sourceFilterGroupName
        ? (sourceFilters.find(
            (filter) => filter.name === sourceFilterGroupName,
          ) ?? null)
        : null,
    [sourceFilterGroupName, sourceFilters],
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
  // In search mode the screen always has a request coming: an empty query with
  // no filters still asks the source for its default page. So an `idle` search
  // state here is the pre-request window (browse metadata in flight, or the
  // 250ms search debounce), not an invitation to type.
  const sourceSearchRequestPending = isMobileSourceBrowseSearchRequestPending({
    sourceSearchActive,
    hasSource: Boolean(source),
    searchStatus: sourceSearchState.status,
  });
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
    sourceHomeProviderKnown,
    homeStatus: sourceHomeState.status,
    sourceHomeHasComponents,
  });

  useEffect(() => {
    listingItemsRef.current = listingState.items;
    listingPaginationRef.current = resolveMobileSourceBrowsePagination(
      listingPaginationRef.current,
      {
        loading: listingState.status === "loading",
        readyHasMore:
          listingState.status === "ready"
            ? listingState.result.hasMore
            : undefined,
      },
    );
  }, [listingState]);

  useEffect(() => {
    listingRequestRef.current += 1;
  }, [runtimeRefreshKey, selectedListing?.id, sourceRuntimeKey]);

  // A rotation captures a scroll ratio for the remounted grid, but a restore
  // that the new content size declines leaves the ratio queued. Switching tab,
  // listing, or search mode retires it so a later pagination append cannot
  // jump the user to a ratio captured against a different list.
  useEffect(() => {
    pendingGridScrollRatioRef.current = null;
  }, [selectedListingId, sourceRuntimeKey, sourceSearchActive]);

  useEffect(() => {
    setSourceBrowseMetadataState({ status: "idle" });
    setSourceFiltersState({
      status: "idle",
      filters: [],
      detail: sourceBrowseStringsRef.current.sourceFiltersIdle,
    });
    clearMobileSourceListingCacheForRuntime(
      sourceRuntimeKey,
      sourceProfileScope,
    );
    setListingTabsContentWidth(0);
    listingTabsScrollX.value = 0;
    setListingTabsViewportWidth(0);
  }, [listingTabsScrollX, sourceProfileScope, sourceRuntimeKey]);

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
              emitMobileDataChanged("sources");
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
    sourceSearchPaginationRef.current = resolveMobileSourceBrowsePagination(
      sourceSearchPaginationRef.current,
      {
        loading: sourceSearchState.status === "loading",
        readyHasMore:
          sourceSearchState.status === "ready"
            ? sourceSearchState.result.hasMore
            : undefined,
      },
    );
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
        if (result.hasHomeProvider && !result.onlySearch && !result.home) {
          // The Aidoku runtime swallows getHome failures into a null layout,
          // so a timed-out or errored home request arrives here looking like
          // "no sections". A source that declares a home provider and hands
          // back nothing is a failure the user can retry, not an empty page.
          setSourceHomeState({
            status: "error",
            home: null,
            detail: strings.sourceBrowse.homeUnavailable,
          });
          return;
        }
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
    sourceHomeRetryKey,
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
      sourceSearchAbortRef.current?.abort();
      const controller = new AbortController();
      sourceSearchAbortRef.current = controller;
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
      // Mirror the transition into the guard ref synchronously: the passive
      // sync effect below runs a frame after commit, and a trigger landing in
      // that gap must not read stale values.
      sourceSearchPaginationRef.current =
        resolveMobileSourceBrowsePagination(sourceSearchPaginationRef.current, {
          loading: true,
        });
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
            signal: controller.signal,
          }),
          strings.sourceBrowse.sourceOperationTimedOut,
        );
        if (sourceSearchRequestRef.current !== requestId) return;

        if (result.status === "blocked") {
          sourceSearchPaginationRef.current =
            resolveMobileSourceBrowsePagination(
              sourceSearchPaginationRef.current,
              { loading: false },
            );
          setSourceSearchState({
            status: "blocked",
            result,
            items: previousItems,
          });
          return;
        }

        const items =
          page > 1 ? [...previousItems, ...result.items] : result.items;
        sourceSearchLastPageRef.current = page;
        sourceSearchPaginationRef.current =
          resolveMobileSourceBrowsePagination(
            sourceSearchPaginationRef.current,
            { loading: false, readyHasMore: result.hasMore },
          );
        setSourceSearchState({
          status: "ready",
          result,
          items,
          page,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (sourceSearchRequestRef.current !== requestId) return;
        cloudflareSheetRef.current?.reportError(error);
        sourceSearchPaginationRef.current =
          resolveMobileSourceBrowsePagination(
            sourceSearchPaginationRef.current,
            { loading: false },
          );
        setSourceSearchState({
          status: "error",
          items: previousItems,
          detail: describeMobileErrorDetail(
            error,
            strings.sourceBrowse.sourceSearchFailed,
          ),
        });
      } finally {
        if (sourceSearchAbortRef.current === controller) {
          sourceSearchAbortRef.current = null;
        }
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

  // Everything that genuinely changes source search results. The effect below
  // also re-runs on incidental churn (installed-source identity, settings
  // loading flips, string tables); an unchanged key must not wipe the results
  // and re-search.
  const sourceSearchRequestKey = sourceSearchActive
    ? `${sourceHomeGenerationKey}:${sourceSearchTerm}:${JSON.stringify(
        compactMobileSourceFilterValues(sourceFilterValues),
      )}`
    : null;
  const loadedSourceSearchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!installedSource || sourceSettings.loading) return;
    if (!sourceSearchActive) {
      sourceSearchAbortRef.current?.abort();
      sourceSearchRequestRef.current += 1;
      loadedSourceSearchKeyRef.current = null;
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
    if (loadedSourceSearchKeyRef.current === sourceSearchRequestKey) return;
    loadedSourceSearchKeyRef.current = sourceSearchRequestKey;
    const attemptedKey = sourceSearchRequestKey;
    let settled = false;
    const debounce = setTimeout(() => {
      void loadSourceSearch(1).finally(() => {
        settled = true;
      });
    }, 250);
    return () => {
      clearTimeout(debounce);
      // The guard exists so incidental dep churn (installed-source identity,
      // string tables, a settings-loading flip) cannot re-run a search that
      // already produced results. It must not also swallow the *restart* of an
      // attempt this cleanup is cancelling: marking the key loaded before the
      // request ran meant a churn during the 250ms debounce — or during a
      // 12s source HTTP timeout — aborted the only attempt and then declined
      // to start another, leaving the screen on its pre-request idle state.
      if (!settled && loadedSourceSearchKeyRef.current === attemptedKey) {
        loadedSourceSearchKeyRef.current = null;
      }
      sourceSearchAbortRef.current?.abort();
    };
  }, [
    installedSource,
    loadSourceSearch,
    runtimeRefreshKey,
    sourceExpectsHomeTab,
    sourceSearchActive,
    sourceSearchRequestKey,
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
      // Mirror the transition into the guard ref synchronously: the passive
      // sync effect below runs a frame after commit, and a trigger landing in
      // that gap must not read stale values.
      listingPaginationRef.current = resolveMobileSourceBrowsePagination(
        listingPaginationRef.current,
        { loading: true },
      );
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
          listingPaginationRef.current = resolveMobileSourceBrowsePagination(
            listingPaginationRef.current,
            { loading: false },
          );
          const nextState: ListingBrowseState = {
            status: "blocked",
            result,
            items: previousItems,
          };
          setListingState(nextState);
          if (page === 1 && cacheKey) {
            writeMobileSourceListingCache(cacheKey, nextState);
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
        listingLastPageRef.current = page;
        listingPaginationRef.current = resolveMobileSourceBrowsePagination(
          listingPaginationRef.current,
          { loading: false, readyHasMore: result.hasMore },
        );
        setListingState(nextState);
        if (cacheKey) {
          writeMobileSourceListingCache(cacheKey, nextState);
        }
      } catch (error) {
        if (listingRequestRef.current !== requestId) return;
        cloudflareSheetRef.current?.reportError(error);
        listingPaginationRef.current = resolveMobileSourceBrowsePagination(
          listingPaginationRef.current,
          { loading: false },
        );
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
      ? readMobileSourceListingCache(cacheKey)
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
      setMobileSourceDetailSeed(
        sourceDisplay.registryId,
        sourceDisplay.rawSourceId,
        manga.id,
        manga,
      );
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
      sourceSearchQueryRef.current = nextQuery;
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
    sourceSearchQueryRef.current = "";
    router.setParams({ q: undefined });
    sourceSearchIdleTasks.schedule(() => {
      setSourceSearchQuery("");
      setSubmittedSourceSearchQuery("");
      setSourceFilterValues([]);
      setSourceFilterPanelOpen(false);
    });
  }, [sourceSearchIdleTasks]);

  const enterSourceSearch = useCallback(() => {
    sourceSearchQueryRef.current = "";
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
    sourceSearchQueryRef.current = "";
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

  /**
   * The home rails failing is a home-fetch failure, not a stale-runtime
   * failure. Re-run just that request: a full refresh rotates
   * `runtimeRefreshKey`, which is part of the listing cache key, so every
   * already-loaded listing page would be thrown away too.
   */
  const retrySourceHome = useCallback(() => {
    sourceHomeResultKeyRef.current = null;
    setSourceHomeRetryKey((current) => current + 1);
  }, []);

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
        q: makeMobileSourceBrowseSearchRouteQuery(nextQuery),
      });
    },
    [sourceFilterValues, sourceSearchQuery],
  );

  const applySourceFilters = useCallback(
    (values: FilterValue[]) => {
      if (pendingSourceFilterApplyRef.current) return;
      const nextValues = compactMobileSourceFilterValues(values);
      const nextQuery =
        normalizeMobileSourceBrowseRouteQuery(sourceSearchQuery);
      pendingSourceFilterApplyRef.current = {
        values: nextValues,
        query: nextQuery,
      };
      setSourceFilterPanelOpen(false);
    },
    [sourceSearchQuery],
  );

  const handleSourceFilterPanelDismissed = useCallback(() => {
    setSourceFilterPanelOpen(false);
    const pending = pendingSourceFilterApplyRef.current;
    pendingSourceFilterApplyRef.current = null;
    if (pending) {
      setSourceFilterValues(pending.values);
      setSubmittedSourceSearchQuery(pending.query);
      router.setParams({
        q: makeMobileSourceBrowseSearchRouteQuery(pending.query),
      });
    }
    setSourceFilterPresentation(null);
  }, []);

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
    if (!sourceFilters.length || sourceFilterPresentation) return;
    pendingSourceFilterApplyRef.current = null;
    setSourceFilterPresentation({
      filters: sourceFilters,
      values: sourceFilterValues,
    });
    setSourceFilterPanelOpen(true);
  }, [sourceFilterPresentation, sourceFilterValues, sourceFilters]);

  const closeSourceFilterPanel = useCallback(() => {
    setSourceFilterPanelOpen(false);
  }, []);

  const openSourceFilterGroup = useCallback(
    (filter: Filter) => {
      // Only one native sheet can be presented at a time; the funnel's full
      // panel always wins.
      if (sourceFilterPresentation) return;
      setSourceFilterGroupName(filter.name);
      setSourceFilterGroupOpen(true);
    },
    [sourceFilterPresentation],
  );

  const closeSourceFilterGroup = useCallback(() => {
    setSourceFilterGroupOpen(false);
  }, []);

  const handleSourceFilterGroupDismissed = useCallback(() => {
    setSourceFilterGroupOpen(false);
    setSourceFilterGroupName(null);
  }, []);

  const toggleSourceCheckFilter = useCallback(
    (filter: Filter) => {
      if (filter.type !== FilterType.Check) return;
      changeSourceFilter(
        filter,
        getNextMobileCheckFilterValue(
          filter,
          sourceFilterValueMap.get(filterValueKey(filter)),
        ),
      );
    },
    [changeSourceFilter, sourceFilterValueMap],
  );

  const sourceSearchLoadMoreBusy = isMobileSourceBrowseLoadMoreBusy({
    loading:
      sourceSearchState.status === "loading" &&
      sourceSearchState.items.length > 0,
    inFlight: sourceSearchLoadMoreInFlight,
  });
  const listingLoadMoreBusy = isMobileSourceBrowseLoadMoreBusy({
    loading: listingState.status === "loading" && listingState.items.length > 0,
    inFlight: listingLoadMoreInFlight,
  });
  const listingTabFadeColor = nemuColorWithAlpha(tokens.background, 1);
  const listingTabFadeTransparent = nemuColorWithAlpha(tokens.background, 0);
  const listingTabsLeadingFadeStyle = useAnimatedStyle(() => ({
    opacity: listingTabsScrollX.value > 2 ? 1 : 0,
  }));
  const listingTabsTrailingFadeStyle = useAnimatedStyle(() => ({
    opacity:
      listingTabsContentWidth -
        listingTabsViewportWidth -
        listingTabsScrollX.value >
      2
        ? 1
        : 0,
  }));

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
    source && sourceSearchActive && showSourceSearchControls
      ? [
          {
            icon: "line.3.horizontal.decrease",
            label: strings.sourceBrowse.openAllFilters,
            hint: strings.sourceBrowse.openAllFilters,
            onPress: openSourceFilterPanel,
          },
        ]
      : source && !sourceSearchActive
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
      searchRequestPending: sourceSearchRequestPending,
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

  // The ~190-line grid header rebuilt its whole subtree on every render of
  // this screen — including each pagination append and every scroll-driven
  // state change. Memoizing the element lets React skip it unless something
  // it actually shows changed.
  const hasListingGridItems = listingGridItems.length > 0;
  const listingGridHeader = useMemo(
    () => (
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
              styles.sourceFilterHeaderSpacing,
              hasListingGridItems
                ? styles.gridHeaderSpacing
                : styles.emptyGridHeaderSpacing,
            ]}
          >
            {sourceFilters.length ? (
              <SourceFilterChipRow
                activeFilterCount={sourceFilterCount}
                chips={sourceFilterChips}
                strings={strings}
                onOpenGroup={openSourceFilterGroup}
                onOpenPanel={openSourceFilterPanel}
                onToggleCheck={toggleSourceCheckFilter}
              />
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
              <Animated.ScrollView
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
                onScroll={handleListingTabsScroll}
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
              </Animated.ScrollView>
              <AnimatedLinearGradient
                pointerEvents="none"
                colors={[listingTabFadeColor, listingTabFadeTransparent]}
                locations={[0, SOURCE_BROWSE_TAB_EDGE_FADE_OPAQUE_AT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.listingTabsFade,
                  styles.listingTabsFadeLeading,
                  listingTabsLeadingFadeStyle,
                ]}
              />
              <AnimatedLinearGradient
                pointerEvents="none"
                colors={[listingTabFadeTransparent, listingTabFadeColor]}
                locations={[SOURCE_BROWSE_TAB_EDGE_FADE_OPAQUE_AT, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.listingTabsFade,
                  styles.listingTabsFadeTrailing,
                  listingTabsTrailingFadeStyle,
                ]}
              />
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
    ),
    [
      handleHomeFilterPress,
      handleHomeListingPress,
      handleListingMangaPress,
      handleListingTabsScroll,
      hasListingGridItems,
      installedSource,
      listingGridAttached,
      listingTabFadeColor,
      listingTabFadeTransparent,
      listingTabsLeadingFadeStyle,
      listingTabsTrailingFadeStyle,
      openSourceFilterGroup,
      openSourceFilterPanel,
      packageMetadata?.filters.length,
      selectSourceHome,
      selectSourceListing,
      selectedListing?.id,
      showExecutableSourceSections,
      showListingTabBar,
      showSourceHomeSection,
      showSourceHomeTab,
      showSourceSearchHeader,
      source,
      sourceFilterChips,
      sourceFilterCount,
      sourceFilters.length,
      sourceFiltersState,
      sourceHome,
      sourceHomeDisplay,
      sourceHomeHasComponents,
      sourceHomeTabCanSelect,
      sourceHomeTabSelected,
      sourceRuntimeUnavailableDetail,
      sourceSearchActive,
      strings,
      toggleSourceCheckFilter,
      visibleListings,
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
            submitSourceSearchText(
              resolveMobileNativeSearchSubmitText(
                undefined,
                sourceSearchQueryRef.current,
              ),
            );
          }}
          onCancelButtonPress={clearSourceSearch}
          onChangeText={(event) => {
            const nextQuery = coerceMobileNativeSearchText(
              event.nativeEvent.text,
            );
            sourceSearchQueryRef.current = nextQuery;
            setSourceSearchQuery(nextQuery);
          }}
          onClose={clearSourceSearch}
          onSearchButtonPress={(event) => {
            sourceSearchInputRef.current?.blur();
            submitSourceSearchText(
              resolveMobileNativeSearchSubmitText(
                event.nativeEvent.text,
                sourceSearchQueryRef.current,
              ),
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
          listRef={gridScrollRef}
          nativeHeader
          contentInsetAdjustmentBehavior="automatic"
          onLayout={(event) => {
            gridScrollSnapshotRef.current = {
              ...gridScrollSnapshotRef.current,
              viewportHeight: event.nativeEvent.layout.height,
            };
          }}
          onScroll={(event) => {
            gridScrollSnapshotRef.current = {
              offset: event.nativeEvent.contentOffset.y,
              contentHeight: event.nativeEvent.contentSize.height,
              viewportHeight: event.nativeEvent.layoutMeasurement.height,
            };
          }}
          // The handler only stores a snapshot for the rotation restore, so
          // it does not need a frame-rate feed.
          scrollEventThrottle={100}
          onContentSizeChange={(_width, contentHeight) => {
            const ratio = pendingGridScrollRatioRef.current;
            const viewportHeight = gridScrollSnapshotRef.current.viewportHeight;
            if (
              !shouldRestoreMobileGridScroll({
                ratio,
                contentHeight,
                viewportHeight,
              })
            ) {
              return;
            }
            pendingGridScrollRatioRef.current = null;
            gridScrollRef.current?.scrollToOffset({
              offset: resolveMobileGridScrollRestoreOffset({
                ratio: ratio ?? 0,
                contentHeight,
                viewportHeight,
              }),
              animated: false,
            });
          }}
          onRefresh={() => {
            void refreshSourceData();
          }}
          refreshDisabled={loading || !source}
          refreshLabel={strings.sourceBrowse.refreshSource}
          refreshing={refreshingSource}
          onEndReached={() => {
            if (source && sourceSearchActive) {
              if (sourceSearchState.status !== "ready") return;
              void loadSourceSearch(sourceSearchState.page + 1);
              return;
            }
            if (listingState.status !== "ready") return;
            void loadListing(listingState.result.page + 1);
          }}
          onEndReachedThreshold={0.6}
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
          ListHeaderComponent={listingGridHeader}
          ListFooterComponent={
            source && sourceSearchActive ? (
              <MobileListFooter
                onRetry={() =>
                  void loadSourceSearch(sourceSearchLastPageRef.current + 1)
                }
                pageNumber={sourceSearchLastPageRef.current + 1}
                state={resolveMobileListFooterState({
                  hasMore:
                    sourceSearchState.status === "ready"
                      ? sourceSearchState.result.hasMore
                      : undefined,
                  itemCount: sourceSearchState.items.length,
                  loadingNextPage: sourceSearchLoadMoreBusy,
                  nextPageFailed: sourceSearchState.status === "error",
                })}
                strings={strings}
                totalCount={sourceSearchState.items.length}
              />
            ) : !sourceSearchActive &&
              showExecutableSourceSections &&
              selectedListing ? (
              <MobileListFooter
                onRetry={() => void loadListing(listingLastPageRef.current + 1)}
                pageNumber={listingLastPageRef.current + 1}
                state={resolveMobileListFooterState({
                  hasMore:
                    listingState.status === "ready"
                      ? listingState.result.hasMore
                      : undefined,
                  itemCount: listingState.items.length,
                  loadingNextPage: listingLoadMoreBusy,
                  nextPageFailed: listingState.status === "error",
                })}
                strings={strings}
                totalCount={listingState.items.length}
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
                  actionLabel={strings.common.retry}
                  icon="alert-circle-outline"
                  onActionPress={() => {
                    void loadSourceSearch(1);
                  }}
                  title={sourceSearchState.detail}
                  tone="danger"
                />
              ) : showCenterSourceBrowseSearchProgress ? (
                <MobileSourceGridSkeleton
                  accessibilityLabel={
                    sourceSearchState.status === "loading"
                      ? sourceSearchState.detail
                      : sourceFiltersState.status === "ready"
                        ? strings.sourceBrowse.searchThisSource
                        : strings.sourceBrowse.loadingFilters
                  }
                />
              ) : (
                <NemuInlineEmptyState
                  icon="search-outline"
                  title={
                    // Only a *completed* search can honestly report "no
                    // matches". An idle/loading state here means the request
                    // never ran or never landed, and calling that an empty
                    // result hid real source failures behind it.
                    shouldShowMobileSourceBrowseNoMatches(
                      sourceSearchState.status,
                    )
                      ? strings.sourceBrowse.noLiveMatches
                      : strings.sourceBrowse.searchOrChooseFilters
                  }
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
                  actionLabel={strings.common.retry}
                  icon="alert-circle-outline"
                  onActionPress={() => {
                    void loadListing(1);
                  }}
                  title={listingState.detail}
                  tone="danger"
                />
              ) : listingState.status === "loading" ? (
                <MobileSourceGridSkeleton
                  accessibilityLabel={listingState.detail}
                />
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
                  actionLabel={strings.common.retry}
                  icon="alert-circle-outline"
                  onActionPress={retrySourceHome}
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
      {sourceFilterPresentation ? (
        <SourceFilterPanel
          visible={sourceFilterPanelOpen}
          filters={sourceFilterPresentation.filters}
          values={sourceFilterPresentation.values}
          onClose={closeSourceFilterPanel}
          onDismiss={handleSourceFilterPanelDismissed}
          onApply={applySourceFilters}
          strings={strings}
        />
      ) : null}
      {sourceFilterGroup ? (
        <SourceFilterGroupSheet
          key={`source-filter-group:${sourceFilterGroup.name}`}
          filter={sourceFilterGroup}
          value={sourceFilterValueMap.get(filterValueKey(sourceFilterGroup))}
          visible={sourceFilterGroupOpen}
          strings={strings}
          onChange={changeSourceFilter}
          onClose={closeSourceFilterGroup}
          onDismiss={handleSourceFilterGroupDismissed}
        />
      ) : null}
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
  // The chip row sits under the native header search bar. iOS insets the list
  // for the bar and pads under it, which left ~30pt above the chips; pull the
  // row up and trim the space before the grid so the chips read as part of the
  // search field, the way the Search tab's source chips do.
  sourceFilterHeaderSpacing: {
    // Measured on the simulator: ~13pt from the search field to the chips and
    // ~13pt from the chips to the first grid row. iOS insets the list for its
    // header search bar, hence the deeper pull-up there.
    marginTop: Platform.OS === "ios" ? -17 : -3,
    marginBottom: -23,
  },
  previewSectionListingGrid: {
    gap: 0,
    marginBottom: 9,
  },
  listingGridListHeader: {
    paddingBottom: 0,
  },
  // The chip row bleeds past the page gutter so a scrolled chip runs to the
  // screen edge, then pays the gutter back as content padding — the same
  // pattern the Search tab's source chip row uses.
  //
  // Vertical rhythm around the row lives in `sourceFilterHeaderSpacing` on the
  // wrapping header section; this frame only owns the horizontal bleed.
  sourceFilterChipRowFrame: {
    marginHorizontal: -spacing.pageX,
    overflow: "visible",
  },
  sourceFilterChipRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.pageX,
    // Reserves room for the depth surface's box-shadow halo below the chips.
    paddingBottom: 6,
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
    // The page scaffold's top inset keeps the row clear of the header
    // fade/blur; the row adds none of its own so the chips sit closer to the
    // title. Bottom padding still reserves room for the web-parity box-shadow
    // halo (up to ~8px blur below the chip).
    paddingTop: 0,
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
  iconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  filterPanel: {
    gap: 13,
  },
  filterPanelScroll: {
    maxHeight: 440,
  },
  filterPanelScrollBounded: {
    flex: 1,
  },
  filterPanelScrollContent: {
    gap: 14,
    paddingBottom: 2,
  },
  filterPanelActions: {
    flexDirection: "row",
    gap: 10,
  },
  filterPanelActionContainer: {
    flex: 1,
    minWidth: 0,
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
  emptyGridHeaderSpacing: {
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
});
