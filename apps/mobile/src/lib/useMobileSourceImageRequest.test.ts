import { describe, expect, test } from "bun:test";
import {
  makeMobileCoverRequestKey,
  resolveMobileStickyCover,
  selectMobileCoverAfterError,
  type MobileStickyCoverPaint,
} from "./useMobileSourceImageRequest";

const seedHeaders = { Referer: "https://source.test/" };

function pending() {
  return { status: "pending" as const, request: null };
}

function settled(request: { url: string; headers: Record<string, string> } | null) {
  return { status: "settled" as const, request };
}

describe("mobile cover request identity", () => {
  test("separates the same URL with and without headers", () => {
    const withoutHeaders = makeMobileCoverRequestKey({
      uri: "https://cdn.test/a.jpg",
    });
    const withHeaders = makeMobileCoverRequestKey({
      uri: "https://cdn.test/a.jpg",
      headers: seedHeaders,
    });

    expect(withoutHeaders).not.toBe(withHeaders);
    expect(makeMobileCoverRequestKey(null)).toBe("");
  });

  test("ignores header ordering", () => {
    expect(
      makeMobileCoverRequestKey({
        uri: "https://cdn.test/a.jpg",
        headers: { Referer: "r", "User-Agent": "u" },
      }),
    ).toBe(
      makeMobileCoverRequestKey({
        uri: "https://cdn.test/a.jpg",
        headers: { "User-Agent": "u", Referer: "r" },
      }),
    );
  });
});

describe("sticky manga cover", () => {
  test("paints the seed cover with its listing headers on the first frame", () => {
    expect(
      resolveMobileStickyCover(null, {
        cover: "https://cdn.test/seed.jpg",
        coverHeaders: seedHeaders,
        requestState: pending(),
        requiresSourceRequest: true,
      }),
    ).toEqual({
      request: { uri: "https://cdn.test/seed.jpg", headers: seedHeaders },
      resolved: true,
    });
  });

  test("keeps the resolved cover while the next request is in flight", () => {
    const previous: MobileStickyCoverPaint = {
      request: { uri: "https://cdn.test/seed.jpg", headers: seedHeaders },
      resolved: true,
    };

    // Details landed with their own raw cover: the rewrite for it has not come
    // back, so painting it bare would 403 and latch the failed state.
    expect(
      resolveMobileStickyCover(previous, {
        cover: "https://cdn.test/detail.jpg",
        requestState: pending(),
        requiresSourceRequest: true,
      }),
    ).toBe(previous);
  });

  test("swaps to the new cover once its request settles", () => {
    const previous: MobileStickyCoverPaint = {
      request: { uri: "https://cdn.test/seed.jpg", headers: seedHeaders },
      resolved: true,
    };

    expect(
      resolveMobileStickyCover(previous, {
        cover: "https://cdn.test/detail.jpg",
        requestState: settled({
          url: "https://cdn.test/detail.jpg?token=1",
          headers: seedHeaders,
        }),
        requiresSourceRequest: true,
      }),
    ).toEqual({
      request: { uri: "https://cdn.test/detail.jpg?token=1", headers: seedHeaders },
      resolved: true,
    });
  });

  test("stops waiting once the source answered with no rewrite", () => {
    const previous: MobileStickyCoverPaint = {
      request: { uri: "https://cdn.test/seed.jpg", headers: seedHeaders },
      resolved: true,
    };

    expect(
      resolveMobileStickyCover(previous, {
        cover: "https://cdn.test/detail.jpg",
        requestState: settled(null),
        requiresSourceRequest: true,
      }),
    ).toEqual({
      request: { uri: "https://cdn.test/detail.jpg" },
      resolved: true,
    });
  });

  test("paints immediately when no source can rewrite the cover", () => {
    expect(
      resolveMobileStickyCover(null, {
        cover: "https://cdn.test/local.jpg",
        requestState: pending(),
        requiresSourceRequest: false,
      }),
    ).toEqual({
      request: { uri: "https://cdn.test/local.jpg" },
      resolved: true,
    });
  });

  test("paints a best-effort first frame when nothing is resolved yet", () => {
    expect(
      resolveMobileStickyCover(null, {
        cover: "https://cdn.test/seed.jpg",
        requestState: pending(),
        requiresSourceRequest: true,
      }),
    ).toEqual({
      request: { uri: "https://cdn.test/seed.jpg" },
      resolved: false,
    });
  });

  test("shows nothing for an empty cover", () => {
    expect(
      resolveMobileStickyCover(
        {
          request: { uri: "https://cdn.test/seed.jpg" },
          resolved: true,
        },
        { cover: "   ", requestState: pending(), requiresSourceRequest: true },
      ),
    ).toBeNull();
  });
});

describe("cover fallback after a failed load", () => {
  const lastLoaded = {
    uri: "https://cdn.test/seed.jpg",
    headers: seedHeaders,
  };

  test("falls back to the last cover that rendered", () => {
    const candidate = { uri: "https://cdn.test/detail.jpg" };

    expect(
      selectMobileCoverAfterError(candidate, {
        failedKey: makeMobileCoverRequestKey(candidate),
        lastLoaded,
      }),
    ).toBe(lastLoaded);
  });

  test("keeps the candidate while it has not failed", () => {
    const candidate = { uri: "https://cdn.test/detail.jpg" };

    expect(
      selectMobileCoverAfterError(candidate, {
        failedKey: "https://cdn.test/other.jpg",
        lastLoaded,
      }),
    ).toBe(candidate);
  });

  test("keeps the candidate when the failure is the last loaded cover", () => {
    expect(
      selectMobileCoverAfterError(lastLoaded, {
        failedKey: makeMobileCoverRequestKey(lastLoaded),
        lastLoaded,
      }),
    ).toBe(lastLoaded);
  });

  test("never resurrects a cover for a manga that has none", () => {
    expect(
      selectMobileCoverAfterError(null, { failedKey: null, lastLoaded }),
    ).toBeNull();
  });
});
