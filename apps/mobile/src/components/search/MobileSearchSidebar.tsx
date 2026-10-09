import { memo, useCallback, useRef, type Ref } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  NemuNativeSearchField,
  NemuPressable,
  NemuText,
  nemuColorWithAlpha,
  nemuMaxFontSizeMultiplier,
  nemuText,
  radius,
  useNemuTheme,
  type NemuNativeSearchFieldHandle,
} from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  resolveSearchSourcePressSelection,
  type SearchSourceDisplay,
  type SearchSourcePressState,
  type SearchSourceSelection,
} from "@/lib/mobileSearch";
import {
  formatMobileSearchSidebarCount,
  resolveMobileSearchSidebarCheckState,
  resolveMobileSearchSidebarPress,
  type MobileSearchSidebarCheckState,
  type MobileSearchSidebarStatus,
} from "@/lib/mobileSearchLayout";
import { MobileSheetSelectionIndicator } from "@/components/MobileSheetSelectionIndicator";
import { MobileSearchSourceIcon } from "./MobileSearchSourceIcon";

const ROW_ICON_SIZE = 26;

type SidebarRowProps = {
  /** null: the "All sources" row. */
  target: string | null;
  title: string;
  icon: SearchSourceDisplay | null;
  status: MobileSearchSidebarStatus;
  check: MobileSearchSidebarCheckState;
  /** False with a single source: it is the whole scope and cannot be toggled. */
  showCheck: boolean;
  disabled?: boolean;
  badge?: string;
  accessibilityHint: string;
  strings: MobileStrings;
  onPress: (target: string | null) => void;
  onLongPress?: (target: string) => void;
};

function SidebarRowStatus({
  status,
  strings,
}: {
  status: MobileSearchSidebarStatus;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  if (status.kind === "loading") {
    return (
      <ActivityIndicator
        accessibilityLabel={strings.search.searching}
        color={tokens.mutedForeground}
        size="small"
      />
    );
  }
  if (status.kind === "error") {
    return (
      <Ionicons
        accessibilityLabel={strings.search.sidebarSearchFailed}
        name="alert-circle-outline"
        size={17}
        color={tokens.danger}
      />
    );
  }
  if (status.kind === "count") {
    return (
      <NemuText
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        style={[styles.count, { color: tokens.mutedForeground }]}
      >
        {formatMobileSearchSidebarCount(status)}
      </NemuText>
    );
  }
  return null;
}

/**
 * The row's inclusion mark: iOS draws the multi-select circle of a list in
 * edit mode (filled checkmark when in scope, a dash for a partial "All"),
 * Android its Material checkbox.
 */
function SidebarCheckMark({ check }: { check: MobileSearchSidebarCheckState }) {
  const { tokens } = useNemuTheme();
  if (Platform.OS === "android") {
    return (
      <MobileSheetSelectionIndicator
        kind="checkbox"
        checked={check !== "off"}
        color={tokens.primary}
        iosStyle={null}
      />
    );
  }
  return (
    <Ionicons
      name={check === "on" ? "checkmark-circle" : check === "mixed" ? "remove-circle" : "ellipse-outline"}
      size={23}
      color={check === "off" ? nemuColorWithAlpha(tokens.mutedForeground, 0.55) : tokens.primary}
    />
  );
}

const SidebarRow = memo(function SidebarRow({
  target,
  title,
  icon,
  status,
  check,
  showCheck,
  disabled,
  badge,
  accessibilityHint,
  strings,
  onPress,
  onLongPress,
}: SidebarRowProps) {
  const { tokens } = useNemuTheme();
  const statusLabel =
    status.kind === "count"
      ? formatMobileString(strings.search.sidebarResultCount, {
          count: formatMobileSearchSidebarCount(status),
        })
      : status.kind === "error"
        ? strings.search.sidebarSearchFailed
        : status.kind === "loading"
          ? strings.search.searching
          : null;
  // An excluded source recedes (muted title, faded icon); the checkmark
  // column carries the state, so the rows never flip to a filled highlight.
  const excluded = check === "off";

  return (
    <NemuPressable
      accessibilityRole="checkbox"
      accessibilityLabel={[title, badge, statusLabel].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: check === "mixed" ? "mixed" : check === "on", disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={() => onPress(target)}
      onLongPress={target !== null && onLongPress ? () => onLongPress(target) : undefined}
      pressProfile="row"
      pressHighlight
      style={[styles.row, disabled ? styles.rowDisabled : null]}
    >
      <View style={excluded ? styles.iconExcluded : null}>
        {icon ? (
          <MobileSearchSourceIcon source={icon} size={ROW_ICON_SIZE} />
        ) : (
          <View
            style={[
              styles.allIcon,
              { backgroundColor: tokens.sourceIconGlass, borderColor: tokens.border },
            ]}
          >
            <Ionicons name="apps-outline" size={15} color={tokens.primary} />
          </View>
        )}
      </View>
      <NemuText
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        numberOfLines={1}
        style={[
          nemuText.rowTitle,
          styles.rowTitle,
          { color: excluded ? tokens.mutedForeground : tokens.foreground },
        ]}
      >
        {title}
      </NemuText>
      {badge ? (
        <NemuText
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={1}
          style={[styles.count, { color: tokens.mutedForeground }]}
        >
          {badge}
        </NemuText>
      ) : (
        <SidebarRowStatus status={status} strings={strings} />
      )}
      {disabled || !showCheck ? null : <SidebarCheckMark check={check} />}
    </NemuPressable>
  );
});

function SidebarSectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.sectionHeader}>
      <NemuText
        accessibilityRole="header"
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        numberOfLines={1}
        style={[styles.sectionTitle, { color: tokens.foreground }]}
      >
        {title}
      </NemuText>
      {action ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={`${action.label} ${title}`}
          hapticFeedback="selection"
          hitSlop={8}
          onPress={action.onPress}
          pressProfile="row"
        >
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            style={[styles.sectionAction, { color: tokens.primary }]}
          >
            {action.label}
          </NemuText>
        </NemuPressable>
      ) : null}
    </View>
  );
}

