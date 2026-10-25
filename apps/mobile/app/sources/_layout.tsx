import { useMemo } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useSegments } from "expo-router";
import {
  createNemuNativeStackScreenOptions,
  createNemuNavigationTheme,
  useNemuTheme,
} from "@/design-system";
import { useMobileAdaptiveLayout, useMobileObservedWindowLayout } from "@/lib/MobileWindowLayoutContext";
import {
  mobileReaderPageBackgroundColor,
  mobileReaderPageBackgroundIsLight,
} from "@/lib/mobileReaderPageBackground";
import { mobileReaderVerticalBarPolicy } from "@/lib/mobileReaderPoseLayout";
import { useReaderPagePrefs } from "@/components/reader/useReaderPagePrefs";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
  mobileSourcesStackContainerBackground,
} from "@/lib/mobileReaderRouteOptions";

export default function SourcesLayout() {
  const { scheme, tokens } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  // The reader opts out of the vertical bar on the inner display full-screen
  // (its route holds the opt-out from the push): no header there, as the
  // reader itself sets, so its first options change nothing.
  const readerVerticalBarOptOut = mobileReaderVerticalBarPolicy(useMobileObservedWindowLayout() ?? {}).optOut;
  // The reader's page background from its very first frame (a chapter
  // switch animates the next reader in as a rounded card: never black
  // corners over a white reader).
  const { pageBackground } = useReaderPagePrefs();
  const readerBackgroundColor = mobileReaderPageBackgroundColor(pageBackground);
  // The stack's own container shows at that card's corners: it takes the
  // theme's background, the reader's while a reader is on top.
  const segments = useSegments();
  const containerBackgroundColor = mobileSourcesStackContainerBackground({
    segments,
    readerBackgroundColor,
    appBackgroundColor: tokens.background,
  });
  const navigationTheme = useMemo(
    () =>
      createNemuNavigationTheme(
        scheme === "dark" ? DarkTheme : DefaultTheme,
        tokens,
        containerBackgroundColor,
      ),
    [containerBackgroundColor, scheme, tokens],
  );
  return (
    <ThemeProvider value={navigationTheme}>
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
            headerShown: Boolean(verticalBarSide) && !readerVerticalBarOptOut,
            // The status bar shows / hides with the reader's controls: always
            // a fade, never a slide (the reader sets the same, see
            // mobileReaderScreenOptions; this covers its first frames).
            statusBarAnimation: "fade",
            // The values the reader opens with (controls shown; glyphs for
            // the page background, see mobileReaderScreenOptions), so its
            // first options re-apply the status bar unchanged.
            statusBarHidden: false,
            statusBarStyle: mobileReaderPageBackgroundIsLight(readerBackgroundColor) ? "dark" : "light",
            headerBackVisible: false,
            title: "",
            contentStyle: { backgroundColor: readerBackgroundColor },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
