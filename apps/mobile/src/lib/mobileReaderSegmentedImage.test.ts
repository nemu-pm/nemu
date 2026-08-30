import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canUseMobileReaderWholeImageTools,
  getMobileReaderSegmentFrames,
  getMobileReaderLogicalAccessibilityPercent,
  getMobileReaderLogicalPageIdentity,
  getMobileReaderLogicalOffsetForProgress,
  getMobileReaderLogicalScrollProgress,
  getMobileReaderMeasuredScrollMetrics,
  isMobileReaderLogicalEndReached,
  MOBILE_READER_SEGMENTED_CAPABILITIES,
  mobileReaderSegmentedNextAction,
  shouldCompleteSingleImageReaderPage,
} from "./mobileReaderSegmentedImage";
import type { MobileCachedSegmentedImageAsset } from "./mobileImageCache";

const asset: MobileCachedSegmentedImageAsset = {
  kind: "segmented-image",
  manifestVersion: 1,
  generation: "00000000m1-000000-0000000001",
  manifestUri: "file:///cache/page.segments.json",
  byteLength: 6,
  width: 1_114,
  height: 38_400,
  segments: [
    {
      uri: "file:///0.png",
      byteLength: 1,
      width: 1_114,
      height: 1_829,
      mimeType: "image/png",
    },
    {
      uri: "file:///1.png",
      byteLength: 2,
      width: 1_114,
      height: 1_828,
      mimeType: "image/png",
    },
    {
      uri: "file:///2.png",
      byteLength: 3,
      width: 1_114,
      height: 34_743,
      mimeType: "image/png",
    },
  ],
};

