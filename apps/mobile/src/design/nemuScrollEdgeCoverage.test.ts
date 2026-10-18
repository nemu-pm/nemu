import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every scrolling surface of the listed screens takes the shared soft edge
 * (`useNemuScrollEdge`): page scroll views go through `PageScaffold` /
 * `PageListScaffold` (which draw `NemuScrollEdgeSurface`), RN-drawn sheet
 * bodies through `NemuSheetScrollEdge` (`{...edge}` spread on the scroll
 * view), SwiftUI forms through `nemuSoftScrollEdge()`. A raw vertical
 * ScrollView / FlatList / SectionList, or a SwiftUI Form without the soft
 * style, falls back to `automatic`, which the iOS 27 SDK draws `hard`.
 */
const SRC = join(import.meta.dir, "..");

const SCREENS = [
  "screens/LibraryScreen.tsx",
  "screens/BrowseScreen.tsx",
  "screens/SearchScreen.tsx",
  "screens/SettingsScreen.tsx",
  "screens/SourceBrowseScreen.tsx",
  "screens/SourceMangaScreen.tsx",
  "screens/MangaDetailScreen.tsx",
  "components/MobileMangaDetailSplitLayout.tsx",
  "components/SourceHomeView.tsx",
  "components/explore/ExploreSearchIdle.tsx",
  "components/MobileCollectionBooksSheet.tsx",
] as const;

const SWIFTUI_SCREENS = [
  "screens/AccountScreen.ios.tsx",
  "screens/ServerSourceScreen.ios.tsx",
  "components/MobileNativeFormSheet.ios.tsx",
] as const;

const RAW_SCROLL = /<(ScrollView|FlatList|SectionList|Animated\.ScrollView|Animated\.FlatList)(?=[\s>])/g;

function rawVerticalScrollViews(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(RAW_SCROLL)) {
    const opening = source.slice(match.index!, match.index! + 400);
    if (/\bhorizontal\b/.test(opening) || /\{\.\.\.edge\}/.test(opening)) continue;
    const line = source.slice(0, match.index!).split("\n").length;
    offenders.push(`${match[1]} at line ${line}`);
  }
  return offenders;
}

describe("soft scroll edge coverage", () => {
  test.each([...SCREENS])("%s: every vertical scroll view takes the shared edge", (file) => {
    expect(rawVerticalScrollViews(readFileSync(join(SRC, file), "utf8"))).toEqual([]);
  });

  test.each([...SWIFTUI_SCREENS])("%s: every SwiftUI Form is pinned to the soft edge", (file) => {
    const source = readFileSync(join(SRC, file), "utf8");
    const forms = [...source.matchAll(/<SwiftForm\b[^>]*?(?:modifiers=\{\[([\s\S]*?)\]\})?/g)];
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      const opening = source.slice(form.index!, form.index! + 400);
      expect(opening).toMatch(/nemuSoftScrollEdge\(\)|scrollEdgeEffectStyle\("soft"/);
    }
  });

  test("the page scaffolds draw the shared edge surface around their scroll view", () => {
    const scaffold = readFileSync(join(SRC, "design-system/components/PageScaffold.tsx"), "utf8");
    expect(scaffold.match(/<NemuScrollEdgeSurface\b/g)?.length).toBe(2);
    expect(rawVerticalScrollViews(scaffold.replace(/<NemuScrollEdgeSurface[\s\S]*?<\/NemuScrollEdgeSurface>/g, ""))).toEqual([]);
  });

  test("the guard catches a raw vertical list", () => {
    expect(rawVerticalScrollViews("<FlatList\n  data={rows}\n/>")).toEqual(["FlatList at line 1"]);
    expect(rawVerticalScrollViews("<ScrollView horizontal>")).toEqual([]);
    expect(rawVerticalScrollViews("<FlatList\n  {...edge}\n/>")).toEqual([]);
  });
});
