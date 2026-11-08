import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Settings opened scrolled to the middle with the first rows out of reach: the
 * popover's Form had a fixed height from a row count, and a frame taller than
 * the space the system gives the popover is centred in it. The popover's
 * ideal height is now what its off-screen copy measured at the popover's
 * width (any text size); the system shows it whole when there is room and
 * caps it otherwise, the Form scrolling from its top.
 */
describe("reader settings presentation", () => {
  const source = mobileSource("components/reader/ReaderSettingsNativePopover.ios.tsx");

  test("the popover's Form takes its measured height as its ideal, never a fixed one", () => {
    expect(source).toContain("fitPopoverToContent({");
    // The Reader page's measured size for the whole presentation: a pushed
    // plugin page keeps it (and scrolls), like a system popover's push.
    expect(source).toContain("page: READER_SETTINGS_POPOVER_PAGE,");
    expect(source).not.toContain("page: topPage");
    expect(source).not.toContain("frame({ width: presentation.width, height: presentation.height })");
  });

  test("the popover's rows are measured at the popover's width, in their own host", () => {
    expect(source).toContain("{ width: presentation.width, height: Math.round(windowSize.height) }");
    const popoverBranch = source.slice(source.lastIndexOf("return (\n    <>"), source.indexOf("<SwiftPopover\n"));
    const anchorView = popoverBranch.indexOf("styles.anchor");
    // The copy sits in its own off-screen host, never in the popover's (it moved the arrow).
    expect(popoverBranch.indexOf("{measuringCopy}")).toBeGreaterThan(0);
    expect(popoverBranch.indexOf("{measuringCopy}")).toBeLessThan(anchorView);
  });

  test("popover and sheet open at the top of the Form", () => {
    const layout = source.slice(source.indexOf("const formLayoutModifiers = ["), source.indexOf("];", source.indexOf("const formLayoutModifiers = [")));
    expect(layout).toContain('defaultScrollAnchor("top")');
  });
});

/**
 * Folding or unfolding with the reader settings open changed the reader under
 * the sheet: in the book posture any open reader sheet moved the page to the
 * free half (one page, the spread given up), so flat ⇄ book under the open
 * settings laid the pages out differently than with them closed.
 */
describe("the reader under the open settings", () => {
  const reader = mobileSource("screens/ReaderScreen.tsx");

  test("the settings sheet never moves the page to the other half in the book posture", () => {
    const start = reader.indexOf("const readerBookSheetOpen =");
    const end = reader.indexOf(";", start);
    expect(start).toBeGreaterThanOrEqual(0);
    const sheets = reader.slice(start, end);
    expect(sheets).not.toContain("readerDisplaySettingsOpen");
    // The chapter sheet too: it is presented as the settings are.
    expect(sheets).not.toContain("readerChapterListOpen");
    expect(sheets).toContain("japaneseLearningOcrSheetVisible");
  });
});

/**
 * The settings sheet's groups: the page (turning, layout, fit, background)
 * under one footnote, the pairing pair on its own, and Avoid Camera Area in
 * More with its footnote (no Outer Display group). Shift by One Page keeps
 * its title in the label colour and its icon in the accent, like every row.
 */
describe("reader settings groups", () => {
  const source = mobileSource("components/reader/ReaderSettingsNativePopover.ios.tsx");

  test("one page group with one footnote; no outer display group", () => {
    expect(source).toContain("<SwiftSection footer={pageFootnote ? <SwiftText>{pageFootnote}</SwiftText> : undefined}>");
    expect(source).not.toContain("strings.reader.outerDisplayMode");
    expect(source.match(/footer=\{<SwiftText>\{strings\.reader\.pageFitFootnote\}/g)).toBeNull();
  });

  test("Shift by One Page's icon is in the accent", () => {
    expect(source).toContain("formRowIcon(shiftPairingSystemImage, { actionRow: true })");
    expect(source).not.toContain("formRowIcon(shiftPairingSystemImage, { tinted: false })");
  });
});
