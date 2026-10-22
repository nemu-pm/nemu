import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  markMobileAidokuPrewarmStarted,
  MOBILE_AIDOKU_PREWARM_FIRST_PAINT_DELAY_MS,
  MOBILE_AIDOKU_PREWARM_IDLE_MS,
  NEMU_AIDOKU_PREWARM_ENABLED,
  noteMobileLibraryFocused,
  noteMobileReaderOpened,
  noteMobileTouches,
  noteMobileUserActivity,
  readMobileAidokuPrewarmNotes,
  resetMobileAidokuPrewarmNotesForTests,
  resolveMobileAidokuPrewarmStep,
  subscribeMobileUserActivity,
  type MobileAidokuPrewarmInput,
} from "./mobileAidokuPrewarm";

const idleOnLibrary: MobileAidokuPrewarmInput = {
  enabled: true,
  platform: "ios",
  nativeAvailable: true,
  started: false,
  readerOpened: false,
  appActive: true,
  libraryFocused: true,
  firstPaintAt: 10_000,
  lastActivityAt: null,
  touching: false,
  now: 20_000,
};

afterEach(() => resetMobileAidokuPrewarmNotesForTests());

describe("Aidoku sandbox pre-warm policy", () => {
  test("is off by default", () => {
    expect(NEMU_AIDOKU_PREWARM_ENABLED).toBe(false);
    expect(MOBILE_AIDOKU_PREWARM_IDLE_MS).toBe(1500);
  });

  test("never runs with the flag off, off iOS, without native support, twice, or after a reader opened", () => {
    expect(resolveMobileAidokuPrewarmStep(idleOnLibrary)).toEqual({ kind: "start" });
    for (const change of [
      { enabled: false },
      { platform: "android" },
      { nativeAvailable: false },
      { started: true },
      { readerOpened: true },
    ]) {
      expect(resolveMobileAidokuPrewarmStep({ ...idleOnLibrary, ...change })).toEqual({
        kind: "never",
      });
    }
  });

  test("waits while the app is in the background, off the Library, unpainted or under a finger", () => {
    for (const change of [
      { appActive: false },
      { libraryFocused: false },
      { firstPaintAt: null },
      { touching: true },
    ]) {
      expect(resolveMobileAidokuPrewarmStep({ ...idleOnLibrary, ...change })).toEqual({
        kind: "blocked",
      });
    }
  });

  test("starts only 1.5 s after the last touch or scroll event, and 1 s after the first paint", () => {
    // A scroll (or momentum) event 400 ms ago: 1.1 s to go.
    expect(
      resolveMobileAidokuPrewarmStep({ ...idleOnLibrary, lastActivityAt: 19_600 }),
    ).toEqual({ kind: "wait", ms: 1100 });
    expect(
      resolveMobileAidokuPrewarmStep({ ...idleOnLibrary, lastActivityAt: 18_500 }),
    ).toEqual({ kind: "start" });
    // Painted 300 ms ago, no activity yet.
    expect(
      resolveMobileAidokuPrewarmStep({ ...idleOnLibrary, firstPaintAt: 19_700 }),
    ).toEqual({ kind: "wait", ms: MOBILE_AIDOKU_PREWARM_FIRST_PAINT_DELAY_MS - 300 });
  });

  test("the process notes: touches, scroll activity, a reader opening, the start", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeMobileUserActivity(() => seen.push(1));
    noteMobileTouches(1, 100);
    expect(readMobileAidokuPrewarmNotes()).toMatchObject({ lastActivityAt: 100, touching: true });
    noteMobileTouches(0, 250);
    expect(readMobileAidokuPrewarmNotes()).toMatchObject({ lastActivityAt: 250, touching: false });
    noteMobileUserActivity(400);
    expect(readMobileAidokuPrewarmNotes().lastActivityAt).toBe(400);
    noteMobileLibraryFocused(true);
    noteMobileLibraryFocused(true);
    expect(readMobileAidokuPrewarmNotes().libraryFocused).toBe(true);
    noteMobileReaderOpened();
    markMobileAidokuPrewarmStarted();
    expect(readMobileAidokuPrewarmNotes()).toMatchObject({ readerOpened: true, started: true });
    unsubscribe();
    noteMobileUserActivity(500);
    // The repeated focus note is not a change.
    expect(seen.length).toBe(5);
  });
});

describe("Aidoku sandbox pre-warm wiring", () => {
  const mobileRoot = path.resolve(import.meta.dir, "../..");
  const read = (relative: string) => readFileSync(path.join(mobileRoot, relative), "utf8");
  const manager = read("modules/nemu-aidoku/ios/NemuAidokuIOSandboxManager.swift");
  const nativeModule = read("modules/nemu-aidoku/ios/NemuAidokuModule.swift");
  const moduleTypes = read("modules/nemu-aidoku/src/NemuAidokuModule.ts");
  const hook = read("src/lib/useMobileAidokuSandboxPrewarm.ts");
  const library = read("src/screens/LibraryScreen.tsx");
  const rootLayout = read("app/_layout.tsx");
  const readerRoute = read("app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx");

  test("native boots the runtime on the executor, only from the main loop's default mode", () => {
    expect(nativeModule).toContain('AsyncFunction("prewarmAidokuSandbox") { (promise: Promise) in');
    expect(nativeModule).toContain("self.iosSandboxManager.prewarm { result in");
    const prewarm = manager.slice(manager.indexOf("  func prewarm("), manager.indexOf("  func close() {"));
    expect(prewarm).toContain("submit(completion: completion) {");
    expect(prewarm).toContain("Self.waitForMainRunLoopDefaultMode(timeoutSeconds: mainIdleTimeoutSeconds)");
    expect(prewarm).toContain("_ = try self.ensureRuntime()");
    // Registers no session.
    expect(prewarm).not.toContain("ensureSessionRegistered");
    expect(prewarm).toContain('"[aidoku-warm] prewarm start at=%.0f"');
    expect(prewarm).toContain('"[aidoku-warm] prewarm end at=%.0f ms=%.0f ok=%ld %@"');
    expect(manager).toContain("CFRunLoopPerformBlock(mainLoop, CFRunLoopMode.defaultMode.rawValue) {");
    expect(moduleTypes).toContain("prewarmAidokuSandbox?(): Promise<string>;");
  });

  test("JS asks only when the flag is on, on iOS, and swallows a failure", () => {
    expect(hook).toContain('const prewarmActive = NEMU_AIDOKU_PREWARM_ENABLED && Platform.OS === "ios";');
    expect(hook).toContain("if (!prewarmActive) return undefined;");
    expect(hook).toContain('console.info("[aidoku-warm] prewarm skipped", {');
    expect(hook).toContain("  : {};");
  });

  test("the Library, the root view and the reader route feed it", () => {
    expect(library).toContain("useMobileAidokuSandboxPrewarm();");
    expect(library).toContain("noteMobileLibraryFocused(true);");
    expect(library).toContain("noteMobileLibraryFocused(false);");
    expect(library).toContain(
      "const libraryGridOnScroll = useMobileAidokuPrewarmScrollFeed(gridScrollAnchor.onScroll);",
    );
    expect(library).toContain("onScroll={libraryGridOnScroll}");
    expect(rootLayout).toContain("{...mobileAidokuPrewarmRootTouchProps}");
    expect(readerRoute).toContain("useEffect(() => noteMobileReaderOpened(), []);");
  });
});
