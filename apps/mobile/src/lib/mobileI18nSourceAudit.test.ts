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

// Scans both the shared UI tree (src/) and the Expo Router route files
// (app/); route wrappers get an "app/" display prefix in violation reports.
const AUDIT_SOURCE_ROOTS = [
  { root: path.join(import.meta.dir, ".."), prefix: "" },
  { root: path.join(import.meta.dir, "..", "..", "app"), prefix: "app/" },
] as const;

async function* scanSourceFiles(): AsyncGenerator<{
  relativePath: string;
  filePath: string;
}> {
  const glob = new Bun.Glob("**/*.tsx");
  for (const { root, prefix } of AUDIT_SOURCE_ROOTS) {
    for await (const scannedPath of glob.scan({ cwd: root })) {
      yield {
        relativePath: prefix + scannedPath,
        filePath: path.join(root, scannedPath),
      };
    }
  }
}

async function findLiteralUserFacingAttributes(): Promise<Violation[]> {
  const violations: Violation[] = [];

  for await (const { relativePath, filePath } of scanSourceFiles()) {
    if (/\.(?:test|spec)\.tsx$/.test(relativePath)) continue;
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
            line:
              sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
              1,
            attribute: attributeName,
            value,
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

type LocalDisplayedHelper =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

function findLiteralUserFacingTextInSource(
  relativePath: string,
  sourceText: string,
): Violation[] {
  const violations: Violation[] = [];
  const sourceFile = ts.createSourceFile(
    relativePath,
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
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        attribute,
        value: normalized,
      });
    }
  };

  // A literal returned by a local formatter is just as user-facing as a literal
  // written directly inside <Text>. Resolve simple local helpers so wrappers do
  // not become an accidental escape hatch from this audit.
  const localDisplayedHelpers = new Map<string, LocalDisplayedHelper>();
  const collectLocalDisplayedHelpers = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      localDisplayedHelpers.set(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isFunctionExpression(node.initializer) ||
        ts.isArrowFunction(node.initializer))
    ) {
      localDisplayedHelpers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectLocalDisplayedHelpers);
  };
  collectLocalDisplayedHelpers(sourceFile);

  const visitedDisplayedHelpers = new Set<string>();

  function visitDisplayedHelper(name: string): void {
    if (visitedDisplayedHelpers.has(name)) return;
    const helper = localDisplayedHelpers.get(name);
    if (!helper?.body) return;
    visitedDisplayedHelpers.add(name);

    if (!ts.isBlock(helper.body)) {
      visitDisplayedExpression(helper.body, "helper-return");
      return;
    }

    const visitReturns = (node: ts.Node): void => {
      if (
        node !== helper.body &&
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node))
      ) {
        return;
      }
      if (ts.isReturnStatement(node) && node.expression) {
        visitDisplayedExpression(node.expression, "helper-return");
        return;
      }
      ts.forEachChild(node, visitReturns);
    };
    visitReturns(helper.body);
  }

  function visitDisplayedExpression(
    expressionNode: ts.Expression,
    attribute = "children-expression",
  ): void {
    if (
      ts.isStringLiteral(expressionNode) ||
      ts.isNoSubstitutionTemplateLiteral(expressionNode)
    ) {
      record(expressionNode, expressionNode.text, attribute);
      return;
    }
    if (ts.isTemplateExpression(expressionNode)) {
      record(expressionNode.head, expressionNode.head.text, attribute);
      for (const span of expressionNode.templateSpans) {
        record(span.literal, span.literal.text, attribute);
      }
      return;
    }
    if (ts.isConditionalExpression(expressionNode)) {
      visitDisplayedExpression(expressionNode.whenTrue, attribute);
      visitDisplayedExpression(expressionNode.whenFalse, attribute);
      return;
    }
    if (ts.isParenthesizedExpression(expressionNode)) {
      visitDisplayedExpression(expressionNode.expression, attribute);
      return;
    }
    if (
      ts.isCallExpression(expressionNode) &&
      ts.isIdentifier(expressionNode.expression)
    ) {
      visitDisplayedHelper(expressionNode.expression.text);
    }
  }

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
      visitDisplayedExpression(node.expression);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

async function findLiteralUserFacingText(): Promise<Violation[]> {
  const violations: Violation[] = [];

  for await (const { relativePath, filePath } of scanSourceFiles()) {
    if (
      /\.(?:test|spec)\.tsx$/.test(relativePath) ||
      DEVELOPER_DIAGNOSTIC_FILES.has(relativePath)
    ) {
      continue;
    }
    const sourceText = await Bun.file(filePath).text();
    violations.push(
      ...findLiteralUserFacingTextInSource(relativePath, sourceText),
    );
  }

  return violations.sort(
    (left, right) =>
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

  test("detects hardcoded text returned by a displayed local helper", () => {
    const violations = findLiteralUserFacingTextInSource(
      "components/Fixture.tsx",
      `
        function statusText(enabled: boolean) {
          return enabled ? "On" : "Off";
        }
        export function Fixture() {
          return <Text>{statusText(true)}</Text>;
        }
      `,
    );

    expect(
      violations.map(({ attribute, value }) => ({ attribute, value })),
    ).toEqual([
      { attribute: "helper-return", value: "On" },
      { attribute: "helper-return", value: "Off" },
    ]);
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
        await readFile(
          path.join(import.meta.dir, "../..", localePath!),
          "utf8",
        ),
      ) as { ios?: { NSPhotoLibraryUsageDescription?: string } };
      const prompt = locale.ios?.NSPhotoLibraryUsageDescription?.trim() ?? "";
      expect(prompt.length).toBeGreaterThan(0);
      prompts.set(language, prompt);
    }
    expect(new Set(prompts.values()).size).toBe(3);
  });
});
