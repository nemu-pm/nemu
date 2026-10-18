import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * The settings button looked "highlighted" while its settings were open: a
 * fill painted behind the glyph that never lined up with the glass button.
 * Like the other chrome buttons, only the glyph brightens.
 */
describe("reader settings button", () => {
  test("no open-state fill behind the settings glyph", () => {
    const source = mobileSource("screens/ReaderScreen.tsx");
    const start = source.indexOf("const settingsButton = (");
    const end = source.indexOf("</NemuPressable>", start);
    const button = source.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(button).not.toContain("readerChromeColors.hover");
    expect(button).toContain('backgroundColor: "transparent"');
  });
});
