import { describe, expect, test } from "bun:test";
import glyphMap from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { MOBILE_READER_CHROME_GLYPHS } from "./mobileReaderBarIcons";

describe("reader vertical bar glyphs", () => {
  test("the chapter list is outlined like the gear, at its size", () => {
    const { chapterList, settings } = MOBILE_READER_CHROME_GLYPHS;
    expect(chapterList.name).toBe("list-outline");
    expect(chapterList.size).toBe(settings.size);
  });

  test("every glyph is an Ionicon, so the bar draws one icon set", () => {
    for (const glyph of Object.values(MOBILE_READER_CHROME_GLYPHS)) {
      expect(glyph.name in glyphMap).toBe(true);
    }
  });

  test("the cover view's toggle is outlined like the gear, at its size", () => {
    const { coverViewShowCover, coverViewShowPages, settings } = MOBILE_READER_CHROME_GLYPHS;
    for (const glyph of [coverViewShowCover, coverViewShowPages]) {
      expect(glyph.name.endsWith("-outline")).toBe(true);
      expect(glyph.size).toBe(settings.size);
    }
  });
});
