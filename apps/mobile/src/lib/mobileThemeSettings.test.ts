import { describe, expect, test } from "bun:test";
import {
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
} from "./mobileThemeSettings";

describe("mobile theme settings helpers", () => {
  test("accepts supported theme preferences", () => {
    expect(normalizeThemePreference("system")).toBe("system");
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
  });

  test("falls back to system for unsupported theme preferences", () => {
    expect(normalizeThemePreference(undefined)).toBe(DEFAULT_THEME_PREFERENCE);
    expect(normalizeThemePreference("sepia")).toBe(DEFAULT_THEME_PREFERENCE);
  });
});
