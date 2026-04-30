/**
 * One-time native platform setup.
 *
 * Configures status bar, dismisses splash screen, and wires keyboard
 * behavior so the webview content sizing matches Capacitor expectations.
 *
 * Safe to import on web — every entry point is gated by Capacitor.isNativePlatform().
 */
import { Capacitor } from "@capacitor/core";
import { themeStore, type Theme } from "@/stores/theme";

let initialized = false;
const listenerHandles: { remove(): void }[] = [];

// Resolve a Theme value to the boolean "the visible UI is dark right now".
function resolveIsDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export async function initNative(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!Capacitor.isNativePlatform()) return;

  // Mark <html> so CSS can target the native shell (e.g. dvh fallback).
  document.documentElement.classList.add("capacitor-native");
  document.documentElement.classList.add(`capacitor-${Capacitor.getPlatform()}`);

  // Lazy-import the plugins so the web bundle doesn't pull them in on web.
  const [
    { StatusBar, Style },
    { SplashScreen },
    { Keyboard },
    { App },
  ] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/keyboard"),
    import("@capacitor/app"),
  ]);

  try {
    // Overlay the webview so layout uses safe-area insets. Style is then
    // kept in sync with the active theme via the subscription below.
    await StatusBar.setOverlaysWebView({ overlay: true });
    const applyStyle = async (isDark: boolean) => {
      try {
        // iOS naming is inverted: Style.Dark = "background is dark" (light/white text),
        // Style.Light = "background is light" (dark/black text).
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({
            color: isDark ? "#0a0a0f" : "#fafaf7",
          });
        }
      } catch (e) {
        console.warn("[native] StatusBar.setStyle failed", e);
      }
    };
    // Initial application from the current theme.
    const initialTheme = themeStore?.getState().theme ?? "system";
    await applyStyle(resolveIsDark(initialTheme));
    // Re-apply on user theme change. Capture the unsubscribe so HMR cleanup
    // tears it down — otherwise hot-reloads stack a new subscriber every cycle.
    const unsubscribeTheme = themeStore?.subscribe((s) => {
      void applyStyle(resolveIsDark(s.theme));
    });
    if (unsubscribeTheme) {
      listenerHandles.push({ remove: unsubscribeTheme });
    }
    // Re-apply on system appearance change when in "system" mode. Same HMR
    // hygiene: register a remover so we don't leak listeners across reloads.
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onSystemChange = () => {
        const t = themeStore?.getState().theme ?? "system";
        if (t === "system") void applyStyle(resolveIsDark(t));
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", onSystemChange);
        listenerHandles.push({
          remove: () => mq.removeEventListener("change", onSystemChange),
        });
      } else {
        mq.addListener(onSystemChange);
        listenerHandles.push({
          remove: () => mq.removeListener(onSystemChange),
        });
      }
    }
  } catch (e) {
    console.warn("[native] StatusBar setup failed", e);
  }

  try {
    // launchShowDuration is 0 in capacitor.config.ts, so this is mostly a
    // safety net — quick fade keeps the handoff visually smooth.
    await SplashScreen.hide({ fadeOutDuration: 150 });
  } catch (e) {
    console.warn("[native] SplashScreen.hide failed", e);
  }

  // Sets a CSS var so layouts can reserve space when the keyboard is up.
  try {
    listenerHandles.push(
      await Keyboard.addListener("keyboardWillShow", (info) => {
        document.documentElement.style.setProperty(
          "--keyboard-height",
          `${info.keyboardHeight}px`,
        );
      }),
    );
    listenerHandles.push(
      await Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.style.setProperty("--keyboard-height", "0px");
      }),
    );
  } catch (e) {
    console.warn("[native] Keyboard listeners failed", e);
  }

  // Hardware back button on Android: pop the router stack, exit at root.
  if (Capacitor.getPlatform() === "android") {
    try {
      listenerHandles.push(
        await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        }),
      );
    } catch (e) {
      console.warn("[native] backButton listener failed", e);
    }
  }

  // Deep-link handler — enables OAuth callback to return into the app via
  // the `nemu://` URL scheme registered in Info.plist. The auth flow opens
  // the OAuth URL in SFSafariViewController via @capacitor/browser; the
  // provider redirects back to e.g. `nemu://auth/callback?ott=<token>`,
  // iOS opens the app, this listener receives the URL, the SPA picks up the
  // one-time token, and the in-app browser is closed.
  try {
    listenerHandles.push(
      await App.addListener("appUrlOpen", async (event) => {
        try {
          const url = new URL(event.url);
          // Only handle nemu:// deep-links; ignore any other scheme.
          if (url.protocol !== "nemu:") return;
          // Only handle auth callbacks; ignore other nemu:// hosts.
          if (url.hostname !== "auth") return;
          // Strip the scheme so router can navigate to the path component.
          const path = url.pathname + url.search + url.hash;
          // Auth callbacks: hand the URL back to the SPA via a custom event so
          // the sign-in flow can inspect it without coupling to native code.
          window.dispatchEvent(new CustomEvent("nemu:deep-link", { detail: { path, url: event.url } }));
          // Close the in-app browser if it was opened for OAuth.
          try {
            const { Browser } = await import("@capacitor/browser");
            await Browser.close();
          } catch { /* not open / not available */ }
        } catch (e) {
          console.warn("[native] appUrlOpen handler failed", e);
        }
      }),
    );
  } catch (e) {
    console.warn("[native] appUrlOpen listener failed", e);
  }
}

// HMR cleanup: remove all native listeners so they aren't duplicated on hot reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const handle of listenerHandles) {
      try { handle.remove(); } catch { /* already removed */ }
    }
    listenerHandles.length = 0;
    initialized = false;
  });
}
