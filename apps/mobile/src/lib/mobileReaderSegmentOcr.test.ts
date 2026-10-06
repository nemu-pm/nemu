import { describe, expect, it } from "bun:test";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileCachedSegmentedImageAsset } from "./mobileImageCache";
import { getMobileReaderSegmentFrames } from "./mobileReaderSegmentedImage";
import {
  getMobileReaderSegmentOcrImageSizes,
  getMobileReaderSegmentOcrPageId,
  getMobileReaderSegmentOcrPages,
  getMobileReaderVisibleSegmentIndexes,
  MOBILE_READER_SEGMENT_OCR_MAX_TILES,
  sameMobileReaderSegmentIndexes,
} from "./mobileReaderSegmentOcr";

// The observed Raw FREE chapter strip: 1360 x 46,080 as 30 tiles, the last
// one shorter (29 x 1542 + 1362).
const TILE_ROWS = 1_542;
const STRIP_HEIGHT = 46_080;
const tileHeights = Array.from({ length: 30 }, (_, index) =>
  index < 29 ? TILE_ROWS : STRIP_HEIGHT - 29 * TILE_ROWS,
);
const asset: MobileCachedSegmentedImageAsset = {
  kind: "segmented-image",
  manifestVersion: 1,
  generation: "00mux903d7-000000-0000000001",
  manifestUri: "file:///cache/page.segments-v1.json",
  byteLength: tileHeights.length,
  width: 1_360,
  height: STRIP_HEIGHT,
  segments: tileHeights.map((height, index) => ({
    uri: `file:///cache/page.segment-${index}.jpg`,
    byteLength: 1,
    width: 1_360,
    height,
    mimeType: "image/jpeg" as const,
  })),
};
const page: MobileReaderPage = {
  id: "0:https://example.test/merged_1-24.jpg",
  index: 0,
  imageUri: "https://example.test/merged_1-24.jpg",
  imageUriOwnership: "source",
  headers: { Referer: "https://example.test/" },
  imageProcessing: "fallback",
};
// A 396pt-wide strip on a 912pt-tall phone: tiles are ~449pt tall.
const frames = getMobileReaderSegmentFrames(asset, 396);
const VIEWPORT = 912;

