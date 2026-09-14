import { afterEach, describe, expect, test } from "bun:test";
import {
  clearMobileSourceImageLoadFailureListeners,
  createMobileSourceImageRepairCoordinator,
  isRepairableMobileSourceImageUri,
  reportMobileSourceImageLoadFailure,
  reportMobileSourceImageRepaired,
  shouldRepairMobileSourceImageRequest,
  subscribeMobileSourceImageLoadFailures,
  subscribeMobileSourceImageRepairs,
} from "./mobileSourceImageRepair";

const PROCESSED_COVER_URI = "file:///cache/nemu-processed-covers/cover-a.png";

afterEach(() => {
  clearMobileSourceImageLoadFailureListeners();
});

describe("isRepairableMobileSourceImageUri", () => {
  test("accepts the local schemes a processed cover can use", () => {
    expect(isRepairableMobileSourceImageUri(PROCESSED_COVER_URI)).toBe(true);
    expect(isRepairableMobileSourceImageUri("content://media/1")).toBe(true);
  });

  test("refuses remote URLs, data URIs and schemeless values", () => {
    // A remote cover that fails is the image cache's problem; re-resolving the
    // rewrite would just hammer the source.
    expect(isRepairableMobileSourceImageUri("https://cdn.test/a.jpg")).toBe(
      false,
    );
    expect(isRepairableMobileSourceImageUri("http://cdn.test/a.jpg")).toBe(
      false,
    );
    // A data URI carries its own bytes, so there is nothing to re-resolve.
    expect(isRepairableMobileSourceImageUri("data:image/png;base64,AA")).toBe(
      false,
    );
    expect(isRepairableMobileSourceImageUri("/cache/cover.png")).toBe(false);
    expect(isRepairableMobileSourceImageUri("")).toBe(false);
  });
});

describe("shouldRepairMobileSourceImageRequest", () => {
  test("repairs the holder whose local URI failed", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: PROCESSED_COVER_URI,
        alreadyRepaired: false,
      }),
    ).toBe(true);
  });

  test("ignores a failure for a URI this holder did not resolve", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: "file:///cache/nemu-processed-covers/cover-b.png",
        alreadyRepaired: false,
      }),
    ).toBe(false);
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: null,
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("never repairs a remote URL", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "https://cdn.test/cover.jpg",
        requestUrl: "https://cdn.test/cover.jpg",
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("repairs a given URI only once", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: PROCESSED_COVER_URI,
        alreadyRepaired: true,
      }),
    ).toBe(false);
  });

  test("ignores an empty reported URI", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "",
        requestUrl: "",
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("accepts an injected repairability predicate", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "https://cdn.test/cover.jpg",
        requestUrl: "https://cdn.test/cover.jpg",
        alreadyRepaired: false,
        isRepairableUri: () => true,
      }),
    ).toBe(true);
  });
});

describe("mobile source image load failure reports", () => {
  test("delivers a reported URI to every subscriber", () => {
    const first: string[] = [];
    const second: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => first.push(uri));
    const unsubscribe = subscribeMobileSourceImageLoadFailures((uri) =>
      second.push(uri),
    );

    reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI);
    unsubscribe();
    reportMobileSourceImageLoadFailure("file:///cache/other.png");

    expect(first).toEqual([PROCESSED_COVER_URI, "file:///cache/other.png"]);
    expect(second).toEqual([PROCESSED_COVER_URI]);
  });

  test("one throwing subscriber does not stop the others", () => {
    const seen: string[] = [];
    subscribeMobileSourceImageLoadFailures(() => {
      throw new Error("boom");
    });
    subscribeMobileSourceImageLoadFailures((uri) => seen.push(uri));

    expect(() =>
      reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI),
    ).not.toThrow();
    expect(seen).toEqual([PROCESSED_COVER_URI]);
  });

  test("ignores an empty report", () => {
    const seen: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => seen.push(uri));

    reportMobileSourceImageLoadFailure("");

    expect(seen).toEqual([]);
  });

  test("keeps the failure and repair channels separate", () => {
    const failures: string[] = [];
    const repairs: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => failures.push(uri));
    const unsubscribe = subscribeMobileSourceImageRepairs((uri) =>
      repairs.push(uri),
    );

    reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI);
    reportMobileSourceImageRepaired(PROCESSED_COVER_URI);
    unsubscribe();
    reportMobileSourceImageRepaired(PROCESSED_COVER_URI);

    expect(failures).toEqual([PROCESSED_COVER_URI]);
    expect(repairs).toEqual([PROCESSED_COVER_URI]);
  });
});

