import { describe, expect, test } from "bun:test";
import {
  READER_TAP_EDGE_ZONE_RATIO,
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
  readerCentreTapBand,
  READER_CHROME_AUTO_HIDE_REACH_MS,
  readerChromeDismissOwnMs,
  readerChromeDismissSweep,
  readerSideBarColumnRect,
  readerStageTouchOwner,
  readerStageTouchMatchesContent,
  readerTapDispatchForZone,
  readerTapZoneForPosition,
  readerScrollTapZoneForPosition,
  READER_SCROLL_TAP_EDGE_ZONE_RATIO,
  READER_BOOK_TAP_EDGE_MIN_WIDTH,
  isReaderBookTapDead,
  readerBookCentreTapBand,
  readerBookTapLayout,
  readerBookTapZoneForPosition,
  readerTapZoneForPhysicalSide,
} from "./readerTapZones";

const WIDTH = 400;

function zone(x: number, mode: "ltr" | "rtl" | "scrolling", pagedMode = true) {
  return readerTapZoneForPosition({ x, width: WIDTH, mode, pagedMode });
}

describe("reader tap zones", () => {
  test("blocks stage taps only while an overlay owns the gesture", () => {
    expect(isReaderStageTapEnabled({ tapGesturesEnabled: false })).toBe(false);
    expect(isReaderStageTapEnabled({ tapGesturesEnabled: true })).toBe(true);
  });

  test("keeps reader chrome taps out of the gallery page-turn zones", () => {
    const geometry = { height: 900, topInset: 100, bottomInset: 120 };
    expect(isReaderTapInsideChrome({ ...geometry, y: 80 })).toBe(true);
    expect(isReaderTapInsideChrome({ ...geometry, y: 100 })).toBe(true);
    expect(isReaderTapInsideChrome({ ...geometry, y: 450 })).toBe(false);
    expect(isReaderTapInsideChrome({ ...geometry, y: 780 })).toBe(true);
    expect(isReaderTapInsideChrome({ ...geometry, y: 850 })).toBe(true);
    expect(
      isReaderTapInsideChrome({
        ...geometry,
        y: Number.NaN,
      }),
    ).toBe(false);
  });

  test("splits the stage into 35/30/35 zones", () => {
    expect(READER_TAP_EDGE_ZONE_RATIO).toBe(0.35);
    // Left edge band: [0, 140)
    expect(zone(0, "ltr")).toBe("previous");
    expect(zone(139, "ltr")).toBe("previous");
    // Centre band: [140, 260]
    expect(zone(140, "ltr")).toBe("toggle");
    expect(zone(200, "ltr")).toBe("toggle");
    expect(zone(260, "ltr")).toBe("toggle");
    // Right edge band: (260, 400]
    expect(zone(261, "ltr")).toBe("next");
    expect(zone(400, "ltr")).toBe("next");
  });

  test("maps edge zones to source order for left-to-right reading", () => {
    expect(zone(20, "ltr")).toBe("previous");
    expect(zone(380, "ltr")).toBe("next");
  });

  test("flips the edge zones for right-to-left reading", () => {
    expect(zone(20, "rtl")).toBe("next");
    expect(zone(380, "rtl")).toBe("previous");
  });

  test("never pages in scrolling mode", () => {
    expect(zone(20, "scrolling", false)).toBe("toggle");
    expect(zone(200, "scrolling", false)).toBe("toggle");
    expect(zone(380, "scrolling", false)).toBe("toggle");
    // Paged flag wins over the mode value so a caller cannot page a
    // vertically scrolling stage by mistake.
    expect(zone(20, "ltr", false)).toBe("toggle");
  });

  test("falls back to the chrome toggle for unusable geometry", () => {
    expect(
      readerTapZoneForPosition({ x: 10, width: 0, mode: "ltr", pagedMode: true }),
    ).toBe("toggle");
    expect(
      readerTapZoneForPosition({
        x: Number.NaN,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
      }),
    ).toBe("toggle");
    expect(
      readerTapZoneForPosition({
        x: 10,
        width: Number.POSITIVE_INFINITY,
        mode: "ltr",
        pagedMode: true,
      }),
    ).toBe("toggle");
    expect(
      readerTapZoneForPosition({
        x: 10,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
        edgeRatio: 0,
      }),
    ).toBe("toggle");
  });

  test("clamps out-of-bounds coordinates onto the nearest edge zone", () => {
    expect(
      readerTapZoneForPosition({
        x: -50,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
      }),
    ).toBe("previous");
    expect(
      readerTapZoneForPosition({
        x: 900,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
      }),
    ).toBe("next");
  });

  test("honours a custom edge ratio", () => {
    expect(
      readerTapZoneForPosition({
        x: 100,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
        edgeRatio: 0.2,
      }),
    ).toBe("toggle");
    expect(
      readerTapZoneForPosition({
        x: 60,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
        edgeRatio: 0.2,
      }),
    ).toBe("previous");
    // Ratios above a half would overlap; they clamp to an even split.
    expect(
      readerTapZoneForPosition({
        x: 199,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
        edgeRatio: 0.9,
      }),
    ).toBe("previous");
    expect(
      readerTapZoneForPosition({
        x: 201,
        width: WIDTH,
        mode: "ltr",
        pagedMode: true,
        edgeRatio: 0.9,
      }),
    ).toBe("next");
  });
});

