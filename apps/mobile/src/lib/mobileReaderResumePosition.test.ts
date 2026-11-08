import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  chooseMobileReaderResumePosition,
  clearMobileReaderResumePositions,
  flushMobileReaderResumePositions,
  isMobileReaderLastPageVisible,
  loadMobileReaderResumePosition,
  markMobileReaderResumeFinished,
  mobileReaderResumeReread,
  noteMobileReaderResumeProgressWrite,
  parseMobileReaderResumePositions,
  peekMobileReaderResumePosition,
  resetMobileReaderResumePositionsForTests,
  resolveMobileChapterOpeningPage,
  saveMobileReaderResumePosition,
  serializeMobileReaderResumePositions,
  subscribeMobileReaderResumePositions,
  type MobileReaderResumePosition,
} from "./mobileReaderResumePosition";
import { buildMobileReaderScrollLayout, mobileReaderScrollAnchorForOffset } from "./mobileReaderScrollLayout";

const local = (
  overrides: Partial<MobileReaderResumePosition> = {},
): MobileReaderResumePosition => ({
  sourceIndex: 3,
  fraction: 0.4,
  total: 20,
  savedAt: 10_000,
  progressAt: 0,
  ...overrides,
});

describe("chooseMobileReaderResumePosition", () => {
  test("reopens where this device stopped, below the high-water page", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local(),
        progress: { progress: 12, total: 20, lastReadAt: 9_000 },
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 3, fraction: 0.4, origin: "local" });
  });

  test("falls back to the synced page when another device read since", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local(),
        progress: { progress: 12, total: 20, lastReadAt: 60_000 },
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 12, fraction: 0, origin: "progress" });
  });

  test("tolerates small clock skew and its own sync-clock writes", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local(),
        progress: { progress: 12, total: 20, lastReadAt: 11_500 },
        pageCount: 20,
      })?.origin,
    ).toBe("local");
    // The device's own write ran ahead of the wall clock.
    expect(
      chooseMobileReaderResumePosition({
        local: local({ progressAt: 60_000 }),
        progress: { progress: 12, total: 20, lastReadAt: 60_000 },
        pageCount: 20,
      })?.origin,
    ).toBe("local");
  });

  test("a later reset (marked unread elsewhere) wins", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local(),
        progress: { progress: 0, total: 20, lastReadAt: 1_000, resetAt: 50_000 },
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 0, fraction: 0, origin: "progress" });
  });

  test("ignores a spot saved for a different page count", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local({ total: 18 }),
        progress: { progress: 12, total: 20, lastReadAt: 1 },
        pageCount: 20,
      })?.origin,
    ).toBe("progress");
    expect(
      chooseMobileReaderResumePosition({
        local: local({ sourceIndex: 25, total: 20 }),
        progress: null,
        pageCount: 20,
      }),
    ).toBeNull();
  });

  test("local only, no synced progress", () => {
    expect(
      chooseMobileReaderResumePosition({ local: local(), progress: null, pageCount: 20 }),
    ).toEqual({ sourceIndex: 3, fraction: 0.4, origin: "local" });
  });

  test("single-page synced records restore nothing (as before)", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: null,
        progress: { progress: 0, total: 1, lastReadAt: 1 },
        pageCount: 1,
      }),
    ).toBeNull();
  });
});

describe("resume position serialization", () => {
  test("round-trips and drops malformed entries", () => {
    const map = new Map([
      ["a", local()],
      ["b", local({ savedAt: 20_000, fraction: 2 })],
    ]);
    const parsed = parseMobileReaderResumePositions(
      serializeMobileReaderResumePositions(map),
    );
    expect(parsed.get("a")).toEqual(local());
    expect(parsed.get("b")?.fraction).toBe(1);
    expect(
      parseMobileReaderResumePositions(
        JSON.stringify({ entries: [["x", { sourceIndex: -1, total: 3, savedAt: 1 }], [1, {}]] }),
      ).size,
    ).toBe(0);
    expect(parseMobileReaderResumePositions("{not json").size).toBe(0);
  });

  test("keeps the newest saves past the limit", () => {
    const map = new Map([
      ["old", local({ savedAt: 1 })],
      ["new", local({ savedAt: 2 })],
    ]);
    const parsed = parseMobileReaderResumePositions(
      serializeMobileReaderResumePositions(map, 1),
    );
    expect([...parsed.keys()]).toEqual(["new"]);
  });
});

