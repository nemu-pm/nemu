// Base (non-native) OAuth browser session. Metro resolves
// `mobileOAuthSession.native.ts` on iOS and Android; this is what bun's test
// runner and Expo web get: no auth session to manage, so sign-in runs unwatched.

import type { MobileOAuthProvider } from "./mobileOAuthProvider";

export function dismissMobileAuthSession(): void {}

export function runMobileWebOAuthSession<T>(
  _provider: MobileOAuthProvider,
  signIn: () => Promise<T>,
): Promise<T> {
  return signIn();
}
