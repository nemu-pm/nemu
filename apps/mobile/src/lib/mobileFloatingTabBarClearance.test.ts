import { describe, expect, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import {
  MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT,
  MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY,
  getMobileFloatingTabBarOverlayExtent,
  getMobilePageContentBottomPadding,
  resolveMobileFloatingTabBarFrame,
} from "./mobileFloatingTabBarClearance";

describe("mobile floating tab bar clearance", () => {
  test("scroll runway lets the final row clear the floating overlay", () => {
    const overlayExtent = getMobileFloatingTabBarOverlayExtent(spacing.tabBottom);
    expect(overlayExtent).toBe(spacing.tabBottom + MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT);
    expect(MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY).toBeGreaterThan(overlayExtent);
  });

  test("adds the runway on top of the safe-area inset", () => {
    expect(getMobilePageContentBottomPadding(24)).toBe(
      24 + MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY,
    );
  });

  test("sanitizes malformed native inset measurements", () => {
    expect(getMobilePageContentBottomPadding(Number.NaN)).toBe(
      MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY,
    );
    expect(getMobilePageContentBottomPadding(-12)).toBe(
      MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY,
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
