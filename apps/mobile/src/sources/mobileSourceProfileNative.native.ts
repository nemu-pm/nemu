import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { registerMobileSourceProfileTransitionHandler } from "./mobileSourceProfileScope";

export async function resetMobileSourceProfileNativeAuthState(): Promise<void> {
  await NemuAidokuModule.resetMobileSourceProfileAuthState();
}

registerMobileSourceProfileTransitionHandler(
  "native-source-auth-state",
  resetMobileSourceProfileNativeAuthState,
);
