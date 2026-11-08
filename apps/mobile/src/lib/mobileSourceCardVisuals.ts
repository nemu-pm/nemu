import type { ViewStyle } from "react-native";
// eslint-disable-next-line no-restricted-imports -- type-only token import avoids a runtime design-system cycle.
import type { NemuColorScheme } from "@/design/tokens";

export type SourceCardVisuals = {
  cardBackground: string;
  cardBorder: string;
  /** Source rows use a quiet border and fill, without raised-card elevation. */
  cardShadow: ViewStyle;
  iconBackground: string;
  iconBorder: string;
  skeletonBlock: string;
};

export function resolveSourceCardVisuals(
  scheme: NemuColorScheme,
): SourceCardVisuals {
  const dark = scheme === "dark";

  if (dark) {
    return {
      cardBackground: "rgba(255,255,255,0.04)",
      cardBorder: "rgba(255,255,255,0.08)",
      cardShadow: {},
      iconBackground: "rgba(255,255,255,0.06)",
      iconBorder: "rgba(255,255,255,0.08)",
      skeletonBlock: "rgba(255,255,255,0.08)",
    };
  }

  return {
    cardBackground: "#fbfcff",
    cardBorder: "rgba(222,225,234,0.92)",
    cardShadow: {},
    iconBackground: "rgba(0,0,0,0.025)",
    iconBorder: "rgba(222,225,234,0.92)",
    skeletonBlock: "rgba(0,0,0,0.06)",
  };
}
