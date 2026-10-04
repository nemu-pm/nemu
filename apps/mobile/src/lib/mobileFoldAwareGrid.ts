import { mobileAdaptiveGridColumns } from "@/lib/mobileAdaptiveLayout";
import { MOBILE_FOLD_MIN_GUTTER } from "@/lib/mobileWindowLayout";

/**
 * Fold-aware layout math for browsing surfaces (library covers, search and
 * source results, source home rows, browse source cards).
 *
 * HIG (iPhone Duo): derive the layout from the container, never the device;
 * prefer an even column count whenever a fold region is present, active or
 * not (`mobileGridPrefersEvenColumns`); when partially folded keep
 * content out of the folding region — in a grid, the gutter between the two
 * middle columns lies on the fold so no card straddles it. Everything here is
 * container-local (points from the container's leading/top edge) so it can be
 * unit tested without React Native.
 */

/**
 * Fold interval along the split axis, container-local, `start <= end`. A
 * zero-width interval (Android reports a physical hinge line) is still a
 * fold: consumers widen it to their minimum gutter, never treat it as flat.
 */
export type MobileFoldInterval = { start: number; end: number };

/**
 * A usable fold interval widened (centred) to at least `minGutter`, or null
 * when there is none (missing, non-finite, or inverted).
 */
