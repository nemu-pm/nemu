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
      "<ManagerSheet",
      'mode="create"',
      'mode="rename"',
    ]) {
      expect(sheets).toContain(sheet);
    }
  });

  test("the library-level actions are the ones the populated library shows", () => {
    expect(librarySource).toMatch(
      /const nativeHeaderActions: NemuNativeHeaderAction\[\] = selectedCollection\s*\?[\s\S]*?: libraryHeaderActions;/,
    );
  });
});
