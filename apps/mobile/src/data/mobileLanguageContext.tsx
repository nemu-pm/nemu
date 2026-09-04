import { getLocales } from "expo-localization";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { emitMobileDataChanged, useMobileDataRevision } from "./mobileDataEvents";
import { useMobileDataStore } from "./mobileDataContext";
import type { AppLanguage, MetadataLanguagePreference } from "./schema";
import {
  MobileLanguageContext,
  type MobileLanguageSettingsValue,
} from "./mobileLanguageState";
import {
  DEFAULT_APP_LANGUAGE,
  DEFAULT_METADATA_LANGUAGE_PREFERENCE,
  getEffectiveMetadataLanguage,
  normalizeAppLanguage,
  normalizeMetadataLanguagePreference,
  resolveDeviceAppLanguage,
  resolveInitialAppLanguage,
} from "@/lib/mobileLanguageSettings";

let cachedDeviceAppLanguage: AppLanguage | null | undefined;

function readDeviceAppLanguage(): AppLanguage | null {
  if (cachedDeviceAppLanguage !== undefined) return cachedDeviceAppLanguage;
  try {
    cachedDeviceAppLanguage = resolveDeviceAppLanguage(getLocales());
  } catch {
    cachedDeviceAppLanguage = null;
  }
  return cachedDeviceAppLanguage;
}

export function MobileLanguageProvider({ children }: { children: ReactNode }) {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [appLanguage, setAppLanguageState] = useState<AppLanguage>(
    () => readDeviceAppLanguage() ?? DEFAULT_APP_LANGUAGE,
  );
  const [metadataLanguagePreference, setMetadataLanguagePreferenceState] =
    useState<MetadataLanguagePreference>(DEFAULT_METADATA_LANGUAGE_PREFERENCE);

  useEffect(() => {
    let mounted = true;
    void store
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        setAppLanguageState(
          resolveInitialAppLanguage(
            settings.appLanguage,
            readDeviceAppLanguage(),
          ),
        );
        setMetadataLanguagePreferenceState(
          normalizeMetadataLanguagePreference(
            settings.metadataLanguagePreference,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [revision, store]);

  const setAppLanguage = useCallback(
    async (language: AppLanguage) => {
      const nextLanguage = normalizeAppLanguage(language);
      if (nextLanguage === appLanguage) return;
      setAppLanguageState(nextLanguage);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          appLanguage: nextLanguage,
        }));
        emitMobileDataChanged("settings");
      } catch (error) {
        setAppLanguageState(appLanguage);
        throw error;
      }
    },
    [appLanguage, store],
  );

  const setMetadataLanguagePreference = useCallback(
    async (preference: MetadataLanguagePreference) => {
      const nextPreference = normalizeMetadataLanguagePreference(preference);
      if (nextPreference === metadataLanguagePreference) return;
      setMetadataLanguagePreferenceState(nextPreference);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          metadataLanguagePreference: nextPreference,
        }));
        emitMobileDataChanged("settings");
      } catch (error) {
        setMetadataLanguagePreferenceState(metadataLanguagePreference);
        throw error;
      }
    },
    [metadataLanguagePreference, store],
  );

  const value = useMemo<MobileLanguageSettingsValue>(
    () => ({
      appLanguage,
      metadataLanguagePreference,
      effectiveMetadataLanguage: getEffectiveMetadataLanguage(
        metadataLanguagePreference,
        appLanguage,
      ),
      setAppLanguage,
      setMetadataLanguagePreference,
    }),
    [
      appLanguage,
      metadataLanguagePreference,
      setAppLanguage,
      setMetadataLanguagePreference,
    ],
  );

  return (
    <MobileLanguageContext.Provider value={value}>
      {children}
    </MobileLanguageContext.Provider>
  );
}
