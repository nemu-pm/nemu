import { describe, expect, test } from "bun:test";
import { NEMU_SOFT_SCROLL_EDGE_EFFECTS, resolveNemuNativeHeaderChrome } from "./nativeHeaderChrome";

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


describe("native scroll edges never fall back to the SDK default", () => {
  test("every edge is soft, never automatic or hidden (iOS 27 resolves automatic to hard)", () => {
    expect(Object.values(NEMU_SOFT_SCROLL_EDGE_EFFECTS)).toEqual(["soft", "soft", "soft", "soft"]);
  });
});
