import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Source contract (same approach as mobileWelcome.test.ts): the empty library
// is no longer a separate early-return page (that branch used to drop the
// header's + / … actions and every collection sheet, and its ScrollView was
// taller than the viewport, so it could be left resting part-way scrolled).
// It is the normal Library list with the hero as its ListEmptyComponent.
const librarySource = readFileSync(
  path.join(import.meta.dir, "../screens/LibraryScreen.tsx"),
  "utf8",
);

function mainLibraryReturn(): string {
  const start = librarySource.lastIndexOf("  return (\n    <>\n    {designExplore ? <MobileExploreDustHost");
  expect(start).toBeGreaterThan(-1);
  return librarySource.slice(start, librarySource.indexOf("\nconst styles = StyleSheet.create", start));
}

describe("empty library keeps collection management reachable", () => {
  test("there is no separate empty-onboarding page", () => {
    expect(librarySource).not.toContain("if (showEmptyOnboarding) {");
  });

  test("the empty hero renders as the normal list's ListEmptyComponent", () => {
    const main = mainLibraryReturn();
    expect(main).toContain("fillViewport={showEmptyOnboarding || showEmptyCollectionHero}");
    const empty = main.slice(main.indexOf("ListEmptyComponent={"));
    expect(empty).toContain(") : showEmptyOnboarding ? (");
    expect(empty).toContain("<EmptyLibrary\n                fill");
    expect(main).toContain("<MobileExploreDustHost />");
    expect(main).toContain("<ContentScrollMarker");
    expect(main).toContain("onRefresh={() => {");
  });

  test("the empty state renders the library header actions (create + collections menu)", () => {
    const main = mainLibraryReturn();
    expect(main).toContain("<Stack.Toolbar");
    expect(main).toContain("renderNemuNativeToolbarButtons(nativeHeaderActions)");
  });

  test("the empty state mounts the collection sheets those actions open", () => {
    expect(mainLibraryReturn()).toContain("{librarySheets}");
    const sheetsStart = librarySource.indexOf("const librarySheets = (");
    expect(sheetsStart).toBeGreaterThan(-1);
    const sheets = librarySource.slice(
      sheetsStart,
      librarySource.indexOf("if (showLoadError) {", sheetsStart),
    );
    for (const sheet of [
      "<TitleMenuSheet",
      // iOS: the SwiftUI manager; Android: the React Native one.
      "<MobileCollectionsManagerNativeSheet",
      "<CollectionsManagerSheet",
      'mode="create"',
      'mode="rename"',
    ]) {
      expect(sheets).toContain(sheet);
    }
  });

  test("the library-level actions are the ones the populated library shows", () => {
    expect(librarySource).toMatch(
      /const nativeHeaderActions: NemuNativeHeaderAction\[\] = selectedCollection\s*\?\s*collectionHeaderActions\s*:\s*libraryHeaderActions;/,
    );
  });

  test("the empty state keeps the title menu (switch / create / manage)", () => {
    const main = mainLibraryReturn();
    expect(main).toContain("titleMenuHeaderOptions(title)");
    expect(main).toContain("{titleMenuAnchor}");
  });

});

describe("collection switching stays in place", () => {
  test("the populated library mounts the title menu on its header", () => {
    const main = mainLibraryReturn();
    expect(main).toContain("titleMenuHeaderOptions(title)");
    expect(main).toContain("{titleMenuAnchor}");
  });

  test("the title menu switches in place; nothing on the page pushes the collection screen", () => {
    const pushes = librarySource.match(/router\.(push|replace)\(\{\s*pathname: "\/library\/collection/g) ?? [];
    expect(pushes).toHaveLength(0);
    expect(librarySource).not.toContain('router.replace("/library")');
  });

  test("without a native title menu the switcher stays in the toolbar of every scope", () => {
    expect(librarySource).toContain("...(titleMenu ? [] : [collectionSwitcherAction])");
    expect(librarySource).toMatch(/\.\.\.\(titleMenu\s*\?\s*\[\]\s*:\s*\[\s*collectionSwitcherAction,/);
  });
});
