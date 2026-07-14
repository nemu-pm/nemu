import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { formatMobileMangaCardAccessibilityLabel } from "./mobileMangaCard";

describe("mobile manga card accessibility", () => {
  test("includes visible subtitle and badge context", () => {
    const strings = getMobileStrings("en");

    expect(
      formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.search.openItem,
        title: "Blue Lock",
        subtitle: "Ch.2 / Ch.5",
        badge: strings.library.updated,
      }),
    ).toBe("Open Blue Lock, Ch.2 / Ch.5, Updated");
  });

  test("omits empty optional card context", () => {
    const strings = getMobileStrings("ja");

    expect(
      formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.search.openItem,
        title: "葬送のフリーレン",
        subtitle: " ",
      }),
    ).toBe("葬送のフリーレン を開く");
  });
});
