import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderCurlSlots,
  isMobileReaderPageCurlActive,
  mobileReaderCurlEdgeIntent,
  mobileReaderCurlFrameForSlot,
  mobileReaderCurlLayout,
  mobileReaderCurlLoneSide,
  mobileReaderCurlSlotForFrame,
  mobileReaderCurlSlotWindow,
  mobileReaderCurlSpine,
  mobileReaderCurlTurnsImmediately,
  nextMobileReaderCurlNavigation,
  normalizeMobileReaderPageTurn,
} from "./mobileReaderPageCurl";
import { mobileReaderApplyFlip, mobileReaderPageFrameFlip } from "./mobileReaderStageMotion";

const never = () => false;

describe("page turn setting", () => {
  test("defaults to the curl and keeps an explicit slide", () => {
    expect(normalizeMobileReaderPageTurn(undefined)).toBe("curl");
    expect(normalizeMobileReaderPageTurn("fade")).toBe("curl");
    expect(normalizeMobileReaderPageTurn("slide")).toBe("slide");
  });

  test("curls only paged whole pages with motion allowed", () => {
    const base = {
      pageTurn: "curl" as const,
      pagedMode: true,
      reduceMotion: false,
      longStrip: false,
      segmented: false,
      available: true,
    };
    expect(isMobileReaderPageCurlActive(base)).toBe(true);
    expect(isMobileReaderPageCurlActive({ ...base, pageTurn: "slide" })).toBe(false);
    expect(isMobileReaderPageCurlActive({ ...base, reduceMotion: true })).toBe(false);
    // Unknown Reduce Motion (not read yet) keeps the slide.
    expect(isMobileReaderPageCurlActive({ ...base, reduceMotion: null })).toBe(false);
    expect(isMobileReaderPageCurlActive({ ...base, pagedMode: false })).toBe(false);
    expect(isMobileReaderPageCurlActive({ ...base, longStrip: true })).toBe(false);
    expect(isMobileReaderPageCurlActive({ ...base, segmented: true })).toBe(false);
    expect(isMobileReaderPageCurlActive({ ...base, available: false })).toBe(false);
  });
});

describe("curl spine", () => {
  test("binds single pages on the reading-start edge and spreads in the middle", () => {
    expect(mobileReaderCurlSpine(false, "ltr")).toBe("min");
    expect(mobileReaderCurlSpine(false, "rtl")).toBe("max");
    expect(mobileReaderCurlSpine(true, "ltr")).toBe("mid");
    expect(mobileReaderCurlSpine(true, "rtl")).toBe("mid");
  });
});