describe("reader tap dispatch", () => {
  test("turns the page immediately, with or without a recent centre tap", () => {
    for (const isSecondCentreTap of [false, true]) {
      expect(
        readerTapDispatchForZone({ zone: "next", isSecondCentreTap }),
      ).toEqual({ kind: "turn", zone: "next" });
      expect(
        readerTapDispatchForZone({ zone: "previous", isSecondCentreTap }),
      ).toEqual({ kind: "turn", zone: "previous" });
    }
  });

  test("defers the centre chrome toggle so double-tap zoom can win", () => {
    expect(
      readerTapDispatchForZone({ zone: "toggle", isSecondCentreTap: false }),
    ).toEqual({ kind: "deferToggle" });
    expect(
      readerTapDispatchForZone({ zone: "toggle", isSecondCentreTap: true }),
    ).toEqual({ kind: "cancelPendingToggle" });
  });

  test("a zoomed page keeps its edge bands from turning the page", () => {
    // A zoomed page's double tap resets the zoom wherever it lands, so an edge
    // tap that also turned the page would page twice and stay zoomed.
    expect(
      readerTapDispatchForZone({
        zone: "next",
        isSecondCentreTap: false,
        pageZoomed: true,
      }),
    ).toEqual({ kind: "deferToggle" });
    expect(
      readerTapDispatchForZone({
        zone: "previous",
        isSecondCentreTap: true,
        pageZoomed: true,
      }),
    ).toEqual({ kind: "cancelPendingToggle" });
    // The second tap of the reset still cancels the pending chrome toggle.
    expect(
      readerTapDispatchForZone({
        zone: "toggle",
        isSecondCentreTap: true,
        pageZoomed: true,
      }),
    ).toEqual({ kind: "cancelPendingToggle" });
  });

  test("the second tap of a zoom reset never turns the page", () => {
    // The double tap has already reset the zoom when this tap lifts, so the
    // page reads unzoomed; the tap before it landed on the zoomed page.
    for (const zoneName of ["next", "previous"] as const) {
      expect(
        readerTapDispatchForZone({
          zone: zoneName,
          isSecondCentreTap: true,
          pageZoomed: false,
          followsZoomedTap: true,
        }),
      ).toEqual({ kind: "cancelPendingToggle" });
    }
  });

  test("an unzoomed page still turns on its edge bands", () => {
    for (const zoneName of ["next", "previous"] as const) {
      expect(
        readerTapDispatchForZone({
          zone: zoneName,
          isSecondCentreTap: false,
          pageZoomed: false,
        }),
      ).toEqual({ kind: "turn", zone: zoneName });
      expect(
        readerTapDispatchForZone({ zone: zoneName, isSecondCentreTap: false }),
      ).toEqual({ kind: "turn", zone: zoneName });
    }
  });

  test("maps every stage position to its behaviour in one pass", () => {
    const dispatchAt = (x: number, isSecondCentreTap = false) =>
      readerTapDispatchForZone({
        zone: readerTapZoneForPosition({
          x,
          width: WIDTH,
          mode: "ltr",
          pagedMode: true,
        }),
        isSecondCentreTap,
      });
    // Edge bands never wait: the turn is the dispatch itself.
    expect(dispatchAt(20).kind).toBe("turn");
    expect(dispatchAt(380).kind).toBe("turn");
    // Only the centre band can schedule (or cancel) a deferred toggle.
    expect(dispatchAt(200).kind).toBe("deferToggle");
    expect(dispatchAt(200, true).kind).toBe("cancelPendingToggle");
    // Scrolling mode has no edge bands, so it is centre behaviour everywhere.
    expect(
      readerTapDispatchForZone({
        zone: readerTapZoneForPosition({
          x: 20,
          width: WIDTH,
          mode: "scrolling",
          pagedMode: false,
        }),
        isSecondCentreTap: false,
      }).kind,
    ).toBe("deferToggle");
  });
});

