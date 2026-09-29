/**
 * Detail hero, design "A": cover on the left; the right column holds title,
 * authors, ONE height-capped row of tag chips ("+N" opens a sheet with every
 * tag) and the Read + library actions anchored to the cover's bottom edge. The
 * card height and the button position therefore never depend on tag count.
 */

export type MobileDetailTagRowFit = {
  /** Every width has been measured; until then the row renders nothing. */
  ready: boolean;
  /** Leading tags that fit (always a prefix, so the order stays predictable). */
  visibleCount: number;
  /** Tags behind the "+N" chip. */
  overflowCount: number;
};

function packsIntoLines(widths: readonly number[], availableWidth: number, gap: number, maxLines: number) {
  let lines = 1;
  let lineWidth = 0;
  for (const width of widths) {
    // A chip wider than the line (it truncates at its max width) still takes
    // a line of its own.
    const itemWidth = Math.min(width, availableWidth);
    const next = lineWidth === 0 ? itemWidth : lineWidth + gap + itemWidth;
    if (next <= availableWidth + 0.5) {
      lineWidth = next;
      continue;
    }
    lines += 1;
    if (lines > maxLines) return false;
    lineWidth = itemWidth;
  }
  return true;
}

/**
 * How many tags fit a row of `maxLines` lines next to the pinned chips (the
 * "Updated" badge), reserving room for the "+N" chip whenever some are hidden.
 */
export function fitMobileDetailTagRow({
  availableWidth,
  tagWidths,
  pinnedWidths = [],
  overflowChipWidth,
  gap,
  maxLines = 1,
}: {
  availableWidth: number;
  /** Measured chip widths in tag order; `undefined` = not measured yet. */
  tagWidths: readonly (number | undefined)[];
  pinnedWidths?: readonly (number | undefined)[];
  overflowChipWidth: number | undefined;
  gap: number;
  maxLines?: number;
}): MobileDetailTagRowFit {
  const total = tagWidths.length;
  const measured = (values: readonly (number | undefined)[]): values is readonly number[] =>
    values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (
    !Number.isFinite(availableWidth) || availableWidth <= 0 ||
    !measured(tagWidths) || !measured(pinnedWidths) ||
    (total > 0 && !(typeof overflowChipWidth === "number" && overflowChipWidth > 0))
  ) {
    return { ready: false, visibleCount: 0, overflowCount: total };
  }
  const lines = Math.max(1, Math.floor(maxLines));
  if (packsIntoLines([...pinnedWidths, ...tagWidths], availableWidth, gap, lines)) {
    return { ready: true, visibleCount: total, overflowCount: 0 };
  }
  for (let count = total - 1; count > 0; count -= 1) {
    const widths = [...pinnedWidths, ...tagWidths.slice(0, count), overflowChipWidth as number];
    if (packsIntoLines(widths, availableWidth, gap, lines)) {
      return { ready: true, visibleCount: count, overflowCount: total - count };
    }
  }
  return { ready: true, visibleCount: 0, overflowCount: total };
}

/** Sample label for measuring the "+N" chip: wide enough for any count below 100. */
export function getMobileDetailOverflowSampleLabel(tagCount: number): string {
  return tagCount >= 10 ? "+88" : "+8";
}

export const MOBILE_DETAIL_HERO_METRICS = {
  gap: 8,
  compactGap: 6,
  titleLineHeight: 28,
  compactTitleLineHeight: 26,
  authorLineHeight: 18,
  /** `MobileChip` md: 30pt pill with a 16pt label line. */
  chipHeight: 30,
  chipLabelLineHeight: 16,
  /**
   * Hero action buttons: a 36pt pill with a 17pt label line, centred in the
   * depth pressable's minimum touch frame (44pt iOS / 48pt Android). The row
   * pulls its bottom margin in by half the difference so the pill, not the
   * invisible frame, lines up with the cover's bottom edge.
   */
  actionHeight: 36,
  actionLabelLineHeight: 17,
  /** Text in the hero stops growing past this multiplier. */
  maxFontSizeMultiplier: 2,
  /** Hero row inner width below which the title steps down a size (≈ 375pt phones). */
  compactRowWidth: 330,
} as const;

/** Historic cover rule, expressed against the hero row's inner width: 92–112pt wide. */
export function getMobileDetailBaseCoverWidth(surfaceWidth: number): number {
  const width = Number.isFinite(surfaceWidth) && surfaceWidth > 0 ? surfaceWidth : 343;
  return Math.max(92, Math.min(112, Math.floor((width - 12) * 0.32)));
}

