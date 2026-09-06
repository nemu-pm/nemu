import "react-native-gesture-handler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  type ErrorBoundaryProps,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { MobileErrorBoundaryScreen } from "@/components/MobileErrorBoundaryScreen";
import { MobileFeedbackSettingsBridge } from "@/components/MobileFeedbackSettingsBridge";
import { MobileSyncProgressToast } from "@/components/MobileSyncProgressToast";
import { MobileToastProvider } from "@/components/MobileToast";
import { MobileWelcomeWizard } from "@/components/MobileWelcomeWizard";
import { MobileDataProvider } from "@/data/mobileData";
import { MobileLanguageProvider } from "@/data/mobileLanguageContext";
import { NemuThemeProvider, useNemuTheme } from "@/design-system";
import { MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS } from "@/lib/mobileReaderRouteOptions";
import { shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import { getMobileWelcomeUnderlyingContentState } from "@/lib/mobileWelcome";
import {
  MobileSyncBridge,
  MobileSyncProvider,
} from "@/sync/MobileSyncProvider";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { useMobileBackgroundSync } from "@/sync/useMobileBackgroundSync";
import { shouldHideMobileSplashScreen } from "@/lib/mobileSplashScreen";
import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
} from "@/lib/mobilePerformance";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootRootModule);
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootFontsReady, {
  status: Platform.OS === "web" ? "system-fallback" : "native-embedded",
});

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <MobileErrorBoundaryScreen {...props} />;
}

function ConfiguredBackgroundSyncRegistrar() {
  useMobileBackgroundSync();
  return null;
}

function MobileBackgroundSyncRegistrar() {
  // useMobileBackgroundSync calls useConvexAuth, which throws unless
  // MobileSyncProvider mounted a Convex provider — it renders bare children
  // when sync is unconfigured (e.g. a build without EXPO_PUBLIC_CONVEX_URL),
  // and the app must still boot local-only in that case.
  if (!mobileSyncConfig.configured) return null;
  return <ConfiguredBackgroundSyncRegistrar />;
}

function RootStack({
  welcomeBlocksAccessibility,
}: {
  welcomeBlocksAccessibility: boolean;
}) {
  const { scheme, tokens } = useNemuTheme();
  const pathname = usePathname();
  const navigationTheme = useMemo(() => {
    const baseTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: tokens.primary,
        background: tokens.background,
        card: tokens.background,
        text: tokens.foreground,
        border: tokens.border,
        notification: tokens.danger,
      },
    };
  }, [scheme, tokens]);
  const underlyingContentState = getMobileWelcomeUnderlyingContentState(
    welcomeBlocksAccessibility,
  );
  const splashHiddenRef = useRef(false);
  const rootLayoutMarkedRef = useRef(false);
  const lastPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.routeChange, { pathname });
  }, [pathname]);
  const hideSplashAfterLayout = useCallback(() => {
    if (!rootLayoutMarkedRef.current) {
      rootLayoutMarkedRef.current = true;
      markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootRootLayout);
    }
    if (
      !shouldHideMobileSplashScreen({
        rootLaidOut: true,
        splashHidden: splashHiddenRef.current,
      })
    ) {
      return;
    }

    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {
      splashHiddenRef.current = false;
    });
  }, []);

  return (
    <ThemeProvider value={navigationTheme}>
      <View
        accessibilityElementsHidden={
          underlyingContentState.accessibilityElementsHidden
        }
        aria-hidden={underlyingContentState.ariaHidden}
        importantForAccessibility={
          underlyingContentState.importantForAccessibility
        }
        onLayout={hideSplashAfterLayout}
        pointerEvents={underlyingContentState.pointerEvents}
        style={[styles.root, { backgroundColor: tokens.background }]}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tokens.background },
            statusBarStyle: scheme === "dark" ? "light" : "dark",
            // The root stack hosts the whole sources flow (manga detail and
            // reader) in one screen. iOS 26 turns the native full-screen
            // content-pop gesture on by default, so without this a horizontal
            // drag anywhere — including a reader page turn or a scrub — pops
            // straight out of the flow. Edge-swipe back is unaffected.
            ...MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS,
          }}
        />
        {Platform.OS !== "ios" && shouldShowMobileFloatingTabBar(pathname) ? (
          <FloatingTabBar />
        ) : null}
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [welcomeBlocksAccessibility, setWelcomeBlocksAccessibility] =
    useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileSyncProvider>
          <MobileDataProvider>
            <MobileLanguageProvider>
              <MobileSyncBridge />
              <MobileFeedbackSettingsBridge />
              <MobileBackgroundSyncRegistrar />
              <NemuThemeProvider>
                <MobileToastProvider>
                  <RootStack
                    welcomeBlocksAccessibility={welcomeBlocksAccessibility}
                  />
                  <MobileSyncProgressToast />
                  <MobileWelcomeWizard
                    onVisibilityChange={setWelcomeBlocksAccessibility}
                  />
                </MobileToastProvider>
              </NemuThemeProvider>
            </MobileLanguageProvider>
          </MobileDataProvider>
        </MobileSyncProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