describe("segmented reader geometry", () => {
  it("uses one cumulative transform with exact adjacency and aggregate height", () => {
    const frames = getMobileReaderSegmentFrames(asset, 390);
    expect(frames).toHaveLength(3);
    expect(frames[0]!.offset).toBe(0);
    frames.slice(0, -1).forEach((frame, index) => {
      expect(frame.offset + frame.height).toBe(frames[index + 1]!.offset);
    });
    expect(frames.at(-1)!.offset + frames.at(-1)!.height).toBe(
      38_400 * (390 / 1_114),
    );
  });

  it("keeps page 1/1 unread until metadata and the terminal threshold", () => {
    expect(
      shouldCompleteSingleImageReaderPage({
        hasImage: true,
        naturalSizeKnown: false,
        longStripPresentation: false,
        reachedLogicalEnd: false,
      }),
    ).toBe(false);
    expect(
      shouldCompleteSingleImageReaderPage({
        hasImage: true,
        naturalSizeKnown: true,
        longStripPresentation: true,
        reachedLogicalEnd: false,
      }),
    ).toBe(false);
    expect(
      shouldCompleteSingleImageReaderPage({
        hasImage: true,
        naturalSizeKnown: true,
        longStripPresentation: true,
        reachedLogicalEnd: true,
      }),
    ).toBe(true);
  });

  it("moves accessibility Next by a viewport before requesting chapter end", () => {
    expect(
      mobileReaderSegmentedNextAction({
        contentOffset: 0,
        contentLength: 0,
        viewportLength: 0,
      }),
    ).toEqual({ kind: "scroll", offset: 0 });
    expect(
      isMobileReaderLogicalEndReached({
        contentOffset: 0,
        contentLength: 0,
        viewportLength: 0,
      }),
    ).toBe(false);
    expect(
      isMobileReaderLogicalEndReached({
        contentOffset: Number.NaN,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toBe(false);
    expect(
      mobileReaderSegmentedNextAction({
        contentOffset: 0,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toEqual({ kind: "scroll", offset: 850 });
    expect(
      mobileReaderSegmentedNextAction({
        contentOffset: 9_000,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toEqual({ kind: "end" });
    expect(
      isMobileReaderLogicalEndReached({
        contentOffset: 8_999,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toBe(true);
  });

  it("seeds fresh content geometry before the first accessibility scroll", () => {
    const metrics = getMobileReaderMeasuredScrollMetrics({
      contentOffset: 0,
      contentLength: 10_100 - 100,
      viewportLength: 1_000,
    });
    expect(metrics).toEqual({
      contentOffset: 0,
      contentLength: 10_000,
      viewportLength: 1_000,
    });
    expect(mobileReaderSegmentedNextAction(metrics)).toEqual({
      kind: "scroll",
      offset: 850,
    });
  });

  it("explicitly disables whole-page-only image capabilities", () => {
    expect(MOBILE_READER_SEGMENTED_CAPABILITIES).toEqual({
      wholePageZoom: false,
      japaneseLearningImageTools: false,
      dualReaderOverlay: false,
    });
    expect(
      canUseMobileReaderWholeImageTools({
        hasImage: true,
        naturalSizeKnown: false,
        segmented: false,
      }),
    ).toBe(false);
    expect(
      canUseMobileReaderWholeImageTools({
        hasImage: true,
        naturalSizeKnown: true,
        segmented: true,
      }),
    ).toBe(false);
    expect(
      canUseMobileReaderWholeImageTools({
        hasImage: true,
        naturalSizeKnown: true,
        segmented: false,
      }),
    ).toBe(true);
  });

  it("binds page state to chapter and exact image content identity", () => {
    const shared = {
      registryId: "registry",
      sourceId: "source",
      mangaId: "manga",
      pageId: "0",
    };
    const first = getMobileReaderLogicalPageIdentity({
      ...shared,
      chapterId: "chapter-a",
      imageUri: "https://example.test/a.jpg",
    });
    expect(
      getMobileReaderLogicalPageIdentity({
        ...shared,
        chapterId: "chapter-b",
        imageUri: "https://example.test/a.jpg",
      }),
    ).not.toBe(first);
    expect(
      getMobileReaderLogicalPageIdentity({
        ...shared,
        chapterId: "chapter-a",
        imageUri: "https://example.test/b.jpg",
      }),
    ).not.toBe(first);
  });

  it("restores normalized intra-strip position across geometry changes", () => {
    const progress = getMobileReaderLogicalScrollProgress({
      contentOffset: 4_500,
      contentLength: 10_000,
      viewportLength: 1_000,
    });
    expect(progress).toBe(0.5);
    expect(
      getMobileReaderLogicalOffsetForProgress({
        progress: progress!,
        contentLength: 20_000,
        viewportLength: 2_000,
      }),
    ).toBe(9_000);
    expect(
      getMobileReaderLogicalScrollProgress({
        contentOffset: 0,
        contentLength: 0,
        viewportLength: 0,
      }),
    ).toBeNull();
  });

  it("announces bounded within-strip progress after geometry is known", () => {
    expect(
      getMobileReaderLogicalAccessibilityPercent({
        contentOffset: 0,
        contentLength: 0,
        viewportLength: 0,
      }),
    ).toBe(0);
    expect(
      getMobileReaderLogicalAccessibilityPercent({
        contentOffset: 4_500,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toBe(50);
    expect(
      getMobileReaderLogicalAccessibilityPercent({
        contentOffset: 9_000,
        contentLength: 10_000,
        viewportLength: 1_000,
      }),
    ).toBe(100);
    expect(
      getMobileReaderLogicalAccessibilityPercent({
        contentOffset: 0,
        contentLength: 800,
        viewportLength: 1_000,
      }),
    ).toBe(100);
  });

  it("wires identity restore and blocks whole-image OCR across asset resolution", () => {
    const screen = readFileSync(
      path.join(import.meta.dir, "../screens/ReaderScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain("longStripContentIdentity={");
    expect(screen).toContain("? currentDisplayedPageIdentity");
    expect(screen).toContain(
      "initialLongStripScrollProgress={initialLongStripScrollProgress}",
    );
    expect(screen).toContain(
      "onLongStripScrollProgressChange={persistLongStripScrollProgress}",
    );
    expect(screen).toContain("intraPageContentIdentity: contentIdentity");
    expect(screen).toContain(
      "currentDisplayedPage.imageUri && !currentImageMetadataReady",
    );
    expect(screen).toContain(
      'japaneseLearningLifecycleRef.current?.abort("ocr")',
    );
    expect(screen).toContain("disabled={Boolean(currentSegmentedImage)}");
    expect(screen).toContain("currentWholeImageToolsAvailable");
    expect(screen).toContain("readerImageSizes.has(pageIdentity)");
    const cachedImage = readFileSync(
      path.join(
        import.meta.dir,
        "../design-system/components/MobileCachedImage.tsx",
      ),
      "utf8",
    );
    expect(cachedImage).not.toContain(
      "() => onSegmentedImageRef.current?.(null)",
    );
    expect(cachedImage).toContain("const synchronouslyCachedAsset = useMemo(");
    expect(cachedImage).toContain(
      "getCachedMobileImageAssetByStorageKeySync(cacheStorageKey)",
    );
    expect(cachedImage).toContain("[cacheStorageKey]");
    const gallery = readFileSync(
      path.join(
        import.meta.dir,
        "../components/reader/MobileReaderGallery.tsx",
      ),
      "utf8",
    );
    expect(gallery).toContain("readerContinuousRelayoutProgress({");
    expect(gallery).toContain(
      "initialProgress: logicalLongStripMode ? persistedProgress : null",
    );
    expect(gallery).toContain("strings.reader.longStripProgress");
  });
});
