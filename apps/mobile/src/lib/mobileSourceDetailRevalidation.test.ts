import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import {
  MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS,
  MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
  createMobileInflightRequests,
  mergeMobileChapterLists,
  shouldRevalidateMobileSourceDetail,
  withMobileSourceDetailSnapshot,
} from "./mobileSourceDetailRevalidation";

describe("revalidation policy", () => {
  test("nothing cached always fetches", () => {
    expect(
      shouldRevalidateMobileSourceDetail({
        cachedAgeMs: null,
        force: false,
        maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
      }),
    ).toBe(true);
  });

  test("a fresh copy answers a tab switch without touching the source", () => {
    expect(
      shouldRevalidateMobileSourceDetail({
        cachedAgeMs: 10_000,
        force: false,
        maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
      }),
    ).toBe(false);
  });

  test("a stale copy is painted and revalidated; pull-to-refresh always fetches", () => {
    expect(
      shouldRevalidateMobileSourceDetail({
        cachedAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
        force: false,
        maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
      }),
    ).toBe(true);
    expect(
      shouldRevalidateMobileSourceDetail({
        cachedAgeMs: 0,
        force: true,
        maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
      }),
    ).toBe(true);
  });

  test("background tabs follow the longer cache TTL", () => {
    expect(MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS).toBeGreaterThan(
      MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
    );
    expect(
      shouldRevalidateMobileSourceDetail({
        cachedAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS * 2,
        force: false,
        maxAgeMs: MOBILE_MANGA_DETAIL_BACKGROUND_REVALIDATE_MS,
      }),
    ).toBe(false);
  });

  test("a corrupt age is treated as a miss", () => {
    for (const cachedAgeMs of [Number.NaN, -1]) {
      expect(
        shouldRevalidateMobileSourceDetail({
          cachedAgeMs,
          force: false,
          maxAgeMs: MOBILE_MANGA_DETAIL_SELECTED_REVALIDATE_MS,
        }),
      ).toBe(true);
    }
  });
});

describe("chapter list merge", () => {
  const c = (id: string, chapterNumber: number, title?: string): ChapterSummary => ({
    id,
    chapterNumber,
    ...(title ? { title } : {}),
  });

  test("an unchanged refresh keeps the painted array (no state change, no jump)", () => {
    const painted = [c("3", 3), c("2", 2), c("1", 1)];
    const fresh = [c("3", 3), c("2", 2), c("1", 1)];
    expect(mergeMobileChapterLists(painted, fresh)).toBe(painted);
  });

  test("new chapters are added while unchanged rows keep their identity", () => {
    const painted = [c("2", 2), c("1", 1)];
    const merged = mergeMobileChapterLists(painted, [c("3", 3), c("2", 2), c("1", 1)]);
    expect(merged.map((chapter) => chapter.id)).toEqual(["3", "2", "1"]);
    expect(merged[1]).toBe(painted[0]!);
    expect(merged[2]).toBe(painted[1]!);
  });

  test("edited and removed chapters follow the fresh list", () => {
    const painted = [c("2", 2, "Old"), c("1", 1), c("0", 0)];
    const merged = mergeMobileChapterLists(painted, [c("2", 2, "New"), c("1", 1)]);
    expect(merged.map((chapter) => chapter.title ?? null)).toEqual(["New", null]);
    expect(merged[0]).not.toBe(painted[0]!);
    expect(merged[1]).toBe(painted[1]!);
  });

  test("nothing painted takes the fresh list as is", () => {
    const fresh = [c("1", 1)];
    expect(mergeMobileChapterLists(undefined, fresh)).toBe(fresh);
    expect(mergeMobileChapterLists([], fresh)).toBe(fresh);
  });
});

