import { afterEach, describe, expect, test } from "bun:test";
import {
  getMobileReadingModeForSourceViewer,
  getMobileReadingModeSetting,
  parseMobileReaderTitleReadingModes,
  peekMobileReaderTitleReadingMode,
  preloadMobileReaderTitleReadingModes,
  resetMobileReaderTitleReadingModesForTests,
  resolveMobileReaderReadingMode,
  serializeMobileReaderTitleReadingModes,
  setMobileReaderTitleReadingMode,
  subscribeMobileReaderTitleReadingModes,
} from "./mobileReaderTitleReadingMode";

describe("a title's reading mode", () => {
  afterEach(() => resetMobileReaderTitleReadingModesForTests());

  test("the source's viewer maps by the aidoku-rs enum", () => {
    expect(getMobileReadingModeForSourceViewer(1)).toBe("ltr");
    expect(getMobileReadingModeForSourceViewer(2)).toBe("rtl");
    expect(getMobileReadingModeForSourceViewer(3)).toBe("scrolling");
    expect(getMobileReadingModeForSourceViewer(4)).toBe("scrolling");
    expect(getMobileReadingModeForSourceViewer(0)).toBeNull();
    expect(getMobileReadingModeForSourceViewer(null)).toBeNull();
    expect(getMobileReadingModeForSourceViewer(undefined)).toBeNull();
  });

  test("the title's pick, then an explicit setting, then under Automatic the source's viewer, then RTL", () => {
    const resolve = resolveMobileReaderReadingMode;
    // A title's own pick beats both the setting and the source.
    expect(resolve({ titleMode: "scrolling", viewer: 1, globalMode: "auto" })).toBe("scrolling");
    expect(resolve({ titleMode: "ltr", viewer: 2, globalMode: "scrolling" })).toBe("ltr");
    // An explicit setting beats the source, as in Aidoku iOS.
    expect(resolve({ titleMode: null, viewer: 1, globalMode: "rtl" })).toBe("rtl");
    expect(resolve({ titleMode: null, viewer: 1, globalMode: "scrolling" })).toBe("scrolling");
    expect(resolve({ titleMode: null, viewer: 2, globalMode: "ltr" })).toBe("ltr");
    // Automatic follows the source.
    expect(resolve({ titleMode: null, viewer: 1, globalMode: "auto" })).toBe("ltr");
    expect(resolve({ titleMode: null, viewer: 2, globalMode: "auto" })).toBe("rtl");
    expect(resolve({ titleMode: null, viewer: 4, globalMode: "auto" })).toBe("scrolling");
    // A source that declares nothing, or one not heard from yet: right to left.
    expect(resolve({ titleMode: null, viewer: 0, globalMode: "auto" })).toBe("rtl");
    expect(resolve({ titleMode: null, viewer: null, globalMode: "auto" })).toBe("rtl");
  });

  test("the setting is Automatic unless a direction was chosen against the old default", () => {
    // New installs and installs that never touched it.
    expect(getMobileReadingModeSetting({})).toBe("auto");
    // The old default, stored by a pick: migrated.
    expect(getMobileReadingModeSetting({ readingMode: "rtl" })).toBe("auto");
    // Chosen against the old default: kept.
    expect(getMobileReadingModeSetting({ readingMode: "ltr" })).toBe("ltr");
    expect(getMobileReadingModeSetting({ readingMode: "scrolling" })).toBe("scrolling");
    // Saved since Automatic arrived: wins, an explicit RTL included.
    expect(getMobileReadingModeSetting({ readingMode: "ltr", readerReadingMode: "rtl" })).toBe("rtl");
    expect(getMobileReadingModeSetting({ readingMode: "ltr", readerReadingMode: "auto" })).toBe("auto");
    expect(getMobileReadingModeSetting({ readerReadingMode: "up" as never })).toBe("auto");
  });

  test("a pick stays with its title and can be cleared", () => {
    let changes = 0;
    subscribeMobileReaderTitleReadingModes(() => {
      changes += 1;
    });
    setMobileReaderTitleReadingMode("a", "scrolling");
    expect(peekMobileReaderTitleReadingMode("a")).toBe("scrolling");
    expect(peekMobileReaderTitleReadingMode("b")).toBeNull();
    setMobileReaderTitleReadingMode("a", null);
    expect(peekMobileReaderTitleReadingMode("a")).toBeNull();
    expect(changes).toBeGreaterThanOrEqual(2);
  });

  test("a pick made before the file was read survives the read", async () => {
    setMobileReaderTitleReadingMode("a", "ltr");
    preloadMobileReaderTitleReadingModes();
    await Bun.sleep(0);
    expect(peekMobileReaderTitleReadingMode("a")).toBe("ltr");
  });

  test("round-trips, drops malformed entries and keeps the newest past the limit", () => {
    const map = new Map([
      ["a", "ltr" as const],
      ["b", "scrolling" as const],
    ]);
    expect(parseMobileReaderTitleReadingModes(serializeMobileReaderTitleReadingModes(map))).toEqual(map);
    expect([...parseMobileReaderTitleReadingModes(serializeMobileReaderTitleReadingModes(map, 1)).keys()]).toEqual(["b"]);
    expect(parseMobileReaderTitleReadingModes(JSON.stringify({ entries: [["x", "up"], [1, "ltr"]] })).size).toBe(0);
    expect(parseMobileReaderTitleReadingModes("{").size).toBe(0);
  });
});
