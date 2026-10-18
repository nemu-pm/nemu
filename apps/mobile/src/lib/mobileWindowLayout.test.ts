import { describe, expect, test } from "bun:test";
import { mobileWindowPanels, mobileWindowUnoccludedRect, type MobileWindowLayout, type WindowReservedRegion } from "./mobileWindowLayout";
const region = (x: number, y: number, width: number, height: number, active = true): WindowReservedRegion => ({ id: "hinge", x, y, width, height, active });
const layout = (divisions: WindowReservedRegion[] = [], occlusions: WindowReservedRegion[] = []): MobileWindowLayout => ({ width: 900, height: 600, supported: true, divisions, occlusions });

describe("mobile window reserved regions", () => {
  test("an unfolded inner display and unsupported platform remain single-panel", () => {
    expect(mobileWindowPanels(layout([region(440, 0, 20, 600, false)]))).toEqual({ axis: "none", panels: [{ x: 0, y: 0, width: 900, height: 600 }], occlusions: [] });
    expect(mobileWindowPanels({ ...layout(), supported: false }).axis).toBe("none");
  });
  test("preserves asymmetric physical panel widths and excludes interaction margins already in frame", () => {
    expect(mobileWindowPanels(layout([region(410, -10, 24, 620)])).panels).toEqual([
      { x: 0, y: 0, width: 410, height: 600 }, { x: 434, y: 0, width: 466, height: 600 },
    ]);
  });
  test("uses horizontal division geometry for upper/lower panels even in a landscape window", () => {
    const result = mobileWindowPanels(layout([region(0, 280, 900, 30)]));
    expect(result.axis).toBe("vertical");
    expect(result.panels).toEqual([{ x: 0, y: 0, width: 900, height: 280 }, { x: 0, y: 310, width: 900, height: 290 }]);
  });
  test("supports a zero-width fold and rejects offscreen, invalid and local rectangles", () => {
    expect(mobileWindowPanels(layout([region(450, 0, 0, 600)])).panels).toEqual([
      { x: 0, y: 0, width: 440, height: 600 }, { x: 460, y: 0, width: 440, height: 600 },
    ]);
    expect(mobileWindowPanels(layout([region(950, 0, 20, 600), region(NaN, 0, 20, 600), region(450, 200, 20, 80)])).axis).toBe("none");
  });
  test("keeps camera occlusions separate from folds and clips them to the container", () => {
    const result = mobileWindowPanels(layout([], [region(-5, 0, 45, 30), region(10, 10, 20, 20, false)]));
    expect(result.panels).toHaveLength(1);
    expect(result.occlusions).toEqual([{ x: 0, y: 0, width: 40, height: 30 }]);
  });
  test("chooses the largest safe content rectangle without adding camera margins again", () => {
    expect(mobileWindowUnoccludedRect({ x: 0, y: 0, width: 450, height: 600 }, [{ x: 200, y: 0, width: 50, height: 40 }]))
      .toEqual({ x: 0, y: 40, width: 450, height: 560 });
  });
  test("fully occluded content has no usable area", () => {
    expect(mobileWindowUnoccludedRect({ x: 0, y: 0, width: 100, height: 100 }, [{ x: 0, y: 0, width: 100, height: 100 }]).width).toBe(0);
  });
});

import { mobileWindowReaderLayout } from "./mobileWindowLayout";
describe("reader fold policy", () => {
  test("RTL single-page uses the right safe panel without enabling spreads", () => {
    const result = mobileWindowReaderLayout(layout([region(410, 0, 24, 600)]), { twoPage: false, paged: true, rtl: true });
    expect(result.stage).toEqual({ x: 434, y: 0, width: 466, height: 600 });
    expect(result.spreadSlots).toBeUndefined();
  });
  test("book pose pairs physical slots only when the existing preference permits it", () => {
    const result = mobileWindowReaderLayout(layout([region(410, 0, 24, 600)]), { twoPage: true, paged: true, rtl: true });
    expect(result.stage.width).toBe(900);
    expect(result.spreadSlots?.map((s) => s.width)).toEqual([410, 466]);
  });
  test("a zero-width hinge still yields a spread with a gutter off the crease", () => {
    const result = mobileWindowReaderLayout(layout([region(450, 0, 0, 600)]), { twoPage: true, paged: true, rtl: true });
    expect(result.split).toBe(true);
    expect(result.spreadSlots).toEqual([
      { x: 0, y: 0, width: 440, height: 600 }, { x: 460, y: 0, width: 440, height: 600 },
    ]);
  });
  test("tabletop reads above the fold and moves controls below regardless of aspect ratio", () => {
    const result = mobileWindowReaderLayout(layout([region(0, 280, 900, 30)]), { twoPage: true, paged: true, rtl: false });
    expect(result.stage.height).toBe(280);
    expect(result.controls.y).toBe(310);
    expect(result.usablePair).toBe(false);
  });
  test("scrolling and too-small panels never manufacture a two-page spread", () => {
    expect(mobileWindowReaderLayout(layout([region(410, 0, 24, 600)]), { twoPage: true, paged: false, rtl: false }).spreadSlots).toBeUndefined();
    expect(mobileWindowReaderLayout(layout([region(100, 0, 24, 600)]), { twoPage: true, paged: true, rtl: false }).usablePair).toBe(false);
  });
  test("fully open restores the full container without changing the saved preference", () => {
    const result = mobileWindowReaderLayout(layout([region(410, 0, 24, 600, false)]), { twoPage: true, paged: true, rtl: false });
    expect(result.split).toBe(false);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 900, height: 600 });
  });
});


