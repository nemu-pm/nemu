import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_STRIP_DIVIDER_CELL,
  appendMobileReaderStripSegment,
  combineMobileReaderStripLayouts,
  isMobileReaderStripDividerKey,
  isMobileReaderStripHeadRemovalOffscreen,
  mobileReaderStripCrossing,
  mobileReaderStripGlobalIndex,
  mobileReaderStripHeadRemoval,
  mobileReaderStripLocate,
  mobileReaderStripPageKey,
  mobileReaderStripRows,
  mobileReaderStripSegmentOffset,
  mobileReaderStripSegmentStarts,
  mobileReaderStripWarmIndexes,
  prependMobileReaderStripSegment,
  pruneMobileReaderStrip,
  readerSeamlessScroll,
  rebaseMobileReaderStrip,
  shouldAppendMobileReaderStripSegment,
  shouldPrependMobileReaderStripSegment,
  type MobileReaderStrip,
  mobileReaderStripRetreatJoined,
} from "./mobileReaderChapterStrip";
import {
  buildMobileReaderScrollLayout,
  mobileReaderScrollCentrePageIndex,
  mobileReaderScrollOffsetForAnchor,
} from "./mobileReaderScrollLayout";

type Chapter = { id: string; chapterNumber?: number };
type Page = { id: string };

function pages(count: number): Page[] {
  // Page ids repeat across chapters (`${index}:${url}` with a shared url shape).
  return Array.from({ length: count }, (_, index) => ({ id: `${index}:p` }));
}

function strip(
  counts: number[],
  currentIndex = 0,
  tail: MobileReaderStrip<Chapter, Page>["tail"] = null,
): MobileReaderStrip<Chapter, Page> {
  return {
    segments: counts.map((count, index) => ({
      chapter: { id: `c${index + 140}`, chapterNumber: index + 140 },
      pages: pages(count),
    })),
    currentIndex,
    tail,
  };
}

describe("flag", () => {
  test("is a boolean constant", () => {
    expect(typeof readerSeamlessScroll).toBe("boolean");
  });
});

describe("mobileReaderStripRows", () => {
  test("a single chapter is its pages, plus the tail divider", () => {
    const rows = mobileReaderStripRows(strip([3], 0, { kind: "end" }));
    expect(rows.map((row) => row.kind)).toEqual(["page", "page", "page", "divider"]);
    const end = rows[3]!;
    expect(end.kind === "divider" && end.variant).toBe("end");
    expect(end.key).toBe("divider\u0001end");
  });

  test("no tail: identity with the chapter's own pages", () => {
    const rows = mobileReaderStripRows(strip([3]));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === "page")).toBe(true);
  });

  test("a divider sits between chapters and announces the one below", () => {
    const rows = mobileReaderStripRows(strip([2, 2]));
    expect(rows.map((row) => row.kind)).toEqual(["page", "page", "divider", "page", "page"]);
    const divider = rows[2]!;
    expect(divider.kind).toBe("divider");
    if (divider.kind !== "divider") return;
    expect(divider.segmentIndex).toBe(0);
    expect(divider.chapter?.id).toBe("c141");
    expect(divider.key).toBe("divider\u0001c141");
  });

  test("keys are unique across chapters even when page ids repeat", () => {
    const rows = mobileReaderStripRows(strip([3, 3, 3], 1, { kind: "end" }));
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows[0]!.key).toBe(mobileReaderStripPageKey("c140", "0:p"));
    expect(isMobileReaderStripDividerKey(rows[3]!.key)).toBe(true);
    expect(isMobileReaderStripDividerKey(rows[0]!.key)).toBe(false);
  });

  test("a loading next chapter keeps its divider key once it joins", () => {
    const loading = mobileReaderStripRows(
      strip([2], 0, { kind: "next", chapter: { id: "c141" }, status: "loading" }),
    );
    const joined = mobileReaderStripRows(strip([2, 2]));
    expect(loading[2]!.key).toBe(joined[2]!.key);
  });
});

