import { describe, expect, test } from "bun:test";
import {
  getMobileCarouselActiveIndex,
  MOBILE_CAROUSEL_SWITCH_HYSTERESIS,
  stepMobileCarouselSwitch,
} from "./mobileCarouselActiveIndex";

const INTERVAL = 372;
const at = (position: number) => position * INTERVAL;

/** Feeds offsets frame by frame; returns the active index after each and the ticks fired. */
function drive(positions: number[], count: number, userDriven = true, start = 0) {
  let index = start;
  const ticksAt: number[] = [];
  const indices = positions.map((position) => {
    const step = stepMobileCarouselSwitch({ index, userDriven }, at(position), INTERVAL, count);
    if (step.tick) ticksAt.push(position);
    index = step.index;
    return index;
  });
  return { indices, ticksAt, index };
}

describe("getMobileCarouselActiveIndex", () => {
  test("switches while dragging, just past the midpoint, not at rest", () => {
    const h = MOBILE_CAROUSEL_SWITCH_HYSTERESIS;
    expect(getMobileCarouselActiveIndex(at(0.3), INTERVAL, 4, 0)).toBe(0);
    expect(getMobileCarouselActiveIndex(at(0.5), INTERVAL, 4, 0)).toBe(0);
    expect(getMobileCarouselActiveIndex(at(0.5 + h), INTERVAL, 4, 0)).toBe(0);
    expect(getMobileCarouselActiveIndex(at(0.5 + h + 0.01), INTERVAL, 4, 0)).toBe(1);
    // Backwards the same way.
    expect(getMobileCarouselActiveIndex(at(1.45), INTERVAL, 4, 2)).toBe(2);
    expect(getMobileCarouselActiveIndex(at(1.5 - h - 0.01), INTERVAL, 4, 2)).toBe(1);
  });

  test("a wobble around the midpoint does not switch back and forth", () => {
    const { indices, ticksAt } = drive([0.4, 0.56, 0.6, 0.52, 0.47, 0.44, 0.55, 0.49, 0.6], 3);
    expect(indices).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1]);
    expect(ticksAt).toEqual([0.6]);
    // Coming all the way back past the other side of the band does switch.
    expect(drive([0.6, 0.41], 3).indices).toEqual([1, 0]);
  });

  test("every snap point rests on its own card whatever was active", () => {
    for (let rest = 0; rest < 5; rest += 1) {
      for (let current = 0; current < 5; current += 1) {
        expect(getMobileCarouselActiveIndex(at(rest), INTERVAL, 5, current)).toBe(rest);
      }
    }
  });

  test("overscroll at either end, a lone card and a missing interval stay put", () => {
    expect(getMobileCarouselActiveIndex(at(-0.9), INTERVAL, 3, 0)).toBe(0);
    expect(getMobileCarouselActiveIndex(at(2.9), INTERVAL, 3, 2)).toBe(2);
    expect(getMobileCarouselActiveIndex(at(3.4), INTERVAL, 3, 1)).toBe(2);
    expect(getMobileCarouselActiveIndex(at(0.9), INTERVAL, 1, 0)).toBe(0);
    expect(getMobileCarouselActiveIndex(500, 0, 3, 1)).toBe(0);
    expect(getMobileCarouselActiveIndex(Number.NaN, INTERVAL, 3, 1)).toBe(0);
  });

  test("a stale index past the end (the list shrank) is clamped first", () => {
    expect(getMobileCarouselActiveIndex(at(1), INTERVAL, 2, 4)).toBe(1);
    expect(getMobileCarouselActiveIndex(at(0.2), INTERVAL, 2, 4)).toBe(0);
  });
});

describe("stepMobileCarouselSwitch", () => {
  test("one tick per card crossed, at the crossing, during a slow drag", () => {
    const positions = Array.from({ length: 21 }, (_, frame) => frame * 0.05);
    const { ticksAt, index } = drive(positions, 3);
    expect(index).toBe(1);
    expect(ticksAt).toHaveLength(1);
    // Fired mid-drag, well before the snap point at 1.
    expect(ticksAt[0]).toBeGreaterThan(0.5);
    expect(ticksAt[0]).toBeLessThan(0.7);
  });

  test("a fast fling across four cards ticks four times, once per card", () => {
    // 6000 pt/s at 60 Hz: 100 pt (0.27 of a card) per frame, then the snap.
    const positions: number[] = [];
    for (let position = 0; position < 4; position += 100 / INTERVAL) positions.push(position);
    positions.push(4);
    const { indices, ticksAt, index } = drive(positions, 6);
    expect(index).toBe(4);
    expect(ticksAt).toHaveLength(4);
    expect(new Set(indices)).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  test("scrolls the user did not start move the index without a tick", () => {
    // First layout: offset 0, nothing changes, nothing fires.
    expect(stepMobileCarouselSwitch({ index: 0, userDriven: false }, 0, INTERVAL, 3)).toEqual({ index: 0, tick: false });
    // A programmatic scroll (re-anchor after a rotation or a fold change).
    expect(stepMobileCarouselSwitch({ index: 0, userDriven: false }, at(2), INTERVAL, 3)).toEqual({ index: 2, tick: false });
    expect(drive([0.2, 0.7, 1.2, 1.8, 2], 3, false).ticksAt).toEqual([]);
  });

  test("a lone card never ticks", () => {
    expect(drive([0.2, 0.7, 1.4, -0.6], 1).ticksAt).toEqual([]);
  });
});