type FakeRequest = { url: string };

/**
 * A stand-in for one mounted cover: the same three wirings the request hook
 * has (resolve, load-failure subscription, repair budget), none of the React.
 *
 * `memo` is the image-request cache and a processed cover's file name is a
 * hash of its cache key, so re-resolving always produces the *same* URI — the
 * reason the repair has to be announced explicitly, and the reason a dead
 * cover would loop if the budget did not stop it.
 */
function createCoverHolder(uri: string) {
  const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
  const cacheKey = `memo:${uri}`;
  const memo = new Map<string, FakeRequest>();
  const announced: string[] = [];
  const forgotten: string[] = [];
  let resolveCount = 0;

  const resolve = () => {
    resolveCount += 1;
    const attempt = coordinator.beginResolve();
    attempt.observeCacheKey(cacheKey);
    const request = memo.get(cacheKey) ?? { url: uri };
    memo.set(cacheKey, request);
    const repairedUri = attempt.settle(request);
    if (repairedUri) reportMobileSourceImageRepaired(repairedUri);
  };

  const unsubscribeFailures = subscribeMobileSourceImageLoadFailures(
    (failedUri) => {
      const key = coordinator.handleLoadFailure(failedUri);
      if (!key) return;
      forgotten.push(key);
      memo.delete(key);
      resolve();
    },
  );
  const unsubscribeRepairs = subscribeMobileSourceImageRepairs((repairedUri) => {
    announced.push(repairedUri);
  });

  return {
    announced,
    forgotten,
    resolve,
    /** The hook's `sourceRequestKey` change: a new identity, a new budget. */
    changeIdentity: () => {
      coordinator.resetRepairBudget();
      resolve();
    },
    get resolveCount() {
      return resolveCount;
    },
    dispose: () => {
      unsubscribeFailures();
      unsubscribeRepairs();
    },
  };
}

describe("processed cover repair handshake", () => {
  const uri = PROCESSED_COVER_URI;

  test("repairs each (identity, URI) pair exactly once", () => {
    const holder = createCoverHolder(uri);
    holder.resolve();

    reportMobileSourceImageLoadFailure(uri);

    // The memoized entry was dropped and the holder resolved a second time,
    // and only then is the view told the URI is worth another attempt.
    expect(holder.forgotten).toEqual([`memo:${uri}`]);
    expect(holder.resolveCount).toBe(2);
    expect(holder.announced).toEqual([uri]);
    holder.dispose();
  });

  test("a genuinely dead cover settles instead of looping", () => {
    const holder = createCoverHolder(uri);
    holder.resolve();

    // The view keeps failing on the same URI because the file is really gone.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      reportMobileSourceImageLoadFailure(uri);
    }

    expect(holder.resolveCount).toBe(2);
    expect(holder.forgotten).toHaveLength(1);
    expect(holder.announced).toEqual([uri]);
    holder.dispose();
  });

  test("a new image identity gets its own repair", () => {
    const holder = createCoverHolder(uri);
    holder.resolve();
    reportMobileSourceImageLoadFailure(uri);
    reportMobileSourceImageLoadFailure(uri);
    expect(holder.forgotten).toHaveLength(1);

    holder.changeIdentity();
    reportMobileSourceImageLoadFailure(uri);

    expect(holder.forgotten).toHaveLength(2);
    holder.dispose();
  });

  test("ignores failures for URIs this holder is not painting", () => {
    const holder = createCoverHolder(uri);
    holder.resolve();

    reportMobileSourceImageLoadFailure(
      "file:///cache/nemu-processed-covers/cover-b.png",
    );
    reportMobileSourceImageLoadFailure("https://cdn.test/cover.jpg");

    expect(holder.forgotten).toEqual([]);
    expect(holder.resolveCount).toBe(1);
    holder.dispose();
  });

  test("announces nothing when no repair was pending", () => {
    const holder = createCoverHolder(uri);
    holder.resolve();
    holder.resolve();

    expect(holder.announced).toEqual([]);
    holder.dispose();
  });
});

