import { describe, expect, test } from "bun:test";
import {
  JAPANESE_LEARNING_SHEET_BACKDROP,
  shouldShowJapaneseLearningSheetBackdrop,
} from "./mobileJapaneseLearningSheetBackdrop";

const base = { ocrSheetVisible: false, chatVisible: false, chatHandoffPending: false };

describe("Japanese learning sheet backdrop", () => {
  test("covers the reader while the compact sentence or chat sheet is up", () => {
    expect(shouldShowJapaneseLearningSheetBackdrop(base)).toBe(false);
    expect(shouldShowJapaneseLearningSheetBackdrop({ ...base, ocrSheetVisible: true })).toBe(true);
    expect(shouldShowJapaneseLearningSheetBackdrop({ ...base, chatVisible: true })).toBe(true);
  });

  test("stays up across the sentence → chat hand-off instead of flickering", () => {
    expect(shouldShowJapaneseLearningSheetBackdrop({ ...base, chatHandoffPending: true })).toBe(true);
  });

  test("matches web's bg-black/10 and a short fade", () => {
    expect(JAPANESE_LEARNING_SHEET_BACKDROP.dimOpacity).toBe(0.1);
    expect(JAPANESE_LEARNING_SHEET_BACKDROP.reducedTransparencyDimOpacity).toBeGreaterThan(0.1);
    expect(JAPANESE_LEARNING_SHEET_BACKDROP.fadeMs).toBe(150);
  });
});
