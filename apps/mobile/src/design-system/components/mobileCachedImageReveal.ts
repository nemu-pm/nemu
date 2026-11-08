/**
 * Whether a cached image's shell is opaque from its first frame instead of
 * fading in from blank: a source already on screen this session, or (with
 * `fadeFromCache` off) one whose bytes were already on disk at render. A
 * skipped fade is opaque anyway through the fade value itself.
 */
export function mobileCachedImageShowsAtOnce({
  skipFade,
  shownAtMount,
  revealedFromCacheAtRender,
}: {
  skipFade: boolean;
  shownAtMount: boolean;
  revealedFromCacheAtRender: boolean;
}): boolean {
  return !skipFade && (shownAtMount || revealedFromCacheAtRender);
}
