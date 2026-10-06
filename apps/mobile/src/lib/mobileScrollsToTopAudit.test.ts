import { describe, expect, test } from "bun:test";
import path from "node:path";
import * as ts from "typescript";

// Source audit (same approach as mobileI18nSourceAudit.test.ts): iOS scrolls a
// screen to the top on a status-bar tap only when exactly one on-screen scroll
// view has `scrollsToTop` on, and React Native leaves it on for every
// ScrollView / FlatList / FlashList. A horizontal row (home rails, filter
// chips, listing tabs) on a screen therefore disables the tap for the whole
// screen unless it opts out. Every `horizontal` scroller must pass
// `scrollsToTop={false}`; a conditional `horizontal={x}` passes
// `scrollsToTop={!x}` so its vertical form keeps the tap.

// Explicit exceptions: file (as reported below) → how many of its horizontal
// scrollers keep the tap, and why. The count must match exactly, so a new
// scroller in that file, or a fixed one, gets the entry re-reviewed.
const ALLOWED_HORIZONTAL_SCROLLERS: Record<
  string,
  { scrollers: number; reason: string }
> = {};

const AUDIT_SOURCE_ROOTS = [
  { root: path.join(import.meta.dir, ".."), prefix: "" },
  { root: path.join(import.meta.dir, "..", "..", "app"), prefix: "app/" },
] as const;

type HorizontalScroller = {
  file: string;
  location: string;
  element: string;
  horizontal: string;
  scrollsToTop: string | null;
};

function attributeValue(
  attribute: ts.JsxAttribute,
  sourceFile: ts.SourceFile,
): string {
  const initializer = attribute.initializer;
  if (!initializer) return "true";
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return initializer.expression.getText(sourceFile);
  }
  return initializer.getText(sourceFile);
}

async function findHorizontalScrollers(): Promise<HorizontalScroller[]> {
  const scrollers: HorizontalScroller[] = [];
  const glob = new Bun.Glob("**/*.tsx");
  for (const { root, prefix } of AUDIT_SOURCE_ROOTS) {
    for await (const scannedPath of glob.scan({ cwd: root })) {
      if (/\.(?:test|spec)\.tsx$/.test(scannedPath)) continue;
      const filePath = path.join(root, scannedPath);
      const sourceFile = ts.createSourceFile(
        filePath,
        await Bun.file(filePath).text(),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node): void => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const attributes = new Map<string, ts.JsxAttribute>();
          for (const property of node.attributes.properties) {
            if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
              attributes.set(property.name.text, property);
            }
          }
          const horizontal = attributes.get("horizontal");
          if (horizontal) {
            const scrollsToTop = attributes.get("scrollsToTop");
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              horizontal.getStart(sourceFile),
            );
            scrollers.push({
              file: `${prefix}${scannedPath}`,
              location: `${prefix}${scannedPath}:${line + 1}`,
              element: node.tagName.getText(sourceFile),
              horizontal: attributeValue(horizontal, sourceFile),
              scrollsToTop: scrollsToTop
                ? attributeValue(scrollsToTop, sourceFile)
                : null,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return scrollers;
}

function leavesStatusBarTap({ horizontal, scrollsToTop }: HorizontalScroller) {
  if (scrollsToTop === "false") return true;
  if (horizontal === "true" || horizontal === "false") return false;
  return scrollsToTop === `!${horizontal}` || scrollsToTop === `!(${horizontal})`;
}

describe("horizontal scrollers leave the status-bar tap to the page", () => {
  test("every horizontal ScrollView / FlatList / FlashList opts out of scrollsToTop", async () => {
    const scrollers = await findHorizontalScrollers();
    // The audit must see the known rails, or a parse change silently passes it.
    expect(scrollers.length).toBeGreaterThanOrEqual(10);

    const violations = scrollers.filter(
      (scroller) =>
        !leavesStatusBarTap(scroller) &&
        !(scroller.file in ALLOWED_HORIZONTAL_SCROLLERS),
    );
    expect(
      violations.map(
        ({ location, element, horizontal, scrollsToTop }) =>
          `${location} <${element} horizontal={${horizontal}}> scrollsToTop=${scrollsToTop ?? "(default true)"}`,
      ),
    ).toEqual([]);
  });

  test("every allowed exception matches its file's scrollers exactly", async () => {
    const scrollers = await findHorizontalScrollers();
    for (const [file, { scrollers: allowed }] of Object.entries(
      ALLOWED_HORIZONTAL_SCROLLERS,
    )) {
      const keepingTap = scrollers.filter(
        (scroller) => scroller.file === file && !leavesStatusBarTap(scroller),
      );
      expect({ file, scrollers: keepingTap.length }).toEqual({
        file,
        scrollers: allowed,
      });
    }
  });

  test("the reader's paged list opts out while its long strip keeps the tap", () => {
    expect(
      leavesStatusBarTap({
        file: "",
        location: "",
        element: "FlatList",
        horizontal: "pagedMode",
        scrollsToTop: "!pagedMode",
      }),
    ).toBe(true);
    expect(
      leavesStatusBarTap({
        file: "",
        location: "",
        element: "FlatList",
        horizontal: "pagedMode",
        scrollsToTop: null,
      }),
    ).toBe(false);
  });
});
