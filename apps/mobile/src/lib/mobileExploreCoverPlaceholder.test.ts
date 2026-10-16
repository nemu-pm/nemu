import { describe, expect, test } from "bun:test";
import { getMobileExploreCoverPlaceholderSize, getMobileExploreCoverPlaceholderTitleScale } from "./mobileExploreCoverPlaceholder";

describe("cover placeholder title size", () => {
  test("the title scales with the cover: dropped on tiny or unreadable covers, compact, regular, then large on hero covers", () => {
    const cases: Array<[number, ReturnType<typeof getMobileExploreCoverPlaceholderSize>]> = [
      [20, "mini"],
      [Number.NaN, "mini"],
      [58, "compact"],
      [118, "regular"],
      [210, "large"],
    ];
    for (const [width, size] of cases) expect(getMobileExploreCoverPlaceholderSize(width)).toBe(size);
  });
});

describe("cover placeholder title scale", () => {
  test("a word too long for the line shrinks the title instead of breaking mid-word", () => {
    const scale = getMobileExploreCoverPlaceholderTitleScale("Pepper&Carrot", 144, 24);
    expect(scale).toBeLessThan(1);
    expect(13 * 24 * scale * 0.56).toBeLessThanOrEqual(144.0001);
  });

  test("short words, CJK, or nothing to measure: full size; never below the floor", () => {
    expect(getMobileExploreCoverPlaceholderTitleScale("One Piece", 144, 24)).toBe(1);
    expect(getMobileExploreCoverPlaceholderTitleScale("葬送のフリーレン", 60, 24)).toBe(1);
    expect(getMobileExploreCoverPlaceholderTitleScale("", 144, 24)).toBe(1);
    expect(getMobileExploreCoverPlaceholderTitleScale("Supercalifragilisticexpialidocious", 40, 24)).toBe(0.55);
  });
});
