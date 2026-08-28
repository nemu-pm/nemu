export type MobileReaderNaturalImageSize = Readonly<{
  width: number;
  height: number;
}>;

/**
 * At this ratio, fitting a portrait page into a phone-height paged viewport
 * makes it too narrow to read. A one-page strip is therefore presented at the
 * normal paged-reader width and allowed to grow vertically instead.
 */
export const MOBILE_READER_LONG_STRIP_MIN_ASPECT_RATIO = 4;

export function isMobileReaderLongStripLogicalPage({
  pageCount,
  naturalSize,
}: {
  pageCount: number;
  naturalSize: MobileReaderNaturalImageSize | null | undefined;
}): boolean {
  if (pageCount !== 1 || !naturalSize) return false;
  const { width, height } = naturalSize;
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    height >= width * MOBILE_READER_LONG_STRIP_MIN_ASPECT_RATIO
  );
}

export function shouldUseMobileReaderLongStripPresentation({
  pagedMode,
  pageCount,
  naturalSize,
}: {
  pagedMode: boolean;
  pageCount: number;
  naturalSize: MobileReaderNaturalImageSize | null | undefined;
}): boolean {
  return (
    pagedMode && isMobileReaderLongStripLogicalPage({ pageCount, naturalSize })
  );
}

export function getMobileReaderImageFrameSize({
  imageWidth,
  naturalSize,
  clampHeightToPagedViewport,
  maximumPagedHeight,
}: {
  imageWidth: number;
  naturalSize: MobileReaderNaturalImageSize | null | undefined;
  clampHeightToPagedViewport: boolean;
  maximumPagedHeight: number;
}): MobileReaderNaturalImageSize {
  const safeImageWidth =
    Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 1;
  const naturalRatio =
    naturalSize &&
    Number.isFinite(naturalSize.width) &&
    Number.isFinite(naturalSize.height) &&
    naturalSize.width > 0 &&
    naturalSize.height > 0
      ? naturalSize.height / naturalSize.width
      : 1.45;
  const naturalHeight = safeImageWidth * naturalRatio;
  const minimumHeight = Math.max(220, naturalHeight);

  return {
    width: safeImageWidth,
    height: clampHeightToPagedViewport
      ? Math.min(
          minimumHeight,
          Number.isFinite(maximumPagedHeight) && maximumPagedHeight > 0
            ? Math.max(260, maximumPagedHeight)
            : 260,
        )
      : minimumHeight,
  };
}
