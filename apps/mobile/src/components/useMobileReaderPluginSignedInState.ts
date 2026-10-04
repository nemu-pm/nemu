import { useMemo } from "react";
import type { MobileStrings } from "@/lib/mobileI18n";
import { useMobileJapaneseLearningSignedIn } from "@/lib/mobileJapaneseLearningAuth";
import {
  applyMobileReaderPluginSignInState,
  type MobileReaderPluginState,
} from "@/lib/mobileReaderPlugins";

/** The plugin with server-only settings locked while signed out. */
export function useMobileReaderPluginSignedInState(
  storedPlugin: MobileReaderPluginState,
  strings: MobileStrings,
): MobileReaderPluginState {
  const signedIn = useMobileJapaneseLearningSignedIn();
  return useMemo(
    () => applyMobileReaderPluginSignInState(storedPlugin, signedIn, strings),
    [signedIn, storedPlugin, strings],
  );
}
