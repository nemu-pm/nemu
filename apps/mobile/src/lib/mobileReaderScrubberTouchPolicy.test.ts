import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Source policy: nothing next to or around the page scrubber may take its
// drags. Both regressions were invisible to unit tests of the slider itself.
const readerSource = readFileSync(
  path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"),
  "utf8",
);

describe("reader scrubber touch policy", () => {
  test("the chapter buttons beside the slider have no hit slop facing it", () => {
    expect(readerSource).toContain(
      "READER_SCRUBBER_LEADING_BUTTON_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 0 }",
    );
    expect(readerSource).toContain(
      "READER_SCRUBBER_TRAILING_BUTTON_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 6 }",
    );
    expect(readerSource.match(/hitSlop=\{READER_SCRUBBER_LEADING_BUTTON_HIT_SLOP\}/g)).toHaveLength(1);
    expect(readerSource.match(/hitSlop=\{READER_SCRUBBER_TRAILING_BUTTON_HIT_SLOP\}/g)).toHaveLength(1);
  });

  test("the scrubber's glass capsule is a non-interactive panel", () => {
    const capsules = [
      ...readerSource.matchAll(/<ReaderCapsule\b[^>]*style=\{styles\.readerScrubberCapsule\}[^>]*>/g),
    ].map((match) => match[0]);
    expect(capsules.length).toBeGreaterThan(0);
    for (const capsule of capsules) expect(capsule).toContain("interactive={false}");
  });
});
