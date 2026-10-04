import type { NemuColorScheme, NemuTokens } from "@/design-system";
import { supportsNemuLiquidGlass } from "./nemuLiquidGlass";

/**
 * How a sheet's background reads:
 * - `opaque`: our card colour (the current look).
 * - `clear`: the system's iOS 26 Liquid Glass with translucent inner cards;
 *   whatever is behind the sheet (covers, a manga page) shows through.
 * - `tinted`: the same glass under a veil of the scheme's surface colour and
 *   with firmer cards, so secondary text keeps its contrast over busy covers.
 */
export type MobileSheetGlassLook = "opaque" | "clear" | "tinted";

/** The switch's values: `off` is the opaque card-colour sheet. */
export type MobileSheetGlassTrial = "off" | "clear" | "tinted";

/** Unset means `tinted`, the owner's pick after the glass trial (2026-10-02). */
export function resolveMobileSheetGlassTrial(value: string | undefined): MobileSheetGlassTrial {
  return value === "off" || value === "clear" ? value : "tinted";
}

/**
 * Our React Native-drawn sheets (`MobileNativeSheetScaffold`: the manga
 * long-press actions, source settings / manager, Settings' plugin settings,
 * …) on the iOS 26 Liquid Glass sheet background. The owner compared opaque,
 * clear and tinted and chose `tinted`: clear glass dropped secondary text
 * below 4.5:1 over library covers, the veiled glass keeps it above 6:1.
 * Override a build with `EXPO_PUBLIC_SHEET_GLASS_TRIAL=off|clear`.
 * iOS 26+ only; Android, web and older iOS always keep the opaque sheet.
 *
 * The reader's plugin sheet is on glass regardless (owner decision): it does
 * not read this switch.
 */
export const MOBILE_SHEET_GLASS_TRIAL: MobileSheetGlassTrial = resolveMobileSheetGlassTrial(
  process.env.EXPO_PUBLIC_SHEET_GLASS_TRIAL,
);

/** The look a scaffold sheet draws with. */
export function mobileSheetGlassLook({
  platformOS,
  platformVersion,
  trial = MOBILE_SHEET_GLASS_TRIAL,
  customBackground = false,
}: {
  platformOS: string;
  platformVersion: string | number | null | undefined;
  trial?: MobileSheetGlassTrial;
  /** The caller paints its own sheet colour (artwork sheets): never glass. */
  customBackground?: boolean;
}): MobileSheetGlassLook {
  if (trial === "off" || customBackground || !supportsNemuLiquidGlass(platformOS, platformVersion)) {
    return "opaque";
  }
  return trial;
}

/**
 * Token overrides for content drawn on a Liquid Glass sheet: every surface
 * that would paint an opaque slab (cards, muted fills, secondary buttons,
 * icon tiles) becomes a translucent fill, so the glass shows through while
 * rows still read as grouped; secondary text is lifted for contrast over
 * whatever is behind the glass. Text and accent colours are unchanged, and
 * so are the status colours except `danger` on `tinted` (below). Module
 * constants: a theme scope must keep them stable.
 */
const GLASS_TOKEN_OVERRIDES: Record<
  Exclude<MobileSheetGlassLook, "opaque">,
  Record<NemuColorScheme, Partial<NemuTokens>>
> = {
  clear: {
    light: {
      background: "rgba(255,255,255,0)",
      card: "rgba(255,255,255,0.5)",
      muted: "rgba(118,118,128,0.12)",
      secondary: "rgba(118,118,128,0.12)",
      border: "rgba(60,60,67,0.12)",
      sourceIconGlass: "rgba(118,118,128,0.1)",
      mutedForeground: "#4f535b",
    },
    dark: {
      background: "rgba(0,0,0,0)",
      card: "rgba(255,255,255,0.07)",
      muted: "rgba(255,255,255,0.1)",
      secondary: "rgba(255,255,255,0.1)",
      border: "rgba(255,255,255,0.1)",
      sourceIconGlass: "rgba(255,255,255,0.1)",
      mutedForeground: "#a2a5ac",
    },
  },
  // Over the veil (`nemuGlassSheetVeil`) the cards can stay lighter-handed;
  // secondary text goes a step further than `clear`. `danger` is text here
  // (a "Remove" row, a destructive button's label, an error line): the
  // theme's red measured 3.6:1 (light) / 4.0:1 (dark) on the veiled glass
  // over library covers, so it moves along its own hue (oklch lightness
  // -0.10 light / +0.10 dark) to hold 4.5:1 there. `dangerSoft` keeps the
  // theme's tint.
  tinted: {
    light: {
      background: "rgba(255,255,255,0)",
      card: "rgba(255,255,255,0.72)",
      muted: "rgba(118,118,128,0.14)",
      secondary: "rgba(118,118,128,0.14)",
      border: "rgba(60,60,67,0.12)",
      sourceIconGlass: "rgba(118,118,128,0.12)",
      mutedForeground: "#43464d",
      danger: "#b32228",
    },
    dark: {
      background: "rgba(0,0,0,0)",
      card: "rgba(255,255,255,0.08)",
      muted: "rgba(255,255,255,0.1)",
      secondary: "rgba(255,255,255,0.1)",
      border: "rgba(255,255,255,0.1)",
      sourceIconGlass: "rgba(255,255,255,0.1)",
      mutedForeground: "#aeb1b8",
      danger: "#fc8684",
    },
  },
};

export function nemuGlassSheetTokenOverrides(
  look: MobileSheetGlassLook,
  scheme: NemuColorScheme,
): Partial<NemuTokens> | null {
  return look === "opaque" ? null : GLASS_TOKEN_OVERRIDES[look][scheme];
}

/**
 * `theme` as content on a sheet of `look` draws with it: the look's token
 * overrides merged in and `sheetGlass` set (applying it twice changes
 * nothing), `theme` itself when opaque.
 */
export function nemuGlassSheetTheme<
  T extends {
    scheme: NemuColorScheme;
    tokens: NemuTokens;
    sheetGlass?: Exclude<MobileSheetGlassLook, "opaque">;
  },
>(theme: T, look: MobileSheetGlassLook): T {
  if (look === "opaque") return theme;
  return {
    ...theme,
    sheetGlass: look,
    tokens: { ...theme.tokens, ...GLASS_TOKEN_OVERRIDES[look][theme.scheme] },
  };
}

/**
 * The `tinted` look's veil: the scheme's surface colour laid over the glass
 * (under the content), so the glass still refracts and catches light at its
 * edges but busy artwork behind it is held well under the text. Dark is
 * 0.68: at 0.56 a bright icon glowing through the glass under a card lifted
 * the card to where secondary text measured 4.4:1 and `danger` 4.0:1.
 */
const GLASS_VEIL: Record<NemuColorScheme, string> = {
  light: "rgba(246,247,250,0.62)",
  dark: "rgba(16,17,20,0.68)",
};

export function nemuGlassSheetVeil(look: MobileSheetGlassLook, scheme: NemuColorScheme): string | null {
  return look === "tinted" ? GLASS_VEIL[scheme] : null;
}
