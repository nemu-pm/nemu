import { memo, useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
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
} from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import type { SearchSourceDisplay, SearchSourceSelection } from "@/lib/mobileSearch";
import {
  formatMobileSearchSidebarCount,
  isMobileSearchSidebarRowSelected,
  resolveMobileSearchSidebarPress,
  type MobileSearchSidebarStatus,
} from "@/lib/mobileSearchLayout";
import { MobileSearchSourceIcon } from "./MobileSearchSourceIcon";

const ROW_ICON_SIZE = 26;

type SidebarRowProps = {
  /** null: the "All sources" row. */
  target: string | null;
  title: string;
  icon: SearchSourceDisplay | null;
  status: MobileSearchSidebarStatus;
  selected: boolean;
  disabled?: boolean;
  badge?: string;
  accessibilityHint: string;
  strings: MobileStrings;
  onPress: (target: string | null) => void;
  onLongPress?: (target: string) => void;
};

function SidebarRowStatus({
  status,
  selected,
  strings,
}: {
  status: MobileSearchSidebarStatus;
  selected: boolean;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const detail = selected ? nemuColorWithAlpha(tokens.primaryForeground, 0.82) : tokens.mutedForeground;
  if (status.kind === "loading") {
    return (
      <ActivityIndicator
        accessibilityLabel={strings.search.searching}
        color={selected ? tokens.primaryForeground : tokens.mutedForeground}
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
        color={selected ? tokens.primaryForeground : tokens.danger}
      />
    );
  }
  if (status.kind === "count") {
    return (
      <NemuText
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        style={[styles.count, { color: detail }]}
      >
        {formatMobileSearchSidebarCount(status)}
      </NemuText>
    );
  }
  return null;
}

const SidebarRow = memo(function SidebarRow({
  target,
  title,
  icon,
  status,
  selected,
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

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={[title, badge, statusLabel].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={() => onPress(target)}
      onLongPress={target !== null && onLongPress ? () => onLongPress(target) : undefined}
      pressProfile="row"
      style={[
        styles.row,
        selected ? { backgroundColor: tokens.primary } : null,
        disabled ? styles.rowDisabled : null,
      ]}
    >
      {icon ? (
        <MobileSearchSourceIcon source={icon} size={ROW_ICON_SIZE} />
      ) : (
        <View
          style={[
            styles.allIcon,
            {
              backgroundColor: selected
                ? nemuColorWithAlpha(tokens.primaryForeground, 0.18)
                : tokens.sourceIconGlass,
              borderColor: selected ? "transparent" : tokens.border,
            },
          ]}
        >
          <Ionicons
            name="apps-outline"
            size={15}
            color={selected ? tokens.primaryForeground : tokens.primary}
          />
        </View>
      )}
      <NemuText
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        numberOfLines={1}
        style={[
          nemuText.rowTitle,
          styles.rowTitle,
          { color: selected ? tokens.primaryForeground : tokens.foreground },
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
        <SidebarRowStatus status={status} selected={selected} strings={strings} />
      )}
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
        style={[styles.sectionTitle, { color: tokens.mutedForeground }]}
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
  const handlePress = useCallback(
    (target: string | null) => {
      const ids = sourceIdsKey ? sourceIdsKey.split("|") : [];
      onChangeSelection(resolveMobileSearchSidebarPress({ sourceIds: ids, selection, target, gesture: "press" }));
    },
    [onChangeSelection, selection, sourceIdsKey],
  );
  const handleLongPress = useCallback(
    (target: string) => {
      const ids = sourceIdsKey ? sourceIdsKey.split("|") : [];
      onChangeSelection(resolveMobileSearchSidebarPress({ sourceIds: ids, selection, target, gesture: "longPress" }));
    },
    [onChangeSelection, selection, sourceIdsKey],
  );
  const showAllRow = sources.length > 1;

  return (
    <View style={styles.root}>
      <NemuNativeSearchField
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
              selected={isMobileSearchSidebarRowSelected(selection, null)}
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
              // With a single source there is no "All" row: that source is the scope.
              selected={isMobileSearchSidebarRowSelected(selection, showAllRow ? source.id : null)}
              disabled={source.unsupported}
              badge={source.unsupported ? strings.common.sourceUnsupportedBadge : undefined}
              accessibilityHint={
                source.unsupported
                  ? strings.common.sourceUnsupportedTachiyomiDescription
                  : strings.search.sidebarSourceHint
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
  sectionTitle: {
    ...nemuText.label,
    flexShrink: 1,
    letterSpacing: 0.48,
    textTransform: "uppercase",
  },
  sectionAction: {
    ...nemuText.label,
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
