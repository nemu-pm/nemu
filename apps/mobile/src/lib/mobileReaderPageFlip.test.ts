import { describe, expect, test } from "bun:test";
import {
  mobileReaderFlatSpreadFlipPanes,
  mobileReaderPageFlipDecision,
  mobileReaderPrefetchPagesBehind,
} from "./mobileReaderPageFlip";

const eligible = {
  paged: true,
  spreadMode: true,
  reduceMotion: false,
  zoomed: false,
  step: 1,
  fromSpreadLength: 2,
  toSpreadLength: 2,
  sameSpread: false,
  hasPanes: true,
  onScreenPagesReady: true,
} as const;

describe("page flip eligibility matrix", () => {
  test("a single-step turn between two full spreads flips — book or flat alike", () => {
    expect(mobileReaderPageFlipDecision(eligible)).toEqual({ flip: true });
    expect(mobileReaderPageFlipDecision({ ...eligible, step: -1 })).toEqual({ flip: true });
  });

  test("each rule that turns plainly, with its reason", () => {
    const cases: Array<[Partial<typeof eligible> | Record<string, unknown>, string]> = [
      [{ paged: false }, "not-paged"],
      [{ spreadMode: false }, "not-spread"],
      [{ reduceMotion: true }, "reduce-motion"],
      [{ reduceMotion: null }, "reduce-motion"],
      [{ zoomed: true }, "zoomed"],
      [{ step: 2 }, "multi-step"],
      [{ sameSpread: true }, "same-spread"],
      // Cover / odd last page: the single ⇄ spread boundary turns plainly.
      [{ fromSpreadLength: 1 }, "spread-boundary"],
      [{ toSpreadLength: 1 }, "spread-boundary"],
      [{ toSpreadLength: null }, "spread-boundary"],
      [{ hasPanes: false }, "no-panes"],
      [{ onScreenPagesReady: false }, "page-missing"],
    ];
    for (const [override, reason] of cases) {
      expect(mobileReaderPageFlipDecision({ ...eligible, ...override } as typeof eligible)).toEqual({ flip: false, reason } as never);
    }
  });

  test("the incoming page still loading never cancels the flip (it is not an input)", () => {
    expect(mobileReaderPageFlipDecision({ ...eligible })).toEqual({ flip: true });
  });
});

describe("flat spread leaf panes", () => {
  test("each side hugs the centre seam at its page width", () => {
    const panes = mobileReaderFlatSpreadFlipPanes({ stageWidth: 951, stageHeight: 669, leftWidth: 466, rightWidth: 470 });
    expect(panes.left).toEqual({ x: 475.5 - 466, y: 0, width: 466, height: 669 });
    expect(panes.right).toEqual({ x: 475.5, y: 0, width: 470, height: 669 });
  });

  test("never wider than half the stage", () => {
    const panes = mobileReaderFlatSpreadFlipPanes({ stageWidth: 800, stageHeight: 600, leftWidth: 900, rightWidth: Number.NaN });
    expect(panes.left.width).toBe(400);
    expect(panes.right.width).toBe(400);
    expect(panes.left.x).toBe(0);
  });
});

describe("prefetch behind", () => {
  test("spreads keep the whole previous spread warm", () => {
    expect(mobileReaderPrefetchPagesBehind(true, 1)).toBe(2);
    expect(mobileReaderPrefetchPagesBehind(false, 1)).toBe(1);
    expect(mobileReaderPrefetchPagesBehind(true, 3)).toBe(3);
  });
});
