import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_MAX_ZOOM_SCALE,
  MOBILE_READER_MIN_ZOOM_SCALE,
  clampMobileReaderZoomOffset,
  clampMobileReaderZoomScale,
  mobileReaderZoomOffsetBound,
  mobileReaderStripOffsetBound,
  clampMobileReaderStripOffset,
  shouldResetMobileReaderZoom,
} from "./mobileReaderZoom";

describe("mobile reader zoom helpers", () => {
  test("clamps zoom scale to the native reader range", () => {
    expect(clampMobileReaderZoomScale(0.4)).toBe(MOBILE_READER_MIN_ZOOM_SCALE);
    expect(clampMobileReaderZoomScale(2.5)).toBe(2.5);
    expect(clampMobileReaderZoomScale(8)).toBe(MOBILE_READER_MAX_ZOOM_SCALE);
    expect(clampMobileReaderZoomScale(Number.NaN)).toBe(
      MOBILE_READER_MIN_ZOOM_SCALE,
    );
  });

  test("resets tiny zoom drift back to the fitted page", () => {
    expect(shouldResetMobileReaderZoom(1)).toBe(true);
    expect(shouldResetMobileReaderZoom(1.019)).toBe(true);
    expect(shouldResetMobileReaderZoom(1.03)).toBe(false);
    expect(shouldResetMobileReaderZoom(Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("derives and applies pan bounds from frame size and scale", () => {
    expect(mobileReaderZoomOffsetBound(400, 1)).toBe(0);
    expect(mobileReaderZoomOffsetBound(400, 2)).toBe(200);
    expect(clampMobileReaderZoomOffset(260, 400, 2)).toBe(200);
    expect(clampMobileReaderZoomOffset(-260, 400, 2)).toBe(-200);
    expect(clampMobileReaderZoomOffset(80, 400, 2)).toBe(80);
    expect(clampMobileReaderZoomOffset(80, 0, 2)).toBe(0);
  });

  test("bounds strip pan by the scaled content, not just the viewport", () => {
    // Scale 1 never pans.
    expect(mobileReaderStripOffsetBound(400, 4000, 1)).toBe(0);
    // Unknown content falls back to viewport overflow.
    expect(mobileReaderStripOffsetBound(400, 0, 2)).toBe(200);
    // Content longer than the viewport scales the overflow accordingly.
    expect(mobileReaderStripOffsetBound(400, 4000, 2)).toBe(3800);
    expect(clampMobileReaderStripOffset(9999, 400, 4000, 2)).toBe(3800);
    expect(clampMobileReaderStripOffset(-9999, 400, 4000, 2)).toBe(-3800);
    expect(clampMobileReaderStripOffset(120, 400, 4000, 2)).toBe(120);
    expect(clampMobileReaderStripOffset(Number.NaN, 400, 4000, 2)).toBe(0);
  });
});
