import { describe, expect, test } from "bun:test";
import { MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE } from "./mobileSourceImages";
import {
  isMobileProcessedCoverFileName,
  isMobileProcessedCoverInputByteLengthAllowed,
  isMobileProcessedCoverOutputByteLengthAllowed,
  isMobileProcessedCoverStagingFileName,
  makeMobileProcessedCoverFileName,
  makeMobileProcessedCoverStagingFileName,
  selectMobileCoverImageRequest,
  selectMobileProcessedCoverEvictions,
  MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES,
  MOBILE_PROCESSED_COVER_MAX_FILES,
  MOBILE_PROCESSED_COVER_OUTPUT_MAX_BYTES,
} from "./mobileSourceCoverProcessing";

const HOUR_MS = 60 * 60 * 1000;

describe("processed cover file identity", () => {
  test("is deterministic, path-safe and distinct per cache key", () => {
    const first = makeMobileProcessedCoverFileName(
      "scope|registry:source|pkg|1|https://images.example/a.jpg|{}",
    );
    const second = makeMobileProcessedCoverFileName(
      "scope|registry:source|pkg|1|https://images.example/b.jpg|{}",
    );

    expect(first).toBe(
      makeMobileProcessedCoverFileName(
        "scope|registry:source|pkg|1|https://images.example/a.jpg|{}",
      ),
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain("/");
    expect(isMobileProcessedCoverFileName(first)).toBe(true);
    expect(isMobileProcessedCoverFileName(second)).toBe(true);
  });

  test("separates covers that differ only in source settings", () => {
    expect(
      makeMobileProcessedCoverFileName('key|{"quality":"high"}'),
    ).not.toBe(makeMobileProcessedCoverFileName('key|{"quality":"low"}'));
  });

  test("rejects names the module does not own", () => {
    expect(isMobileProcessedCoverFileName("cover.png")).toBe(false);
    expect(isMobileProcessedCoverFileName("nemu-http-1.part")).toBe(false);
    expect(
      isMobileProcessedCoverFileName("../cover-00000000000000ff-3.png"),
    ).toBe(false);
    expect(
      isMobileProcessedCoverFileName("cover-00000000000000ff-3.png.part"),
    ).toBe(false);
  });

  test("recognizes its own staging names only", () => {
    const name = makeMobileProcessedCoverFileName("key");
    const staging = makeMobileProcessedCoverStagingFileName(name);

    expect(staging).toBe(`${name}.part`);
    expect(isMobileProcessedCoverStagingFileName(staging)).toBe(true);
    expect(isMobileProcessedCoverStagingFileName(name)).toBe(false);
    expect(isMobileProcessedCoverStagingFileName("nemu-http-1.part")).toBe(
      false,
    );
  });
});

describe("processed cover byte limits", () => {
  test("bound both the download and the processor output", () => {
    expect(isMobileProcessedCoverInputByteLengthAllowed(1)).toBe(true);
    expect(
      isMobileProcessedCoverInputByteLengthAllowed(
        MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES,
      ),
    ).toBe(true);
    expect(
      isMobileProcessedCoverInputByteLengthAllowed(
        MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES + 1,
      ),
    ).toBe(false);
    expect(isMobileProcessedCoverInputByteLengthAllowed(0)).toBe(false);
    expect(isMobileProcessedCoverInputByteLengthAllowed(-1)).toBe(false);
    expect(isMobileProcessedCoverInputByteLengthAllowed(1.5)).toBe(false);
    expect(isMobileProcessedCoverInputByteLengthAllowed(Number.NaN)).toBe(false);

    expect(
      isMobileProcessedCoverOutputByteLengthAllowed(
        MOBILE_PROCESSED_COVER_OUTPUT_MAX_BYTES,
      ),
    ).toBe(true);
    expect(
      isMobileProcessedCoverOutputByteLengthAllowed(
        MOBILE_PROCESSED_COVER_OUTPUT_MAX_BYTES + 1,
      ),
    ).toBe(false);
  });
});

describe("selectMobileCoverImageRequest", () => {
  const base = {
    url: "https://images.example/cover.jpg",
    headers: { Referer: "https://source.example" },
  };

  test("keeps the source rewrite when there is no processed cover", () => {
    expect(selectMobileCoverImageRequest(base, null)).toBe(base);
  });

  test("drops the remote headers once the cover is a local file", () => {
    expect(
      selectMobileCoverImageRequest(base, "file:///cache/cover-x.png"),
    ).toEqual({ url: "file:///cache/cover-x.png", headers: {} });
  });
});

describe("selectMobileProcessedCoverEvictions", () => {
  const owned = (index: number) =>
    makeMobileProcessedCoverFileName(`cover-${index}`);

  test("keeps a bounded directory untouched", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: owned(1), byteLength: 1024, modifiedAt: now - HOUR_MS },
          { name: owned(2), byteLength: 1024, modifiedAt: now },
        ],
        { now },
      ),
    ).toEqual([]);
  });

  test("evicts expired covers", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: owned(1), byteLength: 1024, modifiedAt: now - 400 * HOUR_MS },
          { name: owned(2), byteLength: 1024, modifiedAt: now },
        ],
        { now },
      ),
    ).toEqual([owned(1)]);
  });

  test("trims to the file count cap oldest first", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: owned(3), byteLength: 10, modifiedAt: now - 3 },
          { name: owned(1), byteLength: 10, modifiedAt: now - 1 },
          { name: owned(2), byteLength: 10, modifiedAt: now - 2 },
        ],
        { now, maxFiles: 1 },
      ),
    ).toEqual([owned(3), owned(2)]);
  });

  test("trims to the byte cap oldest first", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: owned(1), byteLength: 400, modifiedAt: now - 2 },
          { name: owned(2), byteLength: 400, modifiedAt: now - 1 },
        ],
        { now, maxTotalBytes: 500 },
      ),
    ).toEqual([owned(1)]);
  });

  test("always sweeps stale staging files but never the active ones", () => {
    const now = 1_000 * HOUR_MS;
    const active = owned(1);
    const activeStaging = makeMobileProcessedCoverStagingFileName(active);
    const orphanStaging = makeMobileProcessedCoverStagingFileName(owned(2));

    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: active, byteLength: 10, modifiedAt: now },
          { name: activeStaging, byteLength: 10, modifiedAt: now },
          { name: orphanStaging, byteLength: 10, modifiedAt: now },
        ],
        { now, keepNames: [active, activeStaging] },
      ),
    ).toEqual([orphanStaging]);
  });

  test("never deletes files outside its own naming scheme", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [
          { name: "nemu-http-1.part", byteLength: 10, modifiedAt: 0 },
          { name: "access-index.json", byteLength: 10, modifiedAt: 0 },
        ],
        { now, maxFiles: 0, maxTotalBytes: 0 },
      ),
    ).toEqual([]);
  });

  test("treats unreadable sizes and timestamps as zero", () => {
    const now = 1_000 * HOUR_MS;
    expect(
      selectMobileProcessedCoverEvictions(
        [{ name: owned(1), byteLength: Number.NaN, modifiedAt: Number.NaN }],
        { now },
      ),
    ).toEqual([owned(1)]);
  });
});

describe("processed cover cache sizing", () => {
  /**
   * The in-memory image-request cache memoizes the `file://` URI of a
   * processed cover, and a memoized entry is never re-resolved while it is a
   * hit. A disk cap at or below the request cap therefore lets ordinary
   * browsing prune files whose URIs are still the ones being painted, which
   * shows up as covers that stay broken until the app is restarted.
   */
  test("holds more files than the request cache can memoize URIs for", () => {
    expect(MOBILE_PROCESSED_COVER_MAX_FILES).toBeGreaterThan(
      MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE,
    );
  });

  test("keeps every memoized cover when the whole request cache is covers", () => {
    const now = 10 * HOUR_MS;
    const files = Array.from(
      { length: MOBILE_SOURCE_IMAGE_REQUEST_CACHE_MAX_SIZE },
      (_, index) => ({
        name: makeMobileProcessedCoverFileName(`memoized-${index}`),
        byteLength: 1024,
        modifiedAt: now - index,
      }),
    );

    expect(selectMobileProcessedCoverEvictions(files, { now })).toEqual([]);
  });
});
