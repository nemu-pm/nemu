import { MOBILE_EXPLORE_GROUP_SHAPE, MOBILE_SETTINGS_GROUP_INSET } from "@/lib/mobileExploreRadius";
import { Fragment, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { MOBILE_SETTINGS_GLYPH } from "@/lib/mobileSettingsGlyph";
import { ExploreSettingsGlyph } from "./ExploreSettingsGlyph";

type IoniconName = keyof typeof Ionicons.glyphMap;

type ExploreSettingsRow = {
  key: string;
  /** The original design's outline glyph (`ExploreSettingsGlyph`). */
  icon: IoniconName;
  /** The glyph's colour: the accent unless given (the About row passes the muted ink, as before). */
  tint?: string;
  title: ReactNode;
  accessibilityLabel: string;
  /** Read by VoiceOver after the title (the old one-line description). */
  accessibilityHint?: string;
  /** Trailing value, e.g. a count. */
  detail?: string;
  disabled?: boolean;
  /** Split view: the section shown in the trailing pane (an accent-filled row). */
  selected?: boolean;
  onPress: () => void;
};

const ROW_HEIGHT = 52;
/**
 * Room for the text's sub-point rounding: a title laid out in exactly its
 * measured width can still break onto a second line.
 */
const PROBE_SLACK = 2;
/** The chevron's width (`Ionicons` size 16). */
const CHEVRON_SIZE = 16;

/**
 * An inset grouped list in the system Settings idiom (design-explore): one
 * rounded group, the original design's outline glyph per row in the accent
 * (bare, no tile), a one-line title (the split sidebar is sized to fit it,
 * `ExploreSettingsRowWidthProbe`), a chevron, hairline separators inset to the
 * text. Settings are a rare stop, so rows are short and scan at a
 * glance; the longer descriptions move to the VoiceOver hint.
 *
 * The regular-width split view's section list is the same group, its
 * selected row filled with the accent (as the system Settings sidebar).
 */
export function ExploreSettingsGroup({ rows }: { rows: ExploreSettingsRow[] }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      {rows.map((row, index) => {
        const selected = row.selected === true;
        // A selected row's fill reaches its neighbours: no hairline beside it.
        const separated = index > 0 && !selected && rows[index - 1]?.selected !== true;
        const ink = selected ? tokens.primaryForeground : undefined;
        return (
          <Fragment key={row.key}>
            {index > 0 ? (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: separated ? tokens.border : "transparent" },
                ]}
              />
            ) : null}
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
              accessibilityHint={row.accessibilityHint}
              accessibilityState={{
                disabled: row.disabled || undefined,
                selected: row.selected,
              }}
              disabled={row.disabled}
              hapticFeedback={row.selected === undefined ? "press" : "selection"}
              pressedScale={1}
              onPress={row.onPress}
              style={[styles.row, selected ? { backgroundColor: tokens.primary } : null]}
            >
              <ExploreSettingsGlyph name={row.icon} color={ink ?? row.tint} />
              <NemuText numberOfLines={2} color={ink ?? tokens.foreground} style={styles.title}>
                {row.title}
              </NemuText>
              {row.detail ? (
                <NemuText
                  numberOfLines={1}
                  color={ink ?? tokens.mutedForeground}
                  style={styles.detail}
                >
                  {row.detail}
                </NemuText>
              ) : null}
              <Ionicons
                name="chevron-forward"
                size={CHEVRON_SIZE}
                color={ink ?? tokens.mutedForeground}
              />
            </NemuPressable>
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * The width a group needs for every row to keep its title on one line: each
 * row laid out unconstrained, off screen, in the group's own geometry and
 * type (so it follows the language and Dynamic Type), border included.
 * Reports once all rows are measured, and again when one changes.
 */
export function ExploreSettingsRowWidthProbe({
  rows,
  onWidth,
}: {
  rows: Pick<ExploreSettingsRow, "key" | "title" | "detail">[];
  onWidth: (width: number) => void;
}) {
  const widths = useRef(new Map<string, number>());
  const report = (key: string, width: number) => {
    widths.current.set(key, width);
    for (const stale of widths.current.keys()) {
      if (!rows.some((row) => row.key === stale)) widths.current.delete(stale);
    }
    if (widths.current.size < rows.length) return;
    onWidth(Math.ceil(Math.max(...widths.current.values()) + 2 * StyleSheet.hairlineWidth + PROBE_SLACK));
  };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.probe}
    >
      {rows.map((row) => (
        <View
          key={row.key}
          style={[styles.row, styles.probeRow]}
          onLayout={(event) => report(row.key, event.nativeEvent.layout.width)}
        >
          <View style={styles.probeGlyph} />
          <NemuText numberOfLines={1} style={[styles.title, styles.probeTitle]}>
            {row.title}
          </NemuText>
          {row.detail ? (
            <NemuText numberOfLines={1} style={styles.detail}>
              {row.detail}
            </NemuText>
          ) : null}
          <View style={styles.probeChevron} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  probe: {
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0,
    alignItems: "flex-start",
  },
  probeRow: {
    alignSelf: "flex-start",
  },
  probeGlyph: {
    width: MOBILE_SETTINGS_GLYPH.box,
  },
  probeTitle: {
    flex: 0,
    flexShrink: 0,
  },
  probeChevron: {
    width: CHEVRON_SIZE,
  },
  group: {
    ...MOBILE_EXPLORE_GROUP_SHAPE,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET,
    paddingVertical: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.medium,
  },
  detail: {
    fontSize: 15,
    lineHeight: 20,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: MOBILE_SETTINGS_GROUP_INSET + MOBILE_SETTINGS_GLYPH.box + 12,
  },
});
