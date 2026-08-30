import { describe, expect, test } from "bun:test";
import { createMobileJapaneseLearningScreenLifecycle } from "./mobileJapaneseLearningScreenLifecycle";

describe("mobile Japanese Learning screen lifecycle", () => {
  test("replacing an operation aborts only its previous run", () => {
    const lifecycle = createMobileJapaneseLearningScreenLifecycle();
    const firstOcr = lifecycle.begin("ocr");
    const chat = lifecycle.begin("chat");
    const secondOcr = lifecycle.begin("ocr");

    expect(firstOcr.aborted).toBe(true);
    expect(firstOcr.reason).toBeInstanceOf(Error);
    expect(secondOcr.aborted).toBe(false);
    expect(chat.aborted).toBe(false);
  });

  test("aborts every owned request when the reader leaves", () => {
    const lifecycle = createMobileJapaneseLearningScreenLifecycle();
    const signals = [
      lifecycle.begin("ocr"),
      lifecycle.begin("grammar"),
      lifecycle.begin("chat"),
      lifecycle.begin("tts-playback"),
      lifecycle.begin("tts-prefetch"),
    ];

    lifecycle.abortAll();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
