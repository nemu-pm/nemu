import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pm.nemu.app",
  appName: "nemu",
  webDir: "dist",
  bundledWebRuntime: false,
  ios: {
    // Native iOS project lives under native/ios/ to keep the repo root tidy.
    path: "native/ios",
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#0a0a0fff",
    scheme: "nemu",
  },
  android: {
    // Native Android project lives under native/android/ for the same reason.
    path: "native/android",
    backgroundColor: "#0a0a0fff",
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      // Keep the splash visible up to 3s OR until React explicitly hides it
      // (whichever comes first). This bridges the "launch storyboard ends but
      // React hasn't loaded library data yet" gap so the user doesn't briefly
      // see the loading skeleton or empty state. native-init.ts hides it on
      // first React paint via SplashScreen.hide().
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#0a0a0f",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0f",
      overlaysWebView: true,
    },
    Keyboard: {
      // "none" prevents the WKWebView frame from shrinking when the keyboard
      // appears. With "native" the webview frame would shrink and the gap
      // between webview bottom and keyboard top showed the native background
      // as a black bar. Instead we use the --keyboard-height CSS variable
      // (set by native-init.ts) to add padding to the active input's
      // scroll container.
      resize: "none",
    },
    // Explicit-only: we call CapacitorHttp via src/lib/native-fetch.ts.
    // Global patching of fetch/XHR is intentionally off to avoid
    // intercepting Convex/internal API calls that need normal webview networking.
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
