import { Stack } from "expo-router";
import { MobileTabBarInsetReporter } from "@/components/MobileTabBarInsetReporter";
import { createNemuNativeStackScreenOptions, useNemuTheme } from "@/design-system";
import { createMobileTabStackAnchorListeners } from "@/lib/mobileTabStackAnchor";
import {
  isMobileSettingsRestoredPush,
  MOBILE_SETTINGS_ACCOUNT_ROUTE,
  MOBILE_SETTINGS_SECTION_ROUTE,
} from "@/lib/mobileSettingsSplit";

// Expo Router layouts can export route config alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = {
  anchor: "index",
};

// Keeps `index` beneath whatever this stack was created with, so the native
// Back button and tab reselection always lead back to the tab's root.
const anchorListeners = createMobileTabStackAnchorListeners();

export default function SettingsLayout() {
  const { tokens } = useNemuTheme();

  return (
    <>
      {/* Measures the native tab bar for app-wide overlays (toast). */}
      <MobileTabBarInsetReporter />
      <Stack
        screenListeners={anchorListeners}
        screenOptions={createNemuNativeStackScreenOptions(tokens)}
      >
        {/* A section the split showed, pushed as it collapses to one column
            (`SettingsScreen`): already on screen, so no push animation, also
            when it replaces the top route. The route clears the param once in
            place, and its pop and edge swipe are the system's again. */}
        <Stack.Screen
          name={MOBILE_SETTINGS_SECTION_ROUTE}
          options={({ route }: { route: { params?: object } }) =>
            isMobileSettingsRestoredPush(route.params)
              ? { animation: "none" as const, animationTypeForReplace: "push" as const }
              : {}}
        />
        {/* Account, kept through a collapse the same way. */}
        <Stack.Screen
          name={MOBILE_SETTINGS_ACCOUNT_ROUTE}
          options={({ route }: { route: { params?: object } }) =>
            isMobileSettingsRestoredPush(route.params)
              ? { animation: "none" as const, animationTypeForReplace: "push" as const }
              : {}}
        />
      </Stack>
    </>
  );
}
