import { describe, expect, test } from "bun:test";
import {
  JAPANESE_LEARNING_SHEET_GONE,
  japaneseLearningSheetDismissed,
  japaneseLearningSheetProgressSample,
  requestJapaneseLearningSheet,
  resolveJapaneseLearningChatDismissal,
  resolveJapaneseLearningSentenceSheetDismissal,
  type JapaneseLearningSheetPresence,
} from "./mobileJapaneseLearningSheetPresence";

/**
 * Replays an event stream the way ReaderScreen applies it, returning the
 * overlay progress JavaScript ends on.
 */
function replay(
  events: ReadonlyArray<
    | { type: "request"; visible: boolean }
    | { type: "sample"; progress: number }
    | { type: "dismissed" }
  >,
) {
  let presence: JapaneseLearningSheetPresence = JAPANESE_LEARNING_SHEET_GONE;
  let progress = 0;
  for (const event of events) {
    if (event.type === "request") {
      presence = requestJapaneseLearningSheet(presence, event.visible);
    } else if (event.type === "sample") {
      const sample = japaneseLearningSheetProgressSample(presence, event.progress);
      if (sample !== null) progress = sample;
    } else {
      const dismissal = resolveJapaneseLearningSentenceSheetDismissal({
        presence,
        handsOffToChat: false,
        transcriptReopensSentence: false,
      });
      presence = dismissal.presence;
      if (dismissal.resetProgress) progress = 0;
    }
  }
  return { presence, progress };
}

describe("Japanese learning sheet presence", () => {
  test("a quick swipe whose last samples reach JS after onDismiss ends at 0 (the stuck blur)", () => {
    // Recorded on the simulator: SwiftUI's onDismiss (close + dismissed) was
    // handled before the 0.33 sample, and the final 0.15 / 0 never arrived.
    const { presence, progress } = replay([
      { type: "request", visible: true },
      { type: "sample", progress: 0.5 },
      { type: "sample", progress: 0.974 },
      { type: "sample", progress: 0.894 },
      { type: "sample", progress: 0.411 },
      { type: "request", visible: false },
      { type: "dismissed" },
      { type: "sample", progress: 0.33 },
    ]);
    expect(progress).toBe(0);
    expect(presence).toEqual(JAPANESE_LEARNING_SHEET_GONE);
  });

  test("samples keep driving the overlay while the sheet animates out", () => {
    const { progress } = replay([
      { type: "request", visible: true },
      { type: "sample", progress: 1 },
      { type: "request", visible: false },
      { type: "sample", progress: 0.4 },
    ]);
    expect(progress).toBe(0.4);
  });

  test("a cancelled swipe (no dismissal) keeps following the sheet back up", () => {
    const { progress, presence } = replay([
      { type: "request", visible: true },
      { type: "sample", progress: 0.97 },
      { type: "sample", progress: 0.6 },
      { type: "sample", progress: 0.97 },
    ]);
    expect(progress).toBe(0.97);
    expect(presence).toEqual({ wanted: true, onScreen: true });
  });

  test("a reopened sheet follows its new presentation again", () => {
    const { progress } = replay([
      { type: "request", visible: true },
      { type: "sample", progress: 1 },
      { type: "request", visible: false },
      { type: "dismissed" },
      { type: "sample", progress: 0.3 },
      { type: "request", visible: true },
      { type: "sample", progress: 0.2 },
    ]);
    expect(progress).toBe(0.2);
  });

  test("samples before the sheet is asked for are ignored", () => {
    expect(japaneseLearningSheetProgressSample(JAPANESE_LEARNING_SHEET_GONE, 0.7)).toBeNull();
  });

  test("samples are clamped and non-finite ones dropped", () => {
    const shown = requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, true);
    expect(japaneseLearningSheetProgressSample(shown, 1.2)).toBe(1);
    expect(japaneseLearningSheetProgressSample(shown, -0.1)).toBe(0);
    expect(japaneseLearningSheetProgressSample(shown, Number.NaN)).toBeNull();
  });

  test("closing an already closed sheet changes nothing", () => {
    expect(requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, false)).toBe(
      JAPANESE_LEARNING_SHEET_GONE,
    );
    expect(japaneseLearningSheetDismissed(JAPANESE_LEARNING_SHEET_GONE)).toBe(
      JAPANESE_LEARNING_SHEET_GONE,
    );
  });

  test("a dismissal the reader revoked (shown again mid-dismissal) keeps the sheet", () => {
    const leaving = requestJapaneseLearningSheet(
      requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, true),
      false,
    );
    const shownAgain = requestJapaneseLearningSheet(leaving, true);
    expect(japaneseLearningSheetDismissed(shownAgain)).toEqual({ wanted: true, onScreen: true });
  });
});