const NO_STATUS: MobileSearchSidebarStatus = { kind: "none" };

/**
 * Leading pane of the regular-width search split: the search field on top
 * (the same capsule as the other search fields in nemu — a SwiftUI
 * `TextField` on iOS), the installed sources as a selectable list that
 * scopes the search and reports each source's result count, and recent
 * searches.
 */
export function MobileSearchSidebar({
  strings,
  query,
  searchFieldRef,
  onChangeQuery,
  onSubmitQuery,
  sources,
  selection,
  statuses,
  allStatus,
  onChangeSelection,
  recents,
  onPressRecent,
  onClearRecents,
}: {
  strings: MobileStrings;
  query: string;
  /** The search field, so the screen can activate it (a Search tab re-tap). */
  searchFieldRef?: Ref<NemuNativeSearchFieldHandle>;
  onChangeQuery: (query: string) => void;
  onSubmitQuery: () => void;
  sources: SearchSourceDisplay[];
  /** Effective (normalized) scope. */
  selection: SearchSourceSelection;
  statuses: Record<string, MobileSearchSidebarStatus>;
  allStatus: MobileSearchSidebarStatus;
  onChangeSelection: (selection: SearchSourceSelection) => void;
  recents: string[];
  onPressRecent: (query: string) => void;
  onClearRecents: () => void;
}) {
  const { tokens } = useNemuTheme();
  const sourceIds = sources.map((source) => source.id);
  const sourceIdsKey = sourceIds.join("|");
  const lastPressRef = useRef<SearchSourcePressState>(null);
  // Same gestures as the phone chips: tap toggles (multi-select), a double tap
  // or long press searches only that source, "All sources" restores every one.
  const handlePress = useCallback(
    (target: string | null) => {
      const ids = sourceIdsKey ? sourceIdsKey.split("|") : [];
      if (target === null || ids.length <= 1) {
        lastPressRef.current = null;
        onChangeSelection(resolveMobileSearchSidebarPress({ sourceIds: ids, selection, target, gesture: "press" }));
        return;
      }
      const result = resolveSearchSourcePressSelection(ids, selection, target, lastPressRef.current, Date.now());
      lastPressRef.current = result.lastPress;
      onChangeSelection(result.selection);
    },
    [onChangeSelection, selection, sourceIdsKey],
  );
  const handleLongPress = useCallback(
    (target: string) => {
      const ids = sourceIdsKey ? sourceIdsKey.split("|") : [];
      lastPressRef.current = null;
      onChangeSelection(resolveMobileSearchSidebarPress({ sourceIds: ids, selection, target, gesture: "only" }));
    },
    [onChangeSelection, selection, sourceIdsKey],
  );
  const showAllRow = sources.length > 1;
  const selectableIds = sources.filter((source) => !source.unsupported).map((source) => source.id);

  return (
    <View style={styles.root}>
      <NemuNativeSearchField
        ref={searchFieldRef}
        accessibilityLabel={strings.search.searchInstalledSources}
        clearAccessibilityLabel={strings.common.clear}
        clearActionTestID="InstalledSourceSearchClearAction"
        onChangeText={onChangeQuery}
        onSubmit={onSubmitQuery}
        placeholder={strings.search.searchInstalledSources}
        testID="InstalledSourceSearchField"
        value={query}
      />

      <View style={styles.section}>
        <SidebarSectionHeader title={strings.search.sidebarSources} />
        <View style={styles.rows}>
          {showAllRow ? (
            <SidebarRow
              target={null}
              title={strings.search.allSources}
              icon={null}
              status={allStatus}
              check={resolveMobileSearchSidebarCheckState({ selection, target: null, sourceIds: selectableIds })}
              showCheck
              accessibilityHint={strings.search.sidebarAllSourcesHint}
              strings={strings}
              onPress={handlePress}
            />
          ) : null}
          {sources.map((source) => (
            <SidebarRow
              key={source.id}
              target={source.id}
              title={source.name}
              icon={source}
              status={statuses[source.id] ?? NO_STATUS}
              check={resolveMobileSearchSidebarCheckState({ selection, target: source.id, sourceIds: selectableIds })}
              showCheck={showAllRow}
              disabled={source.unsupported}
              badge={source.unsupported ? strings.common.sourceUnsupportedBadge : undefined}
              accessibilityHint={
                source.unsupported
                  ? strings.common.sourceUnsupportedTachiyomiDescription
                  : strings.search.sourceSelectionHint
              }
              strings={strings}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          ))}
        </View>
      </View>

      {recents.length > 0 ? (
        <View style={styles.section}>
          <SidebarSectionHeader
            title={strings.search.recentSearches}
            action={{ label: strings.search.clearRecentSearches, onPress: onClearRecents }}
          />
          <View style={styles.rows}>
            {recents.map((recent) => (
              <NemuPressable
                key={recent}
                accessibilityRole="button"
                accessibilityLabel={formatMobileString(strings.search.recentSearchAccessibility, {
                  query: recent,
                })}
                hapticFeedback="selection"
                onPress={() => onPressRecent(recent)}
                pressProfile="row"
                pressHighlight
                style={styles.recentRow}
              >
                <Ionicons name="time-outline" size={17} color={tokens.mutedForeground} />
                <NemuText
                  maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                  numberOfLines={1}
                  style={[nemuText.body, styles.rowTitle, { color: tokens.foreground }]}
                >
                  {recent}
                </NemuText>
              </NemuPressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 22,
  },
  section: {
    gap: 6,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
  },
  // Sentence-case headline, like the section headers of Files' and Mail's
  // sidebars (no uppercase tracking).
  sectionTitle: {
    ...nemuText.sectionTitle,
    flexShrink: 1,
  },
  sectionAction: {
    ...nemuText.body,
    fontSize: 15,
  },
  rows: {
    gap: 2,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.lg,
  },
  rowDisabled: {
    opacity: 0.56,
  },
  iconExcluded: {
    opacity: 0.5,
  },
  allIcon: {
    width: ROW_ICON_SIZE,
    height: ROW_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Math.max(5, ROW_ICON_SIZE * 0.24),
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
  },
  count: {
    ...nemuText.rowSubtitle,
    fontVariant: ["tabular-nums"],
  },
  recentRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
  },
});