describe("resume position store", () => {
  afterEach(() => resetMobileReaderResumePositionsForTests());

  test("a progress write 3 s after the local save, from this device, keeps the local spot", async () => {
    const t = 1_000_000;
    saveMobileReaderResumePosition("k", {
      sourceIndex: 11,
      fraction: 0.62,
      total: 23,
      savedAt: t,
      progressAt: t - 60_000,
    });
    // The reader's silent progress write (sync clock), then its note.
    noteMobileReaderResumeProgressWrite("k", t + 3_000);
    const choice = chooseMobileReaderResumePosition({
      local: await loadMobileReaderResumePosition("k"),
      progress: { progress: 14, total: 23, lastReadAt: t + 3_000 },
      pageCount: 23,
    });
    expect(choice).toEqual({ sourceIndex: 11, fraction: 0.62, origin: "local" });
  });

  test("saves, notes own progress writes, and clears", async () => {
    expect(await loadMobileReaderResumePosition("k")).toBeNull();
    saveMobileReaderResumePosition("k", {
      sourceIndex: 2,
      fraction: 0.5,
      total: 9,
      savedAt: 100,
    });
    noteMobileReaderResumeProgressWrite("k", 500);
    expect(await loadMobileReaderResumePosition("k")).toEqual({
      sourceIndex: 2,
      fraction: 0.5,
      total: 9,
      savedAt: 100,
      progressAt: 500,
    });
    // A later save keeps the noted progress clock.
    saveMobileReaderResumePosition("k", {
      sourceIndex: 4,
      fraction: 0,
      total: 9,
      savedAt: 200,
    });
    expect((await loadMobileReaderResumePosition("k"))?.progressAt).toBe(500);
    flushMobileReaderResumePositions();
    clearMobileReaderResumePositions(["k"]);
    expect(await loadMobileReaderResumePosition("k")).toBeNull();
  });
});

describe("completed chapters", () => {
  // Finished: the synced page is the last one (high-water merge).
  const completedProgress = {
    progress: 19,
    total: 20,
    lastReadAt: 9_000,
    completed: true,
  };

  test("completed, not re-read: the top of page 1", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: null,
        progress: completedProgress,
        pageCount: 20,
      }),
    ).toBeNull();
    // The spot left by finishing it (the last page) is not a re-read spot.
    expect(
      chooseMobileReaderResumePosition({
        local: local({ sourceIndex: 19, fraction: 0.9, reread: false }),
        progress: completedProgress,
        pageCount: 20,
      }),
    ).toBeNull();
  });

  test("a re-read spot mid-chapter reopens there", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local({ sourceIndex: 7, fraction: 0.3, reread: true }),
        progress: completedProgress,
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 7, fraction: 0.3, origin: "local" });
  });

  test("a re-read spot on the last page: the top of page 1", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local({ sourceIndex: 19, fraction: 0.5, reread: true }),
        progress: completedProgress,
        pageCount: 20,
      }),
    ).toBeNull();
  });

  test("a legacy entry without the flag: the top of page 1", () => {
    const legacy = parseMobileReaderResumePositions(
      JSON.stringify({
        version: 1,
        entries: [["k", { sourceIndex: 7, fraction: 0.3, total: 20, savedAt: 10_000 }]],
      }),
    ).get("k");
    expect(legacy?.reread).toBeUndefined();
    expect(
      chooseMobileReaderResumePosition({
        local: legacy,
        progress: completedProgress,
        pageCount: 20,
      }),
    ).toBeNull();
  });

  test("partly read (not completed): unchanged", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local(),
        progress: { progress: 12, total: 20, lastReadAt: 9_000, completed: false },
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 3, fraction: 0.4, origin: "local" });
    expect(
      chooseMobileReaderResumePosition({
        local: null,
        progress: { progress: 12, total: 20, lastReadAt: 9_000, completed: false },
        pageCount: 20,
      }),
    ).toEqual({ sourceIndex: 12, fraction: 0, origin: "progress" });
  });

  test("completed on another device since: the top of page 1", () => {
    expect(
      chooseMobileReaderResumePosition({
        local: local({ sourceIndex: 7, fraction: 0.3, reread: true }),
        progress: { ...completedProgress, lastReadAt: 60_000 },
        pageCount: 20,
      }),
    ).toBeNull();
  });

  test("the reread flag round-trips; finishing clears it", async () => {
    const parsed = parseMobileReaderResumePositions(
      serializeMobileReaderResumePositions(new Map([["k", local({ reread: true })]])),
    );
    expect(parsed.get("k")?.reread).toBe(true);

    saveMobileReaderResumePosition("k", {
      sourceIndex: 7,
      fraction: 0.3,
      total: 20,
      savedAt: 100,
      reread: true,
    });
    expect((await loadMobileReaderResumePosition("k"))?.reread).toBe(true);
    markMobileReaderResumeFinished("k");
    const finished = await loadMobileReaderResumePosition("k");
    expect(finished?.reread).toBe(false);
    expect(
      chooseMobileReaderResumePosition({
        local: finished,
        progress: { progress: 19, total: 20, lastReadAt: 50, completed: true },
        pageCount: 20,
      }),
    ).toBeNull();
    // The same spot saved again as a re-read spot is not deduped away.
    saveMobileReaderResumePosition("k", {
      sourceIndex: 7,
      fraction: 0.3,
      total: 20,
      savedAt: 100,
      reread: true,
    });
    expect((await loadMobileReaderResumePosition("k"))?.reread).toBe(true);
    resetMobileReaderResumePositionsForTests();
  });
});

