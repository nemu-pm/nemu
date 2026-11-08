import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("design-explore scroll rules", () => {
  // iOS scrolls a page to the top on a status-bar tap only when exactly one
  // scroll view on screen has scrollsToTop on. The card row, the folders,
  // the facts strip and the chapter controls are horizontal scroll views on
  // the same screens as the page's own list: each one left on would take the
  // tap away from the page (the library and title pages ignored it).
  test("every horizontal scroll view gives the status-bar tap to the page", () => {
    const dir = path.join(import.meta.dir, "../components/explore");
    const missing: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue;
      const lines = readFileSync(path.join(dir, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!/^\s*horizontal\s*$/.test(line)) return;
        const props = lines.slice(index, index + 6).join("\n");
        if (!props.includes("scrollsToTop={false}")) missing.push(`${file}:${index + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
