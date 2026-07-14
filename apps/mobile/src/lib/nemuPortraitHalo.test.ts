import { describe, expect, test } from "bun:test";
import {
  getNemuPortraitHaloRenderMode,
  shouldAnimateNemuPortraitHalo,
} from "./nemuPortraitHalo";

describe("Nemu portrait halo motion", () => {
  test("animates only while focused, active, and motion is allowed", () => {
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        reduceMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        reduceMotion: true,
      }),
    ).toBe(false);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: false,
        focused: true,
        reduceMotion: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: false,
        reduceMotion: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateNemuPortraitHalo({
        appActive: true,
        focused: true,
        platform: "android",
        reduceMotion: false,
      }),
    ).toBe(false);
  });

  test("keeps Android off blurred offscreen image surfaces", () => {
    expect(getNemuPortraitHaloRenderMode("android")).toBe("raster-glow");
    expect(getNemuPortraitHaloRenderMode("ios")).toBe("blurred-images");
  });
});
