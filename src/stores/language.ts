import { create, type StoreApi, type UseBoundStore } from "zustand";

const LANGUAGE_KEY = "nemu:language";

export type Language = "en" | "zh";

function getBrowserLanguage(): Language {
  if (typeof window === "undefined") return "en";
  
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === "en" || stored === "zh") {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export type LanguageStore = UseBoundStore<StoreApi<LanguageState>>;

export function createLanguageStore(): LanguageStore {
  const stored = getStoredLanguage();
  const defaultLang = stored ?? getBrowserLanguage();
  
  return create<LanguageState>((set) => ({
    language: defaultLang,
    
    setLanguage: (lang) => {
      try {
        localStorage.setItem(LANGUAGE_KEY, lang);
      } catch {
        // Ignore localStorage errors
      }
      set({ language: lang });
    },
  }));
}

// Singleton instance
export const languageStore = typeof window !== "undefined" ? createLanguageStore() : null;

