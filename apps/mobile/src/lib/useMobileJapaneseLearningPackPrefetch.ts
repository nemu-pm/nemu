import { useEffect } from "react";
import { getNetworkStateAsync } from "expo-network";
import { prefetchMobileJapaneseLearningAnalysisPack } from "./mobileJapaneseLearningAnalysisPackStore";
import { getMobileJapaneseLearningEnginePreference } from "./mobileJapaneseLearningEngine";

/** The chapter's pages load first; the dictionary waits until the reader settles. */
const MOBILE_JAPANESE_LEARNING_PACK_PREFETCH_DELAY_MS = 4_000;

/**
 * Reader: with Japanese Learning on, a missing on-device dictionary
 * downloads in the background on Wi-Fi, so the first sentence analysis does
 * not wait on 25 MB (`shouldPrefetchMobileJapaneseLearningPack`). Nothing
 * waits on it; a failure shows only in the dictionary's settings row.
 */
export function useMobileJapaneseLearningPackPrefetch(pluginEnabled: boolean): void {
  useEffect(() => {
    if (!pluginEnabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void getNetworkStateAsync()
        .then((network) => {
          if (cancelled) return;
          return prefetchMobileJapaneseLearningAnalysisPack({
            pluginEnabled,
            preference: getMobileJapaneseLearningEnginePreference(),
            networkType: network.type,
            internetReachable: network.isInternetReachable,
          });
        })
        .catch(() => undefined);
    }, MOBILE_JAPANESE_LEARNING_PACK_PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pluginEnabled]);
}
