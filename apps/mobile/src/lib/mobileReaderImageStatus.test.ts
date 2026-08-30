import { describe, expect, test } from "bun:test";
import { isMobileReaderImageLoading } from "./mobileReaderImageStatus";

describe("mobile reader image status", () => {
  test("shows loading until the first terminal image event", () => {
    expect(
      isMobileReaderImageLoading({
        hasNaturalSize: false,
      }),
    ).toBe(true);
  });

  test("keeps a successfully loaded cached page settled across a gallery remount", () => {
    expect(
      isMobileReaderImageLoading({
        hasNaturalSize: true,
      }),
    ).toBe(false);
  });

  test("shows the image error instead of a competing loading overlay", () => {
    expect(
      isMobileReaderImageLoading({
        error: "Image request failed",
        hasNaturalSize: false,
      }),
    ).toBe(false);
  });
});
