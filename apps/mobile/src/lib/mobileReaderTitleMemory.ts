/**
 * The title capsule's settled labels per chapter, kept for this session.
 *
 * Reopening a chapter whose pages were already loaded restores the same
 * spot, so its capsule ends on the very labels it showed last time ("Title"
 * over "Ch.37 · 1 / 10"). Until the reader's own labels are final (its
 * pages read back, its spot restored) the capsule shows those remembered
 * labels instead of "Fetching pages", so its text and width are final from
 * the first frame (designer, build 9 round 3: no "Fetching pages" then a
 * swap on a reopen).
 *
 * Pure (no React Native), so it is testable.
 */

export type MobileReaderTitleLabels = {
  title: string;
  subtitle: string;
  /** The narrow capsule that keeps only the page count (`pageCountLabel`). */
  compact: boolean;
  pageCountLabel: string | null;
};

const MAX_CHAPTERS = 16;
const remembered = new Map<string, MobileReaderTitleLabels>();

function sameLabels(a: MobileReaderTitleLabels, b: MobileReaderTitleLabels): boolean {
  return a.title === b.title && a.subtitle === b.subtitle && a.compact === b.compact && a.pageCountLabel === b.pageCountLabel;
}

/** Notes the labels a chapter's capsule settled on (only final labels: pages read, spot restored). */
export function rememberMobileReaderTitleLabels(key: string, labels: MobileReaderTitleLabels): void {
  const previous = remembered.get(key);
  if (previous && sameLabels(previous, labels)) return;
  remembered.delete(key);
  remembered.set(key, { ...labels });
  while (remembered.size > MAX_CHAPTERS) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
}

export function peekMobileReaderTitleLabels(key: string): MobileReaderTitleLabels | null {
  return remembered.get(key) ?? null;
}

/**
 * Whether the reader's own capsule labels are final: its pages are in and
 * it rests where it restored to (a paged reader's page number, a scroll
 * reader's counter), or the chapter did not load (an error shows as is).
 */
export function mobileReaderTitleLabelsFinal(input: {
  pagesStatus: string;
  pageCount: number;
  restoreComplete: boolean;
}): boolean {
  if (input.pagesStatus === "idle" || input.pagesStatus === "loading") return false;
  if (input.pagesStatus !== "ready") return true;
  return input.pageCount > 0 && input.restoreComplete;
}

/**
 * What the capsule shows: the reader's own labels once final; before that a
 * reopen's remembered labels; else (a first open) its own ("Fetching pages").
 */
export function resolveMobileReaderTitleLabels(input: {
  live: MobileReaderTitleLabels;
  final: boolean;
  remembered: MobileReaderTitleLabels | null;
}): { labels: MobileReaderTitleLabels; seeded: boolean } {
  if (input.final || !input.remembered) return { labels: input.live, seeded: false };
  return { labels: input.remembered, seeded: true };
}

/**
 * The cross-fade key of the capsule's content: a change of what it says
 * (title, chapter line, loading → page count, compact) cross-fades; a page
 * number moving on alone only resizes (no cross-fade for every page turn).
 */
export function mobileReaderTitleContentKey(labels: MobileReaderTitleLabels): string {
  const subtitleWithoutCount = labels.pageCountLabel
    ? labels.subtitle.split(labels.pageCountLabel).join("#")
    : labels.subtitle;
  return [labels.compact ? "compact" : "full", labels.title, subtitleWithoutCount, labels.pageCountLabel ? "#" : "-"].join("\n");
}

/** The capsule's resize and its content's cross-fade, on UIKit's ease-out (READER_CHROME_MATERIAL_CURVE). */
export const MOBILE_READER_TITLE_RESIZE_MS = 200;

/** The capsule's width for its content's natural width (padding included), within its slot's range. */
export function resolveMobileReaderTitleCapsuleWidth(input: { natural: number; minWidth: number; maxWidth: number }): number | null {
  if (!(input.natural > 0) || !Number.isFinite(input.natural)) return null;
  return Math.round(Math.min(input.maxWidth, Math.max(input.minWidth, input.natural)) * 2) / 2;
}

/**
 * How a new width is applied: the first one, a hidden or still transparent
 * chrome (the opening's hold) and Reduce Motion set it at once; a shown
 * capsule resizes around its centre over MOBILE_READER_TITLE_RESIZE_MS.
 */
export function mobileReaderTitleWidthChange(input: {
  previous: number | null;
  next: number;
  visible: boolean;
  reduceMotion: boolean;
}): "none" | "set" | "animate" {
  if (input.previous !== null && Math.abs(input.previous - input.next) < 0.5) return "none";
  if (input.previous === null || !input.visible || input.reduceMotion) return "set";
  return "animate";
}

/** Exposed for tests. */
export function resetMobileReaderTitleMemoryForTesting(): void {
  remembered.clear();
}
