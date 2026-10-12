import { describe, expect, test } from "bun:test";
import { NEMU_SOFT_SCROLL_EDGE_EFFECTS, resolveNemuNativeScrollEdgeEffects, resolveNemuNativeHeaderChrome } from "./nativeHeaderChrome";

describe("native header chrome defaults", () => {
  test("iOS: see-through header with soft top and bottom scroll edges", () => {
    const chrome = resolveNemuNativeHeaderChrome("ios", "#ffffff");
    expect(chrome).toEqual({
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      scrollEdgeEffects: NEMU_SOFT_SCROLL_EDGE_EFFECTS,
    });
    expect(NEMU_SOFT_SCROLL_EDGE_EFFECTS.top).toBe("soft");
    expect(NEMU_SOFT_SCROLL_EDGE_EFFECTS.bottom).toBe("soft");
    // An opaque bar background would bring back the hard cut.
    expect(chrome.headerStyle.backgroundColor).toBe("transparent");
  });

  test("Android keeps the opaque Material top app bar", () => {
    expect(resolveNemuNativeHeaderChrome("android", "#101010")).toEqual({
      headerStyle: { backgroundColor: "#101010" },
    });
  });
});


describe("native scroll edges follow toolbar placement", () => {
  test("vertical bars leave the top and bottom content clear", () => {
    for (const side of ["left", "right"] as const) {
      const effects = resolveNemuNativeScrollEdgeEffects(side);
      expect(effects).toEqual({ top: "hidden", bottom: "hidden", left: "automatic", right: "automatic" });
      expect(resolveNemuNativeHeaderChrome("ios", "#000", side)).toMatchObject({ scrollEdgeEffects: effects });
    }
  });
  test("moving bars back to horizontal restores their soft edges", () => {
    expect(resolveNemuNativeScrollEdgeEffects(null)).toEqual(NEMU_SOFT_SCROLL_EDGE_EFFECTS);
  });
  test("Android remains opaque even if a bar side is supplied", () => {
    expect(resolveNemuNativeHeaderChrome("android", "#000", "right")).toEqual({ headerStyle: { backgroundColor: "#000" } });
  });
});
