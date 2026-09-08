import { registerMobileSourceProfileTransitionHandler } from "./mobileSourceProfileScope";

export async function resetMobileSourceProfileNativeAuthState(): Promise<void> {}

export async function clearMobileSourceNativeCookies(
  cookieScope: string,
): Promise<void> {
  void cookieScope;
}

registerMobileSourceProfileTransitionHandler(
  "native-source-auth-state",
  resetMobileSourceProfileNativeAuthState,
);
