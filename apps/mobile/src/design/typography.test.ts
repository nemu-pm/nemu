import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mobileRoot = dirname(srcRoot);
const scannedRoots = [srcRoot, join(mobileRoot, "app")];
const sourceExtensions = new Set([".ts", ".tsx"]);
const rawFontWeightPattern = /fontWeight:\s*["'](?:[4-9]00|bold|heavy)["']/g;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return listSourceFiles(path);
    for (const extension of sourceExtensions) {
      if (path.endsWith(extension)) return [path];
    }
    return [];
  });
}

describe("nemu mobile typography", () => {
  test("keeps font weights behind shared mobile typography tokens", () => {
    const offenders = scannedRoots
      .flatMap((root) => listSourceFiles(root))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const matches = source.match(rawFontWeightPattern) ?? [];
        return matches.map((match) => `${relative(mobileRoot, file)}: ${match}`);
      })
      .sort();

    expect(offenders).toEqual([]);
  });
});
