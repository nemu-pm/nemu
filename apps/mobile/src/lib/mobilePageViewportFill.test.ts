import { describe, expect, test } from "bun:test";
import { resolveMobilePageViewportHeight } from "./mobilePageLayout";
import {
  getMobileEmptyLibraryBoxHeight,
  getMobileEmptyLibraryIosBottomChrome,
} from "./mobileEmptyLibraryLayout";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import { MOBILE_PAGE_CONTENT_BOTTOM_MARGIN } from "./mobileFloatingTabBarClearance";

describe("resolveMobilePageViewportHeight", () => {
  test("iOS automatic insets: frame minus the observed bars", () => {
    // 6.3" phone: 874pt frame, 116 nav (incl. status) + 83 tab bar.
    expect(resolveMobilePageViewportHeight({
      frameHeight: 874,
      systemAdjustsInsets: true,
      observedInsets: { top: 116, bottom: 83 },
      fallbackTopInset: 0,
      fallbackBottomInset: 0,
    })).toBe(675);
  });

  test("falls back to the measured header / tab bar before the observer reports", () => {
    expect(resolveMobilePageViewportHeight({
      frameHeight: 874,
      systemAdjustsInsets: true,
      observedInsets: null,
      fallbackTopInset: 116,
      fallbackBottomInset: 34 + 49,
    })).toBe(675);
  });

  test("pages that pad for their bars themselves use the frame", () => {
    expect(resolveMobilePageViewportHeight({
      frameHeight: 800.6,
      systemAdjustsInsets: false,
      observedInsets: { top: 50, bottom: 50 },
      fallbackTopInset: 0,
      fallbackBottomInset: 0,
    })).toBe(800);
  });

  test("null before the frame is measured (no cap yet)", () => {
    expect(resolveMobilePageViewportHeight({
      frameHeight: null,
      systemAdjustsInsets: true,
      observedInsets: null,
      fallbackTopInset: 0,
      fallbackBottomInset: 0,
    })).toBeNull();
  });
});

describe("EmptyLibrary window-derived box (load error, collection not found…)", () => {
  test("iOS bottom chrome is the real tab bar inset plus the page margin", () => {
    expect(getMobileEmptyLibraryIosBottomChrome({
      safeAreaBottom: 34,
      bottomTabBar: true,
      measuredTabBarInset: 83,
    })).toBe(83 + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
    expect(getMobileEmptyLibraryIosBottomChrome({
      safeAreaBottom: 34,
      bottomTabBar: true,
      measuredTabBarInset: null,
    })).toBe(34 + 49 + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
    // Vertical bars (Duo) or a pushed screen without tabs: home indicator only.
    expect(getMobileEmptyLibraryIosBottomChrome({
      safeAreaBottom: 20,
      bottomTabBar: false,
      measuredTabBarInset: 83,
    })).toBe(20 + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
  });

  test("the hosting page (pageTop + box + bottom margin) never exceeds its viewport", () => {
    const windowHeight = 874;
    const top = 62 + 44; // status bar + nav bar
    const tab = 83;
    const topChrome = top + spacing.pageTop;
    const bottomChrome = getMobileEmptyLibraryIosBottomChrome({
      safeAreaBottom: 34,
      bottomTabBar: true,
      measuredTabBarInset: tab,
    });
    const box = getMobileEmptyLibraryBoxHeight({ windowHeight, topChrome, bottomChrome });
    const content = spacing.pageTop + box + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN;
    expect(content).toBeLessThanOrEqual(windowHeight - top - tab);
  });
});
