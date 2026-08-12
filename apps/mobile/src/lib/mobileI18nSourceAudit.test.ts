import { describe, expect, test } from "bun:test";
import path from "node:path";
import * as ts from "typescript";
import { readFile } from "node:fs/promises";

const USER_FACING_ATTRIBUTES = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "placeholder",
  "title",
]);

const ALLOWED_LITERAL_VALUES = new Set([
  "nemu",
  "Nemu",
  "Nemu Agent",
  "v",
  "github.com/nemu-pm/nemu",
]);
const DEVELOPER_DIAGNOSTIC_FILES = new Set([
  "components/MobileDualReaderDebugOverlay.tsx",
]);

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

async function findLiteralUserFacingText(): Promise<Violation[]> {
  const sourceRoot = path.join(import.meta.dir, "..");
  const glob = new Bun.Glob("**/*.tsx");
  const violations: Violation[] = [];

  for await (const relativePath of glob.scan({ cwd: sourceRoot })) {
    if (
      /\.(?:test|spec)\.tsx$/.test(relativePath) ||
      DEVELOPER_DIAGNOSTIC_FILES.has(relativePath)
    ) {
      continue;
    }
    const filePath = path.join(sourceRoot, relativePath);
    const sourceText = await Bun.file(filePath).text();
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const record = (node: ts.Node, value: string, attribute: string) => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (
        normalized &&
        /\p{L}/u.test(normalized) &&
        !ALLOWED_LITERAL_VALUES.has(normalized)
      ) {
        violations.push({
          file: relativePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          attribute,
          value: normalized,
        });
      }
    };

    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node) && ts.isJsxElement(node.parent)) {
        const tag = node.parent.openingElement.tagName.getText(sourceFile);
        if (tag === "Text") record(node, node.text, "children");
      }
      if (
        ts.isJsxExpression(node) &&
        ts.isJsxElement(node.parent) &&
        node.parent.openingElement.tagName.getText(sourceFile) === "Text" &&
        node.expression
      ) {
        const visitDisplayedExpression = (expressionNode: ts.Expression): void => {
          if (
            ts.isStringLiteral(expressionNode) ||
            ts.isNoSubstitutionTemplateLiteral(expressionNode)
          ) {
            record(expressionNode, expressionNode.text, "children-expression");
            return;
          }
          if (ts.isTemplateExpression(expressionNode)) {
            record(expressionNode.head, expressionNode.head.text, "children-expression");
            for (const span of expressionNode.templateSpans) {
              record(span.literal, span.literal.text, "children-expression");
            }
            return;
          }
          if (ts.isConditionalExpression(expressionNode)) {
            visitDisplayedExpression(expressionNode.whenTrue);
            visitDisplayedExpression(expressionNode.whenFalse);
          }
        };
        visitDisplayedExpression(node.expression);
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

  test("does not hardcode user-facing JSX text outside developer diagnostics", async () => {
    expect(await findLiteralUserFacingText()).toEqual([]);
  });

  test("localizes native permission prompts for every app language", async () => {
    const appConfig = JSON.parse(
      await readFile(path.join(import.meta.dir, "../../app.json"), "utf8"),
    ) as {
      expo: {
        locales?: Record<string, string>;
        ios?: { infoPlist?: { CFBundleAllowMixedLocalizations?: boolean } };
      };
    };
    expect(appConfig.expo.ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(
      true,
    );
    expect(Object.keys(appConfig.expo.locales ?? {}).sort()).toEqual([
      "en",
      "ja",
      "zh",
    ]);

    const prompts = new Map<string, string>();
    for (const language of ["en", "zh", "ja"] as const) {
      const localePath = appConfig.expo.locales?.[language];
      expect(localePath).toBeTruthy();
      const locale = JSON.parse(
        await readFile(path.join(import.meta.dir, "../..", localePath!), "utf8"),
      ) as { ios?: { NSPhotoLibraryUsageDescription?: string } };
      const prompt = locale.ios?.NSPhotoLibraryUsageDescription?.trim() ?? "";
      expect(prompt.length).toBeGreaterThan(0);
      prompts.set(language, prompt);
    }
    expect(new Set(prompts.values()).size).toBe(3);
  });
});
