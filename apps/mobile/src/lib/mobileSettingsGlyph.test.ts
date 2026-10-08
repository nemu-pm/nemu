import { describe, expect, test } from "bun:test";
import { getMobileSettingsOutlineGlyph, MOBILE_SETTINGS_GLYPH } from "./mobileSettingsGlyph";

describe("settings glyphs in the new design", () => {
  test("outline names pass through and filled names take the outline form", () => {
    expect(getMobileSettingsOutlineGlyph("book")).toBe("book-outline");
    expect(getMobileSettingsOutlineGlyph("server-outline")).toBe("server-outline");
    expect(getMobileSettingsOutlineGlyph("flask-sharp")).toBe("flask-sharp");
  });

  test("the glyph is drawn bare at the original size in a fixed box", () => {
    expect(MOBILE_SETTINGS_GLYPH.size).toBe(20);
    expect(MOBILE_SETTINGS_GLYPH.box).toBeGreaterThanOrEqual(MOBILE_SETTINGS_GLYPH.size);
  });
});
