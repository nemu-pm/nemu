import type { ViewStyle } from "react-native";
// eslint-disable-next-line no-restricted-imports -- SourceCard (in the design-system barrel) imports this module, so importing the barrel back would create a require cycle.
import { createNemuShadowStyle } from "@/design/shadows";
// eslint-disable-next-line no-restricted-imports -- type-only; same cycle reason as above.
import type { NemuColorScheme } from "@/design/tokens";

export type SourceCardVisuals = {
  cardBackground: string;
  cardBorder: string;
  /**
   * Card lift, built by the shared shadow helper so native gets real
   * `shadow*`/`elevation` values instead of a CSS string. The icon frame's
   * recess is carried by `iconBackground` + `iconBorder`: an inset shadow has
   * no native equivalent.
   */
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
      cardShadow: createNemuShadowStyle({
        color: "#000000",
        offsetY: 3,
        radius: 12,
        opacity: 0.28,
        elevation: 5,
      }),
      iconBackground: "rgba(255,255,255,0.06)",
      iconBorder: "rgba(255,255,255,0.08)",
      skeletonBlock: "rgba(255,255,255,0.08)",
    };
  }

  return {
    cardBackground: "#fbfcff",
    cardBorder: "rgba(222,225,234,0.92)",
    cardShadow: createNemuShadowStyle({
      color: "#0f172a",
      offsetY: 5,
      radius: 16,
      opacity: 0.07,
      elevation: 2,
    }),
    iconBackground: "rgba(0,0,0,0.025)",
    iconBorder: "rgba(222,225,234,0.92)",
    skeletonBlock: "rgba(0,0,0,0.06)",
  };
}
