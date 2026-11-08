import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relative: string) =>
  readFileSync(path.join(import.meta.dir, "..", relative), "utf8");

describe("ExploreRailFade never clips its rail vertically", () => {
  test("the mask overscans like ExploreRowFade and pads its content back", () => {
    const fade = read("components/explore/ExploreSourceHome.tsx");
    expect(fade).toContain(
      'import { EXPLORE_ROW_FADE_ABOVE, EXPLORE_ROW_FADE_BELOW } from "./ExploreRowFade";',
    );
    expect(fade).toContain("marginTop: marginTop - EXPLORE_ROW_FADE_ABOVE,");
    expect(fade).toContain("marginBottom: marginBottom - EXPLORE_ROW_FADE_BELOW,");
    expect(fade).toContain(
      "overscan: { paddingTop: EXPLORE_ROW_FADE_ABOVE, paddingBottom: EXPLORE_ROW_FADE_BELOW },",
    );
    expect(fade).toContain('<View pointerEvents="box-none" style={styles.overscan}>');
    expect(fade).toContain('export const EXPLORE_RAIL_FADE_SCROLLER = { overflow: "visible" } as const;');
  });

  test("every rail inside it lets its shadows overflow the scroller", () => {
    const home = read("components/SourceHomeView.tsx");
    expect(home).not.toContain("style={mobileDesignExploreFlag ? undefined : bleed.frame}");
    expect(
      home.split("style={mobileDesignExploreFlag ? EXPLORE_RAIL_FADE_SCROLLER : bleed.frame}").length - 1,
    ).toBe(2);
    expect(home).toContain("exploreFeaturedPager: { flexGrow: 0, ...EXPLORE_RAIL_FADE_SCROLLER },");

    const hero = read("components/explore/MobileMangaDetailBooksHero.tsx");
    expect(hero).toContain("style={EXPLORE_RAIL_FADE_SCROLLER}");
    expect(hero).toContain('style={[EXPLORE_RAIL_FADE_SCROLLER, pushStyle("tags")]}');
  });
});
