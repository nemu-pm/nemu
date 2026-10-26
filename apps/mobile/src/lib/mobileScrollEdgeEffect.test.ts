import { describe, expect, it, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import { MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT } from "./mobileFloatingTabBarClearance";
import {
  MOBILE_SCROLL_EDGE_REVEAL_DISTANCE,
  mobileScrollEdgeReveal,
  mobileScrollEdgeScrolledPastRest,
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
    // The first two stops (the title's band) are still fully blurred.
    expect(edge.maskStops.slice(0, 2).map(([colour]) => colour)).toEqual(["rgba(0,0,0,1)", "rgba(0,0,0,1)"]);
    expect(edge.maskStops.at(-1)?.[0]).toBe("rgba(0,0,0,0)");
  });

  test("an empty bar row (a title page before its compact title) keeps only the page's top padding", () => {
    const bar = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: false, headerHeight: 44, headerBarHeight: undefined, safeAreaTop: 0,
    });
    expect(bar.extent).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, bar })).toMatchObject({ height: 18 });
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

  test("the open Duo beside the vertical bar: the band reaches the bar's measured bottom, not the header estimate", () => {
    // react-navigation estimates an iPhone header 32 pt when the window is
    // wider than tall (951×669) and the status bar sits in the vertical bar;
    // the title row really ends where the content rests (~95 pt).
    const estimated = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: true, headerHeight: 32, headerBarHeight: undefined, safeAreaTop: 0,
    });
    expect(resolveMobileRailTopScrollEdge({ ...rail, bar: estimated }).height).toBe(40);
    const bar = resolveMobileScrollEdgeBarExtent({
      platform: "ios", nativeHeader: true, barContentVisible: true, headerHeight: 32, headerBarHeight: undefined, safeAreaTop: 0,
      observedSafeAreaTop: 95,
    });
    expect(bar).toEqual({ extent: 95, drawn: false });
    const edge = resolveMobileRailTopScrollEdge({ ...rail, bar });
    expect(edge.height).toBe(95 + MOBILE_SCROLL_EDGE_BAR_TAIL);
    // Full blur over the title row (centre ~48 pt).
    const plateauEnd = edge.maskStops.filter(([colour]) => colour === "rgba(0,0,0,1)").at(-1)![1] * edge.height;
    expect(plateauEnd).toBeGreaterThanOrEqual(48);
    // Scrolled 55 pt, "Continue Reading" (resting ~100 pt down) sits at ~45 pt: inside the band, which is fully shown.
    expect(100 - 55).toBeLessThan(edge.height);
    expect(mobileScrollEdgeReveal(
      mobileScrollEdgeScrolledPastRest({ offsetY: 55 - 95, contentInsetTop: 0, systemInsetTop: 95 }),
    )).toBe(1);
  });

  test("the measurement never adds a band where none is pinned", () => {
    const base = { platform: "ios", nativeHeader: true, headerBarHeight: undefined, safeAreaTop: 0, observedSafeAreaTop: 95 };
    // An empty bar row (a title page before its compact title).
    expect(resolveMobileScrollEdgeBarExtent({ ...base, barContentVisible: false, headerHeight: 32 }).extent).toBe(0);
    // No header shown.
    expect(resolveMobileScrollEdgeBarExtent({ ...base, barContentVisible: true, headerHeight: 0 }).extent).toBe(0);
    // Not measured yet: the estimate.
    expect(resolveMobileScrollEdgeBarExtent({ ...base, barContentVisible: true, headerHeight: 32, observedSafeAreaTop: null }).extent).toBe(32);
  });

  test("the surface feeds its measured safe-area top into the band's height", () => {
    const surface = readFileSync(path.join(import.meta.dir, "../design-system/components/NemuScrollEdgeSurface.tsx"), "utf8");
    expect(surface).toMatch(/useNemuScrollEdge\(\{\s*\.\.\.options,\s*observedSafeAreaTop: systemInsetTop \? observedSafeAreaTop : null,/);
    const hook = readFileSync(path.join(import.meta.dir, "../design/useNemuScrollEdge.ts"), "utf8");
    expect(hook).toContain("observedSafeAreaTop,\n  });");
  });

  test("Android and the reader never draw it", () => {
    expect(resolveMobileScrollEdgeBarExtent({
      platform: "android", nativeHeader: true, barContentVisible: true, headerHeight: 64, headerBarHeight: undefined, safeAreaTop: 24,
    }).extent).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, reader: true, bar: { extent: 44, drawn: false } }).height).toBe(0);
  });
});

