import { ConvexHttpClient } from "convex/browser";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";
import { api } from "../../../../convex/_generated/api";
import { mobileAuthClient } from "./mobileAuthClient";
import {
  isMobileAppleSignInCancel,
  isMobileNativeAppleReady,
  runMobileNativeAppleSignIn,
  watchMobileOAuthSession,
  withMobileAuthDeadline,
  type MobileAppleCredential,
  type MobileOAuthProvider,
} from "./mobileOAuthProvider";
import { mobileSyncConfig } from "./mobileSyncConfig";

const READINESS_LOOKUP_MAX_MS = 3000;
const READINESS_TTL_MS = 5 * 60 * 1000;

let readiness: { lookup: Promise<boolean>; at: number } | null = null;

async function lookUpBackendReadiness(): Promise<boolean> {
  if (!mobileSyncConfig.convexUrl) return false;
  // A backend without this query rejects it, which also reads as not ready.
  const capabilities = await new ConvexHttpClient(mobileSyncConfig.convexUrl, {
    logger: false,
  }).query(api.auth.getSignInCapabilities, {});
  return isMobileNativeAppleReady(
    capabilities.nativeAppleBundleId,
    Constants.expoConfig?.ios?.bundleIdentifier,
  );
}

function isBackendReady(): Promise<boolean> {
  if (Platform.OS !== "ios") return Promise.resolve(false);
  if (!readiness || Date.now() - readiness.at > READINESS_TTL_MS) {
    readiness = {
      at: Date.now(),
      lookup: withMobileAuthDeadline(
        lookUpBackendReadiness(),
        READINESS_LOOKUP_MAX_MS,
        false,
      ).catch(() => false),
    };
  }
  return readiness.lookup;
}

/** Resolves the capability before the tap, so that it costs the tap no time. */
export function prefetchMobileNativeAppleReadiness(): void {
  void isBackendReady();
}

async function requestCredential(nonce?: string): Promise<MobileAppleCredential> {
  // Loaded on use: JS can run on a binary built before the pod was added.
  const AppleAuthentication = await import("expo-apple-authentication");
  return AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    ...(nonce ? { nonce } : {}),
  });
}

export function signInWithMobileNativeApple() {
  return runMobileNativeAppleSignIn({
    isBackendReady,
    isAvailable: async () => {
      const AppleAuthentication = await import("expo-apple-authentication");
      return AppleAuthentication.isAvailableAsync();
    },
    createNonce: () => Crypto.randomUUID(),
    hashNonce: (nonce) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
    requestCredential,
    signInWithIdToken: (idToken) =>
      mobileAuthClient.signIn.social({ provider: "apple", idToken }),
  });
}

/**
 * The fresh authorizationCode account deletion needs from an account the server
 * holds no Apple token for. The server exchanges it with the bundle id client.
 */
export const requestMobileAppleAuthorizationCode:
  | (() => Promise<string | null>)
  | null =
  Platform.OS === "ios"
    ? async () => {
        try {
          return (await requestCredential()).authorizationCode;
        } catch (error) {
          if (isMobileAppleSignInCancel(error)) return null;
          throw error;
        }
      }
    : null;

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
