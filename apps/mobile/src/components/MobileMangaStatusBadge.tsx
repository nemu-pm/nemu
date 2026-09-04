import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  createNemuShadowStyle,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuTokens,
  radius,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";

const MangaStatus = {
  Unknown: 0,
  Ongoing: 1,
  Completed: 2,
  Cancelled: 3,
  Hiatus: 4,
} as const;

type StatusConfig = {
  label: string;
  accent: string;
};

/**
 * Badge fill strength. The chip floats over cover art, so the semantic accent
 * is laid down near-opaque with a lighter rim of the same hue.
 */
const BADGE_FILL_ALPHA = 0.72;
const BADGE_RIM_ALPHA = 0.38;

/**
 * The badge floats over cover art under near-white text, so its accent is
 * always the light scheme's deep hue. The dark scheme's lighter accents read
 * at ~1.7–2.3:1 behind that text; pinning the palette keeps both themes on the
 * deep fill the text needs. No new colours — these are the same tokens.
 */
const BADGE_ACCENT = nemuTokens.light;

function statusConfig(
  status: number,
  strings: MobileStrings,
): StatusConfig | null {
  switch (status) {
    case MangaStatus.Ongoing:
      return {
        label: strings.metadataEditor.statusOngoing,
        accent: BADGE_ACCENT.success,
      };
    case MangaStatus.Completed:
      return {
        label: strings.metadataEditor.statusCompleted,
        accent: BADGE_ACCENT.primary,
      };
    case MangaStatus.Hiatus:
      return {
        label: strings.metadataEditor.statusHiatus,
        accent: BADGE_ACCENT.warning,
      };
    case MangaStatus.Cancelled:
      return {
        label: strings.metadataEditor.statusCancelled,
        accent: BADGE_ACCENT.danger,
      };
    default:
      return null;
  }
}

export function MobileMangaStatusBadge({
  status,
  strings,
  style,
}: {
  status: number | undefined;
  strings: MobileStrings;
  style?: StyleProp<ViewStyle>;
}) {
  if (status == null || status === MangaStatus.Unknown) return null;

  const config = statusConfig(status, strings);
  if (!config) return null;

  return (
    <View
      accessible
      accessibilityLabel={config.label}
      style={[
        styles.badge,
        {
          backgroundColor: nemuColorWithAlpha(config.accent, BADGE_FILL_ALPHA),
          borderColor: nemuColorWithAlpha(config.accent, BADGE_RIM_ALPHA),
        },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.accent }]} />
      <Text
        numberOfLines={1}
        style={[styles.text, { color: BADGE_ACCENT.primaryForeground }]}
      >
        {config.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    maxWidth: 118,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.tab,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    ...createNemuShadowStyle({
      color: "#000",
      offsetY: 4,
      radius: 10,
      opacity: 0.18,
      elevation: 5,
    }),
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
  },
});
