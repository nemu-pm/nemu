import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  mobileReaderProgressPersistenceKey,
  normalizeMobileReaderIntraPageState,
  persistMobileReaderCompletionBeforeNavigation,
} from "./mobileReaderProgressPersistence";

const CONTENT_IDENTITY = `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;

describe("mobile reader progress persistence", () => {
  test("keeps the target stable after timestamp-only saves", () => {
    const readerKey = "1700000000000:chapter:with:delimiters:ltr:12:single";

    expect(mobileReaderProgressPersistenceKey(readerKey, 4)).toBe(
      mobileReaderProgressPersistenceKey(readerKey, 4),
    );
    expect(mobileReaderProgressPersistenceKey(readerKey, 4)).not.toBe(
      mobileReaderProgressPersistenceKey(readerKey, 5),
    );
    expect(mobileReaderProgressPersistenceKey(readerKey, 4)).not.toBe(
      mobileReaderProgressPersistenceKey(`${readerKey}:reload`, 4),
    );
    expect(mobileReaderProgressPersistenceKey("a:1", 2)).not.toBe(
      mobileReaderProgressPersistenceKey("a", 12),
    );
  });

  test("keeps callback identity out of the Reader debounce trigger", () => {
    const screen = readFileSync(
      path.join(import.meta.dir, "../screens/ReaderScreen.tsx"),
      "utf8",
    );
    const debounceStart = screen.indexOf(
      "if (!silentProgressPersistenceKey) return;",
    );
    const debounceEnd = screen.indexOf(
      "\n\n  useEffect(() => {",
      debounceStart + 1,
    );

    expect(debounceStart).toBeGreaterThan(-1);
    expect(debounceEnd).toBeGreaterThan(debounceStart);
    expect(screen).toContain("const persistProgressRef = useRef<");
    expect(screen).toContain("persistProgressRef.current = persistProgress;");

    const debounce = screen.slice(debounceStart, debounceEnd);
    expect(debounce).toContain("persistProgressRef.current(");
    expect(debounce).toContain(
      "[silentProgressPersistenceKey, visibleProgressPageIndex]",
    );
    expect(debounce).not.toMatch(/\bpersistProgress\s*\(/);
  });

  test("accepts only a bounded progress and exact logical content digest", () => {
    expect(
      normalizeMobileReaderIntraPageState({
        intraPageProgress: 0.625,
        intraPageContentIdentity: CONTENT_IDENTITY,
      }),
    ).toEqual({
      intraPageProgress: 0.625,
      intraPageContentIdentity: CONTENT_IDENTITY,
    });
    expect(
      normalizeMobileReaderIntraPageState({
        intraPageProgress: Number.NaN,
        intraPageContentIdentity: CONTENT_IDENTITY,
      }),
    ).toBeNull();
    expect(
      normalizeMobileReaderIntraPageState({
        intraPageProgress: 1.01,
        intraPageContentIdentity: CONTENT_IDENTITY,
      }),
    ).toBeNull();
    expect(
      normalizeMobileReaderIntraPageState({
        intraPageProgress: 0.5,
        intraPageContentIdentity: CONTENT_IDENTITY.toUpperCase(),
      }),
    ).toBeNull();
    expect(
      normalizeMobileReaderIntraPageState({
        intraPageProgress: 0.5,
      }),
    ).toBeNull();
  });

  test("never navigates when completion persistence fails", async () => {
    const calls: string[] = [];
    const failure = new Error("disk unavailable");
    await expect(
      persistMobileReaderCompletionBeforeNavigation({
        persist: async () => {
          calls.push("persist");
          throw failure;
        },
        navigate: () => calls.push("navigate"),
        reportError: (error) =>
          calls.push(error === failure ? "reported" : "wrong-error"),
      }),
    ).resolves.toBe(false);
    expect(calls).toEqual(["persist", "reported"]);
  });

  test("navigates only after completion persistence resolves", async () => {
    const calls: string[] = [];
    await expect(
      persistMobileReaderCompletionBeforeNavigation({
        persist: async () => {
          calls.push("persist");
        },
        navigate: () => calls.push("navigate"),
        reportError: () => calls.push("reported"),
      }),
    ).resolves.toBe(true);
    expect(calls).toEqual(["persist", "navigate"]);
  });

  test("serializes Reader writes and flushes the captured long-strip pair on exit", () => {
    const screen = readFileSync(
      path.join(import.meta.dir, "../screens/ReaderScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain("progressPersistenceQueueRef.current");
    expect(screen).toContain("await priorPersistence.catch");
    expect(screen).toContain("progressPersistenceClockRef.current");
    expect(screen).toContain("progressPersistenceClockRef.current = updatedAt");
    expect(screen).toContain("savedChapterProgress ?? chapterProgress");
    expect(screen).toContain(
      "return () => flushPendingIntraPageProgress(false)",
    );
    expect(screen).toContain("persist: persistProgressRef.current");
    expect(screen).toContain("updateState,");
  });
});
