import type { TextStyle } from "react-native";
import { nemuFontWeight } from "./fontWeights";

/**
 * Material 3 type scale (sp), used where Android sheets should read as native
 * Material instead of the compact iOS scale. Weights use nemu's tokens; the
 * file stays free of `react-native` runtime imports and unit-testable.
 */
export const nemuMaterialTypeScale = {
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: nemuFontWeight.medium },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: nemuFontWeight.medium },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: nemuFontWeight.regular },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: nemuFontWeight.regular },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: nemuFontWeight.medium },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: nemuFontWeight.medium },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: nemuFontWeight.regular },
} as const satisfies Record<string, Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight">>;

type SheetTextStyle = Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight">;

/**
 * Layout overrides for a sheet list row. `null` on iOS so a row keeps its own
 * approved spacing; Material 3 list-item metrics on Android.
 */
export type NemuSheetRowLayout = {
  minHeight: number;
  gap: number;
};

/**
 * Geometry for the custom checkbox / radio indicators drawn inside sheet rows.
 * `null` keeps the component's own iOS indicator. On Android they follow the
 * Material 3 controls (18dp checkbox / 20dp radio with a 2dp outline in
 * onSurfaceVariant) so an unchecked control is actually visible — a hairline
 * outline in the border token disappears against the muted row fill.
 */
export type NemuSheetSelectionIndicator = {
  size: number;
  borderWidth: number;
  borderRadius: number;
  glyphSize: number;
  /** Radio only: inner dot of a selected radio (no checkmark glyph). */
  dotSize: number;
};

/**
 * The one table of per-platform sheet metrics. iOS values are the approved
 * pre-existing numbers (and `null` text overrides, i.e. "keep the component's
 * own iOS style"), so iOS renders exactly as before; Android values follow
 * Material 3 (list items 56dp, 24dp leading icons, 16dp icon-label gap,
 * titleLarge sheet titles, bodyLarge list labels, bodyMedium supporting text).
 */
export type NemuSheetMetrics = {
  /** Sheet chrome / hero title. */
  title: SheetTextStyle;
  /** Composed body titles (confirmation, plugin/source settings). */
  bodyTitle: SheetTextStyle | null;
  /** Supporting/description text under a title. */
  description: SheetTextStyle | null;
  /** Action rows (quick actions, menus): minimum height. */
  actionRowMinHeight: number;
  /** Selection rows (option lists): minimum height. */
  optionRowMinHeight: number;
  /** Leading glyph size in action rows. */
  rowIconSize: number;
  /** Glyph size of a chrome icon action (close, header actions). */
  headerActionIconSize: number;
  /** Gap between a row's leading glyph and its label. */
  rowIconGap: number;
  /** Row label text. */
  rowLabel: SheetTextStyle | null;
  /** Anchored header (artwork + title) title text. */
  anchorTitle: SheetTextStyle | null;
  /** Anchored header subtitle text. */
  anchorSubtitle: SheetTextStyle | null;
  /** Footnotes under a group. */
  footnote: SheetTextStyle | null;
  /** Section heading inside a sheet body (metadata editor, collections). */
  sectionTitle: SheetTextStyle | null;
  /** Supporting text directly under a section heading. */
  sectionCaption: SheetTextStyle | null;
  /** One-line list row layout (menus, pickers). */
  listRowLayout: NemuSheetRowLayout | null;
  /** Two-line list row layout (label + supporting text). */
  twoLineRowLayout: NemuSheetRowLayout | null;
  /** Two-line list row headline text. */
  twoLineRowTitle: SheetTextStyle | null;
  /** Two-line list row supporting text. */
  twoLineRowSupporting: SheetTextStyle | null;
  /** Single-line text field shell (Material filled text field: 56dp). */
  textFieldMinHeight: number | null;
  /** Text inside a sheet text field. */
  textFieldText: SheetTextStyle | null;
  checkbox: NemuSheetSelectionIndicator | null;
  radio: NemuSheetSelectionIndicator | null;
};

const IOS_SHEET_METRICS: NemuSheetMetrics = {
  title: { fontSize: 16, lineHeight: 20, fontWeight: nemuFontWeight.semibold },
  bodyTitle: null,
  description: null,
  actionRowMinHeight: 44,
  optionRowMinHeight: 48,
  rowIconSize: 20,
  headerActionIconSize: 22,
  rowIconGap: 12,
  rowLabel: null,
  anchorTitle: null,
  anchorSubtitle: null,
  footnote: null,
  sectionTitle: null,
  sectionCaption: null,
  listRowLayout: null,
  twoLineRowLayout: null,
  twoLineRowTitle: null,
  twoLineRowSupporting: null,
  textFieldMinHeight: null,
  textFieldText: null,
  checkbox: null,
  radio: null,
};

const ANDROID_SHEET_METRICS: NemuSheetMetrics = {
  title: nemuMaterialTypeScale.titleLarge,
  bodyTitle: nemuMaterialTypeScale.titleLarge,
  description: nemuMaterialTypeScale.bodyMedium,
  actionRowMinHeight: 56,
  optionRowMinHeight: 56,
  rowIconSize: 24,
  headerActionIconSize: 24,
  rowIconGap: 16,
  rowLabel: nemuMaterialTypeScale.bodyLarge,
  anchorTitle: nemuMaterialTypeScale.titleMedium,
  anchorSubtitle: nemuMaterialTypeScale.bodyMedium,
  footnote: nemuMaterialTypeScale.bodySmall,
  sectionTitle: nemuMaterialTypeScale.titleMedium,
  sectionCaption: nemuMaterialTypeScale.bodyMedium,
  listRowLayout: { minHeight: 56, gap: 16 },
  twoLineRowLayout: { minHeight: 72, gap: 16 },
  twoLineRowTitle: nemuMaterialTypeScale.bodyLarge,
  twoLineRowSupporting: nemuMaterialTypeScale.bodyMedium,
  textFieldMinHeight: 56,
  textFieldText: nemuMaterialTypeScale.bodyLarge,
  checkbox: { size: 18, borderWidth: 2, borderRadius: 2, glyphSize: 14, dotSize: 0 },
  radio: { size: 20, borderWidth: 2, borderRadius: 10, glyphSize: 0, dotSize: 10 },
};

export function resolveNemuSheetMetrics(platform: string): NemuSheetMetrics {
  return platform === "android" ? ANDROID_SHEET_METRICS : IOS_SHEET_METRICS;
}
