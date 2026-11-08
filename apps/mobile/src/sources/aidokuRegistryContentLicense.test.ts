import { describe, expect, test } from "bun:test";
import { parseAidokuRegistryIndex } from "./aidokuRegistry";
import { NEMU_RECOMMENDED_REGISTRY_ID } from "@nemu/core/sources";
import { getMobileWelcomeAvailableSources } from "@/lib/mobileWelcome";
import {
  getNemuRecommendedDirectoryFallbackSources,
  NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX,
} from "./nemuRecommendedDirectory";

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
  test("the bundled fallback mirrors the published directory, licences included", () => {
    const licenses = Object.fromEntries(
      getNemuRecommendedDirectoryFallbackSources().map((s) => [s.id, s.contentLicense]),
    );
    expect(licenses).toEqual({
      "en.littlenemo": "Public-Domain",
      "ja.ndlpublicdomain": "Public-Domain",
      "multi.lanraragi": undefined,
      "multi.minifantasytheater": "CC-BY-SA-4.0",
      "multi.peppercarrot": "CC-BY-4.0",
    });
  });
  test("the bundled fallback's entries download from the published directory", () => {
    for (const s of getNemuRecommendedDirectoryFallbackSources()) {
      expect(s.downloadUrl).toBe(`https://nemu-pm.github.io/source-registry/sources/${s.id}-v${s.version}.aix`);
    }
  });
  test("the AI notice travels beside the licence, not in it", () => {
    const notes = NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX.sources
      .filter((s) => s.contentLicenseNote)
      .map((s) => [s.id, s.contentLicenseNote]);
    expect(notes).toEqual([
      ["multi.minifantasytheater", "AI derivation prohibited"],
      ["multi.peppercarrot", "AI derivation prohibited"],
    ]);
  });
  test("the bundled fallback lists LANraragi without a content licence, outside onboarding", () => {
    const sources = getNemuRecommendedDirectoryFallbackSources();
    const lrr = sources.find((s) => s.id === "multi.lanraragi")!;
    expect(lrr).toMatchObject({ name: "LANraragi", languages: ["multi"], registryId: NEMU_RECOMMENDED_REGISTRY_ID });
    expect(lrr.contentLicense).toBeUndefined();
    expect(lrr.downloadUrl).toContain("multi.lanraragi-v4.aix");
    expect(getMobileWelcomeAvailableSources("zh", sources).map((s) => s.id)).toEqual([
      "ja.ndlpublicdomain",
      "multi.peppercarrot",
      "multi.minifantasytheater",
      "en.littlenemo",
    ]);
  });
});
