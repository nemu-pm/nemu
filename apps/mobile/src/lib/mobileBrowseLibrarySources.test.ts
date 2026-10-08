import { describe, expect, test } from "bun:test";
import { selectMobileBrowseLibrarySources } from "./mobileBrowseSources";

const source = (sourceId: string) => ({ registryId: "r", sourceId });
const link = (sourceId: string, libraryItemId: string, removed?: boolean) => ({ registryId: "r", sourceId, libraryItemId, removed });

describe("Browse: the sources the library reads from", () => {
  test("only sources holding library titles, most titles first, each title counted once, capped", () => {
    const picked = selectMobileBrowseLibrarySources(
      [source("a"), source("b"), source("c"), source("d")],
      [link("b", "1"), link("b", "1"), link("c", "1"), link("c", "2"), link("c", "3"), link("d", "4", true)],
    );
    expect(picked.map((item) => [item.source.sourceId, item.titles])).toEqual([
      ["c", 3],
      ["b", 1],
    ]);
    expect(selectMobileBrowseLibrarySources(["a", "b", "c"].map(source), ["a", "b", "c"].map((id) => link(id, id)), 2)).toHaveLength(2);
  });
});
