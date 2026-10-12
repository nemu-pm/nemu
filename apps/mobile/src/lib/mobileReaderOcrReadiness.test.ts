import { describe, expect, test } from "bun:test";
import { mobileReaderOcrPageReadiness } from "./mobileReaderOcrReadiness";

const loadedImagePage = {
  pagesStatus: "ready",
  hasPage: true,
  hasText: false,
  hasImage: true,
  imageLoaded: true,
  imageFailed: false,
  segmentedUnsupported: false,
} as const;

describe("reader OCR page readiness", () => {
  test("a page still loading waits instead of failing", () => {
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, pagesStatus: "loading", hasPage: false })).toBe(
      "waiting",
    );
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, imageLoaded: false })).toBe("waiting");
  });

  test("a loaded image or a text page is ready", () => {
    expect(mobileReaderOcrPageReadiness(loadedImagePage)).toBe("ready");
    expect(
      mobileReaderOcrPageReadiness({ ...loadedImagePage, hasText: true, hasImage: false, imageLoaded: false }),
    ).toBe("ready");
  });

  test("pages that can never be scanned are unavailable", () => {
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, imageLoaded: false, imageFailed: true })).toBe(
      "unavailable",
    );
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, pagesStatus: "error" })).toBe("unavailable");
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, hasPage: false })).toBe("unavailable");
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, hasImage: false })).toBe("unavailable");
    expect(mobileReaderOcrPageReadiness({ ...loadedImagePage, segmentedUnsupported: true })).toBe("unavailable");
  });
});
