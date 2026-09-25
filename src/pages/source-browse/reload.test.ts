import { describe, expect, test } from "bun:test";
import { isSourceBrowseMatchFor, SOURCE_BROWSE_ROUTE_ID } from "./reload";

describe("isSourceBrowseMatchFor", () => {
  const source = { registryId: "aidoku", sourceId: "en.reader" };

  test("selects only this source's browse match", () => {
    expect(
      isSourceBrowseMatchFor(
        { routeId: SOURCE_BROWSE_ROUTE_ID, params: { ...source } },
        source,
      ),
    ).toBe(true);
  });

  test("leaves every other match alone", () => {
    // Parent layouts and the root carry the same params but a different route.
    for (const routeId of ["__root__", "/_shell", "/_shell/browse"]) {
      expect(isSourceBrowseMatchFor({ routeId, params: { ...source } }, source)).toBe(false);
    }
    // A cached or preloaded browse match for another source.
    expect(
      isSourceBrowseMatchFor(
        { routeId: SOURCE_BROWSE_ROUTE_ID, params: { ...source, sourceId: "en.other" } },
        source,
      ),
    ).toBe(false);
    expect(
      isSourceBrowseMatchFor(
        { routeId: SOURCE_BROWSE_ROUTE_ID, params: { ...source, registryId: "local" } },
        source,
      ),
    ).toBe(false);
    expect(isSourceBrowseMatchFor({ routeId: SOURCE_BROWSE_ROUTE_ID, params: null }, source)).toBe(
      false,
    );
  });
});