describe("reader centre zoom band", () => {
  test("matches the centre band the tap zones already use", () => {
    const band = readerCentreTapBand({ width: WIDTH });
    expect(band).toEqual({ start: 140, end: 260 });
    // Everything the band admits toggles rather than turns, and everything it
    // rejects turns — the two helpers cannot disagree about the stage.
    for (const x of [0, 20, 139, 140, 200, 260, 261, 399]) {
      const inBand = Boolean(band && x >= band.start && x <= band.end);
      expect(inBand).toBe(zone(x, "ltr") === "toggle");
    }
  });

  test("returns no restriction when the stage has no edge bands", () => {
    expect(readerCentreTapBand({ width: 0 })).toBeNull();
    expect(readerCentreTapBand({ width: Number.NaN })).toBeNull();
    expect(readerCentreTapBand({ width: WIDTH, edgeRatio: 0 })).toBeNull();
  });
});

describe("reader stage touch ownership", () => {
  // iPhone portrait capsule chrome (stage-local): Back and ⋯ on the top row,
  // the actions capsule and the scrubber on the bottom row.
  const back = { x: 16, y: 62, width: 44, height: 44 };
  const more = { x: 342, y: 62, width: 44, height: 44 };
  const actions = { x: 300, y: 790, width: 90, height: 44 };
  const scrubber = { x: 16, y: 790, width: 276, height: 44 };
  const title = { x: 70, y: 62, width: 250, height: 44 };
  const pieces = [back, title, more, actions, scrubber];
  const shown = { height: 874, topInset: 130, bottomInset: 120 };
  // Hiding collapses the stage's toolbar bands at once; the pieces linger.
  const hiding = { height: 874, topInset: 62, bottomInset: 52 };
  const centre = (rect: typeof back) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });

  test("shown chrome owns its pieces and toolbar bands", () => {
    for (const rect of pieces) {
      expect(
        readerStageTouchOwner({ ...shown, ...centre(rect), chromePieces: pieces }),
      ).toBe("chrome");
    }
    // Between Back and ⋯, inside the top band.
    expect(
      readerStageTouchOwner({ ...shown, x: 200, y: 100, chromePieces: pieces }),
    ).toBe("chrome");
    expect(
      readerStageTouchOwner({ ...shown, x: 200, y: 450, chromePieces: pieces }),
    ).toBe("stage");
  });

  test("a piece fading out takes the tap back instead of the page", () => {
    // The reported bug: ⋯ at the right edge of an RTL page 1 read as the
    // "previous" band and opened the previous chapter mid fade-out.
    for (const rect of pieces) {
      expect(
        readerStageTouchOwner({
          ...hiding,
          ...centre(rect),
          chromePieces: pieces,
          chromeDismissing: true,
        }),
      ).toBe("revealChrome");
    }
    // Piece edges are inclusive.
    expect(
      readerStageTouchOwner({
        ...hiding,
        x: more.x + more.width,
        y: more.y + more.height,
        chromePieces: pieces,
        chromeDismissing: true,
      }),
    ).toBe("revealChrome");
  });

  test("bare page between fading pieces stays the page's", () => {
    expect(
      readerStageTouchOwner({
        ...hiding,
        x: 65,
        y: 84,
        chromePieces: pieces,
        chromeDismissing: true,
      }),
    ).toBe("stage");
    expect(
      readerStageTouchOwner({
        ...hiding,
        x: 380,
        y: 450,
        chromePieces: pieces,
        chromeDismissing: true,
      }),
    ).toBe("stage");
    // Status-bar strip and home-indicator strip keep their static guard.
    expect(
      readerStageTouchOwner({
        ...hiding,
        x: 200,
        y: 20,
        chromePieces: pieces,
        chromeDismissing: true,
      }),
    ).toBe("chrome");
  });

  test("fully hidden chrome leaves the old piece rects to the page", () => {
    // Without pieces (the chrome finished hiding) the ⋯ rect is page again.
    expect(readerStageTouchOwner({ ...hiding, ...centre(back) })).toBe("stage");
    expect(
      readerStageTouchOwner({ ...hiding, x: 364, y: 450 }),
    ).toBe("stage");
  });

  test("unusable touch positions never claim a piece", () => {
    expect(
      readerStageTouchOwner({
        ...hiding,
        x: Number.NaN,
        y: 84,
        chromePieces: pieces,
        chromeDismissing: true,
      }),
    ).toBe("stage");
  });
});