describe("a pane scrolling on its own beside the rail", () => {
  const rail = { platform: "ios", verticalBarSide: "right" as const, safeAreaTop: 8, pageTop: 24, reader: false };

  test("holds full strength over its top padding though nothing is in the bar row", () => {
    const edge = resolveMobileRailTopScrollEdge({ ...rail, pane: true });
    // Ends exactly where its resting rows start.
    expect(edge.height).toBe(32);
    // Held at full strength from the edge, gone at the band's end.
    expect(edge.maskStops.slice(0, 3).map(([colour]) => colour)).toEqual([
      "rgba(0,0,0,1)", "rgba(0,0,0,1)", "rgba(0,0,0,1)",
    ]);
    expect(edge.maskStops.at(-1)?.[0]).toBe("rgba(0,0,0,0)");
    // The same page's other scroll views keep the eased padding band.
    expect(resolveMobileRailTopScrollEdge(rail).maskStops[1]?.[0]).not.toBe("rgba(0,0,0,1)");
  });

  test("a title in the bar row still sizes the band", () => {
    const edge = resolveMobileRailTopScrollEdge({ ...rail, pane: true, bar: { extent: 52, drawn: false } });
    expect(edge.height).toBe(52 + MOBILE_SCROLL_EDGE_BAR_TAIL);
  });

  test("horizontal bars keep the system's edge (iPad), and the reader none", () => {
    expect(resolveMobileRailTopScrollEdge({ ...rail, verticalBarSide: null, pane: true }).height).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, reader: true, pane: true }).height).toBe(0);
    expect(resolveMobileRailTopScrollEdge({ ...rail, platform: "android", pane: true }).height).toBe(0);
  });
});

describe("the top band follows the scroll, like the system's soft edge", () => {
  test("none at rest at the top or pulled down past it", () => {
    expect(mobileScrollEdgeReveal(0)).toBe(0);
    expect(mobileScrollEdgeReveal(-40)).toBe(0);
    expect(mobileScrollEdgeReveal(Number.NaN)).toBe(0);
  });

  test("fades in over the first points of scroll, then holds", () => {
    expect(mobileScrollEdgeReveal(MOBILE_SCROLL_EDGE_REVEAL_DISTANCE / 2)).toBeCloseTo(0.5);
    expect(mobileScrollEdgeReveal(MOBILE_SCROLL_EDGE_REVEAL_DISTANCE)).toBe(1);
    expect(mobileScrollEdgeReveal(600)).toBe(1);
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

describe("mobileScrollEdgeScrolledPastRest", () => {
  test("counts the inset UIKit adds, which scroll events never report", () => {
    // A page under a 74 pt bar that adjusts its insets rests at offset -74.
    expect(mobileScrollEdgeScrolledPastRest({ offsetY: -74, contentInsetTop: 0, systemInsetTop: 74 })).toBe(0);
    expect(mobileScrollEdgeReveal(
      mobileScrollEdgeScrolledPastRest({ offsetY: -74, contentInsetTop: 0, systemInsetTop: 74 }),
    )).toBe(0);
    // Scrolled ~59 pt: content sits under the bar's title, so the band is full.
    const past = mobileScrollEdgeScrolledPastRest({ offsetY: -15, contentInsetTop: 0, systemInsetTop: 74 });
    expect(past).toBe(59);
    expect(mobileScrollEdgeReveal(past)).toBe(1);
    // Without the system inset it read as -15: no band (the overlap bug).
    expect(mobileScrollEdgeReveal(-15)).toBe(0);
  });

  test("the scroll view's own inset and a page that does not adjust", () => {
    expect(mobileScrollEdgeScrolledPastRest({ offsetY: -20, contentInsetTop: 20, systemInsetTop: 0 })).toBe(0);
    expect(mobileScrollEdgeScrolledPastRest({ offsetY: 8, contentInsetTop: 0, systemInsetTop: 0 })).toBe(8);
    expect(mobileScrollEdgeScrolledPastRest({ offsetY: 8, contentInsetTop: Number.NaN, systemInsetTop: Number.NaN })).toBe(8);
  });

  test("the page scaffolds feed the scroll view's safe-area top as the system inset", () => {
    const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");
    const scaffold = read("../design-system/components/PageScaffold.tsx");
    expect(scaffold.match(/useNemuScrollEdgeTracking\(\{\s*systemAdjustsInsets: contentInsetAdjustmentBehavior !== "never",/g)?.length).toBe(2);
    const surface = read("../design-system/components/NemuScrollEdgeSurface.tsx");
    expect(surface).toContain("layout.safeAreaInsets?.top");
    expect(surface).toContain("mobileScrollEdgeScrolledPastRest(");
  });
});
