import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { Stack } from "expo-router";
import { MobileTabBarInsetReporter } from "@/components/MobileTabBarInsetReporter";
import { createNemuNativeStackScreenOptions, useNemuTheme } from "@/design-system";
import { createMobileTabStackAnchorListeners } from "@/lib/mobileTabStackAnchor";

// Expo Router layouts can export route config alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = {
  anchor: "index",
};

// Keeps `index` beneath whatever this stack was created with, so the native
// Back button and tab reselection always lead back to the tab's root.
const anchorListeners = createMobileTabStackAnchorListeners();

export default function LibraryLayout() {
  const { tokens } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();

  return (
    <>
      {/* Measures the native tab bar for app-wide overlays (toast). */}
      <MobileTabBarInsetReporter />
      <Stack
        screenListeners={anchorListeners}
        screenOptions={createNemuNativeStackScreenOptions(tokens, verticalBarSide)}
      >
      </Stack>
    </>
  );
}
