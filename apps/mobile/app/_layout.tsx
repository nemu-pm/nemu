import "react-native-gesture-handler";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useNavigationContainerRef,
  usePathname,
  type ErrorBoundaryProps,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { MobileErrorBoundaryScreen } from "@/components/MobileErrorBoundaryScreen";
import { MobileFeedbackSettingsBridge } from "@/components/MobileFeedbackSettingsBridge";
import { MobileLocalNetworkAllowanceBridge } from "@/components/MobileLocalNetworkAllowanceBridge";
import { MobileJapaneseLearningQaDemoLauncher } from "@/components/MobileJapaneseLearningQaDemoLauncher";
import { MobileScrollEdgeEffectHost } from "@/components/MobileScrollEdgeEffectHost";
import { MobileSourceDirectoryLinkHandler } from "@/components/MobileSourceDirectoryLinkHandler";
import { MobileSyncProgressToast } from "@/components/MobileSyncProgressToast";
import { MobileToastProvider } from "@/components/MobileToast";
import { MobileAiConsentHost } from "@/components/MobileAiConsentHost";
import { MobileWelcomeWizard } from "@/components/MobileWelcomeWizard";
import { MobileDataProvider } from "@/data/mobileData";
import { MobileLanguageProvider } from "@/data/mobileLanguageContext";
import { NemuThemeProvider, createNemuNavigationTheme, useNemuTheme } from "@/design-system";
import { MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS } from "@/lib/mobileReaderRouteOptions";
import { shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import {
  registerMobileRootNavigation,
  type MobileNavigationState,
} from "@/lib/mobileRootTabNavigation";
import { getMobileWelcomeUnderlyingContentState } from "@/lib/mobileWelcome";
import {
  MobileSyncBridge,
  MobileSyncProvider,
} from "@/sync/MobileSyncProvider";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { MobileWindowLayoutProvider } from "@/lib/MobileWindowLayoutContext";
import { MobileOrientationController } from "@/components/MobileOrientationController";
import { MobilePoseTransitionProvider } from "@/lib/MobilePoseTransitionContext";
import { useMobileBackgroundSync } from "@/sync/useMobileBackgroundSync";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { installMobileSystemTransition } from "@/lib/mobileTransitionTiming";
import {
  claimMobileSplashHide,
  isMobileLaunchContentReady,
  markMobileLaunchContentReady,
  registerMobileSplashForceHide,
  releaseMobileSplashHideClaim,
  shouldHideMobileSplashScreen,
  startMobileSplashSafetyCap,
  subscribeMobileLaunchContentReady,
} from "@/lib/mobileSplashScreen";
import { isMobileLibraryRoute } from "@/lib/mobileRootTabs";
import { hideMobileLaunchScreenWithReveal } from "@/lib/mobileLaunchReveal";
import {
  markMobileLaunchSourceWorkRevealed,
  waitForMobileLaunchSourceWork,
} from "@/lib/mobileLaunchSourceWork";
import { scheduleMobileIdleTask } from "@/lib/mobileIdleTask";
import { endNativeBinaryCacheLaunchIndexDeferral } from "@/data/nativeCache";
import { mobileAidokuPrewarmRootTouchProps } from "@/lib/useMobileAidokuSandboxPrewarm";
import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
} from "@/lib/mobilePerformance";

