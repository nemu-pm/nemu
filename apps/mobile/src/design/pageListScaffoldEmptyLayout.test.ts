import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageScaffold = readFileSync(
  path.join(import.meta.dir, "../design-system/components/PageScaffold.tsx"),
  "utf8",
);

describe("a page list's onLayout is the list's own frame (PageListScaffold)", () => {
  test("the empty element's frame is not handed to the list's onLayout", () => {
    // VirtualizedList clones its empty element with an onLayout that calls the
    // list's onLayout with the empty element's frame. The Library grid took an
    // empty collection's card (inside the gutters) as the list's width, and All
    // came back with narrower covers and a gap on the right.
    expect(pageScaffold).toContain("function FontScaleKeyedListSlot({ slot, layoutKey, style }");
    expect(pageScaffold).not.toMatch(/onLayout\?\.\(event\);\s*own\.onLayout\?\.\(event\);/);
  });
});
