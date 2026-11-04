import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Source contract (same approach as mobileWelcome.test.ts): navigation-bar
// items take the platform's own colour. Nothing in the shared helper or the
// screens hands a tint to the bar or to an item — on iOS 26+ a per-item tint
// is the only thing that colours a Liquid Glass bar item, and on Android the
// item falls back to the header's content colour.
const read = (relative: string) =>
  readFileSync(path.join(import.meta.dir, relative), "utf8");

const navigationSource = read("./navigation.ts");

const TOOLBAR_SCREENS = [
  "../screens/LibraryScreen.tsx",
  "../screens/BrowseScreen.tsx",
  "../screens/SourceBrowseScreen.tsx",
  "../screens/SourceMangaScreen.tsx",
  "../screens/MangaDetailScreen.tsx",
  "../screens/SettingsScreen.tsx",
];

describe("native toolbar items use the platform colour", () => {
  test("the shared stack options set no header tint", () => {
    expect(navigationSource).not.toContain("headerTintColor");
  });

  test("toolbar buttons are rendered without a tint", () => {
    expect(navigationSource).not.toContain("tintColor");
    expect(navigationSource).toContain(
      "export function renderNemuNativeToolbarButtons(\n  actions: NemuNativeHeaderAction[],\n) {",
    );
  });

  test.each(TOOLBAR_SCREENS)("%s passes no tint to its toolbars", (screen) => {
    const source = read(screen);
    expect(source).not.toMatch(/<Stack\.Toolbar\b[^>]*\btintColor=/);
    expect(source).not.toMatch(/renderNemuNativeToolbarButtons\([^)]*tokens\./);
    expect(source).not.toContain("headerTintColor");
  });

  test("Android's compact source header draws its bar icons in the bar's content colour", () => {
    const header = read("../components/SourceBrowseCompactHeader.tsx");
    for (const icon of ["arrow-back", "search-outline", "options-outline"]) {
      expect(header).toContain(`<Ionicons name="${icon}" size={23} color={tokens.foreground} />`);
    }
  });

  test("the SwiftUI form sheet leaves its bar untinted; only the confirming action carries the accent", () => {
    const sheet = read("../components/MobileNativeFormSheet.ios.tsx");
    expect(sheet).not.toContain("seedColor=");
    expect(sheet).toContain("<SwiftNavigationStack>");
    expect(sheet).not.toContain("tint(tokens.foreground)");
    expect(sheet).toContain("<ToolbarActionButton action={confirm} accent={tokens.primary} />");
    expect(sheet).toContain('<ToolbarActionButton action={cancel} role="cancel" />');
  });
});
