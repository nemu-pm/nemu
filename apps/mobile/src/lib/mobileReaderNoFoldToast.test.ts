import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getMobileStrings } from "./mobileI18n";

describe("the reader says nothing when the display changes", () => {
  test("no string left to say it with, in any language", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      const duo = getMobileStrings(language).duo as Record<string, unknown>;
      expect(Object.keys(duo).filter((key) => key.startsWith("handoff"))).toEqual([]);
    }
  });

  test("the reader no longer mounts a display toast", () => {
    const reader = readFileSync(join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
    expect(reader).not.toContain("DisplayHandoff");
    expect(reader).not.toContain("mobileDuoDisplayTransition");
  });
});
