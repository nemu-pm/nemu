import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createReaderOpeningGate,
  READER_OPENING_SETTLE_BACKSTOP_MS,
  shouldDeferReaderLiveRefresh,
  waitForReaderOpeningWindow,
} from "./readerOpeningGate";

function fakeTimers() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    timers: {
      setTimeout: (callback: () => void, ms: number) => {
        const id = next++;
        pending.set(id, { callback, ms });
        return id;
      },
      clearTimeout: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    fireAll: () => {
      for (const [id, { callback }] of [...pending]) {
        pending.delete(id);
        callback();
      }
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reader opening gate", () => {
  test("defers only a cache-painted open whose window is still open", () => {
    expect(shouldDeferReaderLiveRefresh({ paintedFromCache: true, openingSettled: false })).toBe(true);
    expect(shouldDeferReaderLiveRefresh({ paintedFromCache: true, openingSettled: true })).toBe(false);
    // No cache: nothing on screen until the source answers, so it asks at once.
    expect(shouldDeferReaderLiveRefresh({ paintedFromCache: false, openingSettled: false })).toBe(false);
    expect(shouldDeferReaderLiveRefresh({ paintedFromCache: false, openingSettled: true })).toBe(false);
  });

  test("releases its waiters on the fade's end, once, with the first reason", async () => {
    const reasons: string[] = [];
    const gate = createReaderOpeningGate({ onSettled: (reason) => reasons.push(reason) });
    let resolved: string | null = null;
    void gate.whenSettled().then((reason) => {
      resolved = reason;
    });
    await flush();
    expect(resolved).toBeNull();
    expect(gate.isSettled()).toBe(false);
    gate.settle("fade-end");
    gate.settle("backstop");
    gate.dispose();
    await flush();
    expect(resolved as string | null).toBe("fade-end");
    expect(reasons).toEqual(["fade-end"]);
    // Later callers do not wait.
    expect(await gate.whenSettled()).toBe("fade-end");
  });

  test("the backstop settles a lost fade completion, and is cleared by a real one", () => {
    const lost = fakeTimers();
    const gate = createReaderOpeningGate({ timers: lost.timers });
    gate.armBackstop();
    gate.armBackstop();
    expect(lost.pending.size).toBe(1);
    expect([...lost.pending.values()][0]?.ms).toBe(READER_OPENING_SETTLE_BACKSTOP_MS);
    lost.fireAll();
    expect(gate.isSettled()).toBe(true);

    const real = fakeTimers();
    const faded = createReaderOpeningGate({ timers: real.timers });
    faded.armBackstop();
    faded.settle("fade-end");
    expect(real.pending.size).toBe(0);
    // Armed after settling: nothing to guard.
    faded.armBackstop();
    expect(real.pending.size).toBe(0);
  });

  test("the backstop outlasts every cover fade the route can run", () => {
    // Paged reading holds the cover up to 5 s, then fades for 250 ms.
    expect(READER_OPENING_SETTLE_BACKSTOP_MS).toBeGreaterThan(5000 + 250);
  });

  test("waitForReaderOpeningWindow waits and logs only when it defers", async () => {
    const lines: string[] = [];
    const log = (message: string) => lines.push(message);
    const gate = createReaderOpeningGate();

    expect(
      await waitForReaderOpeningWindow(gate, { paintedFromCache: false, what: "page-list", log }),
    ).toBe(false);
    expect(lines).toEqual([]);

    let done = false;
    const waiting = waitForReaderOpeningWindow(gate, {
      paintedFromCache: true,
      what: "strip-neighbour",
      log,
    }).then((deferred) => {
      done = true;
      return deferred;
    });
    await flush();
    expect(done).toBe(false);
    expect(lines).toEqual(["[reader-open] live refresh deferred"]);
    gate.settle("fade-end");
    expect(await waiting).toBe(true);
    expect(lines).toEqual([
      "[reader-open] live refresh deferred",
      "[reader-open] live refresh resumed",
    ]);

    // After the window: at once, silent.
    expect(
      await waitForReaderOpeningWindow(gate, { paintedFromCache: true, what: "page-list", log }),
    ).toBe(false);
    expect(lines.length).toBe(2);
  });
});

describe("reader opening gate wiring", () => {
  const mobileRoot = path.resolve(import.meta.dir, "../../..");
  const reader = readFileSync(path.join(mobileRoot, "src/screens/ReaderScreen.tsx"), "utf8");
  const route = readFileSync(
    path.join(mobileRoot, "app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
    "utf8",
  );
  const entry = readFileSync(path.join(import.meta.dir, "readerZoomEntry.ts"), "utf8");

  test("the route closes the window on either fade path's end and arms the backstop at landing", () => {
    expect(route).toContain('openingGate.settle("fade-end")');
    // Both the UI-thread scroll cap and the reveal fade report their end.
    expect(route).toContain('if (finished) runOnJS(onFadeEnd)("scroll-cap", landedAt);');
    expect(route).toContain("if (finished) runOnJS(onFadeEnd)(reason, fadeLandedAt);");
    expect(route).toContain("openingGate.armBackstop();");
    // No cover fades in: closed from the first render.
    expect(route).toContain('if (!zoomCover || !zoomId) coverReveal.openingGate.settle("no-fade");');
    expect(route).toContain("() => ({ onFirstPage, openingGate })");
    // Outside a zoom the reader gets a settled gate.
    expect(entry).toContain('settledOpeningGate.settle("no-fade");');
  });

  test("the page-list effect defers only the live refresh of a cache-painted open", () => {
    const effectStart = reader.indexOf("const [persisted, persistedPageSizes] = await Promise.all([");
    const effect = reader.slice(effectStart, reader.indexOf("const cacheableChapters = resolveMobileReaderChapterIndex({", effectStart));
    const paint = effect.indexOf("restoredPersistedPageList = true;");
    const take = effect.indexOf("mobileReaderPagesPrefetchCache.take(");
    const wait = effect.indexOf("await waitForReaderOpeningWindow(readerOpeningGateRef.current, {");
    const refresh = effect.indexOf("refreshed = await refreshMobileReaderPages(");
    expect(paint).toBeGreaterThan(0);
    expect(take).toBeGreaterThan(paint);
    expect(wait).toBeGreaterThan(take);
    expect(refresh).toBeGreaterThan(wait);
    expect(effect).toContain("paintedFromCache: restoredPersistedPageList,");
    expect(effect).toContain('what: "page-list",');
    // A superseded run does not ask the source after waiting.
    expect(effect.slice(wait, refresh)).toContain(
      "if (readerPagesRequestRunRef.current !== requestRun) return;",
    );
    // A warm-up prefetch is taken as before, without waiting.
    expect(effect).toContain("let refreshed: MobileReaderPagesRefresh | null = prefetched");
  });

  test("the strip's neighbour loader takes the same gate before asking the source", () => {
    const loaderStart = reader.indexOf("readerStripLoadChapterRef.current = async (target) => {");
    const loader = reader.slice(loaderStart, reader.indexOf("return result;", loaderStart));
    const take = loader.indexOf("mobileReaderPagesPrefetchCache.take(pageListCacheKey)");
    const wait = loader.indexOf("await waitForReaderOpeningWindow(readerOpeningGateRef.current, {");
    const refresh = loader.indexOf("result = await refreshMobileReaderPages(");
    expect(take).toBeGreaterThan(0);
    expect(wait).toBeGreaterThan(take);
    expect(refresh).toBeGreaterThan(wait);
    expect(loader).toContain("paintedFromCache: readerOpenPaintedFromCacheRef.current,");
    expect(loader).toContain('what: "strip-neighbour",');
  });
});
