import { describe, expect, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import {
  MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT,
  MOBILE_PAGE_CONTENT_BOTTOM_MARGIN,
  getMobileFloatingTabBarOverlayExtent,
  getMobilePageContentBottomPadding,
  resolveMobileFloatingTabBarFrame,
} from "./mobileFloatingTabBarClearance";

describe("page content bottom padding", () => {
  const base = { tabBottom: spacing.tabBottom };

  test("iOS automatic insets: only the page margin (UIKit already clears the tab bar / home indicator)", () => {
    // iPhone Air in a tab (safe area 34) and a pushed flow without the bar.
    for (const floatingTabBar of [false, true]) {
      expect(
        getMobilePageContentBottomPadding({
          ...base,
          safeAreaBottom: 34,
          systemAdjustsBottomInset: true,
          floatingTabBar,
        }),
      ).toBe(MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
    }
  });

  test("Android floating bar: the last row ends one margin above the bar", () => {
    const padding = getMobilePageContentBottomPadding({
      ...base,
      safeAreaBottom: 24,
      systemAdjustsBottomInset: false,
      floatingTabBar: true,
    });
    // Bar top edge measured from the window bottom: inset + tabBottom + bar.
    const barTop = 24 + spacing.tabBottom + MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT;
    expect(padding).toBe(barTop + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
    expect(padding).toBe(24 + getMobileFloatingTabBarOverlayExtent(spacing.tabBottom) + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
  });

  test("no bar, no automatic inset: safe area plus the margin, no runway band", () => {
    expect(
      getMobilePageContentBottomPadding({
        ...base,
        safeAreaBottom: 34,
        systemAdjustsBottomInset: false,
        floatingTabBar: false,
      }),
    ).toBe(34 + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN);
  });

  test("sanitizes malformed native inset measurements", () => {
    const fallback = { ...base, systemAdjustsBottomInset: false, floatingTabBar: false };
    expect(getMobilePageContentBottomPadding({ ...fallback, safeAreaBottom: Number.NaN })).toBe(
      MOBILE_PAGE_CONTENT_BOTTOM_MARGIN,
    );
    expect(getMobilePageContentBottomPadding({ ...fallback, safeAreaBottom: -12 })).toBe(
      MOBILE_PAGE_CONTENT_BOTTOM_MARGIN,
    );
    expect(getMobileFloatingTabBarOverlayExtent(-5)).toBe(
      MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT,
    );
  });
});

describe("floating tab bar placement on foldables", () => {
  const panes = [
    { x: 0, width: 420 },
    { x: 421, width: 420 },
  ];

  test("book posture keeps the bar inside the trailing pane", () => {
    expect(
      resolveMobileFloatingTabBarFrame({ windowWidth: 841, posture: "book", panels: panes }),
    ).toEqual({ left: 421, width: 420 });
    expect(
      resolveMobileFloatingTabBarFrame({
        windowWidth: 841,
        posture: "book",
        panels: panes,
        layoutDirection: "rtl",
      }),
    ).toEqual({ left: 0, width: 420 });
  });

  test("flat, notebook and narrow panes keep the window-centred bar", () => {
    expect(
      resolveMobileFloatingTabBarFrame({ windowWidth: 841, posture: "flat", panels: [{ x: 0, width: 841 }] }),
    ).toBeNull();
    expect(
      resolveMobileFloatingTabBarFrame({ windowWidth: 841, posture: "notebook", panels: panes }),
    ).toBeNull();
    expect(
      resolveMobileFloatingTabBarFrame({
        windowWidth: 600,
        posture: "book",
        panels: [
          { x: 0, width: 300 },
          { x: 300, width: 300 },
        ],
      }),
    ).toBeNull();
  });
});
