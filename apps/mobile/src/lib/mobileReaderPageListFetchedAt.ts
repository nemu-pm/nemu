type PageListPage = {
  id: string;
  imageUri?: string;
  headers?: Record<string, string>;
  context?: Record<string, string>;
  text?: string;
};

function pageSignature(page: PageListPage): string {
  return JSON.stringify([
    page.id,
    page.imageUri ?? null,
    page.headers ?? null,
    page.context ?? null,
    page.text ?? null,
  ]);
}

/** The same pages, in the same order, loaded from the same requests. */
export function isSameMobileReaderPageList(
  a: readonly PageListPage[],
  b: readonly PageListPage[],
): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (pageSignature(a[index]!) !== pageSignature(b[index]!)) return false;
  }
  return true;
}

/**
 * The reader keys its scroll content and restore on `fetchedAt`. A chapter
 * opened from its cached page list paints at once, then the source's answer
 * lands: when that answer is the very same list, it keeps the cached list's
 * `fetchedAt` so the reader neither remounts nor re-places what it already
 * shows. A changed list (new page ids, URLs, headers or context) takes the
 * new timestamp as before.
 */
export function resolveMobileReaderPageListFetchedAt(input: {
  shown: { pages: readonly PageListPage[]; fetchedAt: number } | null;
  fetched: { pages: readonly PageListPage[]; fetchedAt: number };
}): number {
  const { shown, fetched } = input;
  return shown && isSameMobileReaderPageList(shown.pages, fetched.pages)
    ? shown.fetchedAt
    : fetched.fetchedAt;
}
