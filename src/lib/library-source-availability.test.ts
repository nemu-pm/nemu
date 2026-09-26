import { describe, expect, test } from "bun:test";
import { Keys } from "@/data/keys";
import { getLibrarySourceAvailability } from "./library-source-availability";

const link = { registryId: "aidoku-community", sourceId: "en.mangadex" };
const key = Keys.source(link.registryId, link.sourceId);
const catalogEntry = { id: "en.mangadex", registryId: "aidoku-community", name: "MangaDex" };

describe("getLibrarySourceAvailability", () => {
  test("an installed, enabled source can run", () => {
    expect(getLibrarySourceAvailability(link, [{ id: key }], [])).toEqual({
      status: "enabled",
    });
  });

  test("a user-disabled install is reported as disabled", () => {
    expect(
      getLibrarySourceAvailability(link, [{ id: key, disabled: true }], [catalogEntry]),
    ).toEqual({ status: "disabled" });
  });

  test("a source that is not installed is not reported as disabled, and offers the catalog entry", () => {
    expect(getLibrarySourceAvailability(link, [], [catalogEntry])).toEqual({
      status: "not-installed",
      candidate: catalogEntry,
    });
  });

  test("an uninstall tombstone counts as not installed", () => {
    expect(
      getLibrarySourceAvailability(link, [{ id: key, removed: true }], [catalogEntry]),
    ).toEqual({ status: "not-installed", candidate: catalogEntry });
  });

  test("a missing source absent from the catalog has no install candidate", () => {
    expect(
      getLibrarySourceAvailability(
        link,
        [],
        [{ id: "en.mangadex", registryId: "other-registry" }],
      ),
    ).toEqual({ status: "not-installed", candidate: null });
  });
});