describe("reader chrome dismiss sweep", () => {
  const stageHeight = 874;
  const more = { x: 342, y: 62, width: 44, height: 44 };
  const scrubber = { x: 16, y: 790, width: 276, height: 44 };
  const sweep = (rect: typeof more, slide = 8) =>
    readerChromeDismissSweep(rect, { slide, stageHeight });
  const owner = (rect: typeof more, y: number) =>
    readerStageTouchOwner({
      x: rect.x + rect.width / 2,
      y,
      height: stageHeight,
      topInset: 62,
      bottomInset: 52,
      chromePieces: [sweep(rect)],
      chromeDismissing: true,
    });

  test("the top row keeps the path it slides up through", () => {
    expect(sweep(more)).toEqual({ x: 342, y: 54, width: 44, height: 52 });
    // Above the pose rect, where the piece is while it leaves.
    expect(owner(more, 64)).toBe("revealChrome");
    expect(owner(more, more.y + more.height)).toBe("revealChrome");
    // The page under its trailing edge is still the page.
    expect(owner(more, more.y + more.height + 1)).toBe("stage");
  });

  test("the bottom row keeps the path it slides down through", () => {
    expect(sweep(scrubber)).toEqual({ x: 16, y: 790, width: 276, height: 52 });
    expect(owner(scrubber, scrubber.y + scrubber.height + 8)).toBe("revealChrome");
    expect(owner(scrubber, scrubber.y)).toBe("revealChrome");
    expect(owner(scrubber, scrubber.y - 1)).toBe("stage");
  });

  test("Reduce Motion fades in place: the pose rect is the whole claim", () => {
    expect(sweep(more, 0)).toBe(more);
    expect(sweep(scrubber, 0)).toBe(scrubber);
    expect(sweep(more, Number.NaN)).toBe(more);
  });

  test("an unknown stage height reserves both sides", () => {
    expect(
      readerChromeDismissSweep(more, { slide: 8, stageHeight: Number.NaN }),
    ).toEqual({ x: 342, y: 54, width: 44, height: 60 });
  });
});

describe("reader touch chapter identity", () => {
  test("drops a touch that crosses a chapter switch or replacement fetch", () => {
    expect(readerStageTouchMatchesContent("ch1:ready", "ch2:loading")).toBe(false);
    expect(readerStageTouchMatchesContent("ch1:loading", "ch2:ready")).toBe(false);
    expect(readerStageTouchMatchesContent("ch1:ready:old", "ch1:ready:new")).toBe(false);
    expect(readerStageTouchMatchesContent("ch1:ready", "ch1:ready")).toBe(true);
  });

  test("chapter loading still leaves bare taps to the stage on every band", () => {
    for (const x of [20, 200, 380]) {
      expect(readerStageTouchOwner({ x, y: 450, height: 874, topInset: 62, bottomInset: 52 })).toBe("stage");
      expect(readerTapDispatchForZone({ zone: "toggle", isSecondCentreTap: false }).kind).toBe("deferToggle");
    }
  });
});

describe("scroll reading screen tap zones (§4b)", () => {
  test("a 3×3 grid on the Duo outer display: top row back, middle row toggles, bottom row forward", () => {
    // Outer display portrait: a 678pt-tall stage; the grid's rows sit at the
    // centres of the three bands (columns never matter: the zones are rows).
    const height = 678;
    expect(READER_SCROLL_TAP_EDGE_ZONE_RATIO).toBe(0.25);
    const rows: [number, ReturnType<typeof readerScrollTapZoneForPosition>][] = [[85, "previous"], [339, "toggle"], [593, "next"]];
    for (const [y, expected] of rows) {
      for (let column = 0; column < 3; column += 1) {
        expect(readerScrollTapZoneForPosition({ y, height })).toBe(expected);
      }
    }
  });

  test("with the chrome hidden the strip's padding bands belong to the zones", () => {
    // The gallery passes 0 insets once no chrome piece is on screen: a tap in
    // the old 80pt top padding band is the stage's (and so "previous").
    expect(readerStageTouchOwner({ x: 191, y: 40, height: 678, topInset: 0, bottomInset: 0 })).toBe("stage");
    expect(readerStageTouchOwner({ x: 191, y: 40, height: 678, topInset: 80, bottomInset: 34 })).toBe("chrome");
    expect(readerScrollTapZoneForPosition({ y: 40, height: 678 })).toBe("previous");
    expect(readerScrollTapZoneForPosition({ y: 660, height: 678 })).toBe("next");
  });

  test("the bands are exactly 25% / 50% / 25%", () => {
    expect(readerScrollTapZoneForPosition({ y: 99.9, height: 400 })).toBe("previous");
    expect(readerScrollTapZoneForPosition({ y: 100, height: 400 })).toBe("toggle");
    expect(readerScrollTapZoneForPosition({ y: 300, height: 400 })).toBe("toggle");
    expect(readerScrollTapZoneForPosition({ y: 300.1, height: 400 })).toBe("next");
  });

  test("unusable geometry only toggles", () => {
    expect(readerScrollTapZoneForPosition({ y: Number.NaN, height: 400 })).toBe("toggle");
    expect(readerScrollTapZoneForPosition({ y: 10, height: 0 })).toBe("toggle");
    expect(readerScrollTapZoneForPosition({ y: 10, height: 400, edgeRatio: 0 })).toBe("toggle");
  });
});

describe("book posture tap zones (vertical hinge)", () => {
  // A Duo-like book spread: two 500pt halves around a 20pt hinge.
  const duo = readerBookTapLayout({
    stageWidth: 1020,
    foldGap: { start: 500, end: 520 },
    spreadSlots: [
      { x: 0, width: 510 },
      { x: 510, width: 510 },
    ],
  })!;
  const book = (x: number, mode: "ltr" | "rtl", layout = duo) =>
    readerBookTapZoneForPosition({ x, layout, mode, pagedMode: true });

  test("only the outer 30% of each half turns pages", () => {
    expect(duo.leftStrip).toEqual({ start: 0, end: 150 });
    expect(duo.rightStrip).toEqual({ start: 870, end: 1020 });
    expect(book(10, "ltr")).toBe("previous");
    expect(book(149, "ltr")).toBe("previous");
    expect(book(151, "ltr")).toBe("toggle");
    expect(book(869, "ltr")).toBe("toggle");
    expect(book(871, "ltr")).toBe("next");
    expect(book(1010, "ltr")).toBe("next");
  });

  test("RTL turns toward the page lying on each side, like the flat bands", () => {
    expect(book(10, "rtl")).toBe("next");
    expect(book(1010, "rtl")).toBe("previous");
    expect(book(300, "rtl")).toBe("toggle");
    // Same physical mapping as the stage-wide bands.
    expect<string>(readerTapZoneForPhysicalSide("left", "rtl")).toBe(zone(1, "rtl"));
    expect<string>(readerTapZoneForPhysicalSide("right", "rtl")).toBe(zone(399, "rtl"));
    expect<string>(readerTapZoneForPhysicalSide("left", "ltr")).toBe(zone(1, "ltr"));
    expect<string>(readerTapZoneForPhysicalSide("right", "ltr")).toBe(zone(399, "ltr"));
  });

  test("the inner 70% of both halves toggles the chrome", () => {
    for (const x of [151, 300, 480, 540, 700, 869]) {
      expect(book(x, "ltr")).toBe("toggle");
      expect(book(x, "rtl")).toBe("toggle");
    }
  });

  test("the hinge plus 12pt either side is a dead band", () => {
    expect(duo.deadBand).toEqual({ start: 488, end: 532 });
    for (const x of [488, 495, 500, 510, 520, 525, 532]) {
      expect(book(x, "ltr")).toBeNull();
      expect(book(x, "rtl")).toBeNull();
      expect(isReaderBookTapDead(x, duo)).toBe(true);
    }
    expect(book(487.9, "ltr")).toBe("toggle");
    expect(book(532.1, "ltr")).toBe("toggle");
    expect(isReaderBookTapDead(487.9, duo)).toBe(false);
    expect(isReaderBookTapDead(10, null)).toBe(false);
  });

  test("each half uses its own width (unequal halves)", () => {
    const layout = readerBookTapLayout({
      stageWidth: 1000,
      foldGap: { start: 600, end: 620 },
      spreadSlots: [
        { x: 0, width: 600 },
        { x: 620, width: 380 },
      ],
    })!;
    expect(layout.leftStrip).toEqual({ start: 0, end: 180 });
    expect(layout.rightStrip.start).toBeCloseTo(1000 - 114);
    expect(book(179, "ltr", layout)).toBe("previous");
    expect(book(181, "ltr", layout)).toBe("toggle");
    expect(book(885, "ltr", layout)).toBe("toggle");
    expect(book(887, "ltr", layout)).toBe("next");
  });

  test("the strip is 30% of the tappable width: a side bar column is excluded", () => {
    // An 84pt bar column on the right: the right slot ends at 936.
    const layout = readerBookTapLayout({
      stageWidth: 1020,
      foldGap: { start: 500, end: 520 },
      spreadSlots: [
        { x: 0, width: 500 },
        { x: 520, width: 416 },
      ],
    })!;
    expect(layout.rightHalf).toEqual({ start: 520, end: 936 });
    expect(layout.rightStrip.start).toBeCloseTo(936 - 416 * 0.3);
    expect(layout.rightStrip.end).toBe(936);
  });

  test("a strip is never narrower than 88pt", () => {
    const layout = readerBookTapLayout({
      stageWidth: 520,
      foldGap: { start: 250, end: 270 },
      spreadSlots: [
        { x: 0, width: 250 },
        { x: 270, width: 250 },
      ],
    })!;
    // 30% of 250 = 75 < 88.
    expect(READER_BOOK_TAP_EDGE_MIN_WIDTH).toBe(88);
    expect(layout.leftStrip).toEqual({ start: 0, end: 88 });
    expect(layout.rightStrip).toEqual({ start: 520 - 88, end: 520 });
    expect(book(87, "ltr", layout)).toBe("previous");
    expect(book(89, "ltr", layout)).toBe("toggle");
    expect(book(433, "ltr", layout)).toBe("next");
    // A half narrower than the minimum is all strip (the dead band still wins).
    const narrow = readerBookTapLayout({ stageWidth: 180, foldGap: { start: 80, end: 100 } })!;
    expect(narrow.leftStrip).toEqual({ start: 0, end: 80 });
    expect(book(70, "ltr", narrow)).toBeNull();
    expect(book(60, "ltr", narrow)).toBe("previous");
  });

  test("taps only toggle while page turns are off; the hinge stays dead", () => {
    const off = (x: number) => readerBookTapZoneForPosition({ x, layout: duo, mode: "ltr", pagedMode: false });
    expect(off(10)).toBe("toggle");
    expect(off(1010)).toBe("toggle");
    expect(off(510)).toBeNull();
  });

  test("no fold, no book layout (flat and notebook keep the stage-wide bands)", () => {
    expect(readerBookTapLayout({ stageWidth: 1020, foldGap: null })).toBeNull();
    expect(readerBookTapLayout({ stageWidth: 0, foldGap: { start: 500, end: 520 } })).toBeNull();
    expect(readerBookCentreTapBand(null)).toBeNull();
  });

  test("the zoom band spans between the two page-turn strips", () => {
    expect(readerBookCentreTapBand(duo)).toEqual({ start: 150, end: 870 });
  });
});

describe("reader chrome: a press on the way to a control", () => {
  test("after an auto-hide the rects stay the chrome's past the fade, for the thumb already reaching", () => {
    expect(readerChromeDismissOwnMs({ materialMs: 300, autoHidden: true })).toBe(READER_CHROME_AUTO_HIDE_REACH_MS);
    expect(READER_CHROME_AUTO_HIDE_REACH_MS).toBeGreaterThan(300 + 40);
  });

  test("a hide the reader asked for gives them back with the fade", () => {
    expect(readerChromeDismissOwnMs({ materialMs: 300, autoHidden: false })).toBe(340);
  });

  test("a fade longer than the reach (the opening's) is never cut short", () => {
    expect(readerChromeDismissOwnMs({ materialMs: 1200, autoHidden: true })).toBe(1240);
  });

  test("while owned, a press on a piece reveals the chrome and never reaches the page", () => {
    const piece = { x: 334, y: 70, width: 48, height: 48 };
    const press = { x: 358, y: 94, height: 874, topInset: 0, bottomInset: 0, chromePieces: [piece] };
    expect(readerStageTouchOwner({ ...press, chromeDismissing: true })).toBe("revealChrome");
    expect(readerStageTouchOwner({ ...press, chromeDismissing: false })).toBe("chrome");
    expect(readerStageTouchOwner({ ...press, x: 120, y: 437, chromeDismissing: true })).not.toBe("revealChrome");
  });

  test("the vertical bar's column, in stage coordinates, on either side", () => {
    const bounds = { width: 466, height: 678 };
    expect(readerSideBarColumnRect({ bounds, insets: { left: 0, right: 84 }, stage: { x: 0, y: 0 } }))
      .toEqual({ x: 382, y: 0, width: 84, height: 678 });
    expect(readerSideBarColumnRect({ bounds, insets: { left: 84, right: 0 }, stage: { x: 84, y: 0 } }))
      .toEqual({ x: -84, y: 0, width: 84, height: 678 });
    expect(readerSideBarColumnRect({ bounds, insets: { left: 0, right: 0 }, stage: { x: 0, y: 0 } })).toBeNull();
  });
});

