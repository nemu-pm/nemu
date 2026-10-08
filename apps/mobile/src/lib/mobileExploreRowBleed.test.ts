import { describe, expect, test } from "bun:test";
import { getMobileExploreRowBleed, MOBILE_EXPLORE_BAR_SIDE_REACH } from "./mobileExploreRowBleed";
import { getMobilePageBleedStyles, getMobilePageGutters } from "./mobilePageGutters";

describe("getMobileExploreRowBleed", () => {
  test("no vertical bar: the page's own bleed, nothing clipped", () => {
    const bleed = getMobilePageBleedStyles(getMobilePageGutters({ left: 0, right: 0 }, 20), 0, null);
    expect(getMobileExploreRowBleed(bleed, null)).toEqual({
      frame: { marginLeft: -20, marginRight: -20 },
      content: { paddingLeft: 20, paddingRight: 20 },
      clips: false,
    });
  });

  test("bar on the right (Duo outer display): items rest on the page's content edge and the row clips", () => {
    // Safe-area insets are per edge: the bar holds 84 pt on the right only.
    const gutters = getMobilePageGutters({ left: 0, right: 84 }, 20);
    const bleed = getMobilePageBleedStyles(gutters, 0, "right");
    const row = getMobileExploreRowBleed(bleed, "right");
    expect(row.clips).toBe(true);
    // The away side still bleeds to the screen edge.
    expect(row.frame.marginLeft).toBe(-20);
    expect(row.content.paddingLeft).toBe(20);
    // The bar side: frame reach and padding cancel, so the last item ends on the page edge.
    expect(row.frame.marginRight + row.content.paddingRight).toBe(0);
    expect(row.frame.marginRight).toBe(-MOBILE_EXPLORE_BAR_SIDE_REACH);
  });

  test("bar on the left: mirrored, the first item starts on the page edge", () => {
    const gutters = getMobilePageGutters({ left: 84, right: 0 }, 20);
    const row = getMobileExploreRowBleed(getMobilePageBleedStyles(gutters, 0, "left"), "left");
    expect(row.frame.marginLeft + row.content.paddingLeft).toBe(0);
    expect(row.frame.marginRight).toBe(-20);
    expect(row.content.paddingRight).toBe(20);
    expect(row.clips).toBe(true);
  });
});