describe("ReaderScreen wiring for completed chapters", () => {
  const screen = readFileSync(
    path.join(import.meta.dir, "..", "screens/ReaderScreen.tsx"),
    "utf8",
  );

  test("spots saved in a session that opened the chapter completed are re-read spots", () => {
    expect(screen).toContain(
      "readerLocalResume.progress?.completed === true;",
    );
    expect(screen).toMatch(
      /reread: mobileReaderResumeReread\(\s*readerOpenedCompleted,\s*readerResumeFinishedKeyRef\.current === readerResumeKey,\s*\),/,
    );
  });

  test("the last page on screen latches the session's saves as finished", () => {
    const save = screen.slice(
      screen.indexOf("const saveReaderLocalResume = useCallback(() => {"),
      screen.indexOf("saveReaderLocalResumeRef.current = saveReaderLocalResume;"),
    );
    expect(save).toMatch(
      /isMobileReaderLastPageVisible\(layout, readerScrollRef\.current\?\.scrollViewport\(\) \?\? null\)\s*\) \{\s*readerResumeFinishedKeyRef\.current = readerResumeKey;/,
    );
    // Never cleared within the session: the unmount save keeps it.
    expect(screen.match(/readerResumeFinishedKeyRef\.current = /g)?.length).toBe(1);
  });

  test("a complete save marks the local spot finished", () => {
    expect(screen).toContain(
      "if (complete) markMobileReaderResumeFinished(chapterProgress.id);",
    );
  });

  test("a completed chapter without a re-read spot drops the saved in-page spot", () => {
    expect(screen).toContain(
      "!(readerOpenedCompleted && readerResumeChoice == null)",
    );
  });
});

describe("re-reading a completed chapter of short slices to its end (ToG)", () => {
  // 40 slices of 300pt, the screen 900pt: at the end the reading line rests
  // on slice 37, the last one (39) is on screen.
  const layout = buildMobileReaderScrollLayout(new Array(40).fill(300), new Array(40).fill(0), 0);
  const endTop = layout.length - 900;
  const completedProgress = { progress: 39, total: 40, lastReadAt: 5_000, completed: true };

  test("the last page visible counts as finished, though the reading line is short of it", () => {
    expect(mobileReaderScrollAnchorForOffset(layout, endTop)?.pageIndex).toBe(37);
    expect(isMobileReaderLastPageVisible(layout, { top: endTop, height: 900 })).toBe(true);
    // The bottom exactly at the last page's top counts; a pixel short does not.
    expect(isMobileReaderLastPageVisible(layout, { top: layout.starts[39]! - 900, height: 900 })).toBe(true);
    expect(isMobileReaderLastPageVisible(layout, { top: layout.starts[39]! - 901, height: 900 })).toBe(false);
    expect(isMobileReaderLastPageVisible(layout, null)).toBe(false);
  });

  test("a finished save reopens at p1; the old re-read save reopened on the last screen", () => {
    const spot = { sourceIndex: 37, fraction: 0, total: 40, savedAt: 10_000, progressAt: 5_000 };
    // Before: saved as a re-read spot short of the last page.
    expect(
      chooseMobileReaderResumePosition({
        local: { ...spot, reread: mobileReaderResumeReread(true, false) },
        progress: completedProgress,
        pageCount: 40,
      }),
    ).toEqual({ sourceIndex: 37, fraction: 0, origin: "local" });
    // Now: the session saw the last page — finished, the top of p1.
    expect(mobileReaderResumeReread(true, true)).toBe(false);
    expect(
      chooseMobileReaderResumePosition({
        local: { ...spot, reread: mobileReaderResumeReread(true, true) },
        progress: completedProgress,
        pageCount: 40,
      }),
    ).toBeNull();
    // A later save (scrolled back up, the unmount) keeps the latch.
    expect(
      chooseMobileReaderResumePosition({
        local: { ...spot, sourceIndex: 20, reread: mobileReaderResumeReread(true, true) },
        progress: completedProgress,
        pageCount: 40,
      }),
    ).toBeNull();
    // A first read is never a re-read.
    expect(mobileReaderResumeReread(false, false)).toBe(false);
  });
});

