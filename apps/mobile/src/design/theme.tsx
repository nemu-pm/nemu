import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useMobileDataStore } from "@/data/mobileDataContext";
import type { ThemePreference } from "@/data/schema";
import {
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
} from "@/lib/mobileThemeSettings";
import { nemuTokens, type NemuColorScheme, type NemuTokens } from "./tokens";
import { NemuThemeContext } from "./themeContext";

type NemuTheme = {
  scheme: NemuColorScheme;
  themePreference: ThemePreference;
  tokens: NemuTokens;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
};

export function NemuThemeProvider({ children }: { children: ReactNode }) {
  const store = useMobileDataStore();
  const colorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE
  );
  const systemScheme: NemuColorScheme = colorScheme === "dark" ? "dark" : "light";
  const scheme: NemuColorScheme =
    themePreference === "system" ? systemScheme : themePreference;

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        setThemePreferenceState(normalizeThemePreference(settings.themePreference));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [store]);

  const setThemePreference = useCallback(
    async (preference: ThemePreference) => {
      const nextPreference = normalizeThemePreference(preference);
      if (nextPreference === themePreference) return;
      setThemePreferenceState(nextPreference);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          themePreference: nextPreference,
        }));
      } catch (error) {
        setThemePreferenceState(themePreference);
        throw error;
      }
    },
    [store, themePreference]
  );

  const value = useMemo<NemuTheme>(
    () => ({
      scheme,
      themePreference,
      tokens: nemuTokens[scheme],
      setThemePreference,
    }),
    [scheme, setThemePreference, themePreference]
  );

  return (
    <NemuThemeContext.Provider value={value}>
      {children}
    </NemuThemeContext.Provider>
  );
}