describe("in-flight request sharing", () => {
  test("concurrent callers share one request per key", async () => {
    const requests = createMobileInflightRequests<number>();
    let calls = 0;
    let release!: (value: number) => void;
    const start = () => {
      calls += 1;
      return new Promise<number>((resolve) => {
        release = resolve;
      });
    };
    const first = requests.run("source:manga", start);
    const second = requests.run("source:manga", start);
    expect(second).toBe(first);
    await Promise.resolve();
    release(7);
    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(calls).toBe(1);
    expect(requests.has("source:manga")).toBe(false);
  });

  test("a settled or failed request is forgotten so the next call refetches", async () => {
    const requests = createMobileInflightRequests<number>();
    await expect(
      requests.run("k", () => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
    expect(requests.size).toBe(0);
    await expect(requests.run("k", async () => 2)).resolves.toBe(2);
    expect(requests.size).toBe(0);
  });

  test("different keys run independently", async () => {
    const requests = createMobileInflightRequests<string>();
    const a = requests.run("a", async () => "a");
    const b = requests.run("b", async () => "b");
    expect(a).not.toBe(b);
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
  });
});

describe("tab snapshots (source switching)", () => {
  const metadata = { title: "地缚少年花子君" };
  const chapters: ChapterSummary[] = [
    { id: "2", chapterNumber: 2 },
    { id: "1", chapterNumber: 1 },
  ];

  test("a cached list turns a partial tab into a complete one", () => {
    const partial = { status: "cached" as const, chapters: [{ id: "2" }] };
    const next = withMobileSourceDetailSnapshot(
      partial,
      { metadata, chapters, fetchedAt: 100 },
      "cache",
    );
    expect(next).toEqual({
      status: "cached",
      chapters,
      full: true,
      metadata,
      fetchedAt: 100,
    });
  });

  test("an older cached copy never replaces a newer list on screen", () => {
    const shown = withMobileSourceDetailSnapshot(
      undefined,
      { metadata, chapters, fetchedAt: 200 },
      "network",
    );
    expect(
      withMobileSourceDetailSnapshot(
        shown,
        { metadata, chapters: [chapters[1]!], fetchedAt: 100 },
        "cache",
      ),
    ).toBe(shown);
  });

  test("an identical network refresh keeps the painted state (no re-render)", () => {
    const shown = withMobileSourceDetailSnapshot(
      undefined,
      { metadata, chapters, fetchedAt: 200 },
      "network",
    );
    expect(
      withMobileSourceDetailSnapshot(
        shown,
        { metadata, chapters: chapters.map((c) => ({ ...c })), fetchedAt: 200 },
        "network",
      ),
    ).toBe(shown);
  });

  test("a network refresh merges by id and marks the tab live", () => {
    const cached = withMobileSourceDetailSnapshot(
      undefined,
      { metadata, chapters, fetchedAt: 100 },
      "cache",
    );
    const fresh = withMobileSourceDetailSnapshot(
      cached,
      {
        metadata,
        chapters: [{ id: "3", chapterNumber: 3 }, ...chapters.map((c) => ({ ...c }))],
        fetchedAt: 300,
      },
      "network",
    );
    expect(fresh.status).toBe("ready");
    expect(fresh.chapters.map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(fresh.chapters[1]).toBe(cached.chapters[0]!);
  });

  test("a cached paint keeps an in-flight tab's loading state", () => {
    const loading = { status: "loading" as const, chapters: [] };
    expect(
      withMobileSourceDetailSnapshot(
        loading,
        { metadata, chapters, fetchedAt: 100 },
        "cache",
      ).status,
    ).toBe("loading");
  });
});

describe("priority-aware request sharing", () => {
  test("joining an in-flight request raises its priority in place", async () => {
    const requests = createMobileInflightRequests<string>();
    let release!: (value: string) => void;
    const seen: { ticket: { priority: string } | null } = { ticket: null };
    const sweep = requests.run(
      "source:manga",
      (ticket) => {
        seen.ticket = ticket;
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
      "background",
    );
    await Promise.resolve();
    expect(requests.priorityOf("source:manga")).toBe("background");

    const opened = requests.run(
      "source:manga",
      async () => "never started",
      "user",
    );
    expect(opened).toBe(sweep);
    expect(requests.priorityOf("source:manga")).toBe("user");
    expect(seen.ticket).toEqual({ priority: "user" });

    // A lower-priority join never demotes it.
    void requests.run("source:manga", async () => "x", "background");
    expect(requests.priorityOf("source:manga")).toBe("user");
    release("chapters");
    expect(await opened).toBe("chapters");
    expect(requests.priorityOf("source:manga")).toBeNull();
  });
});

describe("placeholder metadata", () => {
  test("a title-only placeholder never replaces real source metadata", () => {
    const chapters = [{ id: "c2" }, { id: "c1" }];
    const real = { title: "Real", cover: "https://example.com/cover.jpg" };
    const shown = withMobileSourceDetailSnapshot(
      undefined,
      { metadata: real, chapters, fetchedAt: 100 },
      "cache",
    );
    const next = withMobileSourceDetailSnapshot(
      shown,
      {
        metadata: { title: "Placeholder" },
        chapters: [{ id: "c3" }, ...chapters],
        fetchedAt: 200,
        partialMetadata: true,
      },
      "network",
    );
    expect(next.metadata).toBe(real);
    expect(next.chapters.map((chapter) => chapter.id)).toEqual(["c3", "c2", "c1"]);
    // Unchanged rows keep their identity (no re-render, no jump).
    expect(next.chapters[1]).toBe(shown.chapters[0]);

    const fromPlaceholderOnly = withMobileSourceDetailSnapshot(
      undefined,
      {
        metadata: { title: "Placeholder" },
        chapters,
        fetchedAt: 200,
        partialMetadata: true,
      },
      "cache",
    );
    expect(fromPlaceholderOnly.metadata).toBeUndefined();
    expect(fromPlaceholderOnly.full).toBe(true);
  });
});

describe("withdrawn interest", () => {
  test("a request nobody waits for any more drops to background", async () => {
    let dropped = 0;
    const requests = createMobileInflightRequests<string>(() => {
      dropped += 1;
    });
    let release!: (value: string) => void;
    const screen = new AbortController();
    const opened = requests.run(
      "source:manga",
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
      "user",
      screen.signal,
    );
    const sweep = new AbortController();
    void requests.run("source:manga", async () => "x", "background", sweep.signal);
    expect(requests.priorityOf("source:manga")).toBe("user");

    // The user leaves: only the sweep still wants it.
    screen.abort();
    expect(requests.priorityOf("source:manga")).toBe("background");
    expect(dropped).toBe(1);
    // Nobody at all: still background, still running (it fills the cache).
    sweep.abort();
    expect(requests.priorityOf("source:manga")).toBe("background");
    expect(dropped).toBe(1);

    // Opening it again raises it back.
    const again = requests.run("source:manga", async () => "x", "user");
    expect(requests.priorityOf("source:manga")).toBe("user");
    await Promise.resolve();
    release("chapters");
    expect(await opened).toBe("chapters");
    expect(await again).toBe("chapters");
  });

  test("a second screen keeps the request at user priority", () => {
    const requests = createMobileInflightRequests<string>(() => undefined);
    const first = new AbortController();
    const second = new AbortController();
    void requests.run("k", () => new Promise<string>(() => undefined), "user", first.signal);
    void requests.run("k", async () => "x", "user", second.signal);
    first.abort();
    expect(requests.priorityOf("k")).toBe("user");
  });
});