describe("Japanese learning sentence sheet dismissal", () => {
  const leaving = requestJapaneseLearningSheet(
    requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, true),
    false,
  );

  test("closed for good: overlay to 0, bubble released (web closeOcrSheet)", () => {
    expect(
      resolveJapaneseLearningSentenceSheetDismissal({
        presence: leaving,
        handsOffToChat: false,
        transcriptReopensSentence: false,
      }),
    ).toEqual({
      presence: JAPANESE_LEARNING_SHEET_GONE,
      resetProgress: true,
      presentChat: false,
      releaseSelection: true,
    });
  });

  test("Ask hand-off: the chat presents over the same bubble, which stays selected", () => {
    expect(
      resolveJapaneseLearningSentenceSheetDismissal({
        presence: leaving,
        handsOffToChat: true,
        transcriptReopensSentence: false,
      }),
    ).toEqual({
      presence: JAPANESE_LEARNING_SHEET_GONE,
      resetProgress: true,
      presentChat: true,
      releaseSelection: false,
    });
  });

  test("a transcript line tapped meanwhile keeps its new selection", () => {
    const dismissal = resolveJapaneseLearningSentenceSheetDismissal({
      presence: leaving,
      handsOffToChat: false,
      transcriptReopensSentence: true,
    });
    expect(dismissal.resetProgress).toBe(true);
    expect(dismissal.releaseSelection).toBe(false);
  });

  test("shown again before the dismissal finished: nothing is reset", () => {
    const shownAgain = requestJapaneseLearningSheet(leaving, true);
    expect(
      resolveJapaneseLearningSentenceSheetDismissal({
        presence: shownAgain,
        handsOffToChat: false,
        transcriptReopensSentence: false,
      }),
    ).toEqual({
      presence: { wanted: true, onScreen: true },
      resetProgress: false,
      presentChat: false,
      releaseSelection: false,
    });
  });
});

describe("Japanese learning chat dismissal", () => {
  const leaving = requestJapaneseLearningSheet(
    requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, true),
    false,
  );

  test("returning to the sentence keeps its bubble and re-presents it", () => {
    expect(
      resolveJapaneseLearningChatDismissal({
        presence: leaving,
        returnsToSentence: true,
        sentenceWanted: false,
      }),
    ).toEqual({
      presence: JAPANESE_LEARNING_SHEET_GONE,
      resetProgress: true,
      presentSentence: true,
      releaseSelection: false,
    });
  });

  test("closed for good (e.g. the reader lost focus): the Ask bubble goes with it", () => {
    const dismissal = resolveJapaneseLearningChatDismissal({
      presence: leaving,
      returnsToSentence: false,
      sentenceWanted: false,
    });
    expect(dismissal.resetProgress).toBe(true);
    expect(dismissal.presentSentence).toBe(false);
    expect(dismissal.releaseSelection).toBe(true);
  });

  test("a sentence sheet shown meanwhile keeps its selection", () => {
    expect(
      resolveJapaneseLearningChatDismissal({
        presence: leaving,
        returnsToSentence: false,
        sentenceWanted: true,
      }).releaseSelection,
    ).toBe(false);
  });
});
