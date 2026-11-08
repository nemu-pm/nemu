import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { getMobileDetailLanguageNames, getMobileDetailSourceLicense } from "./mobileMangaDetailSourceInfo";

describe("getMobileDetailSourceLicense", () => {
  test("the bundled directory's licences read as their names on the detail page", () => {
    const license = (sourceId: string) =>
      getMobileDetailSourceLicense({ id: `nemu-recommended:${sourceId}`, registryId: "nemu-recommended", sourceId });
    expect(license("ja.ndlpublicdomain")).toBe("Public Domain");
    expect(license("en.littlenemo")).toBe("Public Domain");
    expect(license("multi.minifantasytheater")).toBe("CC BY-SA 4.0");
    expect(license("multi.peppercarrot")).toBe("CC BY 4.0");
  });
  test("a nemu-recommended source's licence from the bundled directory; none elsewhere", () => {
    expect(getMobileDetailSourceLicense({ id: "nemu-recommended:multi.peppercarrot", registryId: "nemu-recommended", sourceId: "multi.peppercarrot" })).toBe("CC BY 4.0");
    expect(getMobileDetailSourceLicense({ id: "nemu-recommended:multi.lanraragi", registryId: "nemu-recommended", sourceId: "multi.lanraragi" })).toBeNull();
    expect(getMobileDetailSourceLicense({ id: "aidoku:en.example", registryId: "aidoku", sourceId: "multi.peppercarrot" })).toBeNull();
    expect(getMobileDetailSourceLicense(null)).toBeNull();
    expect(getMobileDetailSourceLicense({ id: "nemu-recommended:multi.x", registryId: "nemu-recommended", sourceId: "multi.x", contentLicense: "CC0-1.0" })).toBe("CC0 1.0");
  });
});

describe("getMobileDetailLanguageNames", () => {
  const strings = getMobileStrings("en");

  test("the chapters' languages by name, else the source's, never the multi bucket", () => {
    expect(getMobileDetailLanguageNames([{ lang: "en" }, { lang: "en" }, { lang: "ja" }], { languages: ["fr"] }, "en", strings)).toEqual(["English", "日本語"]);
    expect(getMobileDetailLanguageNames([], { languages: ["multi", "fr"] }, "en", strings)).toEqual(["Français"]);
    expect(getMobileDetailLanguageNames([{ lang: null }], null, "en", strings)).toEqual([]);
  });
});
