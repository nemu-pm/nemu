/**
 * The pages a reader already resolved through its source (rewritten request
 * or processed file), kept for this session by chapter. A chapter reopened
 * from its persisted page list starts with every page `pending`: plates until
 * the source's page processor exists, i.e. until the chapter's page list has
 * been asked of the source again (about a second). The pages resolved last
 * time are the same pages: the reopen paints them at once, and the live list
 * then resolves them again behind them.
 *
 * Session memory only (request headers can carry short-lived tokens), a few
 * chapters, never data URIs (a processed page held in memory).
 *
 * Pure (no React Native), so it is testable.
 */

type ResolvablePage = {
  id: string;
  imageUri?: string;
  imageProcessing?: string;
};

const MAX_CHAPTERS = 8;
const chapters = new Map<string, Map<string, ResolvablePage>>();

function isRememberable(page: ResolvablePage): boolean {
  if (!page.imageUri || page.imageUri.startsWith("data:")) return false;
  return page.imageProcessing === "fallback" || page.imageProcessing === "ready";
}

/** Notes the resolved pages of a chapter (keyed like its page-list cache). */
export function rememberMobileReaderResolvedPages(key: string, pages: readonly ResolvablePage[]): void {
  const resolved = pages.filter(isRememberable);
  if (resolved.length === 0) return;
  const known = chapters.get(key) ?? new Map<string, ResolvablePage>();
  chapters.delete(key);
  for (const page of resolved) known.set(page.id, page);
  chapters.set(key, known);
  while (chapters.size > MAX_CHAPTERS) {
    const oldest = chapters.keys().next().value;
    if (oldest === undefined) break;
    chapters.delete(oldest);
  }
}

/**
 * The page list with each `pending` page that was resolved before put back
 * as resolved (same id, same source image). The same array when nothing
 * changes.
 */
export function withMobileReaderResolvedPages<Page extends ResolvablePage>(key: string, pages: Page[]): Page[] {
  const known = chapters.get(key);
  if (!known) return pages;
  let changed = false;
  const next = pages.map((page) => {
    if (page.imageProcessing !== "pending") return page;
    const resolved = known.get(page.id);
    if (!resolved) return page;
    changed = true;
    return resolved as Page;
  });
  return changed ? next : pages;
}

/**
 * A page processor's update hands back every page it has not reached yet as
 * `pending`: a page already showing its resolved image keeps it instead of
 * going back to a plate.
 */
export function keepMobileReaderResolvedPages<Page extends ResolvablePage>(current: readonly Page[], next: Page[]): Page[] {
  if (current.length === 0) return next;
  const byId = new Map<string, Page>();
  for (const page of current) if (isRememberable(page)) byId.set(page.id, page);
  if (byId.size === 0) return next;
  let changed = false;
  const merged = next.map((page) => {
    if (page.imageProcessing !== "pending") return page;
    const shown = byId.get(page.id);
    if (!shown) return page;
    changed = true;
    return shown;
  });
  return changed ? merged : next;
}

/** Exposed for tests. */
export function resetMobileReaderResolvedPagesForTesting(): void {
  chapters.clear();
}
