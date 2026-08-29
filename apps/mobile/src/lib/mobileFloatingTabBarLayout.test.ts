import { describe, expect, test } from "bun:test";
import {
  MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT,
  shouldReserveMobileFloatingTabBarSpace,
} from "./mobileFloatingTabBarLayout";

describe("mobile floating tab bar layout", () => {
  test("reserves content space on short landscape viewports", () => {
    expect(
      shouldReserveMobileFloatingTabBarSpace(
        MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT - 1,
      ),
    ).toBe(true);
  });

  test("keeps the floating overlay at and above the compact breakpoint", () => {
    expect(
      shouldReserveMobileFloatingTabBarSpace(
        MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT,
      ),
    ).toBe(false);
    expect(shouldReserveMobileFloatingTabBarSpace(900)).toBe(false);
  });
});
