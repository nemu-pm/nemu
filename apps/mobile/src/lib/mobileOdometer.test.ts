import { describe, expect, test } from "bun:test";
import { getMobileOdometerPlan, getMobileOdometerTiming } from "./mobileOdometer";

describe("mobile odometer", () => {
  test("only the places that change turn, one step at a time: up with carries, down with a vanishing digit", () => {
    expect(getMobileOdometerPlan("130 new", "131 new")).toEqual({
      prefix: "",
      suffix: " new",
      columns: [
        { place: 2, strip: [1], direction: 1 },
        { place: 1, strip: [3], direction: 1 },
        { place: 0, strip: [0, 1], direction: 1 },
      ],
    });
    expect(getMobileOdometerPlan("99+", "100+")!.columns.map((column) => column.strip)).toEqual([
      [null, 1],
      [9, 0],
      [9, 0],
    ]);
    expect(getMobileOdometerPlan("Ch.10", "Ch.9")).toEqual({
      prefix: "Ch.",
      suffix: "",
      columns: [
        { place: 1, strip: [1, null], direction: -1 },
        { place: 0, strip: [0, 9], direction: -1 },
      ],
    });
  });

  test("a long jump is capped in steps but still lands on the right digits", () => {
    const plan = getMobileOdometerPlan("Ch.1", "Ch.131")!;
    for (const column of plan.columns) expect(column.strip.length - 1).toBeLessThanOrEqual(15);
    expect(plan.columns.map((column) => column.strip.at(-1))).toEqual([1, 3, 1]);
  });

  test("no plan when nothing numeric changed or the words changed; the ones lead the timing and a still digit does not move", () => {
    expect(getMobileOdometerPlan("155", "155")).toBeNull();
    expect(getMobileOdometerPlan("Ch.3", "Vol.3")).toBeNull();
    const [hundreds, tens, ones] = getMobileOdometerPlan("99", "100")!.columns.map(getMobileOdometerTiming);
    expect(ones!.delay).toBe(0);
    expect(tens!.delay).toBeGreaterThan(ones!.delay);
    expect(hundreds!.delay).toBeGreaterThan(tens!.delay);
    expect(getMobileOdometerTiming({ place: 0, strip: [4], direction: 1 })).toEqual({ delay: 0, duration: 0 });
  });
});
