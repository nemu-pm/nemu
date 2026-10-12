/**
 * Where the reader finds the manga title when the chapter was opened without
 * a library entry (deep link, source browse, QA launcher).
 *
 * The persisted source-detail cache (what the source manga page last showed)
 * answers first, without touching the network. Only on a miss does the
 * reader ask the source for its details, and a failed or timed-out request
 * is retried once: a cold source session on a deep link is the common first
 * failure and usually succeeds on the second try.
 */

/** Titles some sources return that are really a URL or a file path. */
export function isMobileSourceMangaTitlePathLike(value: string): boolean {
  const title = value.trim();
  return (
    /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(title) ||
    /^\.{1,2}[\\/]/.test(title) ||
    /^[\\/][^\\/]+[\\/]/.test(title) ||
    /^[a-z]:[\\/]/i.test(title) ||
    /^www\.[^\s/]+(?:\/|$)/i.test(title)
  );
}

export const MOBILE_READER_TITLE_RETRY_DELAY_MS = 1_500;

export type MobileReaderSourceTitleResult =
  | { status: "ready"; title: string | null | undefined }
  | { status: "blocked" };

export type MobileReaderMangaTitleLoader = {
  mangaId: string;
  readCachedTitle: () => Promise<string | null | undefined>;
  /** Absent while the source is not installed/resolved yet. */
  fetchSourceTitle?: () => Promise<MobileReaderSourceTitleResult>;
  isCancelled: () => boolean;
  wait?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
};

/** A title is usable when it is not blank, the opaque id, or a URL/path. */
export function usableMobileReaderMangaTitle(
  value: string | null | undefined,
  mangaId: string,
): string | null {
  const title = value?.trim() ?? "";
  if (!title || title === mangaId.trim()) return null;
  if (isMobileSourceMangaTitlePathLike(title)) return null;
  return title;
}

const defaultWait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function loadMobileReaderMangaTitle({
  mangaId,
  readCachedTitle,
  fetchSourceTitle,
  isCancelled,
  wait = defaultWait,
  retryDelayMs = MOBILE_READER_TITLE_RETRY_DELAY_MS,
}: MobileReaderMangaTitleLoader): Promise<string | null> {
  const cached = usableMobileReaderMangaTitle(
    await readCachedTitle().catch(() => null),
    mangaId,
  );
  if (cached || isCancelled() || !fetchSourceTitle) return cached;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await wait(retryDelayMs);
      if (isCancelled()) return null;
    }
    let result: MobileReaderSourceTitleResult;
    try {
      result = await fetchSourceTitle();
    } catch {
      continue;
    }
    // A blocked source (sign-in, Cloudflare) will not unblock by itself in
    // a second and a half; a ready result without a usable title is final.
    if (result.status !== "ready") return null;
    return usableMobileReaderMangaTitle(result.title, mangaId);
  }
  return null;
}
