import { describe, expect, it } from "bun:test";
import {
  resolveNemuHeaderSearchBarColors,
  resolveNemuSearchFieldSurface,
} from "./nemuSearchFieldAppearance";

const tokens = {
  card: "#ffffff",
  foreground: "#111111",
  mutedForeground: "#777777",
  primary: "#e5484d",
};

describe("resolveNemuSearchFieldSurface", () => {
  it("uses Liquid Glass on iOS 26 and later", () => {
    expect(resolveNemuSearchFieldSurface("ios", "26.0")).toBe("liquid-glass");
    expect(resolveNemuSearchFieldSurface("ios", "26.5")).toBe("liquid-glass");
    expect(resolveNemuSearchFieldSurface("ios", "27.1")).toBe("liquid-glass");
  });

  it("keeps the filled capsule on older iOS", () => {
    expect(resolveNemuSearchFieldSurface("ios", "18.7")).toBe("filled");
    expect(resolveNemuSearchFieldSurface("ios", "25.9")).toBe("filled");
    expect(resolveNemuSearchFieldSurface("ios", undefined)).toBe("filled");
  });

  it("never uses glass off iOS, whatever the version number", () => {
    // Android reports its API level (34, 35, 36), which is above 26.
    expect(resolveNemuSearchFieldSurface("android", 34)).toBe("filled");
    expect(resolveNemuSearchFieldSurface("web", "26.0")).toBe("filled");
  });
});

describe("resolveNemuHeaderSearchBarColors", () => {
  it("leaves the field to the system glass on iOS 26+, keeping the brand tint", () => {
    const colors = resolveNemuHeaderSearchBarColors("ios", "26.2", tokens);
    expect(colors).toEqual({ tintColor: tokens.primary });
    // No opaque fill over the glass.
    expect("barTintColor" in colors).toBe(false);
  });

  it("keeps the themed field on older iOS", () => {
    expect(resolveNemuHeaderSearchBarColors("ios", "18.7", tokens)).toEqual({
      barTintColor: tokens.card,
      headerIconColor: tokens.primary,
      hintTextColor: tokens.mutedForeground,
      textColor: tokens.foreground,
      tintColor: tokens.primary,
    });
  });

  it("keeps the themed field on Android", () => {
    expect(resolveNemuHeaderSearchBarColors("android", 35, tokens)).toEqual({
      barTintColor: tokens.card,
      headerIconColor: tokens.primary,
      hintTextColor: tokens.mutedForeground,
      textColor: tokens.foreground,
      tintColor: tokens.primary,
    });
  });
});
