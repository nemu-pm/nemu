import { describe, expect, test } from "bun:test";

import { findMobileTranscriptPlaybackLineOrder } from "./mobileJapaneseLearningTranscriptTiming";

describe("mobile Japanese Learning transcript timing", () => {
  test("maps playback time to transcript lines by readable character weight", () => {
    const lines = [
      { order: 10, text: "ああ" },
      { order: 20, text: "いいいい" },
      { order: 30, text: "うう" },
    ];

    expect(findMobileTranscriptPlaybackLineOrder(lines, 0, 8)).toBe(10);
    expect(findMobileTranscriptPlaybackLineOrder(lines, 2.1, 8)).toBe(20);
    expect(findMobileTranscriptPlaybackLineOrder(lines, 6.2, 8)).toBe(30);
  });

  test("ignores punctuation and blank lines", () => {
    const lines = [
      { order: 1, text: "  " },
      { order: 2, text: "「はい！」" },
      { order: 3, text: "..." },
      { order: 4, text: "そうです" },
    ];

    expect(findMobileTranscriptPlaybackLineOrder(lines, 0.1, 4)).toBe(2);
    expect(findMobileTranscriptPlaybackLineOrder(lines, 3.9, 4)).toBe(4);
  });

  test("returns null without usable timing evidence", () => {
    expect(findMobileTranscriptPlaybackLineOrder([], 1, 10)).toBeNull();
    expect(
      findMobileTranscriptPlaybackLineOrder([{ order: 1, text: "" }], 1, 10),
    ).toBeNull();
    expect(
      findMobileTranscriptPlaybackLineOrder([{ order: 1, text: "はい" }], 1, 0),
    ).toBeNull();
  });
});
