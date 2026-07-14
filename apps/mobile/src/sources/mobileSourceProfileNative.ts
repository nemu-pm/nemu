import { registerMobileSourceProfileTransitionHandler } from "./mobileSourceProfileScope";

export async function resetMobileSourceProfileNativeAuthState(): Promise<void> {}

registerMobileSourceProfileTransitionHandler(
  "native-source-auth-state",
  resetMobileSourceProfileNativeAuthState,
);
