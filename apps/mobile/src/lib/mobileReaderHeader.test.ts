import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import { getMobileReaderTitle } from "./mobileReaderHeader";

function entry(title: string, overrideTitle?: string): LibraryEntry {
  return {
    item: {
      libraryItemId: "library-1",
      metadata: { title },
      inLibrary: true,
      overrides:
        overrideTitle === undefined
          ? undefined
          : { metadata: { title: overrideTitle } },
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [],
  };
}

describe("mobile reader header", () => {
  test("uses library metadata title", () => {
    expect(getMobileReaderTitle(entry("Frieren"), "source-id")).toBe("Frieren");
  });

  test("uses title overrides before base metadata", () => {
    expect(getMobileReaderTitle(entry("Base", "Override"), "source-id")).toBe(
      "Override",
    );
  });

  test("falls back to the route manga id when title is missing", () => {
    expect(getMobileReaderTitle(entry("   "), "fallback-id")).toBe(
      "fallback-id",
    );
    expect(getMobileReaderTitle(null, "fallback-id")).toBe("fallback-id");
  });

  test("uses source metadata title before the route manga id", () => {
    expect(
      getMobileReaderTitle(null, "/manga/example", "Saibai Cheat"),
    ).toBe("Saibai Cheat");
    expect(getMobileReaderTitle(entry("Library"), "/manga/example", "Source")).toBe(
      "Library",
    );
  });

  test("uses a friendly fallback before exposing the route manga id", () => {
    expect(
      getMobileReaderTitle(null, "opaque-manga-id", null, " Manga "),
    ).toBe("Manga");
  });

  test("ignores cached and source titles that only repeat the opaque id", () => {
    expect(
      getMobileReaderTitle(
        entry("opaque-manga-id"),
        "opaque-manga-id",
        "opaque-manga-id",
        "Manga",
      ),
    ).toBe("Manga");
  });
});
