/**
 * How many display indexes on either side of the current page keep their
 * `<Image>` mounted. RN `Image` fetches and decodes on mount regardless of
 * visibility, so this bounds how many decoded bitmaps the reader holds even
 * though the gallery's FlatList already virtualizes its cells. Pages outside
 * the window render an equal-size placeholder — frame sizes are sticky once
 * learned (`readerImageSizes`), so swapping causes no layout shift.
 *
 * Radius 3 keeps seven pages decoded, which covers a fast run of swipes in
 * either direction while staying well under the ~100 MiB that radius 5 could
 * reach on Android LMK-class devices.
 */
export const MOBILE_READER_PAGE_RENDER_WINDOW = 3;

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
