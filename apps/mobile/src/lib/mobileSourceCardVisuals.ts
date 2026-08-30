import type { NemuColorScheme } from "@/design-system";

export type SourceCardVisuals = {
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  iconBackground: string;
  iconBorder: string;
  iconShadow: string;
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
      cardShadow:
        "0px 2px 8px rgba(0,0,0,0.25), 0px 4px 16px rgba(0,0,0,0.15), inset 0px 0.5px 0px rgba(255,255,255,0.06)",
      iconBackground: "rgba(255,255,255,0.06)",
      iconBorder: "rgba(255,255,255,0.08)",
      iconShadow:
        "inset 0px 1px 3px rgba(0,0,0,0.15), inset 0px 0.5px 0px rgba(255,255,255,0.04)",
      skeletonBlock: "rgba(255,255,255,0.08)",
    };
  }

  return {
    cardBackground: "#fbfcff",
    cardBorder: "rgba(222,225,234,0.92)",
    cardShadow:
      "0px 1px 3px rgba(15,23,42,0.04), 0px 8px 20px rgba(15,23,42,0.05), inset 0px 0.5px 0px rgba(255,255,255,0.70)",
    iconBackground: "rgba(0,0,0,0.025)",
    iconBorder: "rgba(222,225,234,0.92)",
    iconShadow:
      "inset 0px 1px 2px rgba(15,23,42,0.035), inset 0px 0.5px 0px rgba(255,255,255,0.35)",
    skeletonBlock: "rgba(0,0,0,0.06)",
  };
}
