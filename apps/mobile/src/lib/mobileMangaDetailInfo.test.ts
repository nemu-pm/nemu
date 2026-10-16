import { describe, expect, test } from "bun:test";
import { splitMobileDescriptionParagraphs } from "./mobileMangaDetailInfo";

describe("splitMobileDescriptionParagraphs", () => {
  test("one paragraph per non-empty line, trimmed", () => {
    expect(splitMobileDescriptionParagraphs("  First line.\r\n\r\nSecond line. \nThird")).toEqual([
      "First line.",
      "Second line.",
      "Third",
    ]);
  });

  test("blank text has no paragraphs", () => {
    expect(splitMobileDescriptionParagraphs(" \n\n ")).toEqual([]);
  });
});
