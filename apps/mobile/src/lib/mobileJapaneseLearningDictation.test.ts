import { describe, expect, test } from "bun:test";
import {
  buildMobileJapaneseLearningDictationOptions,
  classifyMobileJapaneseLearningDictationError,
  getMobileJapaneseLearningDictationLang,
  getMobileJapaneseLearningDictationTranscript,
  isMobileJapaneseLearningDictationAvailable,
  reduceMobileJapaneseLearningDictationStatus,
  shouldShowMobileJapaneseLearningDictationButton,
  type MobileJapaneseLearningDictationAction,
  type MobileJapaneseLearningDictationStatus,
} from "./mobileJapaneseLearningDictation";
import { getMobileJapaneseLearningDictationModule } from "./mobileJapaneseLearningDictationModule";

describe("mobile Japanese Learning dictation", () => {
  test("maps the app language to web's speech locales", () => {
    expect(getMobileJapaneseLearningDictationLang("en")).toBe("en-US");
    expect(getMobileJapaneseLearningDictationLang("ja")).toBe("ja-JP");
    expect(getMobileJapaneseLearningDictationLang("zh")).toBe("zh-CN");
    expect(getMobileJapaneseLearningDictationLang("ko")).toBe("ko-KR");
    // Unknown languages pass through, like web's `map[appLang] || appLang`.
    expect(getMobileJapaneseLearningDictationLang("fr")).toBe("fr");
  });

  test("starts a single-utterance session with interim results", () => {
    expect(buildMobileJapaneseLearningDictationOptions("ja")).toEqual({
      lang: "ja-JP",
      interimResults: true,
      continuous: false,
    });
  });

  test("uses the best alternative as the whole draft", () => {
    expect(
      getMobileJapaneseLearningDictationTranscript({
        results: [
          { transcript: "この言葉の意味は", confidence: 0.9, segments: [] },
          { transcript: "この事場の意味は", confidence: 0.4, segments: [] },
        ],
      }),
    ).toBe("この言葉の意味は");
    // An empty interim transcript still replaces the draft.
    expect(
      getMobileJapaneseLearningDictationTranscript({
        results: [{ transcript: "", confidence: -1, segments: [] }],
      }),
    ).toBe("");
    expect(getMobileJapaneseLearningDictationTranscript({ results: [] })).toBeNull();
    expect(getMobileJapaneseLearningDictationTranscript(null)).toBeNull();
  });

  test("walks the listening state like web's toggle / onend / onerror", () => {
    const run = (actions: MobileJapaneseLearningDictationAction[]) =>
      actions.reduce(reduceMobileJapaneseLearningDictationStatus, "idle" as MobileJapaneseLearningDictationStatus);

    expect(run([{ type: "toggle-start" }])).toBe("listening");
    expect(run([{ type: "toggle-start" }, { type: "start" }])).toBe("listening");
    expect(run([{ type: "toggle-start" }, { type: "toggle-stop" }])).toBe("idle");
    expect(run([{ type: "toggle-start" }, { type: "permission-denied" }])).toBe("idle");
    expect(run([{ type: "toggle-start" }, { type: "start" }, { type: "end" }])).toBe("idle");
    expect(
      run([{ type: "toggle-start" }, { type: "error", error: "no-speech" }]),
    ).toBe("idle");
    expect(run([{ type: "toggle-start" }, { type: "abort" }])).toBe("idle");
    expect(run([{ type: "end" }])).toBe("idle");
  });

  test("classifies recognizer errors without surfacing them", () => {
    expect(classifyMobileJapaneseLearningDictationError("aborted")).toBe("benign");
    expect(classifyMobileJapaneseLearningDictationError("no-speech")).toBe("benign");
    expect(classifyMobileJapaneseLearningDictationError("speech-timeout")).toBe("benign");
    expect(classifyMobileJapaneseLearningDictationError("not-allowed")).toBe("permission");
    expect(classifyMobileJapaneseLearningDictationError("service-not-allowed")).toBe(
      "unavailable",
    );
    expect(classifyMobileJapaneseLearningDictationError("language-not-supported")).toBe(
      "unavailable",
    );
    expect(classifyMobileJapaneseLearningDictationError("network")).toBe("failure");
    expect(classifyMobileJapaneseLearningDictationError("audio-capture")).toBe("failure");
    expect(classifyMobileJapaneseLearningDictationError(undefined)).toBe("failure");
  });

  test("hides the mic unless the native recognizer is linked and usable", () => {
    expect(isMobileJapaneseLearningDictationAvailable(null)).toBe(false);
    expect(isMobileJapaneseLearningDictationAvailable(undefined)).toBe(false);
    expect(
      isMobileJapaneseLearningDictationAvailable({ isRecognitionAvailable: () => false }),
    ).toBe(false);
    expect(
      isMobileJapaneseLearningDictationAvailable({
        isRecognitionAvailable: () => {
          throw new Error("native call failed");
        },
      }),
    ).toBe(false);
    expect(
      isMobileJapaneseLearningDictationAvailable({ isRecognitionAvailable: () => true }),
    ).toBe(true);
  });

  test("is import-safe without the native module", () => {
    // The non-native entry (used by tests / web) never reaches for the module.
    expect(getMobileJapaneseLearningDictationModule()).toBeNull();
  });

  test("shows the mic in the send slot only while the draft is empty", () => {
    expect(
      shouldShowMobileJapaneseLearningDictationButton({ available: true, input: "" }),
    ).toBe(true);
    expect(
      shouldShowMobileJapaneseLearningDictationButton({ available: true, input: "   " }),
    ).toBe(true);
    expect(
      shouldShowMobileJapaneseLearningDictationButton({ available: true, input: "hi" }),
    ).toBe(false);
    expect(
      shouldShowMobileJapaneseLearningDictationButton({ available: false, input: "" }),
    ).toBe(false);
  });
});
