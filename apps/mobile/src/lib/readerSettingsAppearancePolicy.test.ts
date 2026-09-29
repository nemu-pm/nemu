import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Regression: the reader's native settings popover rendered as a light system
 * popover with white (dark-scheme) row labels. The presentation container
 * takes its appearance from the controller UIKit presents it from, so only
 * the presentation's own preferred color scheme — from the same scheme as the
 * Host and the rows — keeps the two from disagreeing.
 */
describe("reader settings appearance policy", () => {
  test("the native popover / sheet takes its appearance from one scheme", () => {
    const source = mobileSource("components/reader/ReaderSettingsNativePopover.ios.tsx");

    expect(source).toContain("const { scheme, tokens } = useNemuTheme();");
    expect(source).toContain("presentationColorScheme(scheme)");
    expect(source.match(/<SwiftHost colorScheme=\{scheme\}/g)?.length).toBe(2);
    // No second, content-only source that can drift from the container.
    expect(source).not.toContain('environment("colorScheme"');
    expect(source).not.toContain('colorScheme="dark"');
  });

  test("the reader renders the native settings inside its dark scope", () => {
    const source = mobileSource("screens/ReaderScreen.tsx");
    const start = source.indexOf("{useNativeReaderSettings ? (");
    const popover = source.indexOf("<ReaderSettingsNativePopover", start);
    const scope = source.indexOf("<ReaderDarkThemeScope>", start);

    expect(start).toBeGreaterThan(0);
    expect(scope).toBeGreaterThan(start);
    expect(scope).toBeLessThan(popover);
  });

  test("the forced dark screen appearance stays mounted on every display and covers the bars while focused", () => {
    const source = mobileSource("screens/ReaderScreen.tsx");

    expect(source).toMatch(
      /<VerticalBarBehavior\s+disabled=\{readerVerticalBar\.optOut\}\s+appearance="dark"\s+appearanceCoversBars=\{readerIsFocused\}\s*\/>/,
    );
    expect(source).not.toContain('<VerticalBarBehavior disabled appearance="dark" />');
  });
});
