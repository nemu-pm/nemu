import { describe, expect, test } from "bun:test";
import {
  MOBILE_DUO_PAGE_FLIP_MAX_SHADE,
  mobileDuoPageFlipFrame,
  mobileDuoPageFlipPlan,
  mobileDuoSpineGradient,
  mobileDuoSpineShadeRects,
  mobileDuoSpineShadeWidth,
  mobileDuoSpreadPageRects,
  shouldAnimateMobileDuoPageFlip,
} from "./mobileDuoSpine";

const leftPane = { x: 0, y: 0, width: 463, height: 669 };
const rightPane = { x: 488, y: 0, width: 463, height: 669 };
const manga = { width: 1000, height: 1445 };

describe("spine shade geometry", () => {
  test("band width is ~8% of the page, clamped to 6–10%", () => {
    expect(mobileDuoSpineShadeWidth(460)).toBeCloseTo(36.8, 5);
    expect(mobileDuoSpineShadeWidth(460, 0.2)).toBeCloseTo(46, 5);
    expect(mobileDuoSpineShadeWidth(460, 0.01)).toBeCloseTo(27.6, 5);
    expect(mobileDuoSpineShadeWidth(0)).toBe(0);
    expect(mobileDuoSpineShadeWidth(Number.NaN)).toBe(0);
  });

  test("gradient is darkest at the spine edge, a few % alpha, stronger in dark", () => {
    const left = mobileDuoSpineGradient("left", "light");
    expect(left.start.x).toBe(1);
    expect(left.end.x).toBe(0);
    expect(left.colors[0]).toBe("rgba(0,0,0,0.08)");
    expect(left.colors[2]).toBe("rgba(0,0,0,0)");
    const right = mobileDuoSpineGradient("right", "dark");
    expect(right.start.x).toBe(0);
    expect(right.colors[0]).toBe("rgba(0,0,0,0.12)");
  });

  test("book posture: centred pages that reach the fold both get a band", () => {
    const [left, right] = mobileDuoSpreadPageRects({
      panes: [leftPane, rightPane],
      naturalSizes: [manga, manga],
      align: "center",
    });
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    const bands = mobileDuoSpineShadeRects({ leftPage: left, rightPage: right, spine: { start: 463, end: 488 }, tone: "light" });
    expect(bands.map((band) => band.side)).toEqual(["left", "right"]);
    const [leftBand, rightBand] = bands;
    expect(leftBand.rect.x + leftBand.rect.width).toBeCloseTo(left!.x + left!.width, 5);
    expect(rightBand.rect.x).toBeCloseTo(right!.x, 5);
    expect(leftBand.rect.height).toBeCloseTo(left!.height, 5);
  });

  test("flat spread aligns pages to the seam", () => {
    const [left, right] = mobileDuoSpreadPageRects({
      panes: [{ x: 0, y: 0, width: 475, height: 669 }, { x: 475, y: 0, width: 476, height: 669 }],
      naturalSizes: [manga, manga],
      align: "spine",
    });
    expect(left!.x + left!.width).toBeCloseTo(475, 5);
    expect(right!.x).toBe(475);
    expect(mobileDuoSpineShadeRects({ leftPage: left, rightPage: right, spine: { start: 475, end: 475 }, tone: "dark" }))
      .toHaveLength(2);
  });

  test("a narrow page floating mid-pane gets no fake binding", () => {
    const [left] = mobileDuoSpreadPageRects({
      panes: [leftPane, rightPane],
      naturalSizes: [{ width: 300, height: 1500 }, null],
      align: "center",
    });
    expect(mobileDuoSpineShadeRects({ leftPage: left, rightPage: null, spine: { start: 463, end: 488 }, tone: "light" }))
      .toEqual([]);
  });

  test("unknown natural size yields no page rect", () => {
    expect(mobileDuoSpreadPageRects({ panes: [leftPane, rightPane], naturalSizes: [null, { width: 0, height: 10 }], align: "center" }))
      .toEqual([null, null]);
  });
});

describe("half-page flip", () => {
  test("LTR forward lifts the right page over to the left", () => {
    expect(mobileDuoPageFlipPlan({ turn: "forward", rtl: false })).toEqual({
      outgoingSide: "right",
      incomingSide: "left",
      outgoingOrigin: "left",
      incomingOrigin: "right",
      outgoingEndDeg: -90,
      incomingStartDeg: 90,
    });
  });

  test("RTL forward lifts the left page over to the right; backward mirrors", () => {
    const rtlForward = mobileDuoPageFlipPlan({ turn: "forward", rtl: true });
    expect(rtlForward.outgoingSide).toBe("left");
    expect(rtlForward.outgoingOrigin).toBe("right");
    expect(rtlForward.outgoingEndDeg).toBe(90);
    expect(rtlForward.incomingStartDeg).toBe(-90);
    expect(mobileDuoPageFlipPlan({ turn: "backward", rtl: true })).toEqual(mobileDuoPageFlipPlan({ turn: "forward", rtl: false }));
    expect(mobileDuoPageFlipPlan({ turn: "backward", rtl: false })).toEqual(rtlForward);
  });

  test("frames: outgoing to edge-on, then incoming lands flat", () => {
    const plan = mobileDuoPageFlipPlan({ turn: "forward", rtl: false });
    expect(mobileDuoPageFlipFrame(0, plan)).toEqual({
      outgoingDeg: -0, outgoingOpacity: 1, incomingDeg: 90, incomingOpacity: 0, underOpacity: 1, leafShade: 0,
    });
    const quarter = mobileDuoPageFlipFrame(0.25, plan);
    expect(quarter.outgoingDeg).toBeCloseTo(-45, 5);
    expect(quarter.leafShade).toBeCloseTo(MOBILE_DUO_PAGE_FLIP_MAX_SHADE / 2, 5);
    const threeQuarter = mobileDuoPageFlipFrame(0.75, plan);
    expect(threeQuarter.outgoingOpacity).toBe(0);
    expect(threeQuarter.underOpacity).toBe(0);
    expect(threeQuarter.incomingOpacity).toBe(1);
    expect(threeQuarter.incomingDeg).toBeCloseTo(45, 5);
    const done = mobileDuoPageFlipFrame(1, plan);
    expect(done.incomingDeg).toBeCloseTo(0, 5);
    expect(done.incomingOpacity).toBe(0);
    expect(mobileDuoPageFlipFrame(2, plan)).toEqual(done);
    expect(mobileDuoPageFlipFrame(-1, plan)).toEqual(mobileDuoPageFlipFrame(0, plan));
  });

  test("only single reading-order steps in an unzoomed spread animate, never with Reduce Motion", () => {
    const ok = { reduceMotion: false, spread: true, zoomed: false, step: 1 };
    expect(shouldAnimateMobileDuoPageFlip(ok)).toBe(true);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, step: -1 })).toBe(true);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, reduceMotion: true })).toBe(false);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, reduceMotion: null })).toBe(false);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, spread: false })).toBe(false);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, zoomed: true })).toBe(false);
    expect(shouldAnimateMobileDuoPageFlip({ ...ok, step: 4 })).toBe(false);
  });
});
