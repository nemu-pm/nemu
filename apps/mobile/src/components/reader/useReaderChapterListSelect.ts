import { useCallback, useEffect, useRef } from "react";
import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderChapterListStartAt } from "@/lib/mobileReaderChapterList";

/** Longest a jump waits for a sheet whose dismissal is never reported. */
const DISMISS_WAIT_MS = 700;

/**
 * A row's tap closes the sheet, and the chapter opens once the sheet is down:
 * the jump can replace the reader screen, which would cut the dismissal short.
 */
export function useReaderChapterListSelect(
  onClose: () => void,
  onSelectChapter: (chapter: ChapterSummary, startAt: MobileReaderChapterListStartAt) => void,
) {
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const select = useCallback(
    (chapter: ChapterSummary, startAt: MobileReaderChapterListStartAt) => {
      if (pending.current) return;
      pending.current = () => onSelectChapter(chapter, startAt);
      timer.current = setTimeout(flush, DISMISS_WAIT_MS);
      onClose();
    },
    [flush, onClose, onSelectChapter],
  );
  return { select, onDismissed: flush };
}
