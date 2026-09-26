/**
 * Dynamic Type layout helpers.
 *
 * Live text-size changes: React Native's Fabric renderer re-draws existing
 * text at the new size when the content size category changes, but it only
 * dirties the root's layout — every already-mounted text node keeps its Yoga
 * measurement from the old size, so text overflowed and clipped its stale
 * frame until the screen was rebuilt (a relaunch). Newly mounted views measure
 * correctly. Page scaffolds therefore key their content on the font scale so a
 * change remounts the page body (screen state lives above the scaffold and
 * survives; navigation is untouched).
 */
export function getMobileFontScaleLayoutKey(fontScale: number): string {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return `font-scale-${Math.round(scale * 100)}`;
}

/**
 * From iOS "xxxLarge" (≈1.35) up through the accessibility sizes, side-by-side
 * layouts no longer fit a phone width: the detail hero stacks its cover above
 * the copy and lets title and actions wrap instead of truncating.
 */
export const MOBILE_LARGE_TEXT_FONT_SCALE = 1.3;

export function isMobileLargeTextLayout(fontScale: number): boolean {
  return Number.isFinite(fontScale) && fontScale >= MOBILE_LARGE_TEXT_FONT_SCALE;
}

export type MobileMangaDetailHeroLayout = {
  /** Cover above the copy instead of beside it. */
  stacked: boolean;
  /** Where the primary/secondary actions render. */
  actionsPlacement: "below" | "copy";
  /** Line cap for the title; `undefined` wraps freely. */
  titleLines: number | undefined;
  /** Line cap for the primary action ("Continue Vol.1 Ch.2"). */
  primaryActionLines: number | undefined;
};

export function getMobileMangaDetailHeroLayout({
  fontScale,
  compact,
  requestedActionsPlacement,
}: {
  fontScale: number;
  compact: boolean;
  requestedActionsPlacement: "below" | "copy";
}): MobileMangaDetailHeroLayout {
  if (isMobileLargeTextLayout(fontScale)) {
    return {
      stacked: true,
      // The in-copy placement pins the copy column to the cover height, which
      // is what clipped the title and the Continue label at large sizes.
      actionsPlacement: "below",
      titleLines: undefined,
      primaryActionLines: undefined,
    };
  }
  return {
    stacked: false,
    actionsPlacement: requestedActionsPlacement,
    titleLines: compact ? 4 : 3,
    primaryActionLines: 1,
  };
}
