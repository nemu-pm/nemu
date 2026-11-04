import { useCallback, useSyncExternalStore } from "react";
import {
  peekMobileReaderResumePosition,
  subscribeMobileReaderResumePositions,
  type MobileReaderResumePosition,
} from "./mobileReaderResumePosition";

/**
 * This device's last spot in a chapter (key: its chapter-progress id), kept
 * current as the reader saves: what the chapter rows and Continue cards pass
 * to `resolveMobileChapterOpeningPage`.
 */
export function useMobileReaderResumePosition(
  key: string | null | undefined,
): MobileReaderResumePosition | null {
  const read = useCallback(() => peekMobileReaderResumePosition(key), [key]);
  return useSyncExternalStore(subscribeMobileReaderResumePositions, read, nullSnapshot);
}

function nullSnapshot(): null {
  return null;
}
