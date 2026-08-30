import type { ThemePreference } from "@/data/schema";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return DEFAULT_THEME_PREFERENCE;
}
