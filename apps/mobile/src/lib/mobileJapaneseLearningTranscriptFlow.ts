/**
 * Web parity (japanese-learning/index.tsx `handleOcrNavbarClick`): opening
 * the transcript runs text detection for the page when it has no transcript,
 * so there is no separate "Detect text" step.
 *
 * - `idle`: the page has not been scanned yet → scan now.
 * - `error` with the "no image" detail: the transcript opened before the page
 *   image was measurable; retry once the page's detector changes (a new page,
 *   or the same page once its image is ready), never in a loop.
 * - `loading` / `ready` / other errors: nothing to do (errors keep Retry).
 */
export function shouldAutoRunMobileJapaneseLearningTranscriptOcr(input: {
  visible: boolean;
  ocrStatus: "idle" | "loading" | "ready" | "error";
  ocrErrorDetail?: string;
  noImageDetail: string;
  detectorChanged: boolean;
}): boolean {
  if (!input.visible) return false;
  if (input.ocrStatus === "idle") return true;
  return (
    input.ocrStatus === "error" &&
    input.ocrErrorDetail === input.noImageDetail &&
    input.detectorChanged
  );
}

/**
 * Web keeps the sentence actions (Listen / Ask about this sentence / Copy) on
 * one footer row at every width. Native keeps that row too:
 * - `row`: icon + label for all three (web);
 * - `compact`: a narrow docked panel keeps the row, Listen and Copy become
 *   icon-only buttons (still labelled for VoiceOver/TalkBack);
 * - `stacked`: only when Dynamic Type makes one row unreadable.
 */
export type MobileJapaneseLearningSentenceActionsLayout = "row" | "compact" | "stacked";

export function mobileJapaneseLearningSentenceActionsLayout(input: {
  fontScale: number;
  footerWidth: number;
}): MobileJapaneseLearningSentenceActionsLayout {
  if (input.fontScale > 1.3) return "stacked";
  if (input.footerWidth > 0 && input.footerWidth < 360) return "compact";
  return "row";
}
