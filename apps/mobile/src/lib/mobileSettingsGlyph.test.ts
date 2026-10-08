import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileSettingsOutlineGlyph, MOBILE_SETTINGS_GLYPH } from "./mobileSettingsGlyph";

const root = path.join(import.meta.dir, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

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

  test("no tinted tile is left behind any settings glyph", () => {
    for (const file of [
      "src/screens/SettingsScreen.tsx",
      "src/components/explore/ExploreSettingsGroup.tsx",
      "src/components/explore/ExploreSettingsGlyph.tsx",
      "src/components/MobileCloudSyncCard.tsx",
      "src/components/MobileAgentStatusCard.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toContain("exploreTile");
      expect(source).not.toContain("EXPO_PUBLIC_NEMU_SETTINGS_TILES");
      expect(source).not.toMatch(/\btile:/);
    }
  });

  test("the Settings root rows use the outline glyphs", () => {
    const screen = read("src/screens/SettingsScreen.tsx");
    for (const name of [
      "book-outline",
      "server-outline",
      "color-palette-outline",
      "folder-open-outline",
      "information-circle-outline",
      "flask-outline",
    ]) {
      expect(screen).toContain(`"${name}"`);
    }
    expect(read("src/components/explore/ExploreSettingsGlyph.tsx")).toContain("getMobileSettingsOutlineGlyph");
  });
});
