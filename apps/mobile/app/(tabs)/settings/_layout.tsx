import { Stack } from "expo-router";
import { createNemuNativeStackScreenOptions, useNemuTheme } from "@/design-system";

// Expo Router layouts can export route config alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = {
  initialRouteName: "index",
};

export default function SettingsLayout() {
  const { tokens } = useNemuTheme();

  return (
    <Stack
      screenOptions={createNemuNativeStackScreenOptions(tokens)}
    />
  );
}
