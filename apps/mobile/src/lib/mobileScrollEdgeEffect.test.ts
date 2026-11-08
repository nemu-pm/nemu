import { describe, expect, it, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import { MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT } from "./mobileFloatingTabBarClearance";
import {
  MOBILE_SCROLL_EDGE_FALLBACK_SCRIM_MAX_ALPHA,
  MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP,
  MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS,
  MOBILE_SCROLL_EDGE_SCRIM_MAX_ALPHA,
  resolveMobileBottomScrollEdgeEffect,
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

describe("the Library beside the vertical bar", () => {
  const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");

  test("the Library list is not the top edge's content scroll view beside a vertical bar (as on every page without a marker)", () => {
    const library = read("../screens/LibraryScreen.tsx");
    expect(library).toContain("<ContentScrollMarker generation={gridColumns} topEdge={verticalBarSide === null} />");
    const marker = read("../../modules/nemu-window-layout/src/ZoomTransition.native.tsx");
    expect(marker).toContain("topEdge={topEdge}");
    const swift = read("../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(swift).toContain('Prop("topEdge")');
    // Turned off, an earlier top registration is cleared, not left in place.
    expect(swift).toContain("current.setContentScrollView(nil, for: .top)");
    expect(swift).toContain("current.setContentScrollView(scrollView, for: .bottom)");
  });
});

describe("native edge effects (iOS)", () => {
  const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");
  const element = read("../../modules/nemu-window-layout/ios/NemuScrollEdgeElement.swift");

  test("an element registers the interaction and pins its edge to soft (automatic is hard under the iOS 27 SDK)", () => {
    expect(element).toContain("UIScrollEdgeElementContainerInteraction()");
    expect(element).toContain("next.scrollView = scrollView");
    expect(element).toContain("next.edge = edge");
    expect(element).toContain("effect(of: scrollView)?.style = .soft");
    expect(element).toContain("guard #available(iOS 26.0, *)");
  });

  test("an empty element holds a clear label: an empty view forms no effect", () => {
    expect(element).toContain("label.textColor = .clear");
    expect(element).toContain("label.isAccessibilityElement = false");
    expect(element).toContain("guard marker == nil, subviews.isEmpty");
  });

  test("beside the vertical bar each detail pane reveals its top effect by its own offset", () => {
    const split = read("../components/MobileMangaDetailSplitLayout.tsx");
    expect(split).toContain('<ScrollEdgeElement edge="top" revealPastRest');
    expect(split.match(/\{paneEdgeReveal\}/g)?.length).toBe(2);
    expect(element).toContain("effect.isHidden = hidden");
  });

  test("a page marks the bottom edge beside the vertical bar, where no bar forms one", () => {
    const scaffold = read("../design-system/components/PageScaffold.tsx");
    expect(scaffold).toContain('edge="bottom"');
    expect(scaffold).toContain("verticalBarSide && insets.bottom > 0");
  });

  test("the reader's canvas has no edge effect, also beside the vertical bar", () => {
    const stack = read("../../app/sources/_layout.tsx");
    expect(stack).toContain('scrollEdgeEffects: { top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }');
  });

  test("Add Sources' list runs under the sheet bar's pinned search field, observed by the bar", () => {
    const stack = read("../components/MobileAddSourcesStack.ios.tsx");
    expect(stack).toContain("pinnedSearch(search.query, search.placeholder, search.onChangeQuery)");
    expect(stack).toContain('ignoreSafeArea({ regions: "container", edges: "vertical" })');
    const browse = read("../screens/BrowseScreen.tsx");
    // Beside a vertical bar a registered top edge would hide the sheet's title on scroll.
    expect(browse).toContain("<ContentScrollMarker topEdge={!verticalBarSide || regularWidth} />");
    const swift = read("../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(swift).toContain(".navigationBarDrawer(displayMode: .always)");
  });

  test("horizontal rows use the native ends on iOS, their own fade only without the element", () => {
    for (const file of ["../screens/SearchScreen.tsx", "../screens/SourceBrowseScreen.tsx"]) {
      expect(read(file)).toContain("<NemuHorizontalScrollEdges />");
    }
    const rail = read("../components/explore/ExploreSourceHome.tsx");
    expect(rail).toContain("if (nemuHorizontalScrollEdgesAvailable)");
  });
});
