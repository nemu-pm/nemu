import { startMobileSplashSafetyCap } from "./mobileSplashScreen";

// Imported first thing by the JS entry (index.ts): the launch screen's safety
// cap counts from JS start, not from when the root stack mounts.
startMobileSplashSafetyCap();
