import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("reader transitions", () => {
  const route = read("app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx");
  const layout = read("app/sources/_layout.tsx");
  const reader = read("src/screens/ReaderScreen.tsx");

  test("every fade of the opening runs under Reduce Motion (its durations already answer it)", () => {
    const timings = route.match(/withTiming\([^,]+, \{[^}]*\}/g) ?? [];
    expect(timings.length).toBeGreaterThan(0);
    for (const timing of timings) expect(timing).toContain("reduceMotion: ReduceMotion.Never");
  });

  test("the screen under the zoom holds still while the reader opts out of the vertical bar", () => {
    expect(route).toContain("freezePresenter={readerVerticalBar.optOut}");
  });

  test("a chapter switch enters from the side it reads on", () => {
    expect(reader).toContain('targetChapter.id === leftChapter?.id ? "left" : undefined');
    expect(layout).toContain('route.params?.enterFrom === "left" ? "pop" : "push"');
  });

  test("the end-of-chapter prompt dissolves in and out", () => {
    const overlay = read("src/components/reader/MobileReaderEndOfChapterOverlay.tsx");
    expect(overlay).toContain("entering={FadeIn");
    expect(overlay).toContain("exiting={FadeOut");
  });

  test("settings rows only grey for a slow write", () => {
    const popover = read("src/components/reader/ReaderSettingsNativePopover.ios.tsx");
    expect(popover).toContain("useReaderSettingsBusyShown(busy) ? [swiftDisabled(true)] : []");
  });
});
