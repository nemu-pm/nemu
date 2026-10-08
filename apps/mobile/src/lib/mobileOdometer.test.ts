import { describe, expect, test } from "bun:test";
import { getMobileOdometerPlan, getMobileOdometerTiming, MOBILE_ODOMETER_MAX_STEPS } from "./mobileOdometer";

describe("mobile odometer", () => {
  test("one more: only the ones turn, by one, upward", () => {
    const plan = getMobileOdometerPlan("130 new", "131 new");
    expect(plan).toEqual({
      prefix: "",
      suffix: " new",
      columns: [
        { place: 2, strip: [1], direction: 1 },
        { place: 1, strip: [3], direction: 1 },
        { place: 0, strip: [0, 1], direction: 1 },
      ],
    });
  });

  test("a carry turns every place it reaches and brings a new digit in", () => {
    const plan = getMobileOdometerPlan("99+", "100+")!;
    expect(plan.columns.map((column) => column.strip)).toEqual([
      [null, 1],
      [9, 0],
      [9, 0],
    ]);
  });

  test("counting down rolls the other way and drops a vanishing digit", () => {
    const plan = getMobileOdometerPlan("Ch.10", "Ch.9")!;
    expect(plan.prefix).toBe("Ch.");
    expect(plan.columns).toEqual([
      { place: 1, strip: [1, null], direction: -1 },
      { place: 0, strip: [0, 9], direction: -1 },
    ]);
  });

  test("the tens follow a carry from the ones", () => {
    const plan = getMobileOdometerPlan("129", "131")!;
    expect(plan.columns.map((column) => column.strip)).toEqual([[1], [2, 3], [9, 0, 1]]);
  });

  test("long jumps are capped but still land on the right digits", () => {
    const plan = getMobileOdometerPlan("Ch.1", "Ch.131")!;
    for (const column of plan.columns) {
      expect(column.strip.length - 1).toBeLessThanOrEqual(MOBILE_ODOMETER_MAX_STEPS);
    }
    expect(plan.columns.map((column) => column.strip.at(-1))).toEqual([1, 3, 1]);
    expect(plan.columns.map((column) => column.strip[0])).toEqual([null, null, 1]);
    // The ones spin at least a full turn on a jump this size.
    expect(plan.columns[2]!.strip.length - 1).toBeGreaterThanOrEqual(10);
  });

  test("no plan when nothing numeric changed or the words changed", () => {
    expect(getMobileOdometerPlan("155", "155")).toBeNull();
    expect(getMobileOdometerPlan("Manhuagui", "MangaDex")).toBeNull();
    expect(getMobileOdometerPlan("Ch.3", "Vol.3")).toBeNull();
    expect(getMobileOdometerPlan("3 new", "3 new!")).toBeNull();
  });

  test("timing: visible at normal speed, ones lead, higher places trail", () => {
    const plan = getMobileOdometerPlan("99", "100")!;
    const [hundreds, tens, ones] = plan.columns.map(getMobileOdometerTiming);
    expect(ones!.delay).toBe(0);
    expect(tens!.delay).toBeGreaterThan(ones!.delay);
    expect(hundreds!.delay).toBeGreaterThan(tens!.delay);
    // Long enough to be seen as a roll (not the 0.2 s swap it replaces).
    expect(ones!.duration).toBeGreaterThanOrEqual(550);
    const still = getMobileOdometerTiming({ place: 0, strip: [4], direction: 1 });
    expect(still).toEqual({ delay: 0, duration: 0 });
  });
});
