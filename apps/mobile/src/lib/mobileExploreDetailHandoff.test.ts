import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import { peekMobileExploreDetailHandoff, primeMobileExploreDetailHandoff } from "./mobileExploreDetailHandoff";

const entry = (id: string) => ({ item: { libraryItemId: id }, sources: [] }) as unknown as LibraryEntry;

describe("mobileExploreDetailHandoff", () => {
  test("the tapped title goes to its own route (more than once), to no other, expires, and the latest tap wins", () => {
    const cover = { uri: "https://example.test/c.jpg", headers: { Referer: "https://example.test/" } };
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover }, 1000);
    expect(peekMobileExploreDetailHandoff(["b"], 1010)).toBeNull();
    expect(peekMobileExploreDetailHandoff(["a%2F", "a"], 1040)?.cover).toEqual(cover);
    expect(peekMobileExploreDetailHandoff(["a"], 1050)?.entry.item.libraryItemId).toBe("a");
    expect(peekMobileExploreDetailHandoff(["a"], 1000 + 3000 + 1)).toBeNull();
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover: null }, 1000);
    primeMobileExploreDetailHandoff({ entry: entry("b"), cover: null }, 1005);
    expect(peekMobileExploreDetailHandoff(["a"], 1010)).toBeNull();
    expect(peekMobileExploreDetailHandoff(["b"], 1010)?.entry.item.libraryItemId).toBe("b");
  });
});
