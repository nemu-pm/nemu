import type { MobileDataStore } from "./storeTypes";
import { runMobileCacheClearSteps } from "./mobileCacheClear";
import { clearCachedSourcePackages } from "@/sources/sourcePackageCache";
import { defaultMobileSourceSessionCache } from "@/sources/mobileSourceExecutorCache";
import { clearMobileSourceImageRequestCache } from "@/sources/mobileSourceImages";
import { clearCachedRegistryIndex } from "@/sources/mobileRegistryIndexCache";
import { clearMobileImageCache } from "@/lib/mobileImageCache";
import { clearMobileReaderPageListCache } from "@/sources/mobileReaderPageListCache";
import { clearMobileJapaneseLearningTtsCache } from "@/lib/mobileJapaneseLearningTts";
import { clearMobileDualReaderDhashCache } from "@/lib/mobileDualReaderDhashCache";
import { clearMobileSourceDetailCache } from "@/lib/mobileSourceDetailCache";
import { clearMobileSourceListingCache } from "@/lib/mobileSourceListingCache";

/**
 * Clear every non-sandbox Nemu data backend used by the mobile app. Each step
 * is idempotent and every independent cache gets an attempt; the durable
 * profile-cleanup marker remains until all steps and SQLite complete.
 */
export async function clearAllMobileDeviceData(
  store: MobileDataStore,
): Promise<void> {
  let cacheError: unknown;
  let cacheFailed = false;
  try {
    await runMobileCacheClearSteps([
      clearCachedSourcePackages,
      () => defaultMobileSourceSessionCache.clear(),
      clearMobileImageCache,
      clearMobileReaderPageListCache,
      clearMobileJapaneseLearningTtsCache,
      clearMobileDualReaderDhashCache,
      clearMobileSourceImageRequestCache,
      clearCachedRegistryIndex,
      clearMobileSourceDetailCache,
      clearMobileSourceListingCache,
    ]);
  } catch (error) {
    cacheFailed = true;
    cacheError = error;
  }

  // SQLite and its secure source-settings vault are independent of the cache
  // backends. Always attempt their transactional clear before surfacing a
  // cache failure, so a retry has the smallest possible remaining scope.
  await store.clearAllUserData();
  if (cacheFailed) throw cacheError;
}
