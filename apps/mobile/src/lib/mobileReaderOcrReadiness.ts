/**
 * Whether the reader's current page can be scanned for text right now.
 *
 * Opening the transcript (or the QA panel) as a chapter opens used to fail
 * outright — "Text recognition failed" over a still-black page — because the
 * page image had not loaded yet. A page that is still coming is `waiting`:
 * the OCR request is held (shown as recognising) and runs once the image has
 * loaded. Only a page that cannot be scanned at all is `unavailable`.
 */
export type MobileReaderOcrPageReadiness = "ready" | "waiting" | "unavailable";

export function mobileReaderOcrPageReadiness({
  pagesStatus,
  hasPage,
  hasText,
  hasImage,
  imageLoaded,
  imageFailed,
  segmentedUnsupported,
}: {
  pagesStatus: "idle" | "loading" | "ready" | "error" | (string & {});
  hasPage: boolean;
  hasText: boolean;
  hasImage: boolean;
  /** The page image has loaded (its natural size is known). */
  imageLoaded: boolean;
  imageFailed: boolean;
  segmentedUnsupported: boolean;
}): MobileReaderOcrPageReadiness {
  if (pagesStatus === "idle" || pagesStatus === "loading") return "waiting";
  if (pagesStatus !== "ready" || !hasPage) return "unavailable";
  if (segmentedUnsupported) return "unavailable";
  if (!hasText && !hasImage) return "unavailable";
  if (hasImage && !imageLoaded) return imageFailed ? "unavailable" : "waiting";
  return "ready";
}
