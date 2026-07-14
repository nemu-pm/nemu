import { describe, expect, test } from "bun:test";
import {
  computeContainImageRect,
  computeMobileOcrCropRect,
  computeMobileOcrDetectionRect,
} from "./mobileJapaneseLearningOverlay";

describe("mobile Japanese Learning overlay geometry", () => {
  test("fits wide images inside a taller reader frame", () => {
    expect(
      computeContainImageRect(
        { width: 300, height: 450 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({
      left: 0,
      top: 125,
      width: 300,
      height: 200,
    });
  });

  test("fits tall images inside the reader frame", () => {
    expect(
      computeContainImageRect(
        { width: 300, height: 450 },
        { width: 800, height: 1600 },
      ),
    ).toEqual({
      left: 37.5,
      top: 0,
      width: 225,
      height: 450,
    });
  });

  test("maps source OCR coordinates into the contain-fitted image rect", () => {
    expect(
      computeMobileOcrDetectionRect(
        { x1: 100, y1: 200, x2: 300, y2: 600 },
        { width: 300, height: 450 },
        { width: 800, height: 1600 },
      ),
    ).toEqual({
      left: 65.625,
      top: 56.25,
      width: 56.25,
      height: 112.5,
    });
  });

  test("clips detection boxes to the source image bounds", () => {
    expect(
      computeMobileOcrDetectionRect(
        { x1: -10, y1: -20, x2: 100, y2: 120 },
        { width: 300, height: 450 },
        { width: 300, height: 450 },
      ),
    ).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 120,
    });
  });

  test("builds padded source crop rectangles for selected OCR text", () => {
    expect(
      computeMobileOcrCropRect(
        { x1: 40, y1: 60, x2: 180, y2: 100 },
        { width: 300, height: 220 },
        10,
      ),
    ).toEqual({
      x: 30,
      y: 50,
      width: 160,
      height: 60,
    });
  });

  test("clips OCR crop previews at the image edge", () => {
    expect(
      computeMobileOcrCropRect(
        { x1: -20, y1: 5, x2: 80, y2: 35 },
        { width: 120, height: 90 },
        12,
      ),
    ).toEqual({
      x: 0,
      y: 0,
      width: 104,
      height: 54,
    });
  });

  test("returns null for invalid OCR crop boxes", () => {
    expect(
      computeMobileOcrCropRect(
        { x1: 40, y1: 40, x2: 40, y2: 80 },
        { width: 120, height: 90 },
      ),
    ).toBeNull();
  });
});
