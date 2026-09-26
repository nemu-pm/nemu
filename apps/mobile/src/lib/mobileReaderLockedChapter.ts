import type { ChapterSummary } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  isMobileCloudflareError,
  isMobileNetworkSourceError,
} from "@/lib/mobileSourceErrors";

/**
 * Paywall / sign-in wording that sources put in their page-list failures.
 * Word boundaries keep "blocked" (Cloudflare) and "unlocked" out.
 */
const LOCKED_CHAPTER_ERROR_PATTERNS: readonly RegExp[] = [
  /\blocked\b/i,
  /\bpaywall/i,
  /\bpremium\b/i,
  /\b(?:purchase|buy|rent)\b.*\b(?:chapter|episode|to read)\b/i,
  /\b(?:chapter|episode)\b.*\b(?:purchase|paid|coins?|points?|tickets?)\b/i,
  /\bsubscri(?:be|ption)\b.*\bread\b/i,
  /\b(?:log ?in|sign ?in)\b.*\b(?:to read|required)\b/i,
  /\bnot available for free\b/i,
];

function errorText(error: unknown): string {
  try {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : String(error);
  } catch {
    return "";
  }
}

/**
 * Whether a page-list failure means the chapter is locked rather than broken.
 *
 * The runtime's `locked` flag on the requested chapter wins outright: sources
 * such as MangaDex fail those with an unrelated message ("Missing chapter
 * data") because the pages simply do not exist for a free reader. Without the
 * flag, only the source's own paywall wording counts — a network outage or a
 * Cloudflare challenge on a locked-looking URL must keep its real recovery UI.
 */
export function isMobileReaderLockedChapterFailure({
  chapter,
  error,
}: {
  chapter?: Pick<ChapterSummary, "locked"> | null;
  error?: unknown;
}): boolean {
  if (error !== undefined) {
    if (isMobileCloudflareError(error) || isMobileNetworkSourceError(error)) {
      return false;
    }
  }
  if (chapter?.locked === true) return true;
  if (error === undefined) return false;
  const message = errorText(error);
  if (!message) return false;
  return LOCKED_CHAPTER_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export type MobileReaderLockedChapterState = {
  status: "error";
  locked: true;
  title: string;
  detail: string;
};

export function getMobileReaderLockedChapterState(
  strings: MobileStrings,
): MobileReaderLockedChapterState {
  return {
    status: "error",
    locked: true,
    title: strings.reader.chapterLockedTitle,
    detail: strings.reader.chapterLockedDetail,
  };
}