export type MobileDetailHeroCopyLayout = {
  coverWidth: number;
  coverHeight: number;
  /** Title line cap that still lets the column end at the cover's bottom edge. */
  titleLines: number;
  authorLines: number;
  gap: number;
};

/**
 * Cover size and title lines for the side-by-side hero. The copy column is
 * pinned to the cover height so the actions sit on the cover's bottom edge; the
 * cover grows (never the column) when enlarged text needs a taller column for
 * two title lines, one author line, the tag row and the actions.
 */
export function getMobileDetailHeroCopyLayout({
  surfaceWidth,
  fontScale,
  compact,
  hasAuthors,
  hasTagRow,
  maxTitleLines,
  hasActions = true,
  minimumTouchTarget = 44,
  baseCoverWidth: requestedBaseCoverWidth,
}: {
  /** Inner width of the hero row (surface minus its padding). */
  surfaceWidth: number;
  fontScale: number;
  compact: boolean;
  hasAuthors: boolean;
  hasTagRow: boolean;
  maxTitleLines: number;
  /** Actions anchored in the copy column (design A) rather than below the hero. */
  hasActions?: boolean;
  /** `getNemuButtonMinimumTargetSize(Platform.OS)`. */
  minimumTouchTarget?: number;
  /**
   * Resting cover width before enlarged text grows it; defaults to the compact
   * card's rule (`getMobileDetailBaseCoverWidth`). The regular-width info pane
   * passes its larger cover.
   */
  baseCoverWidth?: number;
}): MobileDetailHeroCopyLayout {
  const m = MOBILE_DETAIL_HERO_METRICS;
  const scale = Number.isFinite(fontScale) ? Math.max(1, Math.min(fontScale, m.maxFontSizeMultiplier)) : 1;
  const width = Number.isFinite(surfaceWidth) && surfaceWidth > 0 ? surfaceWidth : 343;
  const gap = compact ? m.compactGap : m.gap;
  const titleLineHeight = (compact ? m.compactTitleLineHeight : m.titleLineHeight) * scale;
  const authorBlock = hasAuthors ? m.authorLineHeight * scale + gap : 0;
  const tagBlock = hasTagRow ? Math.max(m.chipHeight, m.chipLabelLineHeight * scale + 14) + gap : 0;
  const actionBlock = hasActions
    ? getMobileDetailActionRowLayoutHeight({ fontScale: scale, minimumTouchTarget }) + gap
    : 0;
  const fixedBlocks = authorBlock + tagBlock + actionBlock;

  const baseCoverWidth =
    typeof requestedBaseCoverWidth === "number" && Number.isFinite(requestedBaseCoverWidth) && requestedBaseCoverWidth > 0
      ? Math.round(requestedBaseCoverWidth)
      : getMobileDetailBaseCoverWidth(width);
  const minimumColumn = Math.ceil(2 * titleLineHeight + fixedBlocks);
  const maxCoverWidth = Math.max(baseCoverWidth, Math.floor(width * 0.4));
  const coverWidth = Math.min(maxCoverWidth, Math.max(baseCoverWidth, Math.ceil((minimumColumn * 2) / 3)));
  const coverHeight = Math.round(coverWidth * 1.5);

  const titleBudget = coverHeight - fixedBlocks;
  const cap = Math.max(1, maxTitleLines);
  const titleLines = Math.max(Math.min(2, cap), Math.min(cap, Math.floor(titleBudget / titleLineHeight)));
  const leftover = titleBudget - titleLines * titleLineHeight;
  const authorLines = hasAuthors && leftover >= m.authorLineHeight * scale ? 2 : 1;
  return { coverWidth, coverHeight, titleLines, authorLines, gap };
}

/**
 * Height the action row occupies in the copy column: the visual pill plus the
 * half of the touch frame that stays above it (the lower half overhangs).
 */
export function getMobileDetailActionRowLayoutHeight({
  fontScale,
  minimumTouchTarget,
}: {
  fontScale: number;
  minimumTouchTarget: number;
}): number {
  const m = MOBILE_DETAIL_HERO_METRICS;
  const pill = Math.max(m.actionHeight, m.actionLabelLineHeight * fontScale + 12);
  return pill + getMobileDetailActionRowOverhang({ pillHeight: pill, minimumTouchTarget });
}

/** How far the invisible touch frame extends below the visible pill. */
export function getMobileDetailActionRowOverhang({
  pillHeight = MOBILE_DETAIL_HERO_METRICS.actionHeight,
  minimumTouchTarget,
}: {
  pillHeight?: number;
  minimumTouchTarget: number;
}): number {
  return Math.max(0, (minimumTouchTarget - pillHeight) / 2);
}
