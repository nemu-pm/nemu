import { describe, expect, test } from "bun:test";
import { parseAidokuRegistryIndex } from "./aidokuRegistry";
import { getNemuRecommendedDirectoryFallbackSources } from "./nemuRecommendedDirectory";

const dir = { id: "d", name: "D", indexUrl: "https://x.example.com/index.min.json" };
const entry = (extra: Record<string, unknown>) => ({
  sources: [{ id: "a", name: "A", version: 1, downloadURL: "sources/a.aix", ...extra }],
});

describe("contentLicense parsing", () => {
  test("reads a plain licence id and ignores anything else", () => {
    expect(parseAidokuRegistryIndex(dir, entry({ contentLicense: "CC-BY-4.0" })).sources[0]!.contentLicense).toBe("CC-BY-4.0");
    for (const bad of [5, "", "has space", "x".repeat(65), "<b>"]) {
      expect(parseAidokuRegistryIndex(dir, entry({ contentLicense: bad })).sources[0]!.contentLicense).toBeUndefined();
    }
    expect(parseAidokuRegistryIndex(dir, entry({})).sources[0]!.contentLicense).toBeUndefined();
  });
  test("the bundled fallback carries the licence", () => {
    expect(getNemuRecommendedDirectoryFallbackSources()[0]!.contentLicense).toBe("CC-BY-4.0");
  });
});
