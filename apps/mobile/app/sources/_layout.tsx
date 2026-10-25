import { Stack } from "expo-router";
import { createNemuNativeStackScreenOptions, useNemuTheme } from "@/design-system";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { mobileReaderPageBackgroundColor } from "@/lib/mobileReaderPageBackground";
import { useReaderPagePrefs } from "@/components/reader/useReaderPagePrefs";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
} from "@/lib/mobileReaderRouteOptions";

export default function SourcesLayout() {
  const { tokens } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  // The reader's page background from its very first frame (a chapter
  // switch animates the next reader in as a rounded card: never black
  // corners over a white reader).
  const { pageBackground } = useReaderPagePrefs();
  const readerBackgroundColor = mobileReaderPageBackgroundColor(pageBackground);
  return (
    <Stack
      screenOptions={{
        ...createNemuNativeStackScreenOptions(tokens, verticalBarSide),
        // Full-screen back swipe on manga detail like everywhere else; the
        // reader route below is the only screen without a pop gesture.
        ...MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
      }}
    >
      {/* Declared statically: options set from inside the reader only reach
          the native screen after it has mounted, so the pop gesture would be
          live for the first frames of every chapter. */}
      <Stack.Screen
        name={MOBILE_READER_ROUTE_NAME}
        options={{
          ...MOBILE_READER_STACK_GESTURE_OPTIONS,
          // Match the reader before its component mounts, including Duo's
          // persistent rail. UIKit can then transition the bar with the page.
          headerShown: Boolean(verticalBarSide),
          // The status bar shows / hides with the reader's controls: always
          // a fade, never a slide (the reader sets the same, see
          // mobileReaderScreenOptions; this covers its first frames).
          statusBarAnimation: "fade",
          headerBackVisible: false,
          title: "",
          contentStyle: { backgroundColor: readerBackgroundColor },
        }}
      />
    </Stack>
  );
}
