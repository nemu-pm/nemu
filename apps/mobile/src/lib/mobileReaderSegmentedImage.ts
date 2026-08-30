import type {
  MobileCachedImageSegment,
  MobileCachedSegmentedImageAsset,
} from "./mobileImageCache";
import { makeMobileImageCacheStorageKey } from "./mobileImageCacheKey";

export type MobileReaderLogicalPageIdentityInput = Readonly<{
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  pageId: string;
  imageUri?: string | null;
  headers?: Record<string, string>;
}>;

export function getMobileReaderSegmentedCacheDiscriminator(
  input: Omit<MobileReaderLogicalPageIdentityInput, "imageUri" | "headers">,
): string {
  return JSON.stringify([
    "reader-segments-v1",
    input.registryId,
    input.sourceId,
    input.mangaId,
    input.chapterId,
    input.pageId,
  ]);
}

export function getMobileReaderLogicalPageIdentity(
  input: MobileReaderLogicalPageIdentityInput,
): string {
  return makeMobileImageCacheStorageKey(
    "reader-page-state-v1",
    { uri: input.imageUri ?? "", headers: input.headers },
    getMobileReaderSegmentedCacheDiscriminator(input),
  );
}

export type MobileReaderSegmentFrame = Readonly<{
  index: number;
  offset: number;
  width: number;
  height: number;
  segment: MobileCachedImageSegment;
}>;

export function getMobileReaderSegmentFrames(
  asset: MobileCachedSegmentedImageAsset,
  displayedWidth: number,
): MobileReaderSegmentFrame[] {
  if (
    !Number.isFinite(displayedWidth) ||
    displayedWidth <= 0 ||
    asset.width <= 0
  ) {
    return [];
  }
  const scale = displayedWidth / asset.width;
  let cumulativeSourceHeight = 0;
  return asset.segments.map((segment, index) => {
    const offset = cumulativeSourceHeight * scale;
    cumulativeSourceHeight += segment.height;
    const nextOffset = cumulativeSourceHeight * scale;
    return {
      index,
      offset,
      width: displayedWidth,
      // Deriving both edges from one aggregate transform prevents per-tile
      // rounding drift, visible seams, and a missing final row.
      height: nextOffset - offset,
      segment,
    };
  });
}

export function isMobileReaderLogicalEndReached(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
  tolerance?: number;
}): boolean {
  if (
    !Number.isFinite(input.contentOffset) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= 0 ||
    input.viewportLength <= 0
  ) {
    return false;
  }
  const maximumOffset = Math.max(0, input.contentLength - input.viewportLength);
  const tolerance = Math.max(1, input.tolerance ?? 2);
  return input.contentOffset >= maximumOffset - tolerance;
}

export function mobileReaderSegmentedNextAction(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
}): { kind: "scroll"; offset: number } | { kind: "end" } {
  if (isMobileReaderLogicalEndReached(input)) return { kind: "end" };
  if (
    !Number.isFinite(input.contentOffset) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= 0 ||
    input.viewportLength <= 0
  ) {
    return { kind: "scroll", offset: 0 };
  }
  const maximumOffset = Math.max(0, input.contentLength - input.viewportLength);
  return {
    kind: "scroll",
    offset: Math.min(
      maximumOffset,
      input.contentOffset + Math.max(1, input.viewportLength * 0.85),
    ),
  };
}

export function getMobileReaderMeasuredScrollMetrics(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
}): {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
} {
  const contentLength = Number.isFinite(input.contentLength)
    ? Math.max(0, input.contentLength)
    : 0;
  const viewportLength = Number.isFinite(input.viewportLength)
    ? Math.max(0, input.viewportLength)
    : 0;
  const maximumOffset = Math.max(0, contentLength - viewportLength);
  const contentOffset = Number.isFinite(input.contentOffset)
    ? Math.max(0, Math.min(maximumOffset, input.contentOffset))
    : 0;
  return { contentOffset, contentLength, viewportLength };
}

export function getMobileReaderLogicalScrollProgress(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
}): number | null {
  if (
    !Number.isFinite(input.contentOffset) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= input.viewportLength ||
    input.viewportLength <= 0
  ) {
    return null;
  }
  const maximumOffset = input.contentLength - input.viewportLength;
  return Math.max(0, Math.min(1, input.contentOffset / maximumOffset));
}

/** Stable integer progress for the long-strip accessibility label. */
export function getMobileReaderLogicalAccessibilityPercent(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
}): number {
  if (
    !Number.isFinite(input.contentOffset) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= 0 ||
    input.viewportLength <= 0
  ) {
    return 0;
  }
  if (input.contentLength <= input.viewportLength) return 100;
  const maximumOffset = input.contentLength - input.viewportLength;
  return Math.round(
    Math.max(0, Math.min(1, input.contentOffset / maximumOffset)) * 100,
  );
}

export function getMobileReaderLogicalOffsetForProgress(input: {
  progress: number;
  contentLength: number;
  viewportLength: number;
}): number {
  if (
    !Number.isFinite(input.progress) ||
    !Number.isFinite(input.contentLength) ||
    !Number.isFinite(input.viewportLength) ||
    input.contentLength <= input.viewportLength ||
    input.viewportLength <= 0
  ) {
    return 0;
  }
  return (
    Math.max(0, Math.min(1, input.progress)) *
    (input.contentLength - input.viewportLength)
  );
}

export function shouldCompleteSingleImageReaderPage(input: {
  hasImage: boolean;
  naturalSizeKnown: boolean;
  longStripPresentation: boolean;
  reachedLogicalEnd: boolean;
}): boolean {
  if (!input.hasImage) return true;
  if (!input.naturalSizeKnown) return false;
  return !input.longStripPresentation || input.reachedLogicalEnd;
}

export function canUseMobileReaderWholeImageTools(input: {
  hasImage: boolean;
  naturalSizeKnown: boolean;
  segmented: boolean;
}): boolean {
  if (!input.hasImage) return true;
  return input.naturalSizeKnown && !input.segmented;
}

export const MOBILE_READER_SEGMENTED_CAPABILITIES = Object.freeze({
  wholePageZoom: false,
  japaneseLearningImageTools: false,
  dualReaderOverlay: false,
});
