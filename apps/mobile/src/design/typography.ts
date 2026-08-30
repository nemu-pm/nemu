import { Platform, StyleSheet, type TextStyle } from "react-native";

export const NEMU_BRAND_FONT_FAMILY = Platform.select({
  // iOS resolves statically embedded fonts by their PostScript name, while
  // Android uses the configured font filename as the family.
  ios: "NotoSerifJP-ExtraLight",
  android: "NemuBrand",
  default: "serif",
});

// Nemu uses compact native cards and explicit line-height tokens. Keeping the
// multiplier bounded still honors enlarged text while preventing iOS AX sizes
// from drawing glyphs outside those measured native surfaces.
export const nemuMaxFontSizeMultiplier = 1.6;

export const nemuFontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const satisfies Record<string, TextStyle["fontWeight"]>;

export const nemuText = StyleSheet.create({
  screenTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  sheetTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: nemuFontWeight.semibold,
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

export const nemuBrandTextStyle = {
  fontFamily: NEMU_BRAND_FONT_FAMILY,
} satisfies Pick<TextStyle, "fontFamily">;
