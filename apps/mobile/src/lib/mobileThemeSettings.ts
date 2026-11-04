import type { ThemePreference } from "@/data/schema";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return DEFAULT_THEME_PREFERENCE;
}

/**
 * The native (UIKit window) appearance for a theme preference: an explicit
 * light / dark choice overrides the system appearance for every native
 * surface; "system" leaves it unspecified so the system decides.
 */
export function mobileNativeAppearanceForThemePreference(
  preference: ThemePreference,
): "light" | "dark" | "unspecified" {
  return preference === "system" ? "unspecified" : preference;
}
