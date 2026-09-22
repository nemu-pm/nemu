import { describe, expect, test } from "bun:test";
import path from "node:path";

import en from "../src/locales/en.json";
import ja from "../src/locales/ja.json";
import zh from "../src/locales/zh.json";

// The product is written lowercase "nemu" everywhere it appears in copy,
// including sentence-initially. Only the sub-product name "Nemu Agent" and the
// Nemu Chat character keep a capital N, so the audit allows the Agent wordform
// anywhere and exempts the Japanese-learning plugin, which is where the
// character speaks.
const ALLOWED_WORDFORMS = ["Nemu Agent"];
const CHARACTER_KEY_PREFIXES = ["plugin.japaneseLearning."];

const LOCALES = { en, ja, zh } as const;

const PROJECT_ROOT = path.join(import.meta.dir, "..");
const USER_AGENT = "Mozilla/5.0 (compatible; nemu/1.0)";

type Violation = { locale: string; key: string; value: string };

function* walkStrings(
  node: unknown,
  prefix = "",
): Generator<{ key: string; value: string }> {
  if (typeof node === "string") {
    yield { key: prefix, value: node };
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [segment, child] of Object.entries(node)) {
    yield* walkStrings(child, prefix ? `${prefix}.${segment}` : segment);
  }
}

function findCapitalisedBrand(): Violation[] {
  const violations: Violation[] = [];
  for (const [locale, messages] of Object.entries(LOCALES)) {
    for (const { key, value } of walkStrings(messages)) {
      if (CHARACTER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        continue;
      }
      let remaining = value;
      for (const wordform of ALLOWED_WORDFORMS) {
        remaining = remaining.split(wordform).join("");
      }
      if (remaining.includes("Nemu")) {
        violations.push({ locale, key, value });
      }
    }
  }
  return violations;
}

async function read(relativePath: string): Promise<string> {
  return Bun.file(path.join(PROJECT_ROOT, relativePath)).text();
}

describe("lowercase nemu wordmark", () => {
  test("no locale calls the app itself Nemu", () => {
    const violations = findCapitalisedBrand();
    expect(
      violations.map(({ locale, key, value }) => `${locale}:${key} → ${value}`),
    ).toEqual([]);
  });

  test("the shell names the app in lowercase", async () => {
    const html = await read("index.html");
    expect(html).toContain("<title>nemu</title>");
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-title" content="nemu" />',
    );

    const manifest = JSON.parse(await read("public/manifest.webmanifest"));
    expect(manifest.name).toBe("nemu");
    expect(manifest.short_name).toBe("nemu");
  });

  test("web, Convex, and mobile send the same lowercase user agent", async () => {
    const sources = [
      "src/lib/metadata/providers/mangaupdates.ts",
      "convex/proxy.ts",
      "apps/mobile/src/lib/mobileMetadataMatch.ts",
    ];
    for (const source of sources) {
      const contents = await read(source);
      expect(contents, source).toContain(USER_AGENT);
      expect(contents, source).not.toContain("compatible; Nemu/");
    }
  });
});
