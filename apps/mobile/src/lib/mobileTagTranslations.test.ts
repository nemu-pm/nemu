import { describe, expect, test } from "bun:test";
import {
  anilistTagsEn,
  anilistTagsJa,
  anilistTagsZh,
  genresEn,
  genresJa,
  genresZh,
  translateTags,
} from "../../../../src/lib/metadata/translations";
import { translateMobileTags } from "./mobileTagTranslations";

describe("translateMobileTags", () => {
  const tags = Array.from(
    new Set([
      ...(genresEn as string[]),
      ...Object.keys(anilistTagsEn),
      ...Object.keys(genresJa),
      ...Object.keys(genresZh),
      ...Object.keys(anilistTagsJa),
      ...Object.keys(anilistTagsZh),
      "Not A Tag",
      "",
    ]),
  );

  test("matches the web translateTags for every known tag in every language", () => {
    for (const lang of ["en", "ja", "zh"] as const) {
      expect(translateMobileTags(tags, lang)).toEqual(translateTags(tags, lang));
    }
  });
});
