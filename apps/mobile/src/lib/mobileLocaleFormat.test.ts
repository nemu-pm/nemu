import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createMobileTextComparator,
  formatMobileClockTime,
  formatMobileInteger,
  mobileEngineHasIntl,
} from "./mobileLocaleFormat";

// Bun, like iOS's JavaScriptCore, has ICU; `false` models Android's JSC.
const ANDROID_JSC = false;
const WORDS = ["banana", "Apple", "apple", "Zebra", "éclair", "Eclair", "zeta", "Ábc", "10", "9"];
const sameSpaces = (value: string) => value.replace(/\s/g, " ");

describe("mobile locale formatting without Intl", () => {
  test("this test engine has Intl, so the defaults defer to it", () => {
    expect(mobileEngineHasIntl()).toBe(true);
    expect(formatMobileInteger(1234567)).toBe((1234567).toLocaleString());
  });

  test("the fallback collator orders text like ICU, not by code unit", () => {
    const icu = [...WORDS].sort(createMobileTextComparator(true));
    const fallback = [...WORDS].sort(createMobileTextComparator(ANDROID_JSC));

    expect(icu).toEqual(["10", "9", "Ábc", "apple", "Apple", "banana", "Eclair", "éclair", "Zebra", "zeta"]);
    expect(fallback).toEqual(icu);
    // What Android's code-unit localeCompare produced before.
    expect([...WORDS].sort()).toEqual(["10", "9", "Apple", "Eclair", "Zebra", "apple", "banana", "zeta", "Ábc", "éclair"]);
  });

  test("the fallback collator is a consistent total order", () => {
    const compare = createMobileTextComparator(ANDROID_JSC);
    for (const a of WORDS) {
      expect(compare(a, a)).toBe(0);
      for (const b of WORDS) {
        if (a === b) continue;
        expect(Math.sign(compare(a, b))).toBe(-Math.sign(compare(b, a)));
        expect(compare(a, b)).not.toBe(0);
      }
    }
  });

  test("groups digits like the ICU engine", () => {
    for (const value of [0, 7, 999, 1000, 12345, 1234567, -9876543]) {
      expect(formatMobileInteger(value, ANDROID_JSC)).toBe(value.toLocaleString("en-US"));
    }
  });

  test("prints chat clock times like toLocaleTimeString with hour + minute", () => {
    const locales = { en: "en-US", zh: "zh-CN", ja: "ja-JP" } as const;
    for (const hour of [0, 9, 12, 13, 23]) {
      const timestamp = new Date(2026, 0, 2, hour, 5, 9).getTime();
      for (const language of ["en", "zh", "ja"] as const) {
        const icu = new Date(timestamp).toLocaleTimeString(locales[language], {
          hour: "numeric",
          minute: "2-digit",
        });
        expect(formatMobileClockTime(timestamp, language, ANDROID_JSC)).toBe(sameSpaces(icu));
        expect(formatMobileClockTime(timestamp, language, true)).toBe(icu);
      }
    }
  });

  test("user-visible text sorts and counts go through the helpers", () => {
    const read = (file: string) =>
      readFileSync(path.join(import.meta.dir, "..", file), "utf8");
    const library = read("lib/mobileLibraryPresentation.ts");
    const browse = read("lib/mobileBrowseSources.ts");
    const search = read("sources/mobileSourceSearch.ts");
    const storage = read("components/MobileStorageBreakdown.tsx");
    const chat = read("lib/mobileJapaneseLearningReaderHelpers.ts");

    expect(library).toContain("compareMobileText(a.title, b.title)");
    expect(library).not.toContain(".localeCompare(");
    expect(browse).toContain("compareMobileText(a.name, b.name)");
    expect(search).toContain("compareMobileText(left.title, right.title)");
    expect(search).toContain("compareMobileText(left.source.name, right.source.name)");
    expect(storage).toContain("formatMobileInteger(count)");
    expect(storage).not.toContain("toLocaleString");
    expect(chat).toContain("formatMobileClockTime(timestamp, appLanguage)");
    expect(chat).not.toContain("toLocaleTimeString");
  });
});