describe("curl slots", () => {
  test("single pages take one slot per visual frame", () => {
    const slots = buildMobileReaderCurlSlots({
      frames: [[2], [1], [0]],
      spreadMode: false,
      mode: "rtl",
      splitWide: true,
      isWide: never,
    });
    expect(slots.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([2, 1, 0]);
  });

  test("facing pages fill both leaves in visual order", () => {
    const ltr = buildMobileReaderCurlSlots({
      frames: [[1, 2], [3, 4]],
      spreadMode: true,
      mode: "ltr",
      splitWide: true,
      isWide: never,
    });
    expect(ltr.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([1, 2, 3, 4]);
    // RTL frames are reversed by the gallery and each spread reads right to left.
    const rtl = buildMobileReaderCurlSlots({
      frames: [[3, 4], [1, 2]],
      spreadMode: true,
      mode: "rtl",
      splitWide: true,
      isWide: never,
    });
    expect(rtl.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([4, 3, 2, 1]);
  });

  test("a cover rests on the recto with a blank verso, so every spread has two leaves", () => {
    const ltr = buildMobileReaderCurlSlots({
      frames: [[0], [1, 2]],
      spreadMode: true,
      mode: "ltr",
      splitWide: true,
      isWide: never,
    });
    expect(ltr.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual(["blank", 0, 1, 2]);
    const rtl = buildMobileReaderCurlSlots({
      frames: [[1, 2], [0]],
      spreadMode: true,
      mode: "rtl",
      splitWide: true,
      isWide: never,
    });
    expect(rtl.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual([2, 1, 0, "blank"]);
  });

  test("a closing page rests on the verso", () => {
    const slots = buildMobileReaderCurlSlots({
      frames: [[0, 1], [2]],
      spreadMode: true,
      mode: "ltr",
      splitWide: true,
      isWide: never,
    });
    expect(slots.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual([0, 1, 2, "blank"]);
  });

  test("a wide page lies across the spine of a flat spread and stands in one pane on a fold", () => {
    const wide = (index: number) => index === 2;
    const flat = buildMobileReaderCurlSlots({
      frames: [[0, 1], [2], [3, 4]],
      spreadMode: true,
      mode: "ltr",
      splitWide: true,
      isWide: wide,
    });
    expect(flat.slice(2, 4)).toEqual([
      { kind: "page", frame: 1, pageIndex: 2, part: "left" },
      { kind: "page", frame: 1, pageIndex: 2, part: "right" },
    ]);
    const fold = buildMobileReaderCurlSlots({
      frames: [[0, 1], [2], [3, 4]],
      spreadMode: true,
      mode: "ltr",
      splitWide: false,
      isWide: wide,
    });
    expect(fold.slice(2, 4).map((slot) => slot.kind)).toEqual(["blank", "page"]);
  });

  test("the page before a wide page is a verso", () => {
    expect(mobileReaderCurlLoneSide({ mode: "ltr", nextSpread: [5], isWide: (i) => i === 5 })).toBe("left");
    expect(mobileReaderCurlLoneSide({ mode: "ltr", nextSpread: [5, 6], isWide: never })).toBe("right");
    expect(mobileReaderCurlLoneSide({ mode: "rtl", nextSpread: [5, 6], isWide: never })).toBe("left");
    expect(mobileReaderCurlLoneSide({ mode: "rtl", nextSpread: null, isWide: never })).toBe("right");
  });
});

describe("curl navigation", () => {
  test("frames and slots convert both ways", () => {
    expect(mobileReaderCurlSlotForFrame(3, false)).toBe(3);
    expect(mobileReaderCurlSlotForFrame(3, true)).toBe(6);
    expect(mobileReaderCurlFrameForSlot(7, true)).toBe(3);
    expect(mobileReaderCurlFrameForSlot(6, true)).toBe(3);
    expect(mobileReaderCurlFrameForSlot(5, false)).toBe(5);
    expect(mobileReaderCurlSlotForFrame(Number.NaN, true)).toBe(0);
  });

  test("keeps two frames on either side mounted", () => {
    expect(mobileReaderCurlSlotWindow({ frame: 0, frameCount: 10, spreadMode: false })).toEqual({ start: 0, end: 2 });
    expect(mobileReaderCurlSlotWindow({ frame: 5, frameCount: 10, spreadMode: false })).toEqual({ start: 3, end: 7 });
    expect(mobileReaderCurlSlotWindow({ frame: 5, frameCount: 6, spreadMode: true })).toEqual({ start: 6, end: 11 });
    expect(mobileReaderCurlSlotWindow({ frame: 0, frameCount: 0, spreadMode: true })).toEqual({ start: 0, end: -1 });
  });

  test("a drag past either end leads to the next or previous chapter in reading order", () => {
    expect(mobileReaderCurlEdgeIntent("after", "ltr")).toBe("next");
    expect(mobileReaderCurlEdgeIntent("before", "ltr")).toBe("previous");
    expect(mobileReaderCurlEdgeIntent("after", "rtl")).toBe("previous");
    expect(mobileReaderCurlEdgeIntent("before", "rtl")).toBe("next");
  });

  test("every request is new, even to the same slot", () => {
    const first = nextMobileReaderCurlNavigation({ slot: 0, token: 0, animated: false }, 2, true);
    const again = nextMobileReaderCurlNavigation(first, 2, true);
    expect(first).toEqual({ slot: 2, token: 1, animated: true });
    expect(again.token).toBe(2);
  });
});

describe("curl layout", () => {
  test("a single page curls across the whole stage", () => {
    const layout = mobileReaderCurlLayout({ stage: { width: 402, height: 874 }, spreadMode: false });
    expect(layout.frame).toEqual({ x: 0, y: 0, width: 402, height: 874 });
    expect(layout.leaf).toEqual({ width: 402, height: 874 });
  });

  test("a flat spread turns about the stage centre", () => {
    const layout = mobileReaderCurlLayout({ stage: { width: 1180, height: 820 }, spreadMode: true });
    expect(layout.frame).toEqual({ x: 0, y: 0, width: 1180, height: 820 });
    expect(layout.leaf).toEqual({ width: 590, height: 820 });
  });

  test("a book-pose spread turns about the fold and leaves the crease clear", () => {
    const layout = mobileReaderCurlLayout({
      stage: { width: 700, height: 900 },
      spreadMode: true,
      spreadSlots: [
        { x: 20, y: 0, width: 300, height: 900 },
        { x: 340, y: 0, width: 340, height: 900 },
      ],
      foldGap: { start: 320, end: 340 },
    });
    // Spine at the middle of the fold; the leaves are symmetric about it.
    expect(layout.frame.x + layout.frame.width / 2).toBe(330);
    expect(layout.leaf.width).toBe(350);
    // Each page box stops at the fold edge of its pane.
    const [left, right] = layout.boxes;
    expect(layout.frame.x + left!.x + left!.width).toBe(320);
    expect(layout.frame.x + layout.leaf.width + right!.x).toBe(340);
  });

  test("flat → book: each facing page glides from its flat box to its book box (the page-frame FLIP)", () => {
    const stage = { width: 700, height: 900 };
    const flat = mobileReaderCurlLayout({
      stage,
      spreadMode: true,
      spreadSlots: [
        { x: 30, y: 0, width: 320, height: 900 },
        { x: 350, y: 0, width: 320, height: 900 },
      ],
    });
    const book = mobileReaderCurlLayout({
      stage,
      spreadMode: true,
      spreadSlots: [
        { x: 20, y: 30, width: 300, height: 840 },
        { x: 340, y: 30, width: 300, height: 840 },
      ],
      foldGap: { start: 320, end: 340 },
    });
    for (const side of [0, 1] as const) {
      const from = flat.boxes[side]!;
      const to = book.boxes[side]!;
      const flip = mobileReaderPageFrameFlip(from, to);
      // At the start of the glide the page is drawn over its flat box.
      const topLeft = mobileReaderApplyFlip({ x: to.x, y: to.y }, to, flip);
      expect(topLeft.x).toBeCloseTo(from.x, 5);
      expect(topLeft.x + to.width * flip.scale).toBeCloseTo(from.x + from.width, 5);
    }
  });
});

describe("tap turn start", () => {
  test("a one-step animated turn starts natively at once", () => {
    expect(mobileReaderCurlTurnsImmediately({ step: true, overlaysOnPages: false, available: true })).toBe(true);
  });
  test("bubbles on the page, a jump, or an older binary wait for the commit", () => {
    expect(mobileReaderCurlTurnsImmediately({ step: true, overlaysOnPages: true, available: true })).toBe(false);
    expect(mobileReaderCurlTurnsImmediately({ step: false, overlaysOnPages: false, available: true })).toBe(false);
    expect(mobileReaderCurlTurnsImmediately({ step: true, overlaysOnPages: false, available: false })).toBe(false);
  });
});
