import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileCachedSegmentedImageAsset } from "./mobileImageCache";
import type { MobileReaderSegmentFrame } from "./mobileReaderSegmentedImage";

/**
 * A segmented strip is read as the tiles on screen, each one an independent
 * policy-sized image: OCR boxes live in that tile's own pixel space and are
 * drawn in that tile's own frame, so they land exactly where the tile is
 * shown. The whole strip is never handed to OCR (on-device that would be one
 * serial recognition per tile of the chapter; to the cloud, the whole source).
 */
export const MOBILE_READER_SEGMENT_OCR_MAX_TILES = 3;

/** Share of the tile, or of the viewport, that must be on screen. */
const MOBILE_READER_SEGMENT_OCR_MIN_VISIBLE_FRACTION = 0.25;

export function getMobileReaderSegmentOcrPageId(
  pageId: string,
  index: number,
  count: number,
): string {
  return `${pageId}#tile-${index + 1}-of-${count}`;
}

/**
 * The tiles meaningfully on screen, in reading order. `contentInsetTop` is
 * the list's leading padding above the first tile. Never empty for a strip:
 * with nothing measured yet it falls back to the tile nearest the viewport.
 */
export function getMobileReaderVisibleSegmentIndexes(
  frames: ReadonlyArray<Pick<MobileReaderSegmentFrame, "index" | "offset" | "height">>,
  viewport: {
    contentOffset: number;
    viewportLength: number;
    contentInsetTop?: number;
  },
): number[] {
  if (frames.length === 0) return [];
  const inset = Number.isFinite(viewport.contentInsetTop)
    ? Math.max(0, viewport.contentInsetTop!)
    : 0;
  const top = Number.isFinite(viewport.contentOffset) ? viewport.contentOffset : 0;
  const length =
    Number.isFinite(viewport.viewportLength) && viewport.viewportLength > 0
      ? viewport.viewportLength
      : 0;
  const bottom = top + length;
  const visible: Array<{ index: number; overlap: number }> = [];
  let nearest = frames[0]!.index;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const centre = top + length / 2;
  for (const frame of frames) {
    const start = inset + frame.offset;
    const end = start + frame.height;
    const overlap = Math.min(end, bottom) - Math.max(start, top);
    const required =
      Math.min(frame.height, length) * MOBILE_READER_SEGMENT_OCR_MIN_VISIBLE_FRACTION;
    if (length > 0 && overlap > 0 && overlap >= required) {
      visible.push({ index: frame.index, overlap });
    }
    const distance = centre < start ? start - centre : centre > end ? centre - end : 0;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = frame.index;
    }
  }
  if (visible.length === 0) return [nearest];
  return visible
    .sort((a, b) => b.overlap - a.overlap || a.index - b.index)
    .slice(0, MOBILE_READER_SEGMENT_OCR_MAX_TILES)
    .map((entry) => entry.index)
    .sort((a, b) => a - b);
}

/** The OCR targets for the tiles in view: each tile as its own image page. */
export function getMobileReaderSegmentOcrPages(
  page: MobileReaderPage,
  asset: MobileCachedSegmentedImageAsset,
  indexes: ReadonlyArray<number>,
): MobileReaderPage[] {
  const count = asset.segments.length;
  return indexes.flatMap((index) => {
    const segment = asset.segments[index];
    if (!segment) return [];
    return [
      {
        ...page,
        id: getMobileReaderSegmentOcrPageId(page.id, index, count),
        imageUri: segment.uri,
        imageUriOwnership: "app" as const,
        headers: undefined,
        imageProcessing: "ready" as const,
        // A source's text belongs to the whole page, never to one tile.
        text: undefined,
      },
    ];
  });
}

/** Pixel size of each tile page, by its OCR page id. */
export function getMobileReaderSegmentOcrImageSizes(
  pageId: string,
  asset: MobileCachedSegmentedImageAsset,
): Map<string, { width: number; height: number }> {
  const count = asset.segments.length;
  return new Map(
    asset.segments.map((segment, index) => [
      getMobileReaderSegmentOcrPageId(pageId, index, count),
      { width: segment.width, height: segment.height },
    ]),
  );
}

export function sameMobileReaderSegmentIndexes(
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
