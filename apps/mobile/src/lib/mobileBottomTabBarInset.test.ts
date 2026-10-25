import { afterEach, describe, expect, test } from "bun:test";
import {
  getMobileBottomTabBarInset,
  reportMobileBottomTabBarInset,
  resetMobileBottomTabBarInsetForTests,
} from "./mobileBottomTabBarInset";

afterEach(resetMobileBottomTabBarInsetForTests);

describe("mobile bottom tab bar inset store", () => {
  test("keeps the last positive measurement and ignores missing values", () => {
    expect(getMobileBottomTabBarInset()).toBeNull();
    reportMobileBottomTabBarInset(83);
    expect(getMobileBottomTabBarInset()).toBe(83);
    reportMobileBottomTabBarInset(undefined);
    reportMobileBottomTabBarInset(0);
    reportMobileBottomTabBarInset(Number.NaN);
    expect(getMobileBottomTabBarInset()).toBe(83);
    reportMobileBottomTabBarInset(95.3);
    expect(getMobileBottomTabBarInset()).toBe(95.5);
  });
});
