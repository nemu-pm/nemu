import { describe, expect, test } from "bun:test";
import {
  MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT,
  MOBILE_FLOATING_TAB_BAR_MAX_VISUAL_HEIGHT,
  getMobileFloatingTabBarContentInset,
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

  test("reserves the maximum bar height plus its safe-area offset", () => {
    expect(
      getMobileFloatingTabBarContentInset({
        viewportHeight: MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT - 1,
        bottomInset: 24,
        tabBottom: 12,
      }),
    ).toBe(MOBILE_FLOATING_TAB_BAR_MAX_VISUAL_HEIGHT + 36);
  });

  test("sanitizes native inset measurements and skips roomy viewports", () => {
    expect(
      getMobileFloatingTabBarContentInset({
        viewportHeight: 400,
        bottomInset: Number.NaN,
        tabBottom: -12,
      }),
    ).toBe(MOBILE_FLOATING_TAB_BAR_MAX_VISUAL_HEIGHT);
    expect(
      getMobileFloatingTabBarContentInset({
        viewportHeight: MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT,
        bottomInset: 24,
        tabBottom: 12,
      }),
    ).toBe(0);
  });
});
