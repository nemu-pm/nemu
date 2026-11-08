/**
 * Readable width for one-column text pages (Settings and its sections) on a
 * regular-width window: UIKit's readable content guide, 672pt at the default
 * text size and wider as the text grows. A full-width 13" iPad row would put a
 * label and its value a whole screen apart; the column stays centred instead.
 * Compact widths (phones, the Duo, a narrow Split View or Stage Manager
 * window) keep the page gutters, as does any window narrower than the column.
 */
export const MOBILE_READABLE_WIDTH = 672;

export function getMobileReadableGutters({
  containerWidth,
  gutters,
  regularWidth,
  fontScale = 1,
}: {
  /** The page's width (the window for a full page). */
  containerWidth: number;
  /** The page gutters (`useMobilePageGutters`). */
  gutters: { left: number; right: number };
  regularWidth: boolean;
  fontScale?: number;
}): { paddingLeft: number; paddingRight: number } {
  const plain = { paddingLeft: gutters.left, paddingRight: gutters.right };
  if (!regularWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) return plain;
  const readable = MOBILE_READABLE_WIDTH * Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  const extra = (containerWidth - gutters.left - gutters.right - readable) / 2;
  if (extra <= 0) return plain;
  const side = Math.floor(extra);
  return { paddingLeft: gutters.left + side, paddingRight: gutters.right + side };
}
