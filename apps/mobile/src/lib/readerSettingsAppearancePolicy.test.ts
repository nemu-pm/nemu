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

/**
 * Regression: the compact-width settings sheet appeared in place (no slide
 * up) and then grew its rows in. Its `presentationBackground` sat on the Form
 * inside the sheet's NavigationStack, which reaches UIKit only after the
 * presentation has started; and its height came from the Form measuring
 * itself in the sheet, so the detent changed while the sheet was presenting.
 */
describe("reader settings sheet presentation", () => {
  const source = mobileSource("components/reader/ReaderSettingsNativePopover.ios.tsx");

  test("presentation modifiers are on the presented root: the popover's Form, the sheet's Group", () => {
    expect(source).toContain(
      "? [frame({ width: presentation.width, height: presentation.height }), ...presentationModifiers]",
    );
    const sheet = source.indexOf("<SwiftBottomSheet");
    const stack = source.indexOf("<SwiftNavigationStack", sheet);
    expect(source.slice(sheet, stack)).toContain("...presentationModifiers,");
    // Defined once, in `presentationModifiers`.
    expect(source.match(/presentationBackground\(/g)?.length).toBe(1);
  });

  test("the sheet's height is measured off screen before it presents", () => {
    const host = source.indexOf("if (sheet) {");
    const sheet = source.indexOf("<SwiftBottomSheet", host);
    expect(source.slice(host, sheet)).toContain("{measuringCopy}");
    const copy = source.slice(source.indexOf("const measuringCopy = ("), host);
    expect(copy).toContain("...formLayoutModifiers,");
    expect(copy).toContain("group: READER_SETTINGS_SHEET_GROUP");
    expect(copy).toContain("{settingsSections}");
    expect(copy).not.toContain("presentationModifiers");
    // Re-rendered only when the rows' height can change, never by `visible`.
    expect(copy).toContain("heightKey={JSON.stringify([measureFrame, settingsRows, saving,");
    expect(source).toContain("(previous, next) => previous.heightKey === next.heightKey");
    expect(source).toMatch(
      /fitSheetDetentToContent\(\{\s*group: READER_SETTINGS_SHEET_GROUP,\s*page: READER_SETTINGS_SHEET_PAGE,/,
    );
    expect(source).toContain("reportSheetContentHeight({ page: READER_SETTINGS_SHEET_PAGE })");
  });
});
