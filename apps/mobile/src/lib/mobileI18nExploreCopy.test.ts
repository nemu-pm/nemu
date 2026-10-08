import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { MOBILE_DESIGN_EXPLORE_COPY, withMobileDesignExploreCopy } from "./mobileI18nExploreCopy";

const placeholders = (value: string) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

describe("design-explore copy", () => {
  test("only replaces strings that exist, with the same placeholders", () => {
    for (const [language, sections] of Object.entries(MOBILE_DESIGN_EXPLORE_COPY)) {
      const base = getMobileStrings(language) as unknown as Record<string, Record<string, unknown>>;
      for (const [section, values] of Object.entries(sections ?? {})) {
        for (const [key, value] of Object.entries(values ?? {})) {
          expect(typeof base[section]?.[key]).toBe("string");
          expect(placeholders(value as string)).toEqual(placeholders(base[section]![key] as string));
        }
      }
    }
  });

  test("a collection is not called a shelf where Shelf is the layout", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      const strings = withMobileDesignExploreCopy(getMobileStrings(language), language);
      const copy = [
        strings.library.collectionEmpty,
        strings.library.newCollectionDescription,
        strings.library.renameDescription,
        strings.collectionMembership.newCollectionDescription,
      ].join(" ");
      expect(copy).not.toMatch(/shelf|书架|本棚/i);
    }
  });

  test("leaves the catalog itself untouched", () => {
    const en = getMobileStrings("en");
    const before = en.library.newCollectionDescription;
    withMobileDesignExploreCopy(en, "en");
    expect(en.library.newCollectionDescription).toBe(before);
  });
});
