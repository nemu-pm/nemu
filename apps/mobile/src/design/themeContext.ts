import { createContext } from "react";
import type { ThemePreference } from "@/data/schema";
import type { NemuColorScheme, NemuTokens } from "./tokens";

export type NemuTheme = {
  reduceMotion: boolean | null;
  scheme: NemuColorScheme;
  themePreference: ThemePreference;
  tokens: NemuTokens;
  /** Set inside a Liquid Glass sheet's content (`NemuGlassSheetThemeScope`): its look. */
  sheetGlass?: "clear" | "tinted";
  setThemePreference: (preference: ThemePreference) => Promise<void>;
};

export const NemuThemeContext = createContext<NemuTheme | null>(null);
