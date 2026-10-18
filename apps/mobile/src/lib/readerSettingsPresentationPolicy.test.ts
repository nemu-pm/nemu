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
    expect(source).toContain("page: READER_SETTINGS_POPOVER_PAGE,");
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
