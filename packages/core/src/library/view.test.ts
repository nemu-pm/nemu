import { describe, expect, test } from "bun:test";
import {
  entryHasAnyUpdate,
  getEntryCover,
  getEntryTitle,
  sourceHasUpdate,
  type LibraryEntryLike,
  type LocalSourceLinkLike,
} from "./index";

const entry = (over: Partial<LibraryEntryLike["item"]> = {}): LibraryEntryLike => ({
  item: { metadata: { title: "Base", ...((over.metadata ?? {}) as object) }, ...over },
  sources: [],
});

const link = (
  latestChapter?: LocalSourceLinkLike["latestChapter"],
  updateAckChapter?: LocalSourceLinkLike["updateAckChapter"],
): LocalSourceLinkLike => ({ latestChapter, updateAckChapter });

describe("getEntryTitle", () => {
  test("base title when no overrides", () => {
    expect(getEntryTitle(entry({ metadata: { title: "X" } }))).toBe("X");
  });

  test("override title wins", () => {
    expect(
      getEntryTitle(entry({ metadata: { title: "Base" }, overrides: { metadata: { title: "Over" } } })),
    ).toBe("Over");
  });

  test("falls back to base when override metadata present but title absent", () => {
    expect(
      getEntryTitle(entry({ metadata: { title: "Base" }, overrides: { metadata: { cover: "c" } } })),
    ).toBe("Base");
  });

  test("null override metadata falls back to base", () => {
    expect(getEntryTitle(entry({ metadata: { title: "Base" }, overrides: { metadata: null } }))).toBe("Base");
  });
});

describe("getEntryCover", () => {
  test("coverUrl wins over metadata covers", () => {
    expect(
      getEntryCover(
        entry({
          metadata: { title: "t", cover: "base" },
          overrides: { coverUrl: "url", metadata: { cover: "over" } },
        }),
      ),
    ).toBe("url");
  });

  test("override metadata.cover wins over base cover", () => {
    expect(
      getEntryCover(
        entry({ metadata: { title: "t", cover: "base" }, overrides: { metadata: { cover: "over" } } }),
      ),
    ).toBe("over");
  });

  test("base cover when no overrides", () => {
    expect(getEntryCover(entry({ metadata: { title: "t", cover: "base" } }))).toBe("base");
  });

  test("undefined when nothing set", () => {
    expect(getEntryCover(entry({ metadata: { title: "t" } }))).toBeUndefined();
  });
});

describe("sourceHasUpdate", () => {
  test("true when latest > ack", () => {
    expect(sourceHasUpdate(link({ chapterNumber: 5 }, { chapterNumber: 3 }))).toBe(true);
  });

  test("false when latest === ack", () => {
    expect(sourceHasUpdate(link({ chapterNumber: 3 }, { chapterNumber: 3 }))).toBe(false);
  });

  test("false when latest < ack", () => {
    expect(sourceHasUpdate(link({ chapterNumber: 2 }, { chapterNumber: 5 }))).toBe(false);
  });

  test("chapterNumber 0 is a real number (not null-gated)", () => {
    expect(sourceHasUpdate(link({ chapterNumber: 0 }, { chapterNumber: 0 }))).toBe(false);
    expect(sourceHasUpdate(link({ chapterNumber: 5 }, { chapterNumber: 0 }))).toBe(true);
    expect(sourceHasUpdate(link({ chapterNumber: 0 }, { chapterNumber: 5 }))).toBe(false);
  });

  test("false when either chapter missing", () => {
    expect(sourceHasUpdate(link({ chapterNumber: 5 }, undefined))).toBe(false);
    expect(sourceHasUpdate(link(undefined, { chapterNumber: 5 }))).toBe(false);
    expect(sourceHasUpdate(link(undefined, undefined))).toBe(false);
  });

  test("false when chapter object present but chapterNumber absent", () => {
    expect(sourceHasUpdate(link({ chapterNumber: undefined }, { chapterNumber: 5 }))).toBe(false);
    expect(sourceHasUpdate(link({}, { chapterNumber: 5 }))).toBe(false);
  });

  test("false when chapter objects are null", () => {
    expect(sourceHasUpdate(link(null, null))).toBe(false);
  });
});

describe("entryHasAnyUpdate", () => {
  test("true if any source has update", () => {
    const e: LibraryEntryLike = {
      item: { metadata: { title: "t" } },
      sources: [link({ chapterNumber: 1 }, { chapterNumber: 1 }), link({ chapterNumber: 9 }, { chapterNumber: 1 })],
    };
    expect(entryHasAnyUpdate(e)).toBe(true);
  });

  test("false if none have update", () => {
    const e: LibraryEntryLike = {
      item: { metadata: { title: "t" } },
      sources: [link({ chapterNumber: 1 }, { chapterNumber: 5 }), link(undefined, undefined)],
    };
    expect(entryHasAnyUpdate(e)).toBe(false);
  });

  test("false for empty sources", () => {
    expect(entryHasAnyUpdate(entry({ metadata: { title: "t" } }))).toBe(false);
  });
});