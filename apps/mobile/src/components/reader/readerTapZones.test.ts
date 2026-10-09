import { describe, expect, test } from "bun:test";
import {
  READER_TAP_EDGE_ZONE_RATIO,
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
  readerCentreTapBand,
  readerChromeDismissSweep,
  readerStageTouchOwner,
  readerStageTouchMatchesContent,
  readerTapDispatchForZone,
  readerTapZoneForPosition,
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
