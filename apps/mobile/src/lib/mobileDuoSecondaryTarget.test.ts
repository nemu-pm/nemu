import { describe, expect, test } from "bun:test";
import type { SecondaryAlignment, SecondaryRenderPlan } from "@nemu/core/dual-reader";
import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { DualReadSecondaryImageHandle } from "./mobileDualReaderStore";
import {
  mobileDuoSecondaryDestRect,
  mobileDuoSecondaryPageNumber,
  resolveMobileDuoSecondaryChapter,
  resolveMobileDuoSecondaryTarget,
  type MobileDuoSecondaryStoreSlice,
} from "./mobileDuoSecondaryTarget";

const primaryChapters: ChapterSummary[] = [
  { id: "p1", chapterNumber: 1 },
  { id: "p2", chapterNumber: 2 },
];
const secondaryChapters: ChapterSummary[] = [
  { id: "s1", chapterNumber: 1 },
  { id: "s2", chapterNumber: 2 },
];
const seedPair = { primaryId: "p1", secondaryId: "s1" };

function pages(count: number): MobileReaderPage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s2-${index}`,
    index,
    imageUri: `https://example.com/${index}.jpg`,
  })) as unknown as MobileReaderPage[];
}

function handle(): DualReadSecondaryImageHandle {
  return { image: { kind: "sk" }, width: 10, height: 10, pixelCount: 100, byteSize: 400 };
}

const empty: MobileDuoSecondaryStoreSlice = {
  driftDeltaByChapter: {},
  secondaryPagesByChapter: {},
  secondaryRenderPlansByChapter: {},
  secondaryAlignmentByChapter: {},
  secondaryImageUrls: new Map(),
};

