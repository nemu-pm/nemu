import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * A page scroll view that cannot scroll (`scrollEnabled={false}`, or no
 * bounce with content that fits) is never moved to the bars' adjusted top on
 * iOS: it rests at offset 0, its content up under the see-through header (and
 * a header search field), as if scrolled and left there. Pages keep scrolling
 * and bouncing; content that fits only rubber-bands.
 */
const SRC = join(import.meta.dir, "..");

const SCREENS = [
  "screens/LibraryScreen.tsx",
  "screens/BrowseScreen.tsx",
  "screens/SearchScreen.tsx",
  "screens/SettingsScreen.tsx",
  "screens/SourceBrowseScreen.tsx",
] as const;

const SCAFFOLDS = new Set(["PageScaffold", "PageListScaffold"]);

function unscrollableScaffoldProps(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(SRC, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offenders: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      SCAFFOLDS.has(node.tagName.getText(source))
    ) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(source);
        const value = attribute.initializer?.getText(source) ?? "{true}";
        if (name === "scrollEnabled" || (name === "alwaysBounceVertical" && value !== "{true}")) {
          const { line } = source.getLineAndCharacterOfPosition(attribute.getStart(source));
          offenders.push(`${file}:${line + 1} ${name}=${value}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offenders;
}

describe("page scaffolds stay scrollable", () => {
  for (const file of SCREENS) {
    test(file, () => {
      expect(unscrollableScaffoldProps(file)).toEqual([]);
    });
  }
});
