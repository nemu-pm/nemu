/**
 * Metadata language preference store
 * 
 * Controls what language metadata (title, authors, description, tags) 
 * should be displayed in the UI.
 */
import { create, type StoreApi, type UseBoundStore } from "zustand";

const STORAGE_KEY = "nemu:metadata-language";

export type MetadataLanguage = "auto" | "en" | "ja" | "zh";

function getStoredLanguage(): MetadataLanguage {
  if (typeof window === "undefined") return "auto";
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "auto" || stored === "en" || stored === "ja" || stored === "zh") {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return "auto";
}

interface MetadataLanguageState {
  /** User's preference: "auto" follows app language, or explicit en/ja/zh */
  preference: MetadataLanguage;
  setPreference: (lang: MetadataLanguage) => void;
}

export type MetadataLanguageStore = UseBoundStore<StoreApi<MetadataLanguageState>>;

export function createMetadataLanguageStore(): MetadataLanguageStore {
  return create<MetadataLanguageState>((set) => ({
    preference: getStoredLanguage(),
    
    setPreference: (lang) => {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // Ignore localStorage errors
      }
      set({ preference: lang });
    },
  }));
}

// Singleton instance
export const metadataLanguageStore = typeof window !== "undefined" 
  ? createMetadataLanguageStore() 
  : null;

/**
 * Get the effective metadata language.
 * If preference is "auto", resolve using the app language.
 */
export function getEffectiveMetadataLanguage(
  preference: MetadataLanguage,
  appLanguage: "en" | "ja" | "zh"
): "en" | "ja" | "zh" {
  return preference === "auto" ? appLanguage : preference;
}

