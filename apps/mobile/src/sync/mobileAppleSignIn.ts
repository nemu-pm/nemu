// Base (non-native) Apple sign-in. Metro resolves `mobileAppleSignIn.native.ts`
// on iOS and Android; this is what bun's test runner and Expo web get: no system
// sheet and no auth session to manage, so the web flow runs unwatched.

import type {
  MobileNativeAppleSignInOutcome,
  MobileOAuthProvider,
} from "./mobileOAuthProvider";

type NativeAppleResult = {
  error?: { code?: string; message?: string; status?: number } | null;
};

export async function signInWithMobileNativeApple(): Promise<
  MobileNativeAppleSignInOutcome<NativeAppleResult>
> {
  return { kind: "use-web" };
}

/** Null where the system sheet does not exist. */
export const requestMobileAppleAuthorizationCode:
  | (() => Promise<string | null>)
  | null = null;

export function prefetchMobileNativeAppleReadiness(): void {}

export function dismissMobileAuthSession(): void {}

export function runMobileWebOAuthSession<T>(
  _provider: MobileOAuthProvider,
  signIn: () => Promise<T>,
): Promise<T> {
  return signIn();
}
