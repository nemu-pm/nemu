import { describe, expect, test } from "bun:test";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import {
  MobileReaderImagePrefetcher,
  mobileReaderPrefetchImageForPage,
  planMobileReaderNextChapterPrefetch,
  planMobileReaderPagePrefetch,
  shouldPrefetchMobileReaderNextChapter,
  type MobileReaderPrefetchImage,
} from "./mobileReaderPagePrefetch";

function page(index: number, extra: Partial<MobileReaderPage> = {}) {
  return {
    id: `p${index}`,
    index,
    imageUri: `https://img.example.com/${index}.jpg`,
    imageUriOwnership: "source",
    headers: { Referer: "https://example.com/" },
    ...extra,
  } as MobileReaderPage;
}

const chapter = Array.from({ length: 12 }, (_, index) => page(index));
const uris = (images: MobileReaderPrefetchImage[]) =>
  images.map((image) => image.uri.replace("https://img.example.com/", ""));

describe("reader page prefetch plan", () => {
  test("warms the next pages first, then the previous one", () => {
    expect(
      uris(planMobileReaderPagePrefetch({ pages: chapter, currentIndex: 5 })),
    ).toEqual(["6.jpg", "7.jpg", "8.jpg", "9.jpg", "10.jpg", "4.jpg"]);
  });

  test("stays inside the chapter at either end", () => {
    expect(
      uris(planMobileReaderPagePrefetch({ pages: chapter, currentIndex: 0 })),
    ).toEqual(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]);
    expect(
      uris(planMobileReaderPagePrefetch({ pages: chapter, currentIndex: 11 })),
    ).toEqual(["10.jpg"]);
  });

  test("keeps the source request headers so cookies/Referer/UA still apply", () => {
    const [first] = planMobileReaderPagePrefetch({
      pages: chapter,
      currentIndex: 0,
    });
    expect(first?.headers).toEqual({ Referer: "https://example.com/" });
  });

  test("skips pages the reader would not fetch by that URL", () => {
    expect(
      mobileReaderPrefetchImageForPage(page(1, { imageProcessing: "pending" })),
    ).toBeNull();
    expect(
      mobileReaderPrefetchImageForPage(
        page(1, {
          imageUri: "file:///cache/processed.png",
          imageUriOwnership: "app",
        } as Partial<MobileReaderPage>),
      ),
    ).toBeNull();
    expect(
      mobileReaderPrefetchImageForPage(
        page(1, { imageUri: "ftp://example.com/1.jpg" }),
      ),
    ).toBeNull();
    expect(
      mobileReaderPrefetchImageForPage(
        page(1, { imageUri: undefined, imageUriOwnership: undefined }),
      ),
    ).toBeNull();
    // A processing fallback serves the raw source image.
    expect(
      mobileReaderPrefetchImageForPage(page(1, { imageProcessing: "fallback" })),
    ).not.toBeNull();
  });

  test("leaves single-page long strips to their segmented cache", () => {
    expect(
      planMobileReaderPagePrefetch({ pages: [page(0)], currentIndex: 0 }),
    ).toEqual([]);
    expect(planMobileReaderNextChapterPrefetch([page(0)])).toEqual([]);
  });

  test("warms the next chapter's opening pages only near the end", () => {
    expect(
      shouldPrefetchMobileReaderNextChapter({ pageCount: 12, currentIndex: 7 }),
    ).toBe(false);
    expect(
      shouldPrefetchMobileReaderNextChapter({ pageCount: 12, currentIndex: 8 }),
    ).toBe(true);
    expect(
      shouldPrefetchMobileReaderNextChapter({ pageCount: 0, currentIndex: 0 }),
    ).toBe(false);
    expect(uris(planMobileReaderNextChapterPrefetch(chapter))).toEqual([
      "0.jpg",
      "1.jpg",
    ]);
  });
});

describe("reader image prefetcher", () => {
  function deferredLoader() {
    const calls: Array<{
      image: MobileReaderPrefetchImage;
      signal: AbortSignal;
      resolve: (value: unknown) => void;
    }> = [];
    const loader = (image: MobileReaderPrefetchImage, signal: AbortSignal) =>
      new Promise<unknown>((resolve) => {
        calls.push({ image, signal, resolve });
      });
    return { calls, loader };
  }
  const images = (...indexes: number[]) =>
    indexes.map((index) => mobileReaderPrefetchImageForPage(page(index))!);

  test("cancels downloads that fell out of the plan and keeps the rest", () => {
    const { calls, loader } = deferredLoader();
    const prefetcher = new MobileReaderImagePrefetcher(loader);
    prefetcher.update(images(1, 2, 3));
    expect(calls).toHaveLength(3);

    prefetcher.update(images(2, 3, 4));
    expect(calls).toHaveLength(4);
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);
    expect(calls[2]!.signal.aborted).toBe(false);
    expect(uris(calls.map((call) => call.image))).toEqual([
      "1.jpg",
      "2.jpg",
      "3.jpg",
      "4.jpg",
    ]);
  });

  test("does not request a finished page again, but retries a failed one", async () => {
    const { calls, loader } = deferredLoader();
    const prefetcher = new MobileReaderImagePrefetcher(loader);
    prefetcher.update(images(1, 2));
    calls[0]!.resolve("file:///1.jpg");
    calls[1]!.resolve(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prefetcher.inFlightKeys()).toEqual([]);

    prefetcher.update(images(1, 2));
    expect(uris(calls.map((call) => call.image))).toEqual([
      "1.jpg",
      "2.jpg",
      "2.jpg",
    ]);
  });

  test("cancelAll aborts everything in flight", () => {
    const { calls, loader } = deferredLoader();
    const prefetcher = new MobileReaderImagePrefetcher(loader);
    prefetcher.update(images(1, 2));
    prefetcher.cancelAll();
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    expect(prefetcher.inFlightKeys()).toEqual([]);
  });

  test("a loader failure never escapes", async () => {
    const prefetcher = new MobileReaderImagePrefetcher(() =>
      Promise.reject(new Error("offline")),
    );
    prefetcher.update(images(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prefetcher.inFlightKeys()).toEqual([]);
  });
});
