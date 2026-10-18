import { Platform, StyleSheet, type TextStyle } from "react-native";

import { nemuBrandLetterSpacing } from "@/lib/nemuBrandWordmark";
import { nemuFontWeight } from "./fontWeights";
import { nemuMaterialTypeScale } from "./sheetMetrics";

export const NEMU_BRAND_FONT_FAMILY = Platform.select({
  // iOS resolves statically embedded fonts by their PostScript name, while
  // Android uses the configured font filename as the family. The bundled
  // subset is the weight-500 instance of Noto Serif JP — matching the web
  // wordmark — but its name table still carries the ExtraLight source naming,
  // so the PostScript name below reads lighter than the glyphs it selects.
  ios: "NotoSerifJP-ExtraLight",
  android: "NemuBrand",
  default: "serif",
});

// Nemu uses compact native cards and explicit line-height tokens. Keeping the
// multiplier bounded still honors enlarged text while preventing iOS AX sizes
// from drawing glyphs outside those measured native surfaces.
export const nemuMaxFontSizeMultiplier = 1.6;

export { nemuFontWeight };

export const nemuText = StyleSheet.create({
  screenTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  // Composed sheet titles. Android: Material 3 titleLarge (see
  // `sheetMetrics.ts`); iOS keeps its approved 20/25 semibold.
  sheetTitle: {
    ...Platform.select<TextStyle>({
      android: nemuMaterialTypeScale.titleLarge,
      default: { fontSize: 20, lineHeight: 25, fontWeight: nemuFontWeight.semibold },
    }),
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
  },
  pageEmptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  pageEmptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  actionLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
});

// Every wordmark goes through this helper so the web tracking travels with the
// font family and no call site can render the brand without it.
export function createNemuBrandWordmarkStyle(
  fontSize: number,
): Pick<TextStyle, "fontFamily" | "letterSpacing"> {
  return {
    fontFamily: NEMU_BRAND_FONT_FAMILY,
    letterSpacing: nemuBrandLetterSpacing(fontSize),
  };
}
