import { describe, expect, test } from "bun:test";
import {
  getMobileLaunchRevealGroupDelay,
  MOBILE_LAUNCH_REVEAL_GROUPS,
  resolveMobileLaunchRevealMode,
} from "./mobileLaunchRevealPlan";

describe("launch reveal plan", () => {
  test("groups start 40 ms in, 70 ms apart, in page order", () => {
    expect(MOBILE_LAUNCH_REVEAL_GROUPS.map(getMobileLaunchRevealGroupDelay)).toEqual([40, 110, 180, 250]);
  });

  test("the full reveal only for a cold launch into the Library without Reduce Motion", () => {
    expect(resolveMobileLaunchRevealMode({ pending: true, libraryRoute: true, reduceMotion: false })).toBe("full");
    expect(resolveMobileLaunchRevealMode({ pending: true, libraryRoute: true, reduceMotion: true })).toBe("fade");
    expect(resolveMobileLaunchRevealMode({ pending: true, libraryRoute: false, reduceMotion: false })).toBe("fade");
    expect(resolveMobileLaunchRevealMode({ pending: false, libraryRoute: true, reduceMotion: false })).toBeNull();
  });
});
