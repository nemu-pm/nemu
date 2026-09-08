import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { registerMobileSourceProfileTransitionHandler } from "./mobileSourceProfileScope";

export async function resetMobileSourceProfileNativeAuthState(): Promise<void> {
  await NemuAidokuModule.resetMobileSourceProfileAuthState();
}

/**
 * Clears one source's native cookie jars. Unlike the profile-wide reset above
 * this leaves every other source logged in at the transport, so a single
 * source's log out cannot sign the user out of the rest.
 */
export async function clearMobileSourceNativeCookies(
  cookieScope: string,
): Promise<void> {
  await NemuAidokuModule.clearSourceCookies(cookieScope);
}

registerMobileSourceProfileTransitionHandler(
  "native-source-auth-state",
  resetMobileSourceProfileNativeAuthState,
);
