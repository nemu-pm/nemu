import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { withMobileDesignExploreCopy } from "./mobileI18nExploreCopy";

const placeholders = (value: string) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

describe("design-explore copy", () => {
  test("an override keeps the placeholders of the string it replaces; a collection is never called a shelf", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      const base = getMobileStrings(language) as unknown as Record<string, Record<string, unknown>>;
      const copy = withMobileDesignExploreCopy(getMobileStrings(language), language) as unknown as Record<string, Record<string, unknown>>;
      for (const [section, values] of Object.entries(copy)) {
        for (const [key, value] of Object.entries(values)) {
          if (value === base[section]![key]) continue;
          expect(typeof base[section]![key]).toBe("string");
          expect(placeholders(value as string)).toEqual(placeholders(base[section]![key] as string));
        }
      }
      const shelfCopy = [copy.library!.collectionEmpty, copy.library!.newCollectionDescription, copy.library!.renameDescription].join(" ");
      expect(shelfCopy).not.toMatch(/shelf|书架|本棚/i);
    }
  });
});