describe("resolveMobileChapterOpeningPage (rows, cards and resume agree)", () => {
  const progress = { progress: 109, total: 149, lastReadAt: 9_000 };
  const cases: Array<{
    name: string;
    local: MobileReaderResumePosition | null;
    progress: { progress: number; total: number; lastReadAt: number; completed?: boolean };
    expected: { sourceIndex: number; origin: "local" | "progress" } | null;
  }> = [
    {
      name: "local spot present",
      local: local({ sourceIndex: 40, total: 149 }),
      progress,
      expected: { sourceIndex: 40, origin: "local" },
    },
    { name: "local absent: high-water", local: null, progress, expected: { sourceIndex: 109, origin: "progress" } },
    {
      name: "completed with a re-read spot",
      local: local({ sourceIndex: 20, total: 149, reread: true }),
      progress: { ...progress, progress: 148, completed: true },
      expected: { sourceIndex: 20, origin: "local" },
    },
    {
      name: "completed without a re-read spot",
      local: local({ sourceIndex: 20, total: 149 }),
      progress: { ...progress, progress: 148, completed: true },
      expected: null,
    },
  ];
  for (const { name, local: spot, progress: synced, expected } of cases) {
    test(name, () => {
      const opening = resolveMobileChapterOpeningPage({ local: spot, progress: synced });
      expect(opening ? { sourceIndex: opening.sourceIndex, origin: opening.origin } : null).toEqual(expected);
      if (opening) expect(opening.total).toBe(149);
      // The reader's resume, given the same records and the page count.
      const resume = chooseMobileReaderResumePosition({ local: spot, progress: synced, pageCount: 149 });
      expect(resume ? { sourceIndex: resume.sourceIndex, origin: resume.origin } : null).toEqual(expected);
    });
  }

  test("no synced record: out of the local spot's own page count", () => {
    expect(resolveMobileChapterOpeningPage({ local: local(), progress: null })).toEqual({
      sourceIndex: 3,
      shownSourceIndex: 3,
      total: 20,
      origin: "local",
    });
  });
});

describe("resume position store subscription", () => {
  afterEach(() => resetMobileReaderResumePositionsForTests());

  test("peek follows saves and tells subscribers", async () => {
    let calls = 0;
    const unsubscribe = subscribeMobileReaderResumePositions(() => {
      calls += 1;
    });
    await loadMobileReaderResumePosition("k");
    expect(peekMobileReaderResumePosition("k")).toBeNull();
    const before = calls;
    saveMobileReaderResumePosition("k", { sourceIndex: 2, fraction: 0, total: 9, savedAt: 1 });
    expect(calls).toBe(before + 1);
    const first = peekMobileReaderResumePosition("k");
    expect(first?.sourceIndex).toBe(2);
    // Unchanged entries keep their identity (a stable snapshot).
    expect(peekMobileReaderResumePosition("k")).toBe(first);
    unsubscribe();
    saveMobileReaderResumePosition("k", { sourceIndex: 3, fraction: 0, total: 9, savedAt: 2 });
    expect(calls).toBe(before + 1);
    expect(peekMobileReaderResumePosition("k")?.sourceIndex).toBe(3);
  });
});

