import { describe, expect, test } from "bun:test";
import {
  READER_TAP_EDGE_ZONE_RATIO,
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
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
