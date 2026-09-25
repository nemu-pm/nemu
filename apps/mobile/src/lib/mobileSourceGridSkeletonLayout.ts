import {
  getMobileMangaGridColumns,
  getMobileMangaGridItemWidth,
} from "./mobileAdaptiveGrid";

/** Three rows of placeholder cards, matching the loaded listing grid. */
export const MOBILE_SOURCE_GRID_SKELETON_ROWS = 3;
/**
 * The listing grid's portrait page insets: the browse FlatList runs inside
 * the page scaffold's 2 × spacing.pageX gutters, so the skeleton must derive
 * its columns from the same content width to hand off without a layout jump.
 * Landscape callers pass the scaffold's safe-area-aware gutters instead.
 */
export const MOBILE_SOURCE_GRID_SKELETON_HORIZONTAL_PADDING = 32;

/**
 * Column count and card width for the source browse skeleton, derived from
 * the same adaptive grid helpers as SourceBrowseScreen's listing FlatList
 * (`numColumns` + flex:1 rows), so a 3-column iPhone grid loads into a
 * 3-column skeleton.
 */
export function getMobileSourceGridSkeletonGeometry({
  windowWidth,
  horizontalPadding = MOBILE_SOURCE_GRID_SKELETON_HORIZONTAL_PADDING,
}: {
  windowWidth: number;
  /** `useMobilePageGutters().horizontal`; defaults to the portrait gutters. */
  horizontalPadding?: number;
}): { cardWidth: number; columnCount: number } {
  const columnCount = getMobileMangaGridColumns({
    windowWidth,
    horizontalPadding,
  });
  const cardWidth = getMobileMangaGridItemWidth({
    windowWidth,
    horizontalPadding,
  });
  return { cardWidth, columnCount };
}
