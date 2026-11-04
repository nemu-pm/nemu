/**
 * Seamless reading (scroll and paged): a crossing *back* into the chapter
 * before the open one must come from the reader — a drag, a swipe, a tap or
 * key turn — never from the list or the pager moving under a still reader.
 *
 * A chapter opened at page 1 fetches its previous chapter and splices it in
 * front at rest. The splice re-bases every row or frame of the open chapter
 * (the native offset follows through maintainVisibleContentPosition or a
 * re-anchoring scroll). Until that settles, an offset read back in the old
 * terms lands in the inserted chapter, and a backward crossing then opened
 * that chapter in place and wrote progress to it (Library card "Ch.38",
 * reader on "Chapter 35 · 1/14").
 *
 * So the reader keeps one flag: "a user gesture since the open chapter was
 * last (re-)anchored". Opening a chapter and every same-chapter re-base
 * (a prepend, a head drop) clear it; a gesture sets it; a backward crossing
 * needs it. Forward crossings are not gated (nothing is spliced after the
 * open chapter under the reader).
 */
export type MobileReaderStripCrossingGateEvent =
  /** A chapter opened (route or remount): nothing moved by the reader yet. */
  | { kind: "open" }
  /** The open chapter's rows / frames moved under it (splice, head drop). */
  | { kind: "re-anchor" }
  /** A drag, swipe, tap turn or key turn by the reader. */
  | { kind: "user-gesture" };

export function nextMobileReaderStripUserMoved(
  _current: boolean,
  event: MobileReaderStripCrossingGateEvent,
): boolean {
  return event.kind === "user-gesture";
}

export function shouldTakeMobileReaderStripCrossing(
  direction: "forward" | "backward",
  userMovedSinceAnchor: boolean,
): boolean {
  return direction === "forward" || userMovedSinceAnchor;
}

export type MobileReaderStripAnchor = { chapterId: string; base: number };

/**
 * The open chapter's place in the joined rows / frames changed while it stayed
 * the open chapter: a re-anchor. A crossing (another chapter opens) or the
 * first placement is not one.
 */
export function isMobileReaderStripReanchor(
  previous: MobileReaderStripAnchor | null,
  next: MobileReaderStripAnchor,
): boolean {
  return previous !== null && previous.chapterId === next.chapterId && previous.base !== next.base;
}