describe("index mapping", () => {
  const s = strip([3, 2, 4], 1, { kind: "end" });
  const rows = mobileReaderStripRows(s);
  const starts = mobileReaderStripSegmentStarts(rows, s.segments.length);

  test("segment starts skip the dividers", () => {
    // 0 1 2 | d | 4 5 | d | 7 8 9 10 | d(end)
    expect(starts).toEqual([0, 4, 7, rows.length]);
  });

  test("global ↔ local round trip", () => {
    for (let segmentIndex = 0; segmentIndex < s.segments.length; segmentIndex += 1) {
      s.segments[segmentIndex]!.pages.forEach((_, localIndex) => {
        const global = mobileReaderStripGlobalIndex(rows, starts, segmentIndex, localIndex);
        expect(global).not.toBeNull();
        expect(mobileReaderStripLocate(rows, s, global!)).toEqual({ segmentIndex, localIndex });
      });
    }
  });

  test("a local index past the chapter maps to nothing", () => {
    expect(mobileReaderStripGlobalIndex(rows, starts, 1, 2)).toBeNull();
    expect(mobileReaderStripGlobalIndex(rows, starts, 5, 0)).toBeNull();
  });

  test("a divider belongs to the chapter above (its last page)", () => {
    expect(mobileReaderStripLocate(rows, s, 3)).toEqual({ segmentIndex: 0, localIndex: 2 });
    expect(mobileReaderStripLocate(rows, s, 6)).toEqual({ segmentIndex: 1, localIndex: 1 });
    // The caught-up divider belongs to the last chapter.
    expect(mobileReaderStripLocate(rows, s, rows.length - 1)).toEqual({
      segmentIndex: 2,
      localIndex: 3,
    });
  });
});

describe("combineMobileReaderStripLayouts", () => {
  const s = strip([2, 2], 0);
  const rows = mobileReaderStripRows(s);
  const starts = mobileReaderStripSegmentStarts(rows, 2);
  const first = buildMobileReaderScrollLayout([100, 200], null, 8);
  const second = buildMobileReaderScrollLayout([300, 400], null, 8);
  const combined = combineMobileReaderStripLayouts(rows, [first, second]);

  test("pages keep their heights and gaps; dividers are 112pt cells", () => {
    expect(MOBILE_READER_STRIP_DIVIDER_CELL).toBe(112);
    expect(combined.heights).toEqual([100, 200, 112, 300, 400]);
    expect(combined.gaps).toEqual([0, 8, 0, 0, 8]);
    expect(combined.length).toBe(100 + 8 + 200 + 112 + 300 + 8 + 400);
  });

  test("each chapter's offsets are its own layout's, shifted by its start", () => {
    const base = mobileReaderStripSegmentOffset(combined, starts, 1);
    expect(base).toBe(first.length + 112);
    for (let local = 0; local < 2; local += 1) {
      expect(mobileReaderScrollOffsetForAnchor(combined, starts[1]! + local, 0.5)).toBe(
        base + mobileReaderScrollOffsetForAnchor(second, local, 0.5),
      );
    }
    expect(mobileReaderStripSegmentOffset(combined, starts, 0)).toBe(0);
  });

  test("the first chapter alone is the chapter's own layout (identity)", () => {
    const single = combineMobileReaderStripLayouts(mobileReaderStripRows(strip([2])), [first]);
    expect(single.heights).toEqual([...first.heights]);
    expect(single.gaps).toEqual([...first.gaps]);
    expect(single.starts).toEqual([...first.starts]);
  });

  test("unknown heights stay unknown; dividers are always known", () => {
    const partial = buildMobileReaderScrollLayout([100, 200], null, 8, [true, false]);
    const mixed = combineMobileReaderStripLayouts(rows, [partial, second]);
    expect(mixed.known).toEqual([true, false, true, true, true]);
  });
});

describe("crossing", () => {
  const s = strip([2, 2, 2], 1, { kind: "end" });
  const rows = mobileReaderStripRows(s);
  const heights = rows.map((row) => (row.kind === "divider" ? 112 : 500));
  const layout = buildMobileReaderScrollLayout(heights, null, 0);
  const viewport = 800;

  test("the chapter switches only once the divider has passed the centre", () => {
    // Centre on the divider above chapter 2: still chapter 1.
    const dividerTop = layout.starts[5]!;
    const centreOnDivider = mobileReaderScrollCentrePageIndex(
      layout,
      dividerTop + 50 - viewport / 2,
      viewport,
      0,
    )!;
    expect(rows[centreOnDivider]!.kind).toBe("divider");
    expect(mobileReaderStripCrossing(rows, s, centreOnDivider)).toBeNull();
    // Centre just past the divider: chapter 2, page 1.
    const past = mobileReaderScrollCentrePageIndex(
      layout,
      dividerTop + 112 + 1 - viewport / 2,
      viewport,
      0,
    )!;
    expect(mobileReaderStripCrossing(rows, s, past)).toEqual({
      segmentIndex: 2,
      localIndex: 0,
      direction: "forward",
    });
  });

  test("backward crossing lands on the previous chapter's last page", () => {
    expect(mobileReaderStripCrossing(rows, s, 1)).toEqual({
      segmentIndex: 0,
      localIndex: 1,
      direction: "backward",
    });
    // The divider between 0 and 1 still belongs to chapter 0.
    expect(mobileReaderStripCrossing(rows, s, 2)?.segmentIndex).toBe(0);
  });

  test("rebase moves the current chapter only", () => {
    const next = rebaseMobileReaderStrip(s, 2);
    expect(next.currentIndex).toBe(2);
    expect(next.segments).toBe(s.segments);
    expect(rebaseMobileReaderStrip(s, 7)).toBe(s);
  });
});

