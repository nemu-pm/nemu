import { afterEach, describe, expect, test } from "bun:test";
import {
  chooseMobileReaderResumePosition,
  clearMobileReaderResumePositions,
  flushMobileReaderResumePositions,
  loadMobileReaderResumePosition,
  noteMobileReaderResumeProgressWrite,
  parseMobileReaderResumePositions,
  resetMobileReaderResumePositionsForTests,
  saveMobileReaderResumePosition,
  serializeMobileReaderResumePositions,
  type MobileReaderResumePosition,
} from "./mobileReaderResumePosition";

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