describe("mobile source image repair coordinator", () => {
  const newUri = "file:///cache/nemu-processed-covers/cover-new.png";
  const oldUri = "file:///cache/nemu-processed-covers/cover-old.png";

  test("publishes the cache key and the request as one pair", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    const attempt = coordinator.beginResolve();

    // The cache key always arrives before the request does.
    attempt.observeCacheKey("memo:a");
    expect(coordinator.resolution).toEqual({ cacheKey: null, request: null });

    attempt.settle({ url: newUri });
    expect(coordinator.resolution).toEqual({
      cacheKey: "memo:a",
      request: { url: newUri },
    });
  });

  test("a superseded resolve never staples its cache key to the live request", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    // The old identity's resolve reports its cache key, then is superseded
    // mid-flight (a settings save, or the screen swapping images).
    const stale = coordinator.beginResolve();
    stale.observeCacheKey("memo:old");

    const fresh = coordinator.beginResolve();
    fresh.observeCacheKey("memo:new");
    fresh.settle({ url: newUri });

    expect(stale.active).toBe(false);
    expect(stale.settle({ url: oldUri })).toBeNull();
    expect(coordinator.resolution).toEqual({
      cacheKey: "memo:new",
      request: { url: newUri },
    });

    // The consequence that matters: a failure of the superseded URI must not
    // evict the live entry, and the live URI still repairs.
    expect(coordinator.handleLoadFailure(oldUri)).toBeNull();
    expect(coordinator.handleLoadFailure(newUri)).toBe("memo:new");
  });

  test("a cancelled attempt publishes nothing", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    const first = coordinator.beginResolve();
    first.observeCacheKey("memo:a");
    first.settle({ url: newUri });

    const abandoned = coordinator.beginResolve();
    abandoned.observeCacheKey("memo:b");
    abandoned.cancel();
    expect(abandoned.settle({ url: oldUri })).toBeNull();

    expect(coordinator.resolution).toEqual({
      cacheKey: "memo:a",
      request: { url: newUri },
    });
  });

  test("announces a repair only when the same URI came back", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    const first = coordinator.beginResolve();
    first.observeCacheKey("memo:a");
    first.settle({ url: oldUri });
    expect(coordinator.handleLoadFailure(oldUri)).toBe("memo:a");

    // The re-resolve produced a different URI, so the view's latched failure
    // is already invalidated by the new source and needs no announcement.
    const second = coordinator.beginResolve();
    second.observeCacheKey("memo:a");
    expect(second.settle({ url: newUri })).toBeNull();

    const third = coordinator.beginResolve();
    third.observeCacheKey("memo:a");
    expect(third.settle({ url: oldUri })).toBeNull();
  });

  test("a repair arms exactly one announcement", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    const first = coordinator.beginResolve();
    first.observeCacheKey("memo:a");
    first.settle({ url: oldUri });
    coordinator.handleLoadFailure(oldUri);

    const second = coordinator.beginResolve();
    second.observeCacheKey("memo:a");
    expect(second.settle({ url: oldUri })).toBe(oldUri);

    const third = coordinator.beginResolve();
    third.observeCacheKey("memo:a");
    expect(third.settle({ url: oldUri })).toBeNull();
  });

  test("honours an injected repairability predicate", () => {
    const coordinator = createMobileSourceImageRepairCoordinator<FakeRequest>();
    const attempt = coordinator.beginResolve();
    attempt.observeCacheKey("memo:a");
    attempt.settle({ url: "https://cdn.test/cover.jpg" });

    expect(
      coordinator.handleLoadFailure("https://cdn.test/cover.jpg"),
    ).toBeNull();
    expect(
      coordinator.handleLoadFailure("https://cdn.test/cover.jpg", () => true),
    ).toBe("memo:a");
  });
});
