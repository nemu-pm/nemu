import { describe, expect, test } from "bun:test";
import {
  canSelectMobileMangaDetailSourceTab,
  getMobileMangaDetailRouteSourceParam,
  normalizeMobileMangaDetailSourceParam,
  resolveMobileMangaDetailSelectedSourceId,
  shouldRedirectMissingMobileMangaDetailEntry,
} from "./mobileMangaDetailRoute";

const sources = [
  { id: "source-link-1" },
  { id: "source-link-2" },
  { id: "source-link-3" },
];

describe("mobile manga detail route helpers", () => {
  test("normalizes source query params", () => {
    expect(normalizeMobileMangaDetailSourceParam(undefined)).toBeNull();
    expect(normalizeMobileMangaDetailSourceParam("")).toBeNull();
    expect(normalizeMobileMangaDetailSourceParam("  source-link-2  ")).toBe(
      "source-link-2",
    );
    expect(
      normalizeMobileMangaDetailSourceParam([
        " source-link-3 ",
        "source-link-2",
      ]),
    ).toBe("source-link-3");
  });

  test("resolves route source before fallback selection", () => {
    expect(
      resolveMobileMangaDetailSelectedSourceId(
        sources,
        "source-link-3",
        "source-link-2",
      ),
    ).toBe("source-link-3");
  });

  test("falls back to the first source for invalid route source params", () => {
    expect(
      resolveMobileMangaDetailSelectedSourceId(
        sources,
        "deleted-source",
        "source-link-2",
      ),
    ).toBe("source-link-1");
  });

  test("uses the state fallback when no route source is present", () => {
    expect(
      resolveMobileMangaDetailSelectedSourceId(
        sources,
        null,
        "source-link-2",
      ),
    ).toBe("source-link-2");
    expect(
      resolveMobileMangaDetailSelectedSourceId(
        sources,
        null,
        "deleted-source",
      ),
    ).toBe("source-link-1");
  });

  test("keeps first source URLs clean and preserves non-first selections", () => {
    expect(
      getMobileMangaDetailRouteSourceParam("source-link-1", sources),
    ).toBeUndefined();
    expect(
      getMobileMangaDetailRouteSourceParam("source-link-2", sources),
    ).toBe("source-link-2");
    expect(
      getMobileMangaDetailRouteSourceParam("new-source", sources),
    ).toBe("new-source");
    expect(getMobileMangaDetailRouteSourceParam(null, sources)).toBeUndefined();
  });

  test("redirects missing entries only after a successful detail load", () => {
    expect(
      shouldRedirectMissingMobileMangaDetailEntry({
        loading: false,
        error: null,
        hasEntry: false,
      }),
    ).toBe(true);
    expect(
      shouldRedirectMissingMobileMangaDetailEntry({
        loading: true,
        error: null,
        hasEntry: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirectMissingMobileMangaDetailEntry({
        loading: false,
        error: "offline",
        hasEntry: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirectMissingMobileMangaDetailEntry({
        loading: false,
        error: null,
        hasEntry: true,
      }),
    ).toBe(false);
  });

  test("gates selected source tabs as no-op selections", () => {
    expect(
      canSelectMobileMangaDetailSourceTab({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileMangaDetailSourceTab({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileMangaDetailSourceTab({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });
});
