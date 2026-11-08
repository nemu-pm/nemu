import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";
import {
  watchMobileOAuthSession,
  type MobileOAuthProvider,
} from "./mobileOAuthProvider";

/** No-op with no session open. Android's browser closes itself at the next start. */
export function dismissMobileAuthSession(): void {
  if (Platform.OS !== "ios") return;
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // Nothing is open.
  }
}

/** Runs a redirect sign-in; its browser session cannot outlive the attempt. */
export async function runMobileWebOAuthSession<T>(
  provider: MobileOAuthProvider,
  signIn: () => Promise<T>,
): Promise<T> {
  if (Platform.OS !== "ios") return signIn();
  const stopWatching = watchMobileOAuthSession({
    provider,
    subscribeToAppState: (listener) => {
      const subscription = AppState.addEventListener("change", listener);
      return () => subscription.remove();
    },
    dismiss: dismissMobileAuthSession,
  });
  try {
    return await signIn();
  } finally {
    stopWatching();
  }
}
