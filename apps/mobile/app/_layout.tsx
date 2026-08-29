import "react-native-gesture-handler";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { MobileErrorBoundaryScreen } from "@/components/MobileErrorBoundaryScreen";
import { MobileWelcomeWizard } from "@/components/MobileWelcomeWizard";
import { MobileDataProvider } from "@/data/mobileData";
import { NemuThemeProvider, useNemuTheme } from "@/design-system";
import { shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import { shouldReserveMobileFloatingTabBarSpace } from "@/lib/mobileFloatingTabBarLayout";
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
  const { height } = useWindowDimensions();
  const [floatingTabBarHeight, setFloatingTabBarHeight] = useState(0);
  const showFloatingTabBar =
    Platform.OS !== "ios" && shouldShowMobileFloatingTabBar(pathname);
  const reserveFloatingTabBarSpace =
    showFloatingTabBar && shouldReserveMobileFloatingTabBarSpace(height);
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
      <View
        style={[
          styles.stack,
          reserveFloatingTabBarSpace && floatingTabBarHeight > 0
            ? { marginBottom: floatingTabBarHeight }
            : null,
        ]}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tokens.background },
            statusBarStyle: scheme === "dark" ? "light" : "dark",
          }}
        />
      </View>
      {showFloatingTabBar ? (
        <FloatingTabBar
          onReservedHeightChange={
            reserveFloatingTabBarSpace ? setFloatingTabBarHeight : undefined
          }
        />
      ) : null}
    </View>
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
            <MobileSyncBridge />
            <MobileBackgroundSyncRegistrar />
            <NemuThemeProvider>
              <RootStack
                welcomeBlocksAccessibility={welcomeBlocksAccessibility}
              />
              <MobileWelcomeWizard
                onVisibilityChange={setWelcomeBlocksAccessibility}
              />
            </NemuThemeProvider>
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
  stack: {
    flex: 1,
  },
});