installMobileSystemTransition(mobileDesignExploreFlag);
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootRootModule);
// The entry already started the cap (a no-op here unless it did not). When it
// expires before the root stack has taken over the hide (the providers above
// it are still loading), the launch screen lifts without the reveal.
startMobileSplashSafetyCap();
registerMobileSplashForceHide(() => {
  markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootSplashHidden, { forced: true });
  void SplashScreen.hideAsync()
    .catch(() => undefined)
    .then(markMobileLaunchSourceWorkRevealed);
});
// The cover cache's first directory index waits until the launch has settled
// (nativeCache.native.ts), then runs at the next idle period.
void waitForMobileLaunchSourceWork().then(() => {
  scheduleMobileIdleTask(endNativeBinaryCacheLaunchIndexDeferral, { timeout: 2000 });
});
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
  const { scheme, tokens, reduceMotion } = useNemuTheme();
  const pathname = usePathname();
  // Read when the launch screen hides (a callback with no dependencies).
  const revealContextRef = useRef({ pathname, background: tokens.background, reduceMotion: reduceMotion === true });
  useLayoutEffect(() => {
    revealContextRef.current = { pathname, background: tokens.background, reduceMotion: reduceMotion === true };
  });
  const navigationTheme = useMemo(
    () => createNemuNavigationTheme(scheme === "dark" ? DarkTheme : DefaultTheme, tokens),
    [scheme, tokens],
  );
  const underlyingContentState = getMobileWelcomeUnderlyingContentState(
    welcomeBlocksAccessibility,
  );
  // Lets tab-root deep links (`+native-intent`) and the Android tab bar read
  // the navigation tree and wait for their own navigation to land.
  const navigationContainerRef = useNavigationContainerRef();
  useEffect(
    () =>
      registerMobileRootNavigation({
        getRootState: () =>
          navigationContainerRef.isReady()
            ? (navigationContainerRef.getRootState() as MobileNavigationState)
            : undefined,
        onNextState: (listener) => {
          let settled = false;
          let unsubscribe: () => void = () => undefined;
          const expire = setTimeout(() => {
            settled = true;
            unsubscribe();
          }, 1500);
          unsubscribe = navigationContainerRef.addListener("state", () => {
            if (settled) return;
            settled = true;
            clearTimeout(expire);
            unsubscribe();
            listener();
          });
        },
      }),
    [navigationContainerRef],
  );
  const splashHiddenRef = useRef(false);
  const rootLayoutMarkedRef = useRef(false);
  const lastPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.routeChange, { pathname });
  }, [pathname]);
  const hideSplashIfReady = useCallback(() => {
    if (
      !shouldHideMobileSplashScreen({
        rootLaidOut: rootLayoutMarkedRef.current,
        splashHidden: splashHiddenRef.current,
        contentReady: isMobileLaunchContentReady(),
      })
    ) {
      return;
    }

    splashHiddenRef.current = true;
    // The safety cap already lifted the launch screen: nothing to reveal.
    if (!claimMobileSplashHide()) return;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootSplashHidden);
    const reveal = revealContextRef.current;
    // The reveal hook: the window's start state is set under the launch
    // screen, then it hides and the reveal runs (see mobileLaunchReveal.ts).
    void hideMobileLaunchScreenWithReveal({
      libraryRoute: isMobileLibraryRoute(reveal.pathname),
      reduceMotion: reveal.reduceMotion,
      background: reveal.background,
      hideSplash: () => SplashScreen.hideAsync(),
    }).then(markMobileLaunchSourceWorkRevealed, () => {
      splashHiddenRef.current = false;
      releaseMobileSplashHideClaim();
    });
  }, []);
  const hideSplashAfterLayout = useCallback(() => {
    if (!rootLayoutMarkedRef.current) {
      rootLayoutMarkedRef.current = true;
      markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootRootLayout);
    }
    hideSplashIfReady();
  }, [hideSplashIfReady]);
  // The launch screen holds until the Library shows its first local snapshot
  // (LibraryScreen marks it), so the first visible frame is the final layout
  // with data: no blank page, no skeleton swapped for content. A launch into
  // any other screen (a deep link) has nothing to wait for; a stuck read is
  // capped from JS start (startMobileSplashSafetyCap). Never waits on the
  // network.
  useEffect(() => {
    if (!isMobileLibraryRoute(pathname)) markMobileLaunchContentReady();
  }, [pathname]);
  useEffect(() => {
    const unsubscribe = subscribeMobileLaunchContentReady(hideSplashIfReady);
    hideSplashIfReady();
    return unsubscribe;
  }, [hideSplashIfReady]);

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
        // The Aidoku pre-warm's idle check (nothing while it is off).
        {...mobileAidokuPrewarmRootTouchProps}
        style={[styles.root, { backgroundColor: tokens.background }]}
      >
        <MobileScrollEdgeEffectHost>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tokens.background },
              statusBarStyle: scheme === "dark" ? "light" : "dark",
              // iOS 26 full-screen back swipe stays on app-wide. The reader
              // alone opts out: it locks this stack's gesture options while it
              // is mounted (see acquireMobileReaderHostGestureLock), because
              // the whole sources flow is one screen here.
              ...MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
            }}
          />
        </MobileScrollEdgeEffectHost>
        <MobileJapaneseLearningQaDemoLauncher />
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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <MobileSyncProvider>
          <MobileDataProvider>
            <MobileLanguageProvider>
              <MobileSyncBridge />
              <MobileFeedbackSettingsBridge />
              <MobileLocalNetworkAllowanceBridge />
              <MobileBackgroundSyncRegistrar />
              <NemuThemeProvider>
                <MobileWindowLayoutProvider>
                  <MobileOrientationController />
                  {/* Pose-change motion + the root pose veil (drawn above everything below). */}
                  <MobilePoseTransitionProvider>
                    <MobileToastProvider>
                      <RootStack
                        welcomeBlocksAccessibility={welcomeBlocksAccessibility}
                      />
                      <MobileSyncProgressToast />
                      <MobileSourceDirectoryLinkHandler />
                      <MobileAiConsentHost />
                      <MobileWelcomeWizard
                        onVisibilityChange={setWelcomeBlocksAccessibility}
                      />
                    </MobileToastProvider>
                  </MobilePoseTransitionProvider>
                </MobileWindowLayoutProvider>
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
