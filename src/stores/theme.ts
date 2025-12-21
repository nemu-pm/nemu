import { create, type StoreApi, type UseBoundStore } from "zustand";

const THEME_KEY = "nemu:theme";

export type Theme = "system" | "light" | "dark";

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "system" || stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export type ThemeStore = UseBoundStore<StoreApi<ThemeState>>;

export function createThemeStore(): ThemeStore {
  const stored = getStoredTheme();
  const defaultTheme: Theme = stored ?? "system";
  
  return create<ThemeState>((set) => ({
    theme: defaultTheme,
    
    setTheme: (theme) => {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Ignore localStorage errors
      }
      set({ theme });
    },
  }));
}

// Singleton instance
export const themeStore = typeof window !== "undefined" ? createThemeStore() : null;

