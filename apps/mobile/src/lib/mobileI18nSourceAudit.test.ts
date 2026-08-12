import { describe, expect, test } from "bun:test";
import path from "node:path";
import * as ts from "typescript";

const USER_FACING_ATTRIBUTES = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "placeholder",
  "title",
]);

const ALLOWED_LITERAL_VALUES = new Set(["nemu", "Nemu", "Nemu Agent"]);

type Violation = {
  file: string;
  line: number;
  attribute: string;
  value: string;
};

async function findLiteralUserFacingAttributes(): Promise<Violation[]> {
  const sourceRoot = path.join(import.meta.dir, "..");
  const glob = new Bun.Glob("**/*.tsx");
  const violations: Violation[] = [];

  for await (const relativePath of glob.scan({ cwd: sourceRoot })) {
    if (/\.(?:test|spec)\.tsx$/.test(relativePath)) continue;
    const filePath = path.join(sourceRoot, relativePath);
    const sourceText = await Bun.file(filePath).text();
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const visit = (node: ts.Node): void => {
      const attributeName = ts.isJsxAttribute(node)
        ? ts.isIdentifier(node.name)
          ? node.name.text
          : node.name.getText(sourceFile)
        : null;
      if (
        ts.isJsxAttribute(node) &&
        attributeName !== null &&
        USER_FACING_ATTRIBUTES.has(attributeName) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        const value = node.initializer.text.trim();
        if (value && !ALLOWED_LITERAL_VALUES.has(value)) {
          violations.push({
            file: relativePath,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            attribute: attributeName,
            value,
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line,
  );
}

describe("mobile i18n source audit", () => {
  test("does not hardcode user-facing JSX attributes", async () => {
    expect(await findLiteralUserFacingAttributes()).toEqual([]);
  });
});
