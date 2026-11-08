import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
} from "./mobilePerformance";
import { startMobileSplashSafetyCap } from "./mobileSplashScreen";

// First app module evaluated (after Metro's polyfills): `boot.bundle-start`
// vs `boot.js-entry` brackets the entry polyfills.
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootBundleStart);

// Imported first thing by the JS entry (index.ts): the launch screen's safety
// cap counts from JS start, not from when the root stack mounts.
startMobileSplashSafetyCap();
