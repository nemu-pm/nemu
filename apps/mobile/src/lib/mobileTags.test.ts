import { describe, expect, test } from "bun:test";
import {
  getMobileTagOverflowCount,
  getMobileVisibleTags,
  MOBILE_TAG_LIMIT,
} from "./mobileTags";

describe("mobile tag presentation", () => {
  test("keeps duplicate source tags renderable with stable unique keys", () => {
    expect(getMobileVisibleTags(["Action", "Drama", "Action"])).toEqual([
      { key: "0:Action", label: "Action" },
      { key: "1:Drama", label: "Drama" },
      { key: "2:Action", label: "Action" },
    ]);
  });

  test("matches web manga pages by showing ten tags and an overflow count", () => {
    const tags = Array.from({ length: 12 }, (_value, index) => `Tag ${index + 1}`);

    expect(getMobileVisibleTags(tags)).toHaveLength(MOBILE_TAG_LIMIT);
    expect(getMobileTagOverflowCount(tags)).toBe(2);
    expect(getMobileTagOverflowCount(tags.slice(0, MOBILE_TAG_LIMIT))).toBe(0);
  });
});
