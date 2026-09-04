import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  compactMobileLabelList,
  getMobileInstalledSourceSubtitle,
} from "./mobileInstalledSourcePresentation";

function makeSource(overrides: Partial<InstalledSource>): InstalledSource {
  return {
    id: "aidoku-community:multi.mangaplus",
    registryId: "aidoku-community",
    ...overrides,
  } as InstalledSource;
}

describe("compactMobileLabelList", () => {
  test("returns undefined for an empty list", () => {
    expect(compactMobileLabelList([])).toBeUndefined();
  });

  test("keeps one or two codes verbatim", () => {
    expect(compactMobileLabelList(["en"], { upper: true })).toBe("EN");
    expect(compactMobileLabelList(["en", "ja"], { upper: true })).toBe(
      "EN, JA",
    );
  });

  test("collapses longer lists to two codes plus a +N suffix", () => {
    expect(compactMobileLabelList(["en", "ja", "zh"], { upper: true })).toBe(
      "EN, JA +1",
    );
    expect(
      compactMobileLabelList(
        [
          "en",
          "sq",
          "ar",
          "az",
          "bg",
          "ca",
          "zh",
          "cs",
          "da",
          "nl",
          "en-us",
          "fil",
          "fi",
        ],
        { upper: true },
      ),
    ).toBe("EN, SQ +11");
  });

  test("keeps free-form labels verbatim without `upper`", () => {
    // The source settings picker summaries are already display-cased.
    expect(compactMobileLabelList(["Safe", "Suggestive"])).toBe(
      "Safe, Suggestive",
    );
    expect(
      compactMobileLabelList(["Safe", "Suggestive", "Erotica", "Pornographic"]),
    ).toBe("Safe, Suggestive +2");
  });
});

describe("getMobileInstalledSourceSubtitle", () => {
  test("omits the language segment when the source has none", () => {
    expect(getMobileInstalledSourceSubtitle(makeSource({}))).toBe(
      "aidoku-community",
    );
  });

  test("keeps short language lists unchanged", () => {
    expect(
      getMobileInstalledSourceSubtitle(makeSource({ languages: ["ja"] })),
    ).toBe("JA / aidoku-community");
  });

  test("compacts long language lists onto one subtitle line", () => {
    expect(
      getMobileInstalledSourceSubtitle(
        makeSource({
          languages: [
            "en",
            "sq",
            "ar",
            "az",
            "bg",
            "bn",
            "ca",
            "zh",
            "cs",
            "da",
            "nl",
            "en-us",
            "fil",
          ],
        }),
      ),
    ).toBe("EN, SQ +11 / aidoku-community");
  });

  test("falls back to the package metadata languages with the same compaction", () => {
    expect(
      getMobileInstalledSourceSubtitle(
        makeSource({
          packageMetadata: {
            sourceId: "multi.mangaplus",
            name: "MANGA Plus",
            version: 1,
            languages: ["en", "es", "pt", "fr", "id", "ru", "th", "vi"],
            listings: [],
            filters: [],
            settings: [],
            hasWasm: true,
          },
        }),
      ),
    ).toBe("EN, ES +6 / aidoku-community");
  });
});
