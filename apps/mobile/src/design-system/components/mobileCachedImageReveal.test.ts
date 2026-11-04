import { describe, expect, test } from "bun:test";
import { mobileCachedImageShowsAtOnce } from "./mobileCachedImageReveal";

describe("mobileCachedImageShowsAtOnce", () => {
  test("a cover already on disk paints from its first frame (no blank frame before decode)", () => {
    expect(
      mobileCachedImageShowsAtOnce({ skipFade: false, shownAtMount: false, revealedFromCacheAtRender: true }),
    ).toBe(true);
  });

  test("a source shown before this session paints at once", () => {
    expect(
      mobileCachedImageShowsAtOnce({ skipFade: false, shownAtMount: true, revealedFromCacheAtRender: false }),
    ).toBe(true);
  });

  test("a cover that waits on the network fades in", () => {
    expect(
      mobileCachedImageShowsAtOnce({ skipFade: false, shownAtMount: false, revealedFromCacheAtRender: false }),
    ).toBe(false);
  });

  test("a skipped fade leaves opacity to the fade value (already 1)", () => {
    expect(
      mobileCachedImageShowsAtOnce({ skipFade: true, shownAtMount: true, revealedFromCacheAtRender: true }),
    ).toBe(false);
  });
});
