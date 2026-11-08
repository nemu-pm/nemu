import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_PAGE_TURNS,
  buildMobileReaderCurlSlots,
  isMobileReaderPageCurlActive,
  mobileReaderCurlEdgeIntent,
  mobileReaderCurlFrameForSlot,
  mobileReaderCurlLayout,
  mobileReaderCurlLoneSide,
  mobileReaderCurlReanchorFrame,
  mobileReaderCurlSettleIsCurrent,
  mobileReaderCurlSlotForFrame,
  mobileReaderCurlSlotWindow,
  mobileReaderCurlSpine,
  mobileReaderCurlTurnsImmediately,
  mobileReaderPageTurnTransition,
  mobileReaderSlotBackgrounds,
  nextMobileReaderCurlNavigation,
  normalizeMobileReaderPageTurn,
} from "./mobileReaderPageCurl";
import { getMobileReaderSplitWidePageFrame, mobileReaderSplitWideHalfRects } from "./mobileReaderSpreads";
import { mobileReaderApplyFlip, mobileReaderPageFrameFlip } from "./mobileReaderStageMotion";

const never = () => false;

describe("page turn transition", () => {
  const base = {
    pageTurn: "slide" as const,
    pagedMode: true,
    reduceMotion: false,
    longStrip: false,
    segmented: false,
    curlAvailable: true,
    slideAvailable: true,
  };

  test("slide: Books' slide pager for single pages and spreads alike", () => {
    expect(mobileReaderPageTurnTransition(base)).toBe("slide");
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "curl" })).toBe("curl");
  });

  test("Reduce Motion (or not known yet) turns with the slide pager, which cross-fades", () => {
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "curl", reduceMotion: true })).toBe("slide");
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "curl", reduceMotion: null })).toBe("slide");
    expect(mobileReaderPageTurnTransition({ ...base, reduceMotion: true })).toBe("slide");
  });

  test("the scrolling list where no native pager can turn", () => {
    expect(mobileReaderPageTurnTransition({ ...base, pagedMode: false })).toBeNull();
    expect(mobileReaderPageTurnTransition({ ...base, longStrip: true })).toBeNull();
    expect(mobileReaderPageTurnTransition({ ...base, segmented: true })).toBeNull();
    expect(mobileReaderPageTurnTransition({ ...base, slideAvailable: false })).toBeNull();
    // An older binary with the curl but not the slide pager still curls.
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "curl", slideAvailable: false })).toBe("curl");
  });
});

describe("match page slot backgrounds", () => {
  const pages = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const colours: Record<string, string> = { a: "#ffffff", b: "#101010", c: "#f0ead6" };
  const colourFor = (page: { id: string }) => colours[page.id]!;

  test("each slot takes its own page's colour; a lone page's blank side takes the page's", () => {
    // Manga spreads: [c] alone, then [a, b] (visual left b, right a).
    const frames = [[2], [0, 1]];
    const slots = buildMobileReaderCurlSlots({ frames, spreadMode: true, mode: "rtl", isWide: never });
    const mounted = slots.map((slot, index) => ({ slot, index }));
    expect(mobileReaderSlotBackgrounds({ mounted, frames, displayedPages: pages, pageBackgroundFor: colourFor })).toEqual({
      "0": "#f0ead6",
      "1": "#f0ead6",
      "2": "#101010",
      "3": "#ffffff",
    });
  });

  test("none without Match Page", () => {
    const frames = [[0]];
    const mounted = [{ slot: { kind: "page" as const, frame: 0, pageIndex: 0, part: "whole" as const }, index: 0 }];
    expect(mobileReaderSlotBackgrounds({ mounted, frames, displayedPages: pages, pageBackgroundFor: null })).toBeNull();
  });
});

