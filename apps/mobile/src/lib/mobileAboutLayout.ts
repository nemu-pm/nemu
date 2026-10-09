const DEFAULT_ABOUT_SHEET_HEIGHT = 392;
const LARGE_TEXT_EXTRA_HEIGHT = 120;

export const MOBILE_ABOUT_VERSION_PULSE = {
  duration: 2_000,
  easing: [0.4, 0, 0.6, 1] as const,
  midpointOpacity: 0.5,
} as const;

export function shouldAnimateMobileAboutVersionPulse(
  active: boolean,
  reduceMotion: boolean | null,
): boolean {
  return active && reduceMotion === false;
}

export type MobileAboutSheetHero = "regular" | "compact";
export type MobileAboutLinksArrangement = "row" | "column";

/**
 * Source Code and Open-source licenses: side by side in a window wider than
 * tall (so landscape keeps the non-scrolling sheet's height), stacked
 * otherwise.
 */
export function getMobileAboutLinksArrangement({
  height,
  width,
}: {
  height: number;
  width: number;
}): MobileAboutLinksArrangement {
  return width > height ? "row" : "column";
}

export type MobileAboutSheetLayout = {
  /** Icon/halo size and stack spacing; compact tightens the hero to fit. */
  hero: MobileAboutSheetHero;
  scroll: boolean;
  snapPoint: number | "82%" | undefined;
};

/**
 * `topExtra` (iOS): room added above the icon so its glow can fade out inside
 * the sheet instead of being cut by the sheet's top edge (the glow is
 * bounded to the room — see `getMobileAboutHeroGlowRoomTop`). The compact
 * hero keeps the short landscape sheet from scrolling.
 */
export const MOBILE_ABOUT_HERO_METRICS = {
  regular: { iconSize: 80, gap: 13, topExtra: 12 },
  compact: { iconSize: 60, gap: 8, topExtra: 4 },
} as const satisfies Record<
  MobileAboutSheetHero,
  { iconSize: number; gap: number; topExtra: number }
>;

/** iOS: the sheet's hosted content starts this far below the sheet's top edge (grabber band). */
export const MOBILE_IOS_SHEET_HOST_TOP = 16;
/** Scaffold body top padding under the grabber (both platforms' base value). */
const SHEET_BODY_TOP_PADDING = 8;
/** Android draws its drag handle inside the content (`androidContentHandle`): a 48dp band. */
const ANDROID_CONTENT_HANDLE_HEIGHT = 48;
/** `NemuAppIconHalo`'s default box is the icon + 16pt, so the icon sits 8pt below its top. */
const APP_ICON_HALO_TOP_INSET = 8;

/** Body top padding the About sheet asks the scaffold for on iOS. */
export function getMobileAboutSheetBodyTopPadding(hero: MobileAboutSheetHero): number {
  return SHEET_BODY_TOP_PADDING + MOBILE_ABOUT_HERO_METRICS[hero].topExtra;
}

/**
 * Distance from the About icon's top edge up to the sheet's top edge — the
 * edge that clips the glow (the sheet draws content under its grabber).
 */
export function getMobileAboutHeroGlowRoomTop({
  hero,
  platform,
}: {
  hero: MobileAboutSheetHero;
  platform: string;
}): number {
  if (platform === "android") return ANDROID_CONTENT_HANDLE_HEIGHT + APP_ICON_HALO_TOP_INSET;
  return MOBILE_IOS_SHEET_HOST_TOP + getMobileAboutSheetBodyTopPadding(hero) + APP_ICON_HALO_TOP_INSET;
}

// The About text honours Dynamic Type up to `nemuMaxFontSizeMultiplier`.
const ABOUT_MAX_TEXT_SCALE = 1.6;
// iOS keeps a gap between a content-sized sheet and the top safe area.
const IOS_SHEET_TOP_GAP = 10;
// Grabber inset (16); the body top padding comes from the hero.
// Bottom gutter plus the floating sheet's bottom inset. Calibrated so the
// default estimate (421pt) matches the rendered iPhone 17 Pro sheet (~420pt).
const IOS_SHEET_CONTENT_BOTTOM = 36;

/**
 * Conservative height of the About sheet's content-sized body (iOS), so the
 * layout can pick the largest hero that fits without a scroll view.
 */
export function estimateMobileAboutSheetContentHeight({
  fontScale,
  hero,
  links = "row",
}: {
  fontScale: number;
  hero: MobileAboutSheetHero;
  links?: MobileAboutLinksArrangement;
}): number {
  const scale = Math.min(Math.max(fontScale, 1), ABOUT_MAX_TEXT_SCALE);
  const { iconSize, gap } = MOBILE_ABOUT_HERO_METRICS[hero];
  const contentTop = MOBILE_IOS_SHEET_HOST_TOP + getMobileAboutSheetBodyTopPadding(hero);
  const iconBlock = iconSize + 16;
  const titleBlock = 32 * scale + 5 + 21 * scale;
  const versionBlock = Math.max(28, 15 * scale + 13);
  // Three lines at the default size; the line count grows with the text.
  const descriptionBlock = Math.ceil(3 * scale) * 21 * scale;
  const linkRowHeight = Math.max(62, (17 + 16) * scale + 2 + 24);
  // Two link rows; stacked they add a row plus the 8pt gap between them.
  const linkRow = links === "column" ? linkRowHeight * 2 + 8 : linkRowHeight;
  return Math.ceil(
    contentTop +
      iconBlock +
      titleBlock +
      versionBlock +
      descriptionBlock +
      linkRow +
      gap * 4 +
      2 +
      IOS_SHEET_CONTENT_BOTTOM,
  );
}

export function getMobileAboutSheetLayout({
  bottomInset,
  fontScale,
  height,
  platform,
  topInset,
  width,
}: {
  bottomInset: number;
  fontScale: number;
  height: number;
  platform: string;
  topInset: number;
  width: number;
}): MobileAboutSheetLayout {
  const availableHeight = Math.max(1, height - topInset - bottomInset);
  const landscape = width > height;
  const compactViewport = landscape || availableHeight < DEFAULT_ABOUT_SHEET_HEIGHT;

  // Expo's Android sheet already content-sizes large text correctly. Supplying
  // a numeric detent there expands the Material sheet to the full window,
  // leaving a large blank region below the content. Keep portrait Android
  // dynamic, and only bound genuinely compact viewports with a percentage.
  if (platform === "android") {
    return compactViewport
      ? { hero: "regular", scroll: true, snapPoint: "82%" }
      : { hero: "regular", scroll: false, snapPoint: undefined };
  }

  // iOS: the About sheet is a content-sized, non-scrolling sheet in every
  // pose (owner rule). When the regular hero would not fit the room the
  // window leaves for a sheet, tighten the hero first; scrolling is only the
  // last resort for accessibility text in a short (landscape) window.
  const maxSheetHeight = Math.max(1, height - topInset - IOS_SHEET_TOP_GAP);
  const links = getMobileAboutLinksArrangement({ height, width });
  for (const hero of ["regular", "compact"] as const) {
    if (estimateMobileAboutSheetContentHeight({ fontScale, hero, links }) <= maxSheetHeight) {
      return { hero, scroll: false, snapPoint: undefined };
    }
  }

  const desiredHeight =
    DEFAULT_ABOUT_SHEET_HEIGHT +
    Math.min(
      LARGE_TEXT_EXTRA_HEIGHT,
      Math.max(0, fontScale - 1) * LARGE_TEXT_EXTRA_HEIGHT,
    );

  return {
    hero: "compact",
    scroll: true,
    snapPoint: Math.round(Math.min(desiredHeight, maxSheetHeight)),
  };
}
