import { beforeEach, describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import {
  clearMobileExploreDetailHandoff,
  MOBILE_EXPLORE_DETAIL_HANDOFF_TTL_MS,
  peekMobileExploreDetailHandoff,
  primeMobileExploreDetailHandoff,
} from "./mobileExploreDetailHandoff";

function entry(id: string): LibraryEntry {
  return { item: { libraryItemId: id }, sources: [] } as unknown as LibraryEntry;
}

describe("mobileExploreDetailHandoff", () => {
  beforeEach(() => clearMobileExploreDetailHandoff());

  test("nothing primed, nothing handed over", () => {
    expect(peekMobileExploreDetailHandoff(["a"], 1000)).toBeNull();
  });

  test("hands the tapped title to the route that opens it, more than once", () => {
    const cover = { uri: "https://example.test/c.jpg", headers: { Referer: "https://example.test/" } };
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover }, 1000);
    const first = peekMobileExploreDetailHandoff(["a%2F", "a"], 1040);
    expect(first?.entry.item.libraryItemId).toBe("a");
    expect(first?.cover).toEqual(cover);
    // A first render may run twice; the second read still finds it.
    expect(peekMobileExploreDetailHandoff(["a"], 1050)?.entry.item.libraryItemId).toBe("a");
  });

  test("another title's route gets nothing", () => {
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover: null }, 1000);
    expect(peekMobileExploreDetailHandoff(["b"], 1010)).toBeNull();
    // ...and the handoff is still there for its own route.
    expect(peekMobileExploreDetailHandoff(["a"], 1020)).not.toBeNull();
  });

  test("expires, so a later visit reads the database as before", () => {
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover: null }, 1000);
    expect(
      peekMobileExploreDetailHandoff(["a"], 1000 + MOBILE_EXPLORE_DETAIL_HANDOFF_TTL_MS + 1),
    ).toBeNull();
    expect(peekMobileExploreDetailHandoff(["a"], 1010)).toBeNull();
  });

  test("a clock that went backwards drops the handoff", () => {
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover: null }, 1000);
    expect(peekMobileExploreDetailHandoff(["a"], 900)).toBeNull();
  });

  test("the latest tap wins", () => {
    primeMobileExploreDetailHandoff({ entry: entry("a"), cover: null }, 1000);
    primeMobileExploreDetailHandoff({ entry: entry("b"), cover: null }, 1005);
    expect(peekMobileExploreDetailHandoff(["a"], 1010)).toBeNull();
    expect(peekMobileExploreDetailHandoff(["b"], 1010)?.entry.item.libraryItemId).toBe("b");
  });
});
