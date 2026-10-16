/**
 * What a `holdPreviousWhileLoading` image shows while its source has no
 * displayable image yet: the image it last loaded under another source key
 * (the same title's previous cover), or nothing (the fallback shows). Never
 * across a failure: a source that failed shows its fallback, not a stale image.
 */
export function resolveMobileHeldImage<T>({
  hold,
  hasImage,
  failed,
  sourceKey,
  shown,
}: {
  hold: boolean;
  hasImage: boolean;
  failed: boolean;
  sourceKey: string;
  shown: { sourceKey: string; source: T } | null;
}): T | null {
  if (!hold || hasImage || failed || !shown || shown.sourceKey === sourceKey) return null;
  return shown.source;
}