describe("page turn setting", () => {
  test("defaults to the curl and keeps an explicit slide", () => {
    expect(normalizeMobileReaderPageTurn(undefined)).toBe("curl");
    expect(normalizeMobileReaderPageTurn("fade")).toBe("curl");
    expect(normalizeMobileReaderPageTurn("slide")).toBe("slide");
    // Push is its own choice; a stored "slide" keeps meaning Books' slide.
    expect(normalizeMobileReaderPageTurn("push")).toBe("push");
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
      isWide: never,
    });
    expect(slots.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([2, 1, 0]);
  });

  test("facing pages fill both leaves in visual order", () => {
    const ltr = buildMobileReaderCurlSlots({
      frames: [[1, 2], [3, 4]],
      spreadMode: true,
      mode: "ltr",
      isWide: never,
    });
    expect(ltr.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([1, 2, 3, 4]);
    // RTL frames are reversed by the gallery and each spread reads right to left.
    const rtl = buildMobileReaderCurlSlots({
      frames: [[3, 4], [1, 2]],
      spreadMode: true,
      mode: "rtl",
      isWide: never,
    });
    expect(rtl.map((slot) => (slot.kind === "page" ? slot.pageIndex : -1))).toEqual([4, 3, 2, 1]);
  });

  test("a cover rests where reading starts beside a blank leaf, so every spread has two leaves", () => {
    const ltr = buildMobileReaderCurlSlots({
      frames: [[0], [1, 2]],
      spreadMode: true,
      mode: "ltr",
      isWide: never,
    });
    expect(ltr.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual([0, "blank", 1, 2]);
    const rtl = buildMobileReaderCurlSlots({
      frames: [[1, 2], [0]],
      spreadMode: true,
      mode: "rtl",
      isWide: never,
    });
    expect(rtl.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual([2, 1, "blank", 0]);
  });

  test("a closing page rests where reading starts too (left in LTR)", () => {
    const slots = buildMobileReaderCurlSlots({
      frames: [[0, 1], [2]],
      spreadMode: true,
      mode: "ltr",
      isWide: never,
    });
    expect(slots.map((slot) => slot.kind === "page" ? slot.pageIndex : "blank")).toEqual([0, 1, 2, "blank"]);
  });

  test("a wide page lies across the spine, flat or on a fold, and turns as one spread", () => {
    const wide = (index: number) => index === 2;
    const ltr = buildMobileReaderCurlSlots({
      frames: [[0, 1], [2], [3, 4]],
      spreadMode: true,
      mode: "ltr",
      isWide: wide,
    });
    // Leaves pair about the spine: the back of slot 1 is slot 2 (the wide
    // page's left half), the back of slot 3 (its right half) is slot 4.
    expect(ltr.map((slot) => (slot.kind === "page" ? `${slot.pageIndex}${slot.part === "whole" ? "" : slot.part[0]}` : "blank")))
      .toEqual(["0", "1", "2l", "2r", "3", "4"]);
    // Manga: frames run right to left, the image itself never mirrors.
    const rtl = buildMobileReaderCurlSlots({
      frames: [[3, 4], [2], [0, 1]],
      spreadMode: true,
      mode: "rtl",
      isWide: wide,
    });
    expect(rtl.map((slot) => (slot.kind === "page" ? `${slot.pageIndex}${slot.part === "whole" ? "" : slot.part[0]}` : "blank")))
      .toEqual(["4", "3", "2l", "2r", "1", "0"]);
  });

  test("a lone page rests where reading starts: right in manga, left in LTR, whatever follows it", () => {
    expect(mobileReaderCurlLoneSide("rtl")).toBe("right");
    expect(mobileReaderCurlLoneSide("ltr")).toBe("left");
    const sides = (frames: number[][], mode: "rtl" | "ltr", isWide: (index: number) => boolean) => {
      const slots = buildMobileReaderCurlSlots({ frames, spreadMode: true, mode, isWide });
      // Each frame is two slots: [left leaf, right leaf].
      return slots.flatMap((slot, at) => (slot.kind === "page" && slot.part === "whole" && slots[at % 2 === 0 ? at + 1 : at - 1]?.kind === "blank"
        ? [`${slot.pageIndex}:${at % 2 === 0 ? "left" : "right"}`]
        : []));
    };
    // Manga, frames reversed. A cover followed by a pair (Ch.1) and a cover
    // followed by a wide credits page (Ch.95) land in the same pane.
    expect(sides([[3, 4], [1, 2], [0]], "rtl", never)).toEqual(["0:right"]);
    expect(sides([[2, 3], [1], [0]], "rtl", (index) => index === 1)).toEqual(["0:right"]);
    // A closing page and the page before a wide page too.
    expect(sides([[4], [3], [1, 2], [0]], "rtl", (index) => index === 3)).toEqual(["4:right", "0:right"]);
    // Left to right: always the left pane.
    expect(sides([[0], [1, 2], [3]], "ltr", never)).toEqual(["0:left", "3:left"]);
    expect(sides([[0], [1], [2, 3]], "ltr", (index) => index === 1)).toEqual(["0:left"]);
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

  test("a book-pose wide page: its leaves show the halves exactly where the slide gallery puts them", () => {
    const spreadSlots = [
      { x: 20, y: 0, width: 300, height: 900 },
      { x: 340, y: 0, width: 340, height: 900 },
    ];
    const layout = mobileReaderCurlLayout({
      stage: { width: 700, height: 900 },
      spreadMode: true,
      spreadSlots,
      foldGap: { start: 320, end: 340 },
    });
    const frame = getMobileReaderSplitWidePageFrame({
      slots: [spreadSlots[0]!, spreadSlots[1]!],
      size: { width: 1600, height: 1100 },
    });
    // Stage rects (slide gallery) and leaf-local rects (curl) of the halves.
    const stage = mobileReaderSplitWideHalfRects({ slots: [spreadSlots[0]!, spreadSlots[1]!], frame });
    const leaves = mobileReaderSplitWideHalfRects({ slots: [layout.boxes[0]!, layout.boxes[1]!], frame });
    expect(layout.frame.x + leaves[0].x).toBeCloseTo(stage[0].x, 6);
    expect(layout.frame.y + leaves[0].y).toBeCloseTo(stage[0].y, 6);
    expect(layout.frame.x + layout.leaf.width + leaves[1].x).toBeCloseTo(stage[1].x, 6);
    expect(layout.frame.y + leaves[1].y).toBeCloseTo(stage[1].y, 6);
    // Against the fold edges, inside each leaf.
    expect(layout.frame.x + leaves[0].x + leaves[0].width).toBeCloseTo(320, 6);
    expect(layout.frame.x + layout.leaf.width + leaves[1].x).toBeCloseTo(340, 6);
    expect(leaves[0].x).toBeGreaterThanOrEqual(0);
    expect(leaves[1].x + leaves[1].width).toBeLessThanOrEqual(layout.leaf.width + 1e-9);
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

  test("option: a single page curls as its own box, centred, so its margins stay background", () => {
    const layout = mobileReaderCurlLayout({
      stage: { width: 402, height: 874 },
      spreadMode: false,
      pageBox: { width: 378, height: 540.4 },
    });
    expect(layout.pageLeaf).toBe(true);
    expect(layout.frame).toEqual({ x: 12, y: 167, width: 378, height: 540 });
    expect(layout.leaf).toEqual({ width: 378, height: 540 });
    // No box yet (the page not measured): the whole stage, as before.
    expect(mobileReaderCurlLayout({ stage: { width: 402, height: 874 }, spreadMode: false }).pageLeaf).toBeUndefined();
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

describe("curl pager re-anchor (seamless paged reading)", () => {
  const ids = (...names: string[]) => names.map((id) => ({ id }));
  test("a chapter joined before the settled frame moves it by the joined frames, without a turn", () => {
    const beforePages = ids("b0", "b1", "b2");
    const afterPages = ids("a0", "a1", "b0", "b1", "b2");
    expect(mobileReaderCurlReanchorFrame({
      before: [[0], [1], [2]],
      beforePages,
      after: [[0], [1], [2], [3], [4]],
      afterPages,
      frame: 1,
    })).toBe(3);
  });
  test("RTL frames are reversed: a chapter joined after (in reading order) lands before visually", () => {
    // Visual frames: reading order reversed.
    expect(mobileReaderCurlReanchorFrame({
      before: [[1], [0]],
      beforePages: ids("p0", "p1"),
      after: [[3], [2], [1], [0]],
      afterPages: ids("p0", "p1", "n0", "n1"),
      frame: 1,
    })).toBe(3);
  });
  test("spreads match by their pages; a frame that is gone is null; an unchanged one stays", () => {
    const pages = ids("x", "y", "z");
    expect(mobileReaderCurlReanchorFrame({
      before: [[0], [1, 2]], beforePages: pages, after: [[0], [1, 2]], afterPages: pages, frame: 1,
    })).toBe(1);
    expect(mobileReaderCurlReanchorFrame({
      before: [[0], [1, 2]], beforePages: pages, after: [[0], [1], [2]], afterPages: pages, frame: 1,
    })).toBeNull();
  });
});

describe("mobileReaderCurlSettleIsCurrent", () => {
  test("a requested turn's settle counts while its navigation is the latest", () => {
    expect(mobileReaderCurlSettleIsCurrent({ token: 4 }, 4)).toBe(true);
  });

  test("a settle from a superseded request (a re-anchor after frames joined) is dropped", () => {
    // Manga: the slider lands on the chapter's last page (frame 0); the next
    // chapter joins in front and the pager re-anchors with a new token. The
    // old settle's frame 0 is now the next chapter's last page.
    expect(mobileReaderCurlSettleIsCurrent({ token: 4 }, 5)).toBe(false);
  });

  test("a drag's settle always counts", () => {
    expect(mobileReaderCurlSettleIsCurrent({ gesture: true }, 9)).toBe(true);
    expect(mobileReaderCurlSettleIsCurrent({}, 9)).toBe(true);
  });
});

describe("Push (Photos-style paging), a third page turn", () => {
  const base = {
    pageTurn: "push" as const,
    pagedMode: true,
    reduceMotion: false,
    longStrip: false,
    segmented: false,
    curlAvailable: true,
    slideAvailable: true,
    pushAvailable: true,
  };

  test("offered after Curl and Slide; the default stays Curl", () => {
    expect(MOBILE_READER_PAGE_TURNS).toEqual(["curl", "slide", "push"]);
    expect(normalizeMobileReaderPageTurn(undefined)).toBe("curl");
  });

  test("chosen, it turns paged reading, Reduce Motion included (it keeps its own)", () => {
    expect(mobileReaderPageTurnTransition(base)).toBe("push");
    expect(mobileReaderPageTurnTransition({ ...base, reduceMotion: true })).toBe("push");
  });

  test("Slide and Curl are unchanged by it", () => {
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "slide" })).toBe("slide");
    expect(mobileReaderPageTurnTransition({ ...base, pageTurn: "curl" })).toBe("curl");
  });

  test("no push pager, scroll reading, a long strip or a tiled image: as before", () => {
    expect(mobileReaderPageTurnTransition({ ...base, pushAvailable: false })).toBe("slide");
    expect(mobileReaderPageTurnTransition({ ...base, pagedMode: false })).toBeNull();
    expect(mobileReaderPageTurnTransition({ ...base, longStrip: true })).toBeNull();
    expect(mobileReaderPageTurnTransition({ ...base, segmented: true })).toBeNull();
  });
});