describe("segmented strip OCR tiles", () => {
  it("covers the strip with contiguous tile frames", () => {
    expect(frames).toHaveLength(30);
    expect(frames[0]!.offset).toBe(0);
    frames.slice(1).forEach((frame, index) => {
      expect(frame.offset).toBeCloseTo(frames[index]!.offset + frames[index]!.height, 6);
    });
    const last = frames[frames.length - 1]!;
    expect(last.offset + last.height).toBeCloseTo((STRIP_HEIGHT * 396) / 1_360, 6);
  });

  it("picks the tiles on screen at the top, in the middle and at the end", () => {
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: 0,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([0, 1]);

    const tile = frames[1]!.offset;
    // Exactly at a tile boundary: that tile and the next fill the viewport.
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: tile * 10,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([10, 11]);
    // Half a tile further: three tiles are on screen.
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: tile * 10.5,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([10, 11, 12]);

    // The end of the strip: the shorter last tile and the one above it fill
    // the viewport; the sliver of tile 27 left above them (15%) is ignored.
    const last = frames[frames.length - 1]!;
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: last.offset + last.height - VIEWPORT,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([28, 29]);
  });

  it("ignores a tile that only peeks into the viewport", () => {
    const tile = frames[1]!.offset;
    // 10% of tile 4 is left at the top; tiles 5 and 6 are fully shown.
    const indexes = getMobileReaderVisibleSegmentIndexes(frames, {
      contentOffset: tile * 4.9,
      viewportLength: VIEWPORT,
    });
    expect(indexes).toEqual([5, 6]);
  });

  it("accounts for the list padding above the first tile", () => {
    const tile = frames[1]!.offset;
    // The same scroll offset shows earlier tiles when the content starts
    // 120pt down.
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: tile * 10,
        viewportLength: VIEWPORT,
        contentInsetTop: tile,
      }),
    ).toEqual([9, 10]);
  });

  it("never returns more than the tile budget, even when zoomed out", () => {
    const indexes = getMobileReaderVisibleSegmentIndexes(frames, {
      contentOffset: 0,
      viewportLength: frames[1]!.offset * 8,
    });
    expect(indexes).toHaveLength(MOBILE_READER_SEGMENT_OCR_MAX_TILES);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("falls back to the nearest tile before anything is measured", () => {
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: 0,
        viewportLength: 0,
      }),
    ).toEqual([0]);
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: Number.NaN,
        viewportLength: Number.NaN,
      }),
    ).toEqual([0]);
    // Overscrolled past the end.
    expect(
      getMobileReaderVisibleSegmentIndexes(frames, {
        contentOffset: 1_000_000,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([29]);
    expect(
      getMobileReaderVisibleSegmentIndexes([], {
        contentOffset: 0,
        viewportLength: VIEWPORT,
      }),
    ).toEqual([]);
  });

  it("turns each tile into its own app-local image page", () => {
    const pages = getMobileReaderSegmentOcrPages(
      { ...page, text: "source text for the whole page" },
      asset,
      [10, 11, 99],
    );
    expect(pages).toHaveLength(2);
    expect(pages.map((entry) => entry.id)).toEqual([
      getMobileReaderSegmentOcrPageId(page.id, 10, 30),
      getMobileReaderSegmentOcrPageId(page.id, 11, 30),
    ]);
    expect(pages[0]!.imageUri).toBe("file:///cache/page.segment-10.jpg");
    expect(pages[0]!.imageUriOwnership).toBe("app");
    // Request headers belong to the remote source image, not a local tile.
    expect(pages[0]!.headers).toBeUndefined();
    // The page's own text must not short-circuit OCR for one tile.
    expect(pages[0]!.text).toBeUndefined();
    expect(pages[0]!.index).toBe(page.index);
    expect(new Set(pages.map((entry) => entry.id)).size).toBe(pages.length);
    expect(pages[0]!.id).not.toBe(page.id);
  });

  it("maps a tile-space box onto that tile's frame, not the strip", () => {
    const sizes = getMobileReaderSegmentOcrImageSizes(page.id, asset);
    expect(sizes.size).toBe(30);
    const tileIndex = 29;
    const size = sizes.get(getMobileReaderSegmentOcrPageId(page.id, tileIndex, 30))!;
    expect(size).toEqual({ width: 1_360, height: STRIP_HEIGHT - 29 * TILE_ROWS });

    // A bubble at pixel (680, 681) of the last (shorter) tile is at the middle
    // of that tile's frame: the frame and the tile share one scale.
    const frame = frames[tileIndex]!;
    const scaleX = frame.width / size.width;
    const scaleY = frame.height / size.height;
    expect(scaleX).toBeCloseTo(scaleY, 9);
    expect(680 * scaleX).toBeCloseTo(frame.width / 2, 6);
    expect(681 * scaleY).toBeCloseTo(frame.height / 2, 6);
    // In strip coordinates that same point sits at the tile's own offset.
    const stripY = frame.offset + 681 * scaleY;
    expect(stripY).toBeCloseTo(((29 * TILE_ROWS + 681) * 396) / 1_360, 6);
  });

  it("compares visible tile sets by value", () => {
    expect(sameMobileReaderSegmentIndexes([1, 2], [1, 2])).toBe(true);
    expect(sameMobileReaderSegmentIndexes([1, 2], [1, 3])).toBe(false);
    expect(sameMobileReaderSegmentIndexes([1], [1, 2])).toBe(false);
    expect(sameMobileReaderSegmentIndexes([], [])).toBe(true);
  });
});
