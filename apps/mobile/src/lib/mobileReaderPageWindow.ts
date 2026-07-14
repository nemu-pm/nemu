/**
 * How many display indexes on either side of the current page keep their
 * `<Image>` mounted. RN `Image` fetches and decodes on mount regardless of
 * visibility and the reader gallery is a plain ScrollView (no virtualization),
 * so without a window a 100+ page chapter would hold ~100 decoded bitmaps.
 * Pages outside the window render an equal-size placeholder — frame sizes are
 * sticky once learned (`readerImageSizes`), so swapping causes no layout shift.
 */
// Keep this aligned with the processor's +/-2 near-page window. At radius 5 a
// plain ScrollView could retain eleven decoded manga bitmaps at once (well over
// 100 MiB for common pages), which is unnecessarily risky on Android LMK-class
// devices. Five mounted pages still cover fast swipes in either direction.
export const MOBILE_READER_PAGE_RENDER_WINDOW = 2;

export function isMobileReaderPageNearViewport(
  displayIndex: number | undefined,
  currentPageIndex: number,
  windowRadius: number = MOBILE_READER_PAGE_RENDER_WINDOW,
): boolean {
  // Unknown display position (e.g. a page not in the displayed list) must
  // stay mounted — dropping its image would be an invisible regression.
  if (displayIndex === undefined || !Number.isFinite(displayIndex)) return true;
  return Math.abs(displayIndex - currentPageIndex) <= windowRadius;
}

export type MobileReaderPageRenderPolicy =
  | "none"
  | "far-placeholder"
  | "processing-placeholder"
  | "image";

export function getMobileReaderPageRenderPolicy({
  currentPageIndex,
  displayIndex,
  hasImageUri,
  processingPending,
  windowRadius = MOBILE_READER_PAGE_RENDER_WINDOW,
}: {
  currentPageIndex: number;
  displayIndex: number | undefined;
  hasImageUri: boolean;
  processingPending: boolean;
  windowRadius?: number;
}): MobileReaderPageRenderPolicy {
  if (!hasImageUri) return "none";
  // Apply virtualization before processing UI: otherwise every pending page in
  // a long chapter mounts its own ActivityIndicator despite being far outside
  // the visible window.
  if (
    !isMobileReaderPageNearViewport(
      displayIndex,
      currentPageIndex,
      windowRadius,
    )
  ) {
    return "far-placeholder";
  }
  return processingPending ? "processing-placeholder" : "image";
}
