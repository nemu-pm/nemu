import { useMemo } from "react";
import {
  useInstalledSources,
  useLibraryEntries,
  useMangaProgress,
} from "@/data/mobileHooks";
import type { InstalledSource } from "@/data/schema";
import {
  selectMobileContinueReading,
  type MobileContinueReadingItem,
} from "@/lib/mobileContinueReading";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import {
  buildMobileProgressIndex,
  sortMobileLibraryEntries,
} from "@/lib/mobileLibraryPresentation";

export type MobileNowReading = {
  item: MobileContinueReadingItem;
  installedSources: InstalledSource[];
};

function useNowReadingFromStore(): MobileNowReading | null {
  const entries = useLibraryEntries();
  const progress = useMangaProgress();
  const installedSources = useInstalledSources();
  return useMemo(() => {
    const index = buildMobileProgressIndex(progress.data);
    const item = selectMobileContinueReading(
      sortMobileLibraryEntries(entries.data, index),
      index,
      undefined,
      1,
    )[0];
    return item ? { item, installedSources: installedSources.data } : null;
  }, [entries.data, installedSources.data, progress.data]);
}

/**
 * The most recently read unfinished title, for the tab bar's bottom
 * accessory. Without the design-explore flag this never reads the store.
 */
export const useMobileNowReading: () => MobileNowReading | null =
  mobileDesignExploreFlag ? useNowReadingFromStore : () => null;
