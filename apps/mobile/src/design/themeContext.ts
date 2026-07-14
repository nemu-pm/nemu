import { createContext } from "react";
import type { ThemePreference } from "@/data/schema";
import type { NemuColorScheme, NemuTokens } from "./tokens";

export type NemuTheme = {
  scheme: NemuColorScheme;
  themePreference: ThemePreference;
  tokens: NemuTokens;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
};

export const NemuThemeContext = createContext<NemuTheme | null>(null);
