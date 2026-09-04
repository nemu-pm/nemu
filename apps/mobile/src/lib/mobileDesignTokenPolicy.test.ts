import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC_ROOT = path.join(import.meta.dir, "..");

/**
 * Files allowed to keep a violation for now.
 *
 * `mobileSheetChromePolicy.test.ts` asserts the *absence* of the pill literal,
 * so its own source quotes it. Nothing new may join this list.
 */
const ALLOWED = new Set([
  "lib/mobileDesignTokenPolicy.test.ts",
  "lib/mobileSheetChromePolicy.test.ts",
]);

/** `` `${tokens.primary}24` `` — an alpha smuggled in as a hex suffix. */
const HEX_SUFFIX_TEMPLATE = /`\$\{[A-Za-z_][A-Za-z0-9_.]*\}[0-9a-fA-F]{2}`/;
/** `tokens.primary + "24"` — the same trick spelled with a concatenation. */
const HEX_SUFFIX_CONCAT =
  /(?:tokens|token|color|colour|accent|tone)[A-Za-z0-9_.]*\s*\+\s*"[0-9a-fA-F]{2}"/i;
/** The pill radius has a token: `radius.pill`. */
const PILL_LITERAL = /borderRadius:\s*999\b/;

function mobileSourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => !ALLOWED.has(entry))
    .sort();
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const relativePath of mobileSourceFiles()) {
    const source = readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
    source.split("\n").forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${relativePath}:${index + 1}`);
    });
  }
  return hits;
}

describe("mobile design token policy", () => {
  test("no alpha is smuggled in as a hex suffix", () => {
    expect(offenders(HEX_SUFFIX_TEMPLATE)).toEqual([]);
    expect(offenders(HEX_SUFFIX_CONCAT)).toEqual([]);
  });

  test("the pill radius always comes from radius.pill", () => {
    expect(offenders(PILL_LITERAL)).toEqual([]);
  });
});
