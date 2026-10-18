import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Settings opened scrolled to the middle with the first rows out of reach: the
 * popover's Form had a fixed height from a row count, and a frame taller than
 * the space the system gives the popover is centred in it. The count is only
 * the popover's ideal height now (a Form has none of its own); the system
 * caps the popover and the Form scrolls from its top.
 */
describe("reader settings presentation", () => {
  const source = mobileSource("components/reader/ReaderSettingsNativePopover.ios.tsx");

  test("the popover's Form proposes an ideal height, never a fixed one", () => {
    expect(source).toContain("frame({ minWidth: presentation.width, idealWidth: presentation.width, maxWidth: presentation.width, idealHeight: presentation.height })");
    expect(source).not.toContain("frame({ width: presentation.width, height: presentation.height })");
  });

  test("popover and sheet open at the top of the Form", () => {
    const layout = source.slice(source.indexOf("const formLayoutModifiers = ["), source.indexOf("];", source.indexOf("const formLayoutModifiers = [")));
    expect(layout).toContain('defaultScrollAnchor("top")');
  });
});
