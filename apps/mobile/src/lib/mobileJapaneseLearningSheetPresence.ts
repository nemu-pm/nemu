/**
 * One Japanese Learning sheet (sentence sheet, Nemu chat) as the reader's
 * overlay sees it. The overlay (web `DrawerOverlay` blur + dim, and the
 * selected bubble's popout) follows the sheet's native presentation
 * progress, which UIKit reports as a stream of samples. That stream is not
 * ordered with the sheet's dismissal callback: SwiftUI's `onDismiss` can
 * reach JavaScript before the dismissal's last samples, and the samples sent
 * once the sheet's view has left the window (its final 0) are never
 * delivered. Applying every sample left the overlay at the last one that did
 * arrive (a quick swipe: ~0.3), so the blurred, dimmed page came back right
 * after the reset to 0 and stayed until another sheet was opened.
 *
 * The reader therefore owns the overlay's lifecycle: a sheet is on screen
 * from the moment it is asked for until its dismissal is reported, and only
 * samples taken in that window move the overlay. A dismissal that the reader
 * did not immediately revoke (a bubble tapped mid-dismissal) ends at 0.
 */
export type JapaneseLearningSheetPresence = {
  /** The reader wants the sheet up (the controlled `visible`). */
  wanted: boolean;
  /**
   * The native sheet may be on screen: from the request to show it until its
   * dismissal is reported, including the dismissal animation itself.
   */
  onScreen: boolean;
};

export const JAPANESE_LEARNING_SHEET_GONE: JapaneseLearningSheetPresence = {
  wanted: false,
  onScreen: false,
};

/** The reader asks to show (`visible`) or close the sheet. */
export function requestJapaneseLearningSheet(
  presence: JapaneseLearningSheetPresence,
  visible: boolean,
): JapaneseLearningSheetPresence {
  if (visible) return { wanted: true, onScreen: true };
  // Closing: the native sheet still animates out and reports progress.
  return presence.wanted ? { wanted: false, onScreen: presence.onScreen } : presence;
}

/** The native sheet finished dismissing (swipe, tap outside, or a programmatic close). */
export function japaneseLearningSheetDismissed(
  presence: JapaneseLearningSheetPresence,
): JapaneseLearningSheetPresence {
  // Shown again while it was leaving: the scaffold presents it once more.
  if (presence.wanted) return presence;
  return JAPANESE_LEARNING_SHEET_GONE;
}

/**
 * The overlay progress for one native presentation sample, or null to drop
 * a sample that arrived after the sheet's dismissal was reported.
 */
export function japaneseLearningSheetProgressSample(
  presence: JapaneseLearningSheetPresence,
  progress: number,
): number | null {
  if (!presence.onScreen) return null;
  if (!Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress));
}

/** What a finished sentence-sheet dismissal leaves behind. */
export type JapaneseLearningSentenceSheetDismissal = {
  presence: JapaneseLearningSheetPresence;
  /** The overlay drops to 0 (the sheet is gone, whatever the last sample said). */
  resetProgress: boolean;
  /** Present the chat the sentence handed off to (Ask). */
  presentChat: boolean;
  /**
   * Gone for good (web `closeOcrSheet`): deselect the bubble, so its popout
   * cannot resurface, and stop its analysis, so a late result cannot land on
   * a closed sheet.
   */
  releaseSelection: boolean;
};

export function resolveJapaneseLearningSentenceSheetDismissal({
  presence,
  handsOffToChat,
  transcriptReopensSentence,
}: {
  presence: JapaneseLearningSheetPresence;
  /** An Ask closed the sentence sheet to present the chat over the same bubble. */
  handsOffToChat: boolean;
  /** A transcript line was tapped while this sheet was leaving: it comes back for that line. */
  transcriptReopensSentence: boolean;
}): JapaneseLearningSentenceSheetDismissal {
  const next = japaneseLearningSheetDismissed(presence);
  const gone = !next.onScreen;
  return {
    presence: next,
    resetProgress: gone,
    presentChat: handsOffToChat,
    releaseSelection: gone && !handsOffToChat && !transcriptReopensSentence,
  };
}

/** What a finished chat dismissal leaves behind. */
export type JapaneseLearningChatDismissal = {
  presence: JapaneseLearningSheetPresence;
  resetProgress: boolean;
  /** Uncover the sentence the chat was opened from (web: closing the stacked drawer). */
  presentSentence: boolean;
  /**
   * Nothing is left on screen for the bubble an Ask chat was about: its popout
   * and its selection go with the chat.
   */
  releaseSelection: boolean;
};

export function resolveJapaneseLearningChatDismissal({
  presence,
  returnsToSentence,
  sentenceWanted,
}: {
  presence: JapaneseLearningSheetPresence;
  /** The chat was closed to bring its sentence sheet back. */
  returnsToSentence: boolean;
  /** The sentence sheet is (being) shown anyway, e.g. a bubble tapped meanwhile. */
  sentenceWanted: boolean;
}): JapaneseLearningChatDismissal {
  const next = japaneseLearningSheetDismissed(presence);
  const gone = !next.onScreen;
  return {
    presence: next,
    resetProgress: gone,
    presentSentence: returnsToSentence,
    releaseSelection: gone && !returnsToSentence && !sentenceWanted,
  };
}
