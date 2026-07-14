import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { createNemuShadowStyle, radius, nemuFontWeight } from "@/design-system";
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
  backgroundColor: string;
  borderColor: string;
  dotColor: string;
  textColor: string;
};

function statusConfig(status: number, strings: MobileStrings): StatusConfig | null {
  switch (status) {
    case MangaStatus.Ongoing:
      return {
        label: strings.metadataEditor.statusOngoing,
        backgroundColor: "rgba(5,150,105,0.72)",
        borderColor: "rgba(16,185,129,0.38)",
        dotColor: "#10b981",
        textColor: "#ffffff",
      };
    case MangaStatus.Completed:
      return {
        label: strings.metadataEditor.statusCompleted,
        backgroundColor: "rgba(2,132,199,0.72)",
        borderColor: "rgba(14,165,233,0.38)",
        dotColor: "#0ea5e9",
        textColor: "#ffffff",
      };
    case MangaStatus.Hiatus:
      return {
        label: strings.metadataEditor.statusHiatus,
        backgroundColor: "rgba(217,119,6,0.72)",
        borderColor: "rgba(245,158,11,0.4)",
        dotColor: "#f59e0b",
        textColor: "#ffffff",
      };
    case MangaStatus.Cancelled:
      return {
        label: strings.metadataEditor.statusCancelled,
        backgroundColor: "rgba(225,29,72,0.72)",
        borderColor: "rgba(244,63,94,0.4)",
        dotColor: "#f43f5e",
        textColor: "#ffffff",
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
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      <Text numberOfLines={1} style={[styles.text, { color: config.textColor }]}>
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
