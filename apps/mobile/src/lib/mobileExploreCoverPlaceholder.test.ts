import { describe, expect, test } from "bun:test";
import { getMobileExploreCoverPlaceholderSize } from "./mobileExploreCoverPlaceholder";

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
