import { describe, expect, test } from "bun:test";
import {
  shouldAutoRunMobileJapaneseLearningTranscriptOcr,
  mobileJapaneseLearningSentenceActionsLayout as layout,
} from "./mobileJapaneseLearningTranscriptFlow";

const base = {
  visible: true,
  ocrStatus: "idle" as const,
  noImageDetail: "no image",
  detectorChanged: false,
};

describe("transcript auto-detect (web navbar flow)", () => {
  test("scans an unscanned page as soon as the transcript is visible", () => {
    expect(shouldAutoRunMobileJapaneseLearningTranscriptOcr(base)).toBe(true);
  });

  test("never scans while hidden", () => {
    expect(shouldAutoRunMobileJapaneseLearningTranscriptOcr({ ...base, visible: false })).toBe(false);
  });

  test("leaves in-flight and finished scans alone", () => {
    for (const ocrStatus of ["loading", "ready"] as const) {
      expect(
        shouldAutoRunMobileJapaneseLearningTranscriptOcr({ ...base, ocrStatus, detectorChanged: true }),
      ).toBe(false);
    }
  });

  test("retries a not-yet-measurable page only once its detector changes", () => {
    const noImage = { ...base, ocrStatus: "error" as const, ocrErrorDetail: "no image" };
    expect(shouldAutoRunMobileJapaneseLearningTranscriptOcr(noImage)).toBe(false);
    expect(shouldAutoRunMobileJapaneseLearningTranscriptOcr({ ...noImage, detectorChanged: true })).toBe(true);
  });

  test("keeps real failures on their Retry action", () => {
    expect(
      shouldAutoRunMobileJapaneseLearningTranscriptOcr({
        ...base,
        ocrStatus: "error",
        ocrErrorDetail: "service unavailable",
        detectorChanged: true,
      }),
    ).toBe(false);
  });
});

describe("sentence action row (web footer)", () => {
  test("keeps web's labelled row on phone sheets and wide panels", () => {
    for (const footerWidth of [0, 378, 420, 900]) {
      expect(layout({ fontScale: 1, footerWidth })).toBe("row");
    }
  });
  test("keeps the row with icon-only secondary actions in narrow panels", () => {
    expect(layout({ fontScale: 1, footerWidth: 300 })).toBe("compact");
  });
  test("stacks only for large Dynamic Type", () => {
    expect(layout({ fontScale: 1.5, footerWidth: 900 })).toBe("stacked");
  });
});