const identity: SecondaryAlignment = {
  dx: 0, dy: 0, scale: 1, confidence: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe("resolveMobileDuoSecondaryChapter", () => {
  test("maps through the seed pair", () => {
    const chapter = resolveMobileDuoSecondaryChapter({ chapterId: "p2", primaryChapters, secondaryChapters, seedPair });
    expect(chapter.primaryChapter?.id).toBe("p2");
    expect(chapter.secondaryChapterId).toBe("s2");
    expect(chapter.lookupReady).toBe(true);
  });
  test("is not ready without chapters or seed", () => {
    expect(resolveMobileDuoSecondaryChapter({ chapterId: "p2", primaryChapters, secondaryChapters: [], seedPair }))
      .toEqual({ primaryChapter: primaryChapters[1], secondaryChapterId: null, lookupReady: false });
    expect(resolveMobileDuoSecondaryChapter({ chapterId: "p2", primaryChapters, secondaryChapters, seedPair: null }).lookupReady)
      .toBe(false);
  });
});

describe("resolveMobileDuoSecondaryTarget", () => {
  const mapped = resolveMobileDuoSecondaryChapter({ chapterId: "p2", primaryChapters, secondaryChapters, seedPair });

  test("idle without a page", () => {
    expect(resolveMobileDuoSecondaryTarget(mapped, { ...empty, chapterId: "p2", localIndex: null }).status).toBe("idle");
  });

  test("notReady while the lookup loads, unavailable when nothing maps", () => {
    const notReady = resolveMobileDuoSecondaryChapter({ chapterId: "p2", primaryChapters, secondaryChapters: [], seedPair });
    expect(resolveMobileDuoSecondaryTarget(notReady, { ...empty, chapterId: "p2", localIndex: 0 }).status).toBe("notReady");
    const unavailable = { ...mapped, secondaryChapterId: null };
    expect(resolveMobileDuoSecondaryTarget(unavailable, { ...empty, chapterId: "p2", localIndex: 0 }).status).toBe("unavailable");
  });

  test("single page: drift-mapped, clamped, loading until decoded, then ready", () => {
    const slice = {
      ...empty,
      driftDeltaByChapter: { p2: 2 },
      secondaryPagesByChapter: { s2: pages(4) },
    };
    const loading = resolveMobileDuoSecondaryTarget(mapped, { ...slice, chapterId: "p2", localIndex: 3 });
    expect(loading.mappedIndex).toBe(5);
    expect(loading.clampedIndex).toBe(3);
    expect(loading.imageKey).toBe("s2:3");
    expect(loading.status).toBe("loading");
    expect(mobileDuoSecondaryPageNumber(loading)).toBe(4);

    const ready = resolveMobileDuoSecondaryTarget(mapped, {
      ...slice,
      secondaryImageUrls: new Map([["s2:3", handle()]]),
      chapterId: "p2",
      localIndex: 3,
    });
    expect(ready.status).toBe("ready");
  });

  test("pages not loaded yet: loading with no key", () => {
    const target = resolveMobileDuoSecondaryTarget(mapped, { ...empty, chapterId: "p2", localIndex: 0 });
    expect(target.status).toBe("loading");
    expect(target.imageKey).toBeNull();
  });

  test("render plans win when they match chapter + drift", () => {
    const merge: SecondaryRenderPlan = {
      kind: "merge", secondaryChapterId: "s2", secondaryIndices: [4, 5], order: "normal", driftDelta: 0,
    } as SecondaryRenderPlan;
    const target = resolveMobileDuoSecondaryTarget(mapped, {
      ...empty,
      secondaryPagesByChapter: { s2: pages(8) },
      secondaryRenderPlansByChapter: { p2: { 2: merge } },
      chapterId: "p2",
      localIndex: 2,
    });
    expect(target.renderPlan).toBe(merge);
    expect(target.imageKey?.startsWith("merge:s2:4:5")).toBe(true);
    expect(mobileDuoSecondaryPageNumber(target)).toBe(5);

    const stale = resolveMobileDuoSecondaryTarget(mapped, {
      ...empty,
      driftDeltaByChapter: { p2: 1 },
      secondaryPagesByChapter: { s2: pages(8) },
      secondaryRenderPlansByChapter: { p2: { 2: merge } },
      chapterId: "p2",
      localIndex: 2,
    });
    expect(stale.renderPlan).toBeNull();
    expect(stale.imageKey).toBe("s2:3");
  });

  test("split plan uses the composite key", () => {
    const split = { kind: "split", secondaryChapterId: "s2", secondaryIndex: 1, side: "right", driftDelta: 0 } as SecondaryRenderPlan;
    const target = resolveMobileDuoSecondaryTarget(mapped, {
      ...empty,
      secondaryRenderPlansByChapter: { p2: { 0: split } },
      chapterId: "p2",
      localIndex: 0,
    });
    expect(target.imageKey).toBe("split:s2:1:right");
    expect(mobileDuoSecondaryPageNumber(target)).toBe(2);
  });

  test("missing plan short-circuits", () => {
    const missing = { kind: "missing", secondaryChapterId: "s2", driftDelta: 0 } as SecondaryRenderPlan;
    const target = resolveMobileDuoSecondaryTarget(mapped, {
      ...empty,
      secondaryRenderPlansByChapter: { p2: { 0: missing } },
      chapterId: "p2",
      localIndex: 0,
    });
    expect(target.status).toBe("missing");
    expect(target.imageKey).toBeNull();
    expect(mobileDuoSecondaryPageNumber(target)).toBeNull();
  });

  test("alignment applies only above the confidence floor and for the mapped chapter", () => {
    const withAlignment = (confidence: number, secondaryChapterId = "s2") => resolveMobileDuoSecondaryTarget(mapped, {
      ...empty,
      secondaryAlignmentByChapter: { p2: { secondaryChapterId, byPage: { 0: { ...identity, confidence } } } },
      chapterId: "p2",
      localIndex: 0,
    });
    expect(withAlignment(0.9).applyAlignment).toBe(true);
    expect(withAlignment(0.05).applyAlignment).toBe(false);
    expect(withAlignment(0.9, "other").alignment).toBeNull();
  });
});

describe("mobileDuoSecondaryDestRect", () => {
  test("contain-fits in its own pane without alignment", () => {
    const { rect, aligned } = mobileDuoSecondaryDestRect({
      container: { width: 463, height: 669 },
      secondaryNatural: { width: 1000, height: 1500 },
      primaryNatural: { width: 1000, height: 1500 },
      alignment: null,
      applyAlignment: false,
    });
    expect(aligned).toBe(false);
    expect(rect.height).toBeCloseTo(669, 3);
    expect(rect.width).toBeCloseTo(446, 3);
    expect(rect.x).toBeCloseTo((463 - 446) / 2, 3);
  });

  test("identity alignment mirrors the primary's fitted frame in the pane", () => {
    const { rect, aligned } = mobileDuoSecondaryDestRect({
      container: { width: 463, height: 669 },
      secondaryNatural: { width: 1000, height: 1500 },
      primaryNatural: { width: 1000, height: 1500 },
      alignment: identity,
      applyAlignment: true,
    });
    expect(aligned).toBe(true);
    expect(rect.width).toBeCloseTo(446, 3);
    expect(rect.height).toBeCloseTo(669, 3);
  });

  test("falls back to contain when the primary size is unknown", () => {
    expect(mobileDuoSecondaryDestRect({
      container: { width: 400, height: 600 },
      secondaryNatural: { width: 400, height: 600 },
      primaryNatural: null,
      alignment: identity,
      applyAlignment: true,
    }).aligned).toBe(false);
  });
});
