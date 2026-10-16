/**
 * Placeholder density for a cover that cannot load, by its rendered width:
 * a hero-sized book with a display title (a tall card's cover, the detail
 * hero), a full cloth-bound book with the title, a compact one with a shorter
 * title, or (thumbnails too small for legible text) the bare book with its rule.
 */
type MobileExploreCoverPlaceholderSize = "large" | "regular" | "compact" | "mini";

export function getMobileExploreCoverPlaceholderSize(width: number): MobileExploreCoverPlaceholderSize {
  if (!Number.isFinite(width) || width < 48) return "mini";
  if (width < 96) return "compact";
  return width < 180 ? "regular" : "large";
}

/** A bold Latin glyph's average advance, as a fraction of the type size (generous, so a word never breaks). */
const BOLD_ADVANCE = 0.56;
const MIN_TITLE_SCALE = 0.55;
/** Runs of letters that cannot break inside them (CJK and kana break anywhere). */
const UNBREAKABLE_RUN = /[^\s぀-ヿ㐀-鿿가-힯豈-﫿＀-￯]+/g;

/**
 * The placeholder title's size, as a scale of its type size, so its longest
 * word fits the line ("Pepper&Carrot" on a narrow cover shrinks rather than
 * breaking as "Pepper&Ca / rrot"); 1 when every word fits.
 */
export function getMobileExploreCoverPlaceholderTitleScale(
  title: string,
  lineWidth: number,
  fontSize: number,
): number {
  const longest = Math.max(0, ...(title.match(UNBREAKABLE_RUN) ?? []).map((run) => [...run].length));
  if (!longest || !(lineWidth > 0) || !(fontSize > 0)) return 1;
  const scale = lineWidth / (longest * fontSize * BOLD_ADVANCE);
  return Math.max(MIN_TITLE_SCALE, Math.min(1, scale));
}