export function mobileFoldIntervalWithGutter(
  fold: MobileFoldInterval | null | undefined,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileFoldInterval | null {
  if (!fold || !Number.isFinite(fold.start) || !Number.isFinite(fold.end) || fold.end < fold.start) return null;
  if (fold.end - fold.start >= minGutter) return fold;
  const middle = (fold.start + fold.end) / 2;
  return { start: middle - minGutter / 2, end: middle + minGutter / 2 };
}

export type MobileFoldAwareGridLayout = {
  columns: number;
  /** Fixed width of every cell (a partly filled last row keeps it). */
  itemWidth: number;
  /**
   * Leading margin for each column index, measured from the previous cell's
   * trailing edge (column 0: from the start of the content box). Cells render
   * with `{ width: itemWidth, marginLeft: columnMargins[column] }`.
   */
  columnMargins: number[];
  /** The middle gutter coincides with an active fold. */
  foldAligned: boolean;
};

/**
 * A folded grid may keep the flat grid's column count when cells shrink by at
 * most this factor, so a fold/unfold does not remount the virtualized list
 * (and lose its scroll anchor) for a few points of cover width.
 */
export const MOBILE_FOLD_GRID_KEEP_COLUMNS_TOLERANCE = 0.9;

function uniformMargins(columns: number, gap: number, leading = 0): number[] {
  return Array.from({ length: columns }, (_, index) => (index === 0 ? leading : gap));
}

function flatGridLayout({
  contentWidth,
  minItemWidth,
  gap,
  minColumns,
  maxColumns,
  preferEven,
}: {
  contentWidth: number;
  minItemWidth: number;
  gap: number;
  minColumns: number;
  maxColumns: number;
  preferEven: boolean;
}): MobileFoldAwareGridLayout {
  const fit = mobileAdaptiveGridColumns({
    contentWidth: Math.max(0, contentWidth),
    minItemWidth,
    gap,
    maxColumns,
    preferEven,
  }).columns;
  const columns = Math.max(minColumns, fit);
  const itemWidth = Math.max(0, Math.floor((contentWidth - gap * (columns - 1)) / columns));
  return { columns, itemWidth, columnMargins: uniformMargins(columns, gap), foldAligned: false };
}

/**
 * Columns, cell width and per-column margins for a grid inside a content box
 * of `contentWidth` points. `fold` is the active vertical fold (book posture)
 * in the same content-box coordinates, or null.
 *
 * Folded: the grid becomes two equal half-grids with the same cell width, the
 * first ending exactly at the fold's start and the second starting at its end
 * (the middle gutter is the fold, never narrower than `gap`). A pane that is
 * wider than the other — e.g. the inner display's trailing system bars
 * narrow the right pane — keeps its slack beside the fold, so the grid's
 * leading edge stays on the page gutter, aligned with section headers.
 */
export function mobileFoldAwareGridLayout({
  contentWidth,
  minItemWidth,
  gap,
  minColumns = 1,
  maxColumns = 12,
  preferEven,
  fold,
}: {
  contentWidth: number;
  minItemWidth: number;
  gap: number;
  minColumns?: number;
  maxColumns?: number;
  preferEven: boolean;
  fold?: MobileFoldInterval | null;
}): MobileFoldAwareGridLayout {
  const flat = flatGridLayout({ contentWidth, minItemWidth, gap, minColumns, maxColumns, preferEven });
  // Never let the middle gutter be narrower than the ordinary gap (a
  // zero-width Android hinge included).
  const gutter = mobileFoldIntervalWithGutter(fold, gap);
  if (!gutter) return flat;
  const gutterStart = Math.floor(gutter.start);
  const gutterEnd = Math.ceil(gutter.end);
  const leading = gutterStart;
  const trailing = contentWidth - gutterEnd;
  const half = Math.min(leading, trailing);
  // The fold lies outside the content box (or leaves no room on one side):
  // nothing to avoid, or nothing sensible to split.
  if (gutterStart <= 0 || gutterEnd >= contentWidth) return flat;
  if (half < minItemWidth * MOBILE_FOLD_GRID_KEEP_COLUMNS_TOLERANCE) return flat;

  const halfWidthFor = (perSide: number) =>
    Math.max(0, Math.floor((half - gap * (perSide - 1)) / perSide));
  const maxPerSide = Math.max(1, Math.floor(maxColumns / 2));
  const fitPerSide = Math.max(
    1,
    Math.min(maxPerSide, Math.floor((half + gap) / (minItemWidth + gap))),
  );
  let perSide = Math.max(Math.ceil(minColumns / 2), fitPerSide);
  // Folding should be a small adjustment: keep the flat column count when it
  // is even and the cells stay close to their tuned width.
  if (flat.columns % 2 === 0 && flat.columns / 2 > perSide && flat.columns / 2 <= maxPerSide) {
    const keep = flat.columns / 2;
    if (halfWidthFor(keep) >= minItemWidth * MOBILE_FOLD_GRID_KEEP_COLUMNS_TOLERANCE) {
      perSide = keep;
    }
  }
  const itemWidth = halfWidthFor(perSide);
  const halfGridWidth = perSide * itemWidth + gap * (perSide - 1);
  const columns = perSide * 2;
  const columnMargins = uniformMargins(columns, gap, 0);
  columnMargins[perSide] = gutterEnd - halfGridWidth;
  return { columns, itemWidth, columnMargins, foldAligned: true };
}

/**
 * Content-box width of a grid. Measured: the container minus its insets (the
 * page gutters for a full-bleed list, 0 for a container that already is the
 * content box). Not yet measured: the window inside the page gutters, whatever
 * the insets — a content-box container must not start one column too wide and
 * remount its list once it reports its width.
 */
export function mobileFoldAwareGridContentWidth({
  containerWidth,
  windowWidth,
  insets,
  pageGutters,
}: {
  containerWidth: number | null;
  windowWidth: number;
  insets: { left: number; right: number };
  pageGutters: { left: number; right: number };
}): number {
  return Math.max(
    0,
    containerWidth !== null
      ? containerWidth - insets.left - insets.right
      : windowWidth - pageGutters.left - pageGutters.right,
  );
}

/** Style for the cell at `index` of a grid laid out row-major. */
export function mobileFoldAwareGridCellStyle(
  layout: Pick<MobileFoldAwareGridLayout, "columns" | "itemWidth" | "columnMargins">,
  index: number,
): { width: number; marginLeft: number } {
  const column = ((index % layout.columns) + layout.columns) % layout.columns;
  return { width: layout.itemWidth, marginLeft: layout.columnMargins[column] ?? 0 };
}

/** Physical x (content-box local) of every column's leading edge. */
export function mobileFoldAwareGridColumnOffsets(
  layout: Pick<MobileFoldAwareGridLayout, "itemWidth" | "columnMargins">,
): number[] {
  const offsets: number[] = [];
  let x = 0;
  for (const margin of layout.columnMargins) {
    x += margin;
    offsets.push(x);
    x += layout.itemWidth;
  }
  return offsets;
}

/** Split items into explicit rows (non-virtualized grids): no flex-wrap rounding surprises. */
export function chunkMobileGridRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/**
 * Horizontal pager whose cards never rest on the fold (source home featured
 * carousel). Flat: one card per page at the full available width. Book: one
 * card per pane — card `k` rests in the leading pane and `k + 1` in the
 * trailing pane, and the pager snaps by one pane.
 */
export type MobileFoldPagerLayout = {
  cardWidth: number;
  /** Snap interval and distance between consecutive cards' leading edges. */
  stride: number;
  /** Width of the scroll view viewport. */
  viewportWidth: number;
  foldAligned: boolean;
};

export function mobileFoldPagerLayout({
  containerWidth,
  margin = 0,
  fold,
  minCardWidth = 240,
}: {
  containerWidth: number;
  /** Breathing room subtracted from the card (not the stride). */
  margin?: number;
  fold?: MobileFoldInterval | null;
  /** Below this a pane is too narrow for a featured card; stay flat. */
  minCardWidth?: number;
}): MobileFoldPagerLayout {
  const width = Math.max(1, containerWidth);
  const flat = {
    cardWidth: Math.max(1, width - margin),
    stride: Math.max(1, width - margin),
    viewportWidth: Math.max(1, width - margin),
    foldAligned: false,
  };
  const gutter = mobileFoldIntervalWithGutter(fold);
  if (!gutter || gutter.start <= 0 || gutter.end >= width) return flat;
  const pane = Math.min(gutter.start, width - gutter.end);
  const cardWidth = Math.floor(pane - margin);
  if (cardWidth < minCardWidth) return flat;
  return { cardWidth, stride: gutter.end, viewportWidth: width, foldAligned: true };
}

/**
 * Move a fixed element along one axis so its frame no longer intersects the
 * fold: to whichever side needs the smaller shift, within `[min, max]` (the
 * space the element may occupy). Returns the offset to add (0 when clear, or
 * when neither side has room — never a rearrangement).
 */
export function mobileNudgeOffFold(
  frame: { start: number; size: number },
  fold: MobileFoldInterval | null | undefined,
  bounds: { min?: number; max?: number } = {},
): number {
  const gutter = mobileFoldIntervalWithGutter(fold);
  if (!gutter) return 0;
  fold = gutter;
  const end = frame.start + frame.size;
  if (end <= fold.start || frame.start >= fold.end) return 0;
  const min = bounds.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  const before = fold.start - end; // negative: move toward the start
  const after = fold.end - frame.start; // positive: move toward the end
  const beforeFits = frame.start + before >= min;
  const afterFits = end + after <= max;
  if (beforeFits && afterFits) return Math.abs(before) <= after ? before : after;
  if (beforeFits) return before;
  if (afterFits) return after;
  return 0;
}

export type MobilePaneContentRegion = {
  /** Container-local frame the content should be centered in. */
  x: number;
  y: number;
  width: number;
  /** Height to fill (0 = natural height). */
  height: number;
  /** Width of the content itself: the region clamped to a readable measure. */
  contentWidth: number;
};

/** Readable measure for empty / loading / error states on wide windows. */
export const MOBILE_PANE_CONTENT_MAX_WIDTH = 480;

/**
 * Where a page-level placeholder (empty, loading or error state) sits in its
 * container. It is centered with a readable max width; in book posture it
 * occupies one pane (the leading one unless too narrow); in notebook posture
 * it fills the top pane from the container's top edge (or the bottom pane
 * when the top one has too little room below the chrome).
 *
 * `container` and `fold` are window coordinates; `windowHeight` bounds the
 * bottom pane. The result depends only on the container's origin and width —
 * not its height — so applying it cannot feed back into the measurement.
 */
export function mobilePaneContentRegion({
  container,
  posture,
  fold,
  windowHeight,
  bottomInset = 0,
  maxContentWidth = MOBILE_PANE_CONTENT_MAX_WIDTH,
  minPaneExtent = 200,
}: {
  container: { x: number; y: number; width: number };
  posture: "flat" | "book" | "notebook";
  fold: { x: number; y: number; width: number; height: number } | null;
  windowHeight: number;
  bottomInset?: number;
  maxContentWidth?: number;
  minPaneExtent?: number;
}): MobilePaneContentRegion {
  const width = Math.max(0, container.width);
  const centered = (x: number, regionWidth: number, y: number, height: number) => ({
    x,
    y,
    width: regionWidth,
    height,
    contentWidth: Math.min(regionWidth, maxContentWidth),
  });
  if (!fold || posture === "flat") return centered(0, width, 0, 0);
  if (posture === "book") {
    const leading = fold.x - container.x;
    const trailingStart = fold.x + fold.width - container.x;
    const trailing = width - trailingStart;
    if (leading >= minPaneExtent && leading >= Math.min(trailing, minPaneExtent)) {
      return centered(0, Math.min(width, leading), 0, 0);
    }
    if (trailing >= minPaneExtent) return centered(trailingStart, trailing, 0, 0);
    return centered(0, width, 0, 0);
  }
  const top = fold.y - container.y;
  if (top >= minPaneExtent) return centered(0, width, 0, top);
  const bottomStart = Math.max(0, fold.y + fold.height - container.y);
  const bottom = windowHeight - bottomInset - container.y - bottomStart;
  if (bottom >= minPaneExtent) return centered(0, width, bottomStart, bottom);
  return centered(0, width, 0, 0);
}
