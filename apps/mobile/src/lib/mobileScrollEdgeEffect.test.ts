import { describe, expect, it } from "bun:test";
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
