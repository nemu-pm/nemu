import { describe, expect, test } from "bun:test";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileImageUriOwnership } from "./mobileImageUriPolicy";
import type { SecondaryRenderPlan } from "@nemu/core/dual-reader";
import type { DualReadSecondaryImageHandle } from "./mobileDualReaderStore";
import {
  __resetSecondaryImageLoading,
  adaptMobileDualReadStore,
  ensureSecondaryCompositeImage,
  ensureSecondaryImage,
  fetchMobilePageBytes,
  makeSecondaryCompositeKey,
  makeSecondarySingleKey,
  type SecondaryImageStoreSeam,
} from "./mobileDualReaderSecondaryImages";
import { base64ToBytes } from "./mobileBase64";
import {
  createPureRgbaRenderer,
  type MobileDualReaderRealized,
  type MobileDualReaderRenderer,
} from "./mobileDualReaderSkiaAdapter";

function makePage(
  index: number,
  imageUri: string,
  imageUriOwnership: MobileImageUriOwnership = "source",
): MobileReaderPage {
  return { id: `p${index}`, index, imageUri, imageUriOwnership };
}

/** In-memory store seam: a Map mirroring the real store's image cache. */
function makeStore(): SecondaryImageStoreSeam & {
  map: Map<string, DualReadSecondaryImageHandle>;
  bumpGeneration: () => void;
} {
  const map = new Map<string, DualReadSecondaryImageHandle>();
  let generation = 0;
  return {
    map,
    hasImage: (key) => map.has(key),
    getGeneration: () => generation,
    setImage: (key, handle, expectedGeneration) => {
      if (generation !== expectedGeneration) return false;
      map.set(key, handle);
      return true;
    },
    bumpGeneration: () => {
      generation += 1;
    },
  };
}

/** A pure renderer that "decodes" by using the bytes as a width/height seed
 * (matching the adapter test's fake), so we can assert realized dimensions. */
function fakeRenderer(): MobileDualReaderRenderer {
  const decode = async (bytes: Uint8Array) => {
    const width = bytes[0] ?? 4;
    const height = bytes[1] ?? 4;
    const data = new Uint8Array(width * height * 4);
    return { data, width, height };
  };
  return createPureRgbaRenderer(decode);
}

/** A fetcher that turns the page's imageUri into deterministic bytes. */
function fakeFetcher(): (page: Pick<MobileReaderPage, "imageUri" | "headers">) => Promise<Uint8Array> {
  return async (page) => {
    // Encode (width,height) into bytes[0..1] from the uri suffix "WxH".
    const match = /(\d+)x(\d+)$/.exec(page.imageUri ?? "");
    const w = match ? Number(match[1]) : 6;
    const h = match ? Number(match[2]) : 4;
    return new Uint8Array([w, h]);
  };
}

describe("mobileDualReaderSecondaryImages — byte fetching + base64", () => {
  test("base64ToBytes round-trips a known value", () => {
    // "AAAA" → 3 zero bytes.
    expect(Array.from(base64ToBytes("AAAA"))).toEqual([0, 0, 0]);
    // "AQID" → 1,2,3.
    expect(Array.from(base64ToBytes("AQID"))).toEqual([1, 2, 3]);
  });

  test("fetchMobilePageBytes decodes a data: URI to bytes", async () => {
    // bytesToBase64([10, 4]) === "CgQ=".
    const page = makePage(0, "data:image/png;base64,CgQ=", "app");
    const bytes = await fetchMobilePageBytes(page, {
      readFileBytes: async () => new Uint8Array([99]),
    });
    expect(Array.from(bytes)).toEqual([10, 4]);
  });

  test("fetchMobilePageBytes reads file URIs via readFileBytes", async () => {
    const page = makePage(0, "file:///tmp/x.png", "app");
    const bytes = await fetchMobilePageBytes(page, {
      readFileBytes: async () => new Uint8Array([7, 8, 9]),
    });
    expect(Array.from(bytes)).toEqual([7, 8, 9]);
  });

  test("fetchMobilePageBytes fetches http URIs with headers", async () => {
    const fakeFetch = ((url: string, init?: RequestInit) => {
      expect(url).toBe("https://example.com/img.png");
      expect(init?.headers).toEqual({ Referer: "x" });
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 }),
      );
    }) as unknown as typeof fetch;
    const page = makePage(0, "https://example.com/img.png");
    page.headers = { Referer: "x" };
    const bytes = await fetchMobilePageBytes(page, { fetchImpl: fakeFetch });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  test("fetchMobilePageBytes throws on missing imageUri", async () => {
    await expect(fetchMobilePageBytes(makePage(0, ""), {})).rejects.toThrow(/no image/);
  });
});

