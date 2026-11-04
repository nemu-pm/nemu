import { describe, expect, test } from "bun:test";
import { getMobileExploreChapterMenuLabel } from "./mobileExploreChapterMenuLabel";

const base = { sortDirection: "desc" as const, sortAscending: "Ascending", sortDescending: "Descending" };

describe("getMobileExploreChapterMenuLabel", () => {
  test("names the selected source with its count", () => {
    expect(getMobileExploreChapterMenuLabel({ ...base, selected: { name: "MangaDex", count: "130" } })).toBe("MangaDex · 130");
  });
  test("falls back to the list length when the source has no count", () => {
    expect(getMobileExploreChapterMenuLabel({ ...base, selected: { name: "MangaDex" }, fallbackCount: 12 })).toBe("MangaDex · 12");
  });
  test("a source's own page names the source, never the lone sort direction", () => {
    expect(getMobileExploreChapterMenuLabel({ ...base, selected: null, sourceName: "MangaDex", fallbackCount: 130 })).toBe("MangaDex · 130");
    expect(getMobileExploreChapterMenuLabel({ ...base, selected: null, sourceName: "MangaDex" })).toBe("MangaDex");
  });
  test("without a source it shows the sort direction", () => {
    expect(getMobileExploreChapterMenuLabel({ ...base, selected: null })).toBe("Descending");
    expect(getMobileExploreChapterMenuLabel({ ...base, sortDirection: "asc", selected: null })).toBe("Ascending");
  });
});