import { mobileWindowAbsoluteBand } from "./mobileWindowLayout";
import { readerCentreTapBand, readerTapZoneForPosition } from "../components/reader/readerTapZones";
describe("reserved geometry coordinate consistency", () => {
  test("active camera with no fold constrains both stage and chrome", () => {
    const result = mobileWindowReaderLayout(layout([], [region(420, 0, 60, 40)]), { twoPage: false, paged: true, rtl: false });
    expect(result.split).toBe(false);
    expect(result.constrained).toBe(true);
    expect(result.stage).toEqual({ x: 0, y: 40, width: 900, height: 560 });
    expect(result.controls).toEqual(result.stage);
  });
  test("equal-sized panels with different origins retain matching zoom and page-turn zones", () => {
    const localBand = readerCentreTapBand({ width: 440 });
    for (const originX of [460, 0, 30]) {
      const band = mobileWindowAbsoluteBand(localBand, originX);
      if (!band) throw new Error("Expected a centre band");
      const centreAbsoluteX = originX + 220;
      expect(centreAbsoluteX >= band.start && centreAbsoluteX <= band.end).toBe(true);
      expect(readerTapZoneForPosition({ x: centreAbsoluteX - originX, width: 440, mode: "rtl", pagedMode: true })).toBe("toggle");
      expect(originX + 10 < band.start).toBe(true);
      expect(readerTapZoneForPosition({ x: 10, width: 440, mode: "rtl", pagedMode: true })).toBe("next");
    }
  });
  test("side camera can shift the stage without changing the reading preference", () => {
    const result = mobileWindowReaderLayout(layout([], [region(0, 240, 30, 120)]), { twoPage: true, paged: true, rtl: true });
    expect(result.stage).toEqual({ x: 30, y: 0, width: 870, height: 600 });
    expect(result.constrained).toBe(true);
    expect(result.spreadSlots).toBeUndefined();
  });
});


import { mobileWindowPopoverFrame } from "./mobileWindowLayout";
describe("continuous content and custom modal placement", () => {
  test("scrolling content keeps its full document width across book/tabletop folds", () => {
    for (const divider of [region(440, 0, 20, 600), region(0, 280, 900, 30)]) {
      const result = mobileWindowReaderLayout(layout([divider]), { twoPage: false, paged: false, rtl: true });
      expect(result.stage).toEqual({ x: 0, y: 0, width: 900, height: 600 });
      expect(result.controls).not.toEqual(result.stage);
    }
  });
  test("continuous content still avoids a camera while ignoring fold displacement", () => {
    const result = mobileWindowReaderLayout(layout([region(440, 0, 20, 600)], [region(0, 0, 30, 600)]), { twoPage: false, paged: false, rtl: false });
    expect(result.stage).toEqual({ x: 30, y: 0, width: 870, height: 600 });
  });
  test("custom settings panel fits wholly above its toolbar inside the lower region", () => {
    const frame = mobileWindowPopoverFrame({ width: 900, height: 600 }, { x: 0, y: 310, width: 900, height: 290 }, 100);
    expect(frame).toEqual({ left: 12, right: 12, bottom: 100, maxHeight: 178 });
    expect(600 - frame.bottom - frame.maxHeight).toBeGreaterThanOrEqual(310);
  });
  test("right panel stays on the right and short panels cap the toolbar gap", () => {
    const frame = mobileWindowPopoverFrame({ width: 900, height: 600 }, { x: 460, y: 0, width: 440, height: 120 }, 100);
    expect(frame.left).toBe(472);
    expect(frame.bottom).toBe(540);
    expect(frame.maxHeight).toBe(48);
  });
});
