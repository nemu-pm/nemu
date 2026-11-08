import { afterEach, describe, expect, test } from "bun:test";
import {
  getMobileToastRegion,
  resetMobileToastRegionForTests,
  setMobileToastRegion,
} from "./mobileToastRegion";

afterEach(() => resetMobileToastRegionForTests());

describe("mobileToastRegion", () => {
  test("the newest publisher wins; removing it restores the one beneath", () => {
    const settings = Symbol("settings");
    const pushed = Symbol("pushed");
    setMobileToastRegion(settings, { x: 250, width: 419 });
    setMobileToastRegion(pushed, { x: 320, width: 631 });
    expect(getMobileToastRegion()).toEqual({ x: 320, width: 631 });
    setMobileToastRegion(pushed, null);
    expect(getMobileToastRegion()).toEqual({ x: 250, width: 419 });
    setMobileToastRegion(settings, null);
    expect(getMobileToastRegion()).toBeNull();
  });
});
