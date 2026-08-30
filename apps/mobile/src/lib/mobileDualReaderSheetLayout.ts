export type MobileDualReaderSheetLayout = {
  frameMaxHeight: "85%" | "auto";
  listFillsFrame: boolean;
};

/**
 * Keep short Dual Read setup states content-sized. Once the linked-source or
 * chapter lists can no longer fit comfortably, switch to a bounded sheet and
 * let the chapter list own the remaining scrollable space.
 */
export function getMobileDualReaderSheetLayout({
  candidateCount,
  chapterCount,
  fontScale,
  height,
  loading,
  width,
}: {
  candidateCount: number;
  chapterCount: number;
  fontScale: number;
  height: number;
  loading: boolean;
  width: number;
}): MobileDualReaderSheetLayout {
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const visibleChapterRows = loading ? 1 : Math.max(1, chapterCount);
  const estimatedContentHeight =
    300 +
    Math.max(1, candidateCount) * 70 * effectiveFontScale +
    visibleChapterRows * 58 * effectiveFontScale;
  const needsBoundedList =
    candidateCount > 2 ||
    chapterCount > 3 ||
    fontScale >= 1.75 ||
    width > height ||
    estimatedContentHeight > Math.max(400, height * 0.74);

  return needsBoundedList
    ? { frameMaxHeight: "85%", listFillsFrame: true }
    : { frameMaxHeight: "auto", listFillsFrame: false };
}
