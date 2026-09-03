import { describe, expect, it } from "bun:test";
import { supportsNemuLiquidGlassButtonStyle } from "./nemuLiquidGlass";

describe("supportsNemuLiquidGlassButtonStyle", () => {
  it("parses the major component of an iOS version string", () => {
    expect(supportsNemuLiquidGlassButtonStyle("26.5")).toBe(true);
    expect(supportsNemuLiquidGlassButtonStyle("26.0")).toBe(true);
    expect(supportsNemuLiquidGlassButtonStyle("27.1")).toBe(true);
    expect(supportsNemuLiquidGlassButtonStyle("18.7")).toBe(false);
    expect(supportsNemuLiquidGlassButtonStyle("9.3.5")).toBe(false);
  });

  it("accepts an Android-style numeric version", () => {
    expect(supportsNemuLiquidGlassButtonStyle(26)).toBe(true);
    expect(supportsNemuLiquidGlassButtonStyle(34)).toBe(true);
  });

  it("is false for unusable values", () => {
    expect(supportsNemuLiquidGlassButtonStyle(null)).toBe(false);
    expect(supportsNemuLiquidGlassButtonStyle(undefined)).toBe(false);
    expect(supportsNemuLiquidGlassButtonStyle("")).toBe(false);
    expect(supportsNemuLiquidGlassButtonStyle("unknown")).toBe(false);
  });
});
