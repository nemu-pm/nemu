import { createContext, useContext } from "react";
import type { AppLanguage, MetadataLanguagePreference } from "./schema";

export type MobileLanguageSettingsValue = {
  appLanguage: AppLanguage;
  metadataLanguagePreference: MetadataLanguagePreference;
  effectiveMetadataLanguage: AppLanguage;
  setAppLanguage: (language: AppLanguage) => Promise<void>;
  setMetadataLanguagePreference: (
    preference: MetadataLanguagePreference,
  ) => Promise<void>;
};

export const MobileLanguageContext =
  createContext<MobileLanguageSettingsValue | null>(null);

export function useMobileLanguageContext(): MobileLanguageSettingsValue {
  const value = useContext(MobileLanguageContext);
  if (!value) {
    throw new Error(
      "useMobileLanguageSettings must be used inside MobileLanguageProvider.",
    );
  }
  return value;
}
