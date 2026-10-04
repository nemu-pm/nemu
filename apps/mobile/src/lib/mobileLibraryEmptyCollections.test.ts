import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Source contract (same approach as mobileWelcome.test.ts): the empty-library
// state returns early from LibraryScreen, and that branch used to drop the
// header's + / … actions and every collection sheet, so collections could not
// be created or managed until a title was added.
const librarySource = readFileSync(
  path.join(import.meta.dir, "../screens/LibraryScreen.tsx"),
  "utf8",
);

function emptyOnboardingBranch(): string {
  const start = librarySource.indexOf("if (showEmptyOnboarding) {");
  expect(start).toBeGreaterThan(-1);
  const end = librarySource.indexOf("\n  }\n", start);
  return librarySource.slice(start, end);
}

describe("empty library keeps collection management reachable", () => {
  test("the empty state renders the library header actions (create + collections menu)", () => {
    const branch = emptyOnboardingBranch();
    expect(branch).toContain("<Stack.Toolbar");
    expect(branch).toContain("libraryHeaderActions");
  });

  test("the empty state mounts the collection sheets those actions open", () => {
    expect(emptyOnboardingBranch()).toContain("{librarySheets}");
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
    const branch = emptyOnboardingBranch();
    expect(branch).toContain("titleMenuHeaderOptions(");
    expect(branch).toContain("{titleMenuAnchor}");
  });
});

describe("collection switching stays in place", () => {
  test("the populated library mounts the title menu on its header", () => {
    const main = librarySource.slice(librarySource.lastIndexOf("  return (\n    <>"));
    expect(main).toContain("titleMenuHeaderOptions(title)");
    expect(main).toContain("{titleMenuAnchor}");
  });

  test("switching collections never pushes or replaces a route", () => {
    expect(librarySource).not.toMatch(/router\.(push|replace)\(\{\s*pathname: "\/library\/collection/);
    expect(librarySource).not.toContain('router.replace("/library")');
  });

  test("without a native title menu the switcher stays in the toolbar of every scope", () => {
    expect(librarySource).toContain("...(titleMenu ? [] : [collectionSwitcherAction])");
    expect(librarySource).toMatch(/\.\.\.\(titleMenu\s*\?\s*\[\]\s*:\s*\[\s*collectionSwitcherAction,/);
  });
});