describe("append / prepend / prune", () => {
  test("append triggers in the last 3 pages", () => {
    expect(shouldAppendMobileReaderStripSegment(16, 20)).toBe(false);
    expect(shouldAppendMobileReaderStripSegment(17, 20)).toBe(true);
    expect(shouldAppendMobileReaderStripSegment(0, 1)).toBe(true);
    expect(shouldAppendMobileReaderStripSegment(0, 0)).toBe(false);
  });

  test("prepend triggers in the first 3 pages and only with a previous chapter", () => {
    expect(shouldPrependMobileReaderStripSegment(2, true)).toBe(true);
    expect(shouldPrependMobileReaderStripSegment(3, true)).toBe(false);
    expect(shouldPrependMobileReaderStripSegment(0, false)).toBe(false);
  });

  test("warm indexes are the first 4 pages", () => {
    expect(mobileReaderStripWarmIndexes(20)).toEqual([0, 1, 2, 3]);
    expect(mobileReaderStripWarmIndexes(2)).toEqual([0, 1]);
  });

  test("append keeps the current chapter and replaces the tail", () => {
    const s = strip([2], 0, { kind: "next", chapter: { id: "c141" }, status: "loading" });
    const next = appendMobileReaderStripSegment(
      s,
      { chapter: { id: "c141" }, pages: pages(3) },
      { kind: "end" },
    );
    expect(next.segments.map((segment) => segment.chapter.id)).toEqual(["c140", "c141"]);
    expect(next.currentIndex).toBe(0);
    expect(next.tail).toEqual({ kind: "end" });
    // Same chapter twice: unchanged.
    expect(appendMobileReaderStripSegment(next, { chapter: { id: "c141" }, pages: [] }, null)).toBe(
      next,
    );
  });

  test("prepend shifts the current index", () => {
    const s = strip([2], 0);
    const next = prependMobileReaderStripSegment(s, { chapter: { id: "c139" }, pages: pages(2) });
    expect(next.segments[0]!.chapter.id).toBe("c139");
    expect(next.currentIndex).toBe(1);
  });

  test("prune keeps the current chapter and one on each side", () => {
    const s = strip([2, 2, 2, 2], 2, { kind: "end" });
    const result = pruneMobileReaderStrip(s);
    expect(result.strip.segments.map((segment) => segment.chapter.id)).toEqual([
      "c141",
      "c142",
      "c143",
    ]);
    expect(result.strip.currentIndex).toBe(1);
    expect(result.strip.tail).toEqual({ kind: "end" });
    expect(result.removedHead.map((segment) => segment.chapter.id)).toEqual(["c140"]);
    expect(result.removedTail).toEqual([]);
  });

  test("prune drops the far tail (and its tail divider) after scrolling back", () => {
    const s = strip([2, 2, 2], 0, { kind: "end" });
    const result = pruneMobileReaderStrip(s);
    expect(result.strip.segments.map((segment) => segment.chapter.id)).toEqual(["c140", "c141"]);
    expect(result.strip.tail).toBeNull();
    expect(result.removedTail.map((segment) => segment.chapter.id)).toEqual(["c142"]);
  });

  test("nothing to prune: same strip", () => {
    const s = strip([2, 2, 2], 1);
    expect(pruneMobileReaderStrip(s).strip).toBe(s);
  });

  test("head removal measures the rows above the first kept chapter", () => {
    const s = strip([2, 2, 2, 2], 2);
    const rows = mobileReaderStripRows(s);
    const starts = mobileReaderStripSegmentStarts(rows, 4);
    const layout = buildMobileReaderScrollLayout(
      rows.map((row) => (row.kind === "divider" ? 112 : 500)),
      null,
      0,
    );
    const removal = mobileReaderStripHeadRemoval(layout, starts, 1);
    expect(removal).toEqual({ rows: 3, height: 1112 });
    expect(isMobileReaderStripHeadRemovalOffscreen(removal, 1200)).toBe(true);
    expect(isMobileReaderStripHeadRemovalOffscreen(removal, 1000)).toBe(false);
    expect(mobileReaderStripHeadRemoval(layout, starts, 0)).toEqual({ rows: 0, height: 0 });
  });
});

describe("a pull past the top crosses once the chapter above joins", () => {
  test("joined: the chapter pulled from is no longer first", () => {
    expect(mobileReaderStripRetreatJoined(["c2", "c3"], "c3")).toBe(true);
  });
  test("not yet (still alone, or dropped meanwhile)", () => {
    expect(mobileReaderStripRetreatJoined(["c3"], "c3")).toBe(false);
    expect(mobileReaderStripRetreatJoined(["c4", "c5"], "c3")).toBe(false);
  });
});
