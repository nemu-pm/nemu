/**
 * The end of the last chapter there is: one more forward turn past its last
 * page (tap, swipe, a slide or curl drag, scrolling past the end) closes the
 * reader as Back does, the chapter saved as complete. No caught-up card, no
 * dead end.
 *
 * Only a true end: the chapter list is in and names no chapter after this
 * one (a chapter added later is a next chapter, and reads on), and the
 * chapter itself is loaded with nothing on screen failed (a page still
 * loading or waiting on Retry never closes the reader).
 */
export function mobileReaderExitsAtEnd(state: {
  /** The chapter list is in: a missing next chapter is really absent. */
  chaptersKnown: boolean;
  hasNextChapter: boolean;
  /** The open chapter's pages are ready. */
  pagesReady: boolean;
  /** A page on screen failed to load (its Retry is showing). */
  visiblePageFailed: boolean;
}): boolean {
  return state.chaptersKnown && !state.hasNextChapter && state.pagesReady && !state.visiblePageFailed;
}

/**
 * The page Continue opens on the detail page. Caught up (the last chapter
 * there is, finished): its last page, never page 1, so the button does not
 * restart a finished chapter and one more turn there closes the reader
 * again. Otherwise the reader's own resume position.
 */
export const MOBILE_READER_LAST_PAGE = Number.MAX_SAFE_INTEGER;

export function mobileContinueReaderPage(target: { caughtUp?: boolean }): number | undefined {
  return target.caughtUp ? MOBILE_READER_LAST_PAGE : undefined;
}