describe("mobileDualReaderSecondaryImages — ensure functions", () => {
  test("makeSecondarySingleKey / makeSecondaryCompositeKey mirror web", () => {
    expect(makeSecondarySingleKey("chA", 3)).toBe("chA:3");
    const split: SecondaryRenderPlan = {
      kind: "split",
      secondaryChapterId: "chA",
      secondaryIndex: 2,
      side: "right",
      driftDelta: 0,
    };
    expect(makeSecondaryCompositeKey(split)).toBe("split:chA:2:right");
    const merge: SecondaryRenderPlan = {
      kind: "merge",
      secondaryChapterId: "chA",
      secondaryIndices: [0, 1],
      order: "swap",
      driftDelta: 0,
    };
    expect(makeSecondaryCompositeKey(merge)).toBe("merge:chA:0:1:swap");
  });

  test("ensureSecondaryImage decodes + caches under the single key", async () => {
    __resetSecondaryImageLoading();
    const renderer = fakeRenderer();
    const store = makeStore();
    const pages = [makePage(0, "u-10x6")];
    await ensureSecondaryImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages,
      chapterId: "chA",
      index: 0,
    });
    const key = makeSecondarySingleKey("chA", 0);
    expect(store.map.has(key)).toBe(true);
    const realized = store.map.get(key)!.image as { width: number; height: number };
    expect(realized.width).toBe(10);
    expect(realized.height).toBe(6);
  });

  test("ensureSecondaryImage is a no-op when already cached", async () => {
    __resetSecondaryImageLoading();
    const renderer = fakeRenderer();
    const store = makeStore();
    const pages = [makePage(0, "u-10x6")];
    await ensureSecondaryImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages,
      chapterId: "chA",
      index: 0,
    });
    // Second call must not re-dispose/re-decode (would throw via the fake).
    let calls = 0;
    const countingFetcher = (): Promise<Uint8Array> => {
      calls += 1;
      return Promise.resolve(new Uint8Array([10, 6]));
    };
    await ensureSecondaryImage({
      renderer,
      fetchBytes: countingFetcher,
      store,
      pages,
      chapterId: "chA",
      index: 0,
    });
    expect(calls).toBe(0);
  });

  test("ensureSecondaryCompositeImage builds a split composite", async () => {
    __resetSecondaryImageLoading();
    const renderer = fakeRenderer();
    const store = makeStore();
    const pages = [makePage(0, "u-10x6")];
    const plan: SecondaryRenderPlan = {
      kind: "split",
      secondaryChapterId: "chA",
      secondaryIndex: 0,
      side: "right",
      driftDelta: 0,
    };
    await ensureSecondaryCompositeImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages,
      plan,
    });
    const key = makeSecondaryCompositeKey(plan);
    expect(store.map.has(key)).toBe(true);
    // Split right of a 10x6 → cropWidth 5, height 6.
    const realized = store.map.get(key)!.image as { width: number; height: number };
    expect(realized.width).toBe(5);
    expect(realized.height).toBe(6);
  });

  test("ensureSecondaryCompositeImage builds a merge composite", async () => {
    __resetSecondaryImageLoading();
    const renderer = fakeRenderer();
    const store = makeStore();
    const pages = [makePage(0, "u-4x2"), makePage(1, "u-4x4")];
    const plan: SecondaryRenderPlan = {
      kind: "merge",
      secondaryChapterId: "chA",
      secondaryIndices: [0, 1],
      order: "normal",
      driftDelta: 0,
    };
    await ensureSecondaryCompositeImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages,
      plan,
    });
    const key = makeSecondaryCompositeKey(plan);
    expect(store.map.has(key)).toBe(true);
    // Merge 4x2 + 4x4 → targetHeight 4, short scales to 8x4 → total 12x4.
    const realized = store.map.get(key)!.image as { width: number; height: number };
    expect(realized.width).toBe(12);
    expect(realized.height).toBe(4);
  });

  test("releases decoded split and merge intermediates", async () => {
    __resetSecondaryImageLoading();
    const released: string[] = [];
    let nextId = 0;
    const renderer: MobileDualReaderRenderer = {
      decodeToRgba: async () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
      decodeImage: async () => ({ id: `decoded-${nextId++}` }),
      renderSplit: async () => ({ id: "split" }),
      renderMerge: async () => ({ id: "merge" }),
      getDimensions: async () => ({ width: 1, height: 1 }),
      release: (image) => released.push((image as { id: string }).id),
    };
    const store = makeStore();
    await ensureSecondaryCompositeImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages: [makePage(0, "u-4x2")],
      plan: {
        kind: "split",
        secondaryChapterId: "split-chapter",
        secondaryIndex: 0,
        side: "left",
        driftDelta: 0,
      },
    });
    await ensureSecondaryCompositeImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages: [makePage(0, "u-4x2"), makePage(1, "u-4x4")],
      plan: {
        kind: "merge",
        secondaryChapterId: "merge-chapter",
        secondaryIndices: [0, 1],
        order: "normal",
        driftDelta: 0,
      },
    });
    expect(released).toEqual(["decoded-0", "decoded-1", "decoded-2"]);
  });

  test("releases a stale decoded image instead of writing it after generation changes", async () => {
    __resetSecondaryImageLoading();
    const fetchResult = Promise.withResolvers<Uint8Array>();
    const released: unknown[] = [];
    const renderer: MobileDualReaderRenderer = {
      decodeToRgba: async () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
      decodeImage: async () => ({ id: "stale" }),
      renderSplit: async (image) => image,
      renderMerge: async (image) => image,
      getDimensions: async () => ({ width: 1, height: 1 }),
      release: (image) => released.push(image),
    };
    const store = makeStore();
    const pending = ensureSecondaryImage({
      renderer,
      fetchBytes: () => fetchResult.promise,
      store,
      pages: [makePage(0, "u-1x1")],
      chapterId: "chA",
      index: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.bumpGeneration();
    fetchResult.resolve(new Uint8Array([1, 1]));
    await pending;
    expect(store.map.size).toBe(0);
    expect(released).toEqual([{ id: "stale" }]);
  });

  test("releases a decoded image when foreground work is cancelled before commit", async () => {
    __resetSecondaryImageLoading();
    const controller = new AbortController();
    const released: unknown[] = [];
    const renderer: MobileDualReaderRenderer = {
      decodeToRgba: async () => ({
        data: new Uint8Array(4),
        width: 1,
        height: 1,
      }),
      decodeImage: async () => {
        controller.abort();
        return { id: "cancelled" };
      },
      renderSplit: async (image) => image,
      renderMerge: async (image) => image,
      getDimensions: async () => ({ width: 1, height: 1 }),
      release: (image) => released.push(image),
    };
    const store = makeStore();
    await ensureSecondaryImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages: [makePage(0, "u-1x1")],
      chapterId: "chA",
      index: 0,
      signal: controller.signal,
    });
    expect(store.map.size).toBe(0);
    expect(released).toEqual([{ id: "cancelled" }]);
  });

  test("ensureSecondaryCompositeImage is a no-op for single/missing plans", async () => {
    __resetSecondaryImageLoading();
    const renderer = fakeRenderer();
    const store = makeStore();
    const single: SecondaryRenderPlan = {
      kind: "single",
      secondaryChapterId: "chA",
      secondaryIndex: 0,
      driftDelta: 0,
    };
    await ensureSecondaryCompositeImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages: [makePage(0, "u-4x2")],
      plan: single,
    });
    expect(store.map.size).toBe(0);
  });

  test("handles cache a realized drawable with a dispose that calls release", async () => {
    __resetSecondaryImageLoading();
    let released = 0;
    const renderer: MobileDualReaderRenderer = {
      decodeToRgba: async () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
      decodeImage: async () => ({ __id: 1 }) as MobileDualReaderRealized,
      renderSplit: async () => ({ __id: 2 }) as MobileDualReaderRealized,
      renderMerge: async () => ({ __id: 3 }) as MobileDualReaderRealized,
      getDimensions: async () => ({ width: 1, height: 1 }),
      release: () => {
        released += 1;
      },
    };
    const store = makeStore();
    await ensureSecondaryImage({
      renderer,
      fetchBytes: fakeFetcher(),
      store,
      pages: [makePage(0, "u-1x1")],
      chapterId: "chA",
      index: 0,
    });
    const handle = store.map.get(makeSecondarySingleKey("chA", 0))!;
    expect(handle.image).toEqual({ __id: 1 });
    handle.dispose?.();
    expect(released).toBe(1);
  });

  test("adaptMobileDualReadStore reads/writes the real store", () => {
    const map = new Map<string, DualReadSecondaryImageHandle>([
      [
        "k",
        { image: 1, width: 1, height: 1, pixelCount: 1, byteSize: 4 },
      ],
    ]);
    // Mirror the real store shape: actions live on the getState() snapshot.
    const fakeStore = {
      getState: () => ({
        runtimeGeneration: 3,
        secondaryImageUrls: map,
        setSecondaryImageUrl: (
          key: string,
          handle: DualReadSecondaryImageHandle,
          generation: number,
        ) => {
          if (generation !== 3) return false;
          map.set(key, handle);
          return true;
        },
      }),
    } as unknown as Parameters<typeof adaptMobileDualReadStore>[0];
    const seam = adaptMobileDualReadStore(fakeStore);
    expect(seam.hasImage("k")).toBe(true);
    expect(seam.hasImage("other")).toBe(false);
    expect(seam.getGeneration()).toBe(3);
    seam.setImage(
      "other",
      { image: 2, width: 1, height: 1, pixelCount: 1, byteSize: 4 },
      3,
    );
    expect(seam.hasImage("other")).toBe(true);
  });
});
