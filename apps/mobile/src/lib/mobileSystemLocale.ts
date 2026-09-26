import { getLocales } from "expo-localization";
import { firstMobileSystemLocale } from "./mobileErrorBoundary";

/**
 * The device's primary locale tag, for the screens that render before (or
 * without) the app language context: the error boundary and the pending-data
 * cleanup gate.
 *
 * `Intl` answers on iOS. Android's JavaScriptCore is built without ICU and has
 * no `Intl` global at all, so those screens always fell back to English there;
 * `expo-localization` reads the same tag from the platform instead.
 */
export function mobileSystemLocale(): string | undefined {
  return firstMobileSystemLocale([
    () => Intl.DateTimeFormat().resolvedOptions().locale,
    () => getLocales()[0]?.languageTag,
  ]);
}
