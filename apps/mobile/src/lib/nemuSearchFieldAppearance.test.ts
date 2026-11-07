import { describe, expect, it } from "bun:test";
import {
  resolveNemuHeaderSearchBarColors,
  resolveNemuSearchFieldSurface,
  resolveNemuSystemSearchFieldFill,
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

describe("resolveNemuHeaderSearchBarColors beside a vertical rail", () => {
  const fill = "#e9eaf0";
  it("pins the system field fill on iOS 26+ so the push matches the settled field", () => {
    expect(resolveNemuHeaderSearchBarColors("ios", "26.0", tokens, fill)).toEqual({
      barTintColor: fill,
      tintColor: tokens.primary,
    });
  });
  it("leaves the field to the system without a rail", () => {
    expect(resolveNemuHeaderSearchBarColors("ios", "26.0", tokens, undefined)).toEqual({ tintColor: tokens.primary });
  });
  it("keeps the themed field on older iOS and Android", () => {
    expect(resolveNemuHeaderSearchBarColors("ios", "18.7", tokens, fill).barTintColor).toBe(tokens.card);
    expect(resolveNemuHeaderSearchBarColors("android", 34, tokens, fill).barTintColor).toBe(tokens.card);
  });
});

describe("resolveNemuSystemSearchFieldFill", () => {
  it("is tertiarySystemFill laid over the page, opaque (the settled field measured e8eaf0 on #f9faff)", () => {
    expect(resolveNemuSystemSearchFieldFill("#f9faff", "light")).toBe("#e9eaf0");
    expect(resolveNemuSystemSearchFieldFill("#090a0d", "dark")).toBe("#232429");
  });
  it("gives up on a background it cannot read", () => {
    expect(resolveNemuSystemSearchFieldFill("rgb(1, 2, 3)", "light")).toBeNull();
  });
});
