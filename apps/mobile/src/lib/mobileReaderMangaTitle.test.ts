import { describe, expect, test } from "bun:test";
import {
  loadMobileReaderMangaTitle,
  usableMobileReaderMangaTitle,
  type MobileReaderSourceTitleResult,
} from "./mobileReaderMangaTitle";

const MANGA_ID = "chi-baku-shounen-hanako-kun-57356";

function loader(
  overrides: Partial<Parameters<typeof loadMobileReaderMangaTitle>[0]> & {
    fetchResults?: (MobileReaderSourceTitleResult | Error)[];
  } = {},
) {
  const calls = { cache: 0, fetch: 0, waits: [] as number[] };
  const results = [...(overrides.fetchResults ?? [])];
  const promise = loadMobileReaderMangaTitle({
    mangaId: MANGA_ID,
    readCachedTitle: async () => {
      calls.cache += 1;
      return null;
    },
    fetchSourceTitle: async () => {
      calls.fetch += 1;
      const next = results.shift();
      if (!next) throw new Error("no more results");
      if (next instanceof Error) throw next;
      return next;
    },
    isCancelled: () => false,
    wait: async (ms) => {
      calls.waits.push(ms);
    },
    retryDelayMs: 10,
    ...overrides,
  });
  return { calls, promise };
}

describe("usableMobileReaderMangaTitle", () => {
  test("rejects blanks, the opaque id and URL/path-like titles", () => {
    expect(usableMobileReaderMangaTitle("  ", MANGA_ID)).toBeNull();
    expect(usableMobileReaderMangaTitle(` ${MANGA_ID} `, MANGA_ID)).toBeNull();
    expect(
      usableMobileReaderMangaTitle("https://soraraw.com/manga/1", MANGA_ID),
    ).toBeNull();
    expect(usableMobileReaderMangaTitle("/manga/1/", MANGA_ID)).toBeNull();
    expect(usableMobileReaderMangaTitle(" 地縛少年 花子くん ", MANGA_ID)).toBe(
      "地縛少年 花子くん",
    );
  });
});

describe("loadMobileReaderMangaTitle", () => {
  test("uses the persisted detail cache without touching the network", async () => {
    const { calls, promise } = loader({
      readCachedTitle: async () => "地縛少年 花子くん",
      fetchResults: [{ status: "ready", title: "Network" }],
    });
    expect(await promise).toBe("地縛少年 花子くん");
    expect(calls.fetch).toBe(0);
  });

  test("falls through an unusable cached title to the source", async () => {
    const { calls, promise } = loader({
      readCachedTitle: async () => MANGA_ID,
      fetchResults: [{ status: "ready", title: "地縛少年 花子くん" }],
    });
    expect(await promise).toBe("地縛少年 花子くん");
    expect(calls.fetch).toBe(1);
  });

  test("treats a failing cache read as a miss", async () => {
    const { promise } = loader({
      readCachedTitle: async () => {
        throw new Error("disk");
      },
      fetchResults: [{ status: "ready", title: "Source" }],
    });
    expect(await promise).toBe("Source");
  });

  test("retries a failed source fetch exactly once", async () => {
    const { calls, promise } = loader({
      fetchResults: [new Error("timeout"), { status: "ready", title: "Retry" }],
    });
    expect(await promise).toBe("Retry");
    expect(calls.fetch).toBe(2);
    expect(calls.waits).toEqual([10]);
  });

  test("gives up after the retry fails too", async () => {
    const { calls, promise } = loader({
      fetchResults: [new Error("a"), new Error("b"), { status: "ready", title: "x" }],
    });
    expect(await promise).toBeNull();
    expect(calls.fetch).toBe(2);
  });

  test("does not retry a blocked source or a ready result without a title", async () => {
    const blocked = loader({ fetchResults: [{ status: "blocked" }] });
    expect(await blocked.promise).toBeNull();
    expect(blocked.calls.fetch).toBe(1);

    const untitled = loader({
      fetchResults: [{ status: "ready", title: "https://example.com/x" }],
    });
    expect(await untitled.promise).toBeNull();
    expect(untitled.calls.fetch).toBe(1);
  });

  test("returns the cached title only when no source is available", async () => {
    const { promise } = loader({ fetchSourceTitle: undefined });
    expect(await promise).toBeNull();
  });

  test("stops before the retry once cancelled", async () => {
    let cancelled = false;
    const { calls, promise } = loader({
      fetchResults: [new Error("timeout"), { status: "ready", title: "late" }],
      wait: async () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });
    expect(await promise).toBeNull();
    expect(calls.fetch).toBe(1);
  });
});
