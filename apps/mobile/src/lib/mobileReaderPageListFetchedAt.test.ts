import { describe, expect, test } from "bun:test";
import {
  isSameMobileReaderPageList,
  resolveMobileReaderPageListFetchedAt,
} from "./mobileReaderPageListFetchedAt";

const pages = [
  { id: "p1", imageUri: "https://x/1.jpg", headers: { Referer: "https://x" } },
  { id: "p2", imageUri: "https://x/2.jpg", context: { key: "a" } },
];

describe("mobile reader page list fetchedAt", () => {
  test("an unchanged list keeps the shown list's fetchedAt", () => {
    expect(
      resolveMobileReaderPageListFetchedAt({
        shown: { pages: JSON.parse(JSON.stringify(pages)), fetchedAt: 100 },
        fetched: { pages, fetchedAt: 200 },
      }),
    ).toBe(100);
  });

  test("a changed list takes the new fetchedAt", () => {
    for (const changed of [
      pages.slice(0, 1),
      [pages[0]!, { ...pages[1]!, imageUri: "https://x/2b.jpg" }],
      [{ ...pages[0]!, headers: { Referer: "https://y" } }, pages[1]!],
      [pages[0]!, { ...pages[1]!, context: { key: "b" } }],
      [pages[0]!, { ...pages[1]!, id: "p3" }],
    ]) {
      expect(isSameMobileReaderPageList(pages, changed)).toBe(false);
      expect(
        resolveMobileReaderPageListFetchedAt({
          shown: { pages, fetchedAt: 100 },
          fetched: { pages: changed, fetchedAt: 200 },
        }),
      ).toBe(200);
    }
  });

  test("nothing shown yet takes the new fetchedAt", () => {
    expect(
      resolveMobileReaderPageListFetchedAt({
        shown: null,
        fetched: { pages, fetchedAt: 200 },
      }),
    ).toBe(200);
  });
});
