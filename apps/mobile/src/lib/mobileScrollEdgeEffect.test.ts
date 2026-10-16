import { describe, expect, it, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import { MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT } from "./mobileFloatingTabBarClearance";
import {
  MOBILE_SCROLL_EDGE_BAR_TAIL,
  resolveMobileRailBottomScrollEdge,
  resolveMobileScrollEdgeBarExtent,
  MOBILE_SCROLL_EDGE_FALLBACK_SCRIM_MAX_ALPHA,
  MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP,
  MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS,
  MOBILE_SCROLL_EDGE_SCRIM_MAX_ALPHA,
  resolveMobileBottomScrollEdgeEffect,
  resolveMobileRailTopScrollEdge,
} from "./mobileScrollEdgeEffect";

describe("resolveMobileBottomScrollEdgeEffect", () => {
  it("starts at the capsule's top edge: nothing above the bar is softened", () => {
    const effect = resolveMobileBottomScrollEdgeEffect({
      bottomInset: 24,
      tabBottom: spacing.tabBottom,
      blurAvailable: true,
    });
    const capsuleTop = 24 + spacing.tabBottom + MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT;
    expect(effect.capsuleTop).toBe(capsuleTop);
    expect(MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP).toBeGreaterThanOrEqual(0);
    expect(effect.height).toBe(capsuleTop - MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP);
    expect(effect.height).toBeLessThanOrEqual(capsuleTop);
    expect(effect.maxBlurRadius).toBe(MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS);
  });

  it("ramps the scrim monotonically from clear to the max alpha", () => {
    const { scrimStops } = resolveMobileBottomScrollEdgeEffect({
      bottomInset: 0,
      tabBottom: spacing.tabBottom,
      blurAvailable: true,
    });
    expect(scrimStops[0]).toEqual({ offset: 0, alpha: 0 });
    expect(scrimStops.at(-1)).toEqual({ offset: 1, alpha: MOBILE_SCROLL_EDGE_SCRIM_MAX_ALPHA });
    for (let index = 1; index < scrimStops.length; index += 1) {
      expect(scrimStops[index].offset).toBeGreaterThan(scrimStops[index - 1].offset);
      expect(scrimStops[index].alpha).toBeGreaterThan(scrimStops[index - 1].alpha);
    }
  });

  it("falls back to a stronger fade and no blur without the native blur", () => {
    const effect = resolveMobileBottomScrollEdgeEffect({
      bottomInset: 48,
      tabBottom: spacing.tabBottom,
      blurAvailable: false,
    });
    expect(effect.maxBlurRadius).toBe(0);
    expect(effect.scrimStops.at(-1)?.alpha).toBe(MOBILE_SCROLL_EDGE_FALLBACK_SCRIM_MAX_ALPHA);
  });

  it("sanitises non-finite and negative insets", () => {
    const effect = resolveMobileBottomScrollEdgeEffect({
      bottomInset: Number.NaN,
      tabBottom: -4,
      blurAvailable: true,
    });
    expect(effect.height).toBe(MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT - MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP);
  });
});

describe("iOS rail top scroll edge", () => {
  const base = { platform: "ios", verticalBarSide: "right" as const, safeAreaTop: 6, pageTop: 18, reader: false };

  test("beside the vertical bar the band covers exactly the page's top padding", () => {
    const edge = resolveMobileRailTopScrollEdge(base);
    expect(edge.height).toBe(24);
    expect(edge.maskStops[0]).toEqual(["rgba(0,0,0,1)", 0]);
    expect(edge.maskStops.at(-1)).toEqual(["rgba(0,0,0,0)", 1]);
  });

  test("the blur only weakens away from the edge", () => {
    const alphas = resolveMobileRailTopScrollEdge(base).maskStops.map(([colour]) => Number(colour.match(/,([\d.]+)\)$/)?.[1]));
    for (let index = 1; index < alphas.length; index += 1) expect(alphas[index]!).toBeLessThan(alphas[index - 1]!);
  });

  test("no band with horizontal bars, in the reader, or off iOS", () => {
    expect(resolveMobileRailTopScrollEdge({ ...base, verticalBarSide: null }).height).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...base, reader: true }).height).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...base, platform: "android" }).height).toBe(0);
  });
});

describe("the band covers what is pinned at the top", () => {
  const rail = { platform: "ios", verticalBarSide: "right" as const, safeAreaTop: 0, pageTop: 18, reader: false };

  test("a bar row with a title: the band runs past the bar's bottom and holds full strength over the title", () => {
    const bar = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: true, headerHeight: 44, headerBarHeight: undefined, safeAreaTop: 0,
    });
    expect(bar).toEqual({ extent: 44, drawn: false });
    const edge = resolveMobileRailTopScrollEdge({ ...rail, bar });
    expect(edge.height).toBe(44 + MOBILE_SCROLL_EDGE_BAR_TAIL);
    expect(edge.scrimAlpha).toBeGreaterThan(0);
    // The first two stops (the title's band) are still fully blurred.
    expect(edge.maskStops.slice(0, 2).map(([colour]) => colour)).toEqual(["rgba(0,0,0,1)", "rgba(0,0,0,1)"]);
    expect(edge.maskStops.at(-1)?.[0]).toBe("rgba(0,0,0,0)");
  });

  test("an empty bar row (a title page before its compact title) keeps only the page's top padding", () => {
    const bar = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: false, headerHeight: 44, headerBarHeight: undefined, safeAreaTop: 0,
    });
    expect(bar.extent).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, bar })).toMatchObject({ height: 18, scrimAlpha: 0 });
  });

  test("a bar the page draws itself gets the band with horizontal bars too", () => {
    const bar = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: true, headerHeight: 0, headerBarHeight: 44, safeAreaTop: 20,
    });
    expect(bar).toEqual({ extent: 64, drawn: true });
    expect(resolveMobileRailTopScrollEdge({ ...rail, verticalBarSide: null, bar }).height).toBe(64 + MOBILE_SCROLL_EDGE_BAR_TAIL);
    // A native bar with horizontal bars: the system's own soft edge.
    const native = { extent: 44, drawn: false };
    expect(resolveMobileRailTopScrollEdge({ ...rail, verticalBarSide: null, bar: native }).height).toBe(0);
  });

  test("Android and the reader never draw it", () => {
    expect(resolveMobileScrollEdgeBarExtent({
      platform: "android", nativeHeader: true, barContentVisible: true, headerHeight: 64, headerBarHeight: undefined, safeAreaTop: 24,
    }).extent).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, reader: true, bar: { extent: 44, drawn: false } }).height).toBe(0);
  });
});

describe("iOS rail bottom scroll edge", () => {
  test("beside the vertical bar the band covers the home indicator inset, strongest at the edge", () => {
    const edge = resolveMobileRailBottomScrollEdge({ platform: "ios", verticalBarSide: "left", safeAreaBottom: 34, reader: false });
    expect(edge.height).toBe(34);
    expect(edge.maskStops[0]?.[0]).toBe("rgba(0,0,0,0)");
    expect(edge.maskStops.at(-1)?.[0]).toBe("rgba(0,0,0,1)");
  });
  test("none with horizontal bars (the tab bar's native edge) or in the reader", () => {
    expect(resolveMobileRailBottomScrollEdge({ platform: "ios", verticalBarSide: null, safeAreaBottom: 34, reader: false }).height).toBe(0);
    expect(resolveMobileRailBottomScrollEdge({ platform: "ios", verticalBarSide: "right", safeAreaBottom: 34, reader: true }).height).toBe(0);
  });
});