describe("the page a row names is the reader counter's (the restore keeps the anchor)", () => {
  afterEach(() => resetMobileReaderResumePositionsForTests());
  const synced = { progress: 109, total: 149, lastReadAt: 9_000 };

  test("anchor p40, counter p41: the row names p41, the restore seeks to p40", () => {
    // ToG Ch.632 on the Duo: the p40/p41 boundary near mid-screen.
    const spot = local({ sourceIndex: 39, fraction: 0.62, total: 149, counterSourceIndex: 40 });
    expect(resolveMobileChapterOpeningPage({ local: spot, progress: synced })).toEqual({
      sourceIndex: 39,
      shownSourceIndex: 40,
      total: 149,
      origin: "local",
    });
    expect(chooseMobileReaderResumePosition({ local: spot, progress: synced, pageCount: 149 })).toEqual({
      sourceIndex: 39,
      fraction: 0.62,
      origin: "local",
    });
  });

  test("a spot saved before the counter page was recorded: the anchor page", () => {
    const legacy = parseMobileReaderResumePositions(
      JSON.stringify({
        version: 1,
        entries: [["k", { sourceIndex: 39, fraction: 0.62, total: 149, savedAt: 10_000 }]],
      }),
    ).get("k")!;
    expect(legacy.counterSourceIndex).toBeUndefined();
    expect(resolveMobileChapterOpeningPage({ local: legacy, progress: synced })?.shownSourceIndex).toBe(39);
  });

  test("a re-read spot names its counter page; the completed rules read the anchor", () => {
    const completed = { ...synced, progress: 148, completed: true };
    expect(
      resolveMobileChapterOpeningPage({
        local: local({ sourceIndex: 19, total: 149, reread: true, counterSourceIndex: 20 }),
        progress: completed,
      }),
    ).toEqual({ sourceIndex: 19, shownSourceIndex: 20, total: 149, origin: "local" });
    // Not a re-read spot, or one on the last page: page 1, whatever the counter.
    expect(
      resolveMobileChapterOpeningPage({
        local: local({ sourceIndex: 19, total: 149, counterSourceIndex: 20 }),
        progress: completed,
      }),
    ).toBeNull();
    expect(
      resolveMobileChapterOpeningPage({
        local: local({ sourceIndex: 148, total: 149, reread: true, counterSourceIndex: 148 }),
        progress: completed,
      }),
    ).toBeNull();
  });

  test("the synced high-water page is not overridden by a stale local counter page", () => {
    const spot = local({ sourceIndex: 39, total: 149, savedAt: 1_000, counterSourceIndex: 40 });
    expect(
      resolveMobileChapterOpeningPage({ local: spot, progress: { ...synced, lastReadAt: 60_000 } }),
    ).toEqual({ sourceIndex: 109, shownSourceIndex: 109, total: 149, origin: "progress" });
  });

  test("the store keeps the counter page, round-trips it and saves when only it changes", async () => {
    await loadMobileReaderResumePosition("k");
    saveMobileReaderResumePosition("k", { sourceIndex: 39, fraction: 0.6, total: 149, savedAt: 1, counterSourceIndex: 39 });
    saveMobileReaderResumePosition("k", { sourceIndex: 39, fraction: 0.6, total: 149, savedAt: 2, counterSourceIndex: 40 });
    const saved = peekMobileReaderResumePosition("k");
    expect(saved?.counterSourceIndex).toBe(40);
    expect(saved?.sourceIndex).toBe(39);
    const back = parseMobileReaderResumePositions(serializeMobileReaderResumePositions(new Map([["k", saved!]])));
    expect(back.get("k")?.counterSourceIndex).toBe(40);
    // Out of range: dropped (the anchor page is shown).
    expect(
      parseMobileReaderResumePositions(
        JSON.stringify({ entries: [["k", { sourceIndex: 1, total: 5, savedAt: 1, counterSourceIndex: 9 }]] }),
      ).get("k")?.counterSourceIndex,
    ).toBeUndefined();
  });
});

describe("ReaderScreen wiring: the save records the counter's page", () => {
  const screen = readFileSync(path.join(import.meta.dir, "..", "screens/ReaderScreen.tsx"), "utf8");
  const save = screen.slice(screen.indexOf("const saveReaderLocalResume = useCallback("));
  const body = save.slice(0, save.indexOf("useEffect(() => {"));

  test("the counter page is the live (centre) page over the committed one, as the counter renders it", () => {
    expect(body).toContain(
      "mobileReaderLivePageIndex(readerLivePageStore.get(), clampedPageIndex)",
    );
    expect(body).toMatch(/!galleryPagedMode && !isTwoPageMode\s*\?\s*mobileReaderLivePageIndex/);
    // The counter renders the same store over the same committed page.
    expect(screen).toMatch(/liveStore=\{readerChromeLivePageStore\}\s*committedIndex=\{clampedPageIndex\}/);
  });

  test("the save passes it beside the unchanged anchor", () => {
    expect(body).toMatch(
      /saveMobileReaderResumePosition\(readerResumeKey, \{\s*sourceIndex: readerSourceIndexForDisplayIndex\(\s*clampReaderPageIndex\(displayIndex, pageCount\)/,
    );
    expect(body).toMatch(
      /counterSourceIndex: readerSourceIndexForDisplayIndex\(\s*clampReaderPageIndex\(counterDisplayIndex, pageCount\)/,
    );
  });
});
