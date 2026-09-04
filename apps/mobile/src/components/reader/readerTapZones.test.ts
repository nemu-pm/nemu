import { describe, expect, test } from "bun:test";
import {
  READER_TAP_EDGE_ZONE_RATIO,
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
  readerCentreTapBand,
  readerTapDispatchForZone,
  readerTapZoneForPosition,
} from "./readerTapZones";

const WIDTH = 400;

function zone(x: number, mode: "ltr" | "rtl" | "scrolling", pagedMode = true) {
  return readerTapZoneForPosition({ x, width: WIDTH, mode, pagedMode });
}

describe("reader tap zones", () => {
  test("blocks page-turn taps while an overlay owns the gesture", () => {
    expect(
      isReaderStageTapEnabled({ tapGesturesEnabled: false, loading: false }),
    ).toBe(false);
    expect(
      isReaderStageTapEnabled({ tapGesturesEnabled: true, loading: true }),
    ).toBe(false);
    expect(
      isReaderStageTapEnabled({ tapGesturesEnabled: true, loading: false }),
    ).toBe(true);
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
