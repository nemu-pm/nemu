import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_MAX_ZOOM_SCALE,
  MOBILE_READER_MIN_ZOOM_SCALE,
  clampMobileReaderZoomOffset,
  clampMobileReaderZoomScale,
  mobileReaderZoomOffsetBound,
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
});
