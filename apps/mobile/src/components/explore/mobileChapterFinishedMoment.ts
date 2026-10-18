import { useSyncExternalStore } from "react";
import { createChangeListeners } from "@/lib/mobileChangeListeners";

/**
 * The chapter the reader just finished by reading past its last page
 * (design-explore). The reader replaces its route for the next chapter, so
 * the moment that marks it lives here rather than in the screen's state.
 */
type MobileChapterFinishedMoment = { id: number; label: string; at: number };

let moment: MobileChapterFinishedMoment | null = null;
let nextId = 1;
const changes = createChangeListeners();

/** A moment is gone after this (a reader opened later must not show it). */
const MOBILE_CHAPTER_FINISHED_FRESH_MS = 4000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Marks `label` ("Ch.118") as just finished; the mark clears itself. */
export function markMobileChapterFinished(label: string, now = Date.now()) {
  moment = { id: nextId++, label, at: now };
  if (clearTimer) clearTimeout(clearTimer);
  const id = moment.id;
  clearTimer = setTimeout(() => {
    if (moment?.id !== id) return;
    moment = null;
    changes.notify();
  }, MOBILE_CHAPTER_FINISHED_FRESH_MS);
  changes.notify();
}

export function useMobileChapterFinishedMoment(): MobileChapterFinishedMoment | null {
  return useSyncExternalStore(
    changes.subscribe,
    () => moment,
    () => null,
  );
}
