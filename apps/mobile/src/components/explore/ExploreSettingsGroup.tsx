import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { MOBILE_SETTINGS_GLYPH } from "@/lib/mobileSettingsGlyph";
import { ExploreSettingsGlyph } from "./ExploreSettingsGlyph";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type ExploreSettingsRow = {
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
  onPress: () => void;
};

const ROW_HEIGHT = 52;

/**
 * An inset grouped list in the system Settings idiom (design-explore): one
 * rounded group, the original design's outline glyph per row in the accent
 * (bare, no tile), a single title line, a chevron, hairline separators inset
 * to the text. Settings are a rare stop, so rows are short and scan at a
 * glance; the longer descriptions move to the VoiceOver hint.
 */
export function ExploreSettingsGroup({ rows }: { rows: ExploreSettingsRow[] }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: tokens.border }]} /> : null}
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={row.accessibilityLabel}
            accessibilityHint={row.accessibilityHint}
            accessibilityState={{ disabled: row.disabled || undefined }}
            disabled={row.disabled}
            hapticFeedback="press"
            pressedScale={1}
            onPress={row.onPress}
            style={styles.row}
          >
            <ExploreSettingsGlyph name={row.icon} color={row.tint} />
            <NemuText numberOfLines={1} color={tokens.foreground} style={styles.title}>
              {row.title}
            </NemuText>
            {row.detail ? (
              <NemuText numberOfLines={1} color={tokens.mutedForeground} style={styles.detail}>
                {row.detail}
              </NemuText>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={tokens.mutedForeground} />
          </NemuPressable>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: R.group,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
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
    marginLeft: 14 + MOBILE_SETTINGS_GLYPH.box + 12,
  },
});
