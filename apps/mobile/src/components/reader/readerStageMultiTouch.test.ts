import { describe, expect, test } from "bun:test";
import {
  readerStageFingersDown,
  readerStageMultiTouchOnEnd,
  readerStageMultiTouchOnStart,
} from "./readerStageMultiTouch";

const t = (...ids: number[]) => ids.map((identifier) => ({ identifier }));

describe("reader stage multi-touch", () => {
  test("a single finger is never multi-touch", () => {
    const start = readerStageMultiTouchOnStart(false, { touches: t(1), changedTouches: t(1) });
    expect(start).toBe(false);
    expect(readerStageMultiTouchOnEnd(start, { touches: t(), changedTouches: t(1) })).toEqual({
      ignore: false,
      multiTouch: false,
    });
    // RN may still list the lifting finger in `touches`.
    expect(readerStageMultiTouchOnEnd(false, { touches: t(1), changedTouches: t(1) }).ignore).toBe(false);
  });

  test("a second finger makes the whole sequence multi-touch until the last lift", () => {
    let multi = readerStageMultiTouchOnStart(false, { touches: t(1), changedTouches: t(1) });
    multi = readerStageMultiTouchOnStart(multi, { touches: t(1, 2), changedTouches: t(2) });
    expect(multi).toBe(true);
    const first = readerStageMultiTouchOnEnd(multi, { touches: t(1, 2), changedTouches: t(1) });
    expect(first).toEqual({ ignore: true, multiTouch: true });
    const last = readerStageMultiTouchOnEnd(first.multiTouch, { touches: t(2), changedTouches: t(2) });
    expect(last).toEqual({ ignore: true, multiTouch: false });
    // The next sequence starts clean.
    expect(readerStageMultiTouchOnStart(last.multiTouch, { touches: t(3), changedTouches: t(3) })).toBe(false);
  });

  test("two fingers landing or lifting in one event", () => {
    expect(readerStageMultiTouchOnStart(false, { touches: t(1, 2), changedTouches: t(1, 2) })).toBe(true);
    expect(readerStageMultiTouchOnEnd(true, { touches: t(), changedTouches: t(1, 2) })).toEqual({
      ignore: true,
      multiTouch: false,
    });
    // A lift that reports both fingers is multi-touch even if the start was missed.
    expect(readerStageMultiTouchOnEnd(false, { touches: t(1, 2), changedTouches: t(1, 2) }).ignore).toBe(true);
  });

  test("fingers down counts each finger once", () => {
    expect(readerStageFingersDown({ touches: t(1, 2), changedTouches: t(2) })).toBe(2);
    expect(readerStageFingersDown({ touches: t(), changedTouches: t(5) })).toBe(1);
  });
});
