import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ReadingMode } from "@/data/schema";
import {
  peekMobileReaderTitleReadingMode,
  preloadMobileReaderTitleReadingModes,
  resolveMobileReaderReadingMode,
  setMobileReaderTitleReadingMode,
  subscribeMobileReaderTitleReadingModes,
} from "@/lib/mobileReaderTitleReadingMode";
import {
  loadMobileSourceMangaViewer,
  peekMobileSourceMangaViewer,
  subscribeMobileSourceMangaViewers,
} from "@/lib/mobileSourceMangaViewer";

function subscribe(listener: () => void): () => void {
  const stopModes = subscribeMobileReaderTitleReadingModes(listener);
  const stopViewers = subscribeMobileSourceMangaViewers(listener);
  return () => {
    stopModes();
    stopViewers();
  };
}

/**
 * The reader's mode for one title, and the sheet's way to change it: a pick is
 * this title's alone, and picking what the title would use anyway clears it.
 * The default in Settings stays with `useReadingMode`.
 */
export function useMobileReaderTitleReadingMode(
  key: string,
  globalMode: ReadingMode,
): { mode: ReadingMode; setMode: (mode: ReadingMode) => Promise<void> } {
  const mode = useSyncExternalStore(subscribe, () =>
    resolveMobileReaderReadingMode({
      titleMode: peekMobileReaderTitleReadingMode(key),
      viewer: peekMobileSourceMangaViewer(key),
      globalMode,
    }),
  );
  useEffect(() => {
    preloadMobileReaderTitleReadingModes();
    void loadMobileSourceMangaViewer(key);
  }, [key]);
  const setMode = useCallback(
    async (next: ReadingMode) => {
      const unpicked = resolveMobileReaderReadingMode({
        titleMode: null,
        viewer: peekMobileSourceMangaViewer(key),
        globalMode,
      });
      setMobileReaderTitleReadingMode(key, next === unpicked ? null : next);
    },
    [globalMode, key],
  );
  return { mode, setMode };
}
