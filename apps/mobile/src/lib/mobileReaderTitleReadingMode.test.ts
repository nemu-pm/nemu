import { afterEach, describe, expect, test } from "bun:test";
import {
  getMobileReadingModeForSourceViewer,
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

  test("the user's pick, then the source's viewer, then the default", () => {
    const resolve = resolveMobileReaderReadingMode;
    expect(resolve({ titleMode: "scrolling", viewer: 1, globalMode: "rtl" })).toBe("scrolling");
    expect(resolve({ titleMode: null, viewer: 1, globalMode: "rtl" })).toBe("ltr");
    expect(resolve({ titleMode: null, viewer: 2, globalMode: "ltr" })).toBe("rtl");
    expect(resolve({ titleMode: null, viewer: 4, globalMode: "rtl" })).toBe("scrolling");
    // A source that declares nothing, or one not heard from yet.
    expect(resolve({ titleMode: null, viewer: 0, globalMode: "ltr" })).toBe("ltr");
    expect(resolve({ titleMode: null, viewer: null, globalMode: "scrolling" })).toBe("scrolling");
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
