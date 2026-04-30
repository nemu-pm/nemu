import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pm.nemu.app",
  appName: "nemu",
  webDir: "dist",
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
      // Color-only splash, no icon, theme-adaptive.
      // - iOS: LaunchScreen.storyboard renders a SplashBackground named
      //   color (light = #fafaf7 / dark = #0a0a0f) matching index.css.
      // - Android: Theme.SplashScreen uses @color/splash_background
      //   defined in values/ + values-night/ for the same adaptation.
      // The Capacitor plugin's overlay is suppressed by setting
      // launchShowDuration to 0; the OS-level launch screen does the
      // brief flash, then index.html's pre-mount script paints the same
      // color before React mounts, so the handoff is invisible.
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
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
