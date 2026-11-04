import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  nextMobileFormScrollRest as nextRest,
  resolveMobileFormScrollEdge as formEdge,
  resolveMobileRailBottomScrollEdge,
  resolveMobileRailTopScrollEdge,
} from "./mobileScrollEdgeEffect";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime helper; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { resolveNemuNativeScrollEdgeEffects } from "@/design/nativeHeaderChrome";

const read = (file: string) => readFileSync(path.join(import.meta.dir, "..", "..", file), "utf8");

describe("SwiftUI Form scroll edges (Account)", () => {
  test("beside a vertical bar the app band, as the stack screens hide theirs; else the system's", () => {
    expect(formEdge({ platform: "ios", verticalBarSide: "left" })).toBe("app-band");
    expect(formEdge({ platform: "ios", verticalBarSide: "right" })).toBe("app-band");
    expect(formEdge({ platform: "ios", verticalBarSide: null })).toBe("system");
    expect(formEdge({ platform: "android", verticalBarSide: "left" })).toBe("system");
    // The same switch the native header chrome uses.
    expect(resolveNemuNativeScrollEdgeEffects("left").top).toBe("hidden");
    expect(resolveNemuNativeScrollEdgeEffects(null).top).toBe("soft");
  });

  test("the bands fade to zero at their far end (no hard line where the blur stops)", () => {
    const top = resolveMobileRailTopScrollEdge({
      platform: "ios",
      verticalBarSide: "left",
      safeAreaTop: 0,
      pageTop: 8,
      reader: false,
      bar: { extent: 52, drawn: false },
    });
    expect(top.height).toBeGreaterThan(0);
    expect(top.maskStops[0]).toEqual(["rgba(0,0,0,1)", 0]);
    expect(top.maskStops[top.maskStops.length - 1]).toEqual(["rgba(0,0,0,0)", 1]);
    const bottom = resolveMobileRailBottomScrollEdge({
      platform: "ios",
      verticalBarSide: "left",
      safeAreaBottom: 20,
      reader: false,
    });
    expect(bottom.maskStops[0]).toEqual(["rgba(0,0,0,0)", 0]);
    expect(bottom.maskStops[bottom.maskStops.length - 1]).toEqual(["rgba(0,0,0,1)", 1]);
  });

  test("the top band's rest is the first offset, taken again on a resize at rest", () => {
    expect(nextRest({ rest: null, offset: -62, sizeChanged: false, wasAtRest: true })).toBe(-62);
    expect(nextRest({ rest: -62, offset: 40, sizeChanged: false, wasAtRest: true })).toBe(-62);
    expect(nextRest({ rest: -62, offset: -50, sizeChanged: true, wasAtRest: true })).toBe(-50);
    // Scrolled into the band when the window changed: the old rest holds.
    expect(nextRest({ rest: -62, offset: 100, sizeChanged: true, wasAtRest: false })).toBe(-62);
  });

  test("the Account Form hides its edge and sits in the shared surface only beside the bar", () => {
    const page = read("src/screens/AccountScreen.ios.tsx");
    expect(page).toContain("<NemuScrollEdgeSurface nativeHeader tracking={edge.tracking}>");
    expect(page).toMatch(/nemuSoftScrollEdge\(\),\s+\.\.\.edge\.formModifiers/);
    expect(page).toContain("[scrollEdgeEffectHidden(), ...(geometryModifier ? [geometryModifier] : [])]");
    expect(page).toContain("useScrollGeometryChange(band ? onGeometry : undefined)");
    const module = read("modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(module).toContain('static let type = "nemuScrollEdgeEffectHidden"');
    expect(module).toContain("content.scrollEdgeEffectHidden(true, for: .vertical)");
    expect(module).toContain("ViewModifierRegistry.register(NemuScrollEdgeEffectHiddenModifier.type)");
    expect(module).toContain("ViewModifierRegistry.unregister(NemuScrollEdgeEffectHiddenModifier.type)");
  });
});
