import { describe, expect, test } from "bun:test";
import { stepMobileCarouselSwitch } from "./mobileCarouselActiveIndex";

const INTERVAL = 372;
const HYSTERESIS = 0.08;
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

describe("mobile carousel active card", () => {
  test("switches just past the midpoint plus hysteresis, both ways; a wobble around it does not flicker", () => {
    expect(drive([0.5 + HYSTERESIS], 4).index).toBe(0);
    expect(drive([0.5 + HYSTERESIS + 0.01], 4).index).toBe(1);
    expect(drive([1.5 - HYSTERESIS - 0.01], 4, true, 2).index).toBe(1);
    expect(drive([0.4, 0.56, 0.6, 0.52, 0.47, 0.44, 0.55, 0.49, 0.6], 3).indices).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("every snap point rests on its own card; overscroll, a stale index, a lone card and a missing interval stay in range", () => {
    for (let rest = 0; rest < 5; rest += 1) expect(drive([rest], 5, true, 4 - rest).index).toBe(rest);
    expect(drive([-0.9], 3).index).toBe(0);
    expect(drive([3.4], 3, true, 1).index).toBe(2);
    expect(drive([1], 2, true, 4).index).toBe(1);
    expect(drive([0.9], 1).index).toBe(0);
    expect(stepMobileCarouselSwitch({ index: 1, userDriven: true }, Number.NaN, INTERVAL, 3).index).toBe(0);
    expect(stepMobileCarouselSwitch({ index: 1, userDriven: true }, 500, 0, 3).index).toBe(0);
  });

  test("one tick per card crossed, at the crossing, for a slow drag and a fast fling alike", () => {
    const slow = drive(Array.from({ length: 21 }, (_, frame) => frame * 0.05), 3);
    expect(slow.index).toBe(1);
    expect(slow.ticksAt).toHaveLength(1);
    // 100 pt per frame at 60 Hz, four cards, then the snap.
    const fling: number[] = [];
    for (let position = 0; position < 4; position += 100 / INTERVAL) fling.push(position);
    fling.push(4);
    const quick = drive(fling, 6);
    expect(quick.index).toBe(4);
    expect(quick.ticksAt).toHaveLength(4);
  });

  test("scrolls the user did not start, and a lone card, never tick", () => {
    expect(stepMobileCarouselSwitch({ index: 0, userDriven: false }, at(2), INTERVAL, 3)).toEqual({ index: 2, tick: false });
    expect(drive([0.2, 0.7, 1.2, 1.8, 2], 3, false).ticksAt).toEqual([]);
    expect(drive([0.2, 0.7, 1.4, -0.6], 1).ticksAt).toEqual([]);
  });
});
