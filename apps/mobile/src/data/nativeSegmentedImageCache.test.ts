import { describe, expect, it } from "bun:test";
import {
  getNativeSegmentedImagePayloadByteLimit,
  isNativeSegmentedImageTileWithinPolicy,
  NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES,
  nextNativeSegmentedImageGeneration,
  parseNativeSegmentedImageCacheManifest,
} from "./nativeSegmentedImageCache";

const key = "reader_3Apage";
const valid = {
  kind: "nemu-segmented-image",
  manifestVersion: 1,
  generation: "00000000m1-000000-0000000001",
  byteLength: 300,
  width: 100,
  height: 10_000,
  segments: [
    {
      fileName: `${key}.segment-v1-00000000m1-000000-0000000001-00.png`,
      byteLength: 100,
      width: 100,
      height: 4_000,
      mimeType: "image/png",
    },
    {
      fileName: `${key}.segment-v1-00000000m1-000000-0000000001-01.png`,
      byteLength: 200,
      width: 100,
      height: 6_000,
      mimeType: "image/png",
    },
  ],
} as const;

describe("native segmented image cache manifest", () => {
  it("accepts one exact ordered bounded group", () => {
    expect(parseNativeSegmentedImageCacheManifest(valid, key, 1_000)).toEqual(
      valid,
    );
  });

  it("fails closed for traversal, missing order, MIME mismatch, and bad sums", () => {
    const mutations = [
      {
        ...valid,
        segments: [
          { ...valid.segments[0], fileName: "../outside.segment-v1-00.png" },
          valid.segments[1],
        ],
      },
      {
        ...valid,
        segments: [valid.segments[1], valid.segments[0]],
      },
      {
        ...valid,
        segments: [
          { ...valid.segments[0], mimeType: "image/jpeg" },
          valid.segments[1],
        ],
      },
      { ...valid, byteLength: 301 },
      { ...valid, height: 10_001 },
      { ...valid, generation: "zzzzzzzzzz-zzzzzz-zzzzzzzzzz" },
      { ...valid, generation: "m1-0-1" },
    ];
    mutations.forEach((value) => {
      expect(
        parseNativeSegmentedImageCacheManifest(value, key, 1_000),
      ).toBeNull();
    });
  });

  it("rejects over-count and aggregate safety-envelope violations", () => {
    expect(
      parseNativeSegmentedImageCacheManifest(
        {
          ...valid,
          segments: Array.from({ length: 33 }, () => valid.segments[0]),
        },
        key,
        10_000,
      ),
    ).toBeNull();
    expect(
      parseNativeSegmentedImageCacheManifest(
        { ...valid, width: 2_049 },
        key,
        1_000,
      ),
    ).toBeNull();
  });

  it("derives a sortable generation past the latest even after clock rollback", () => {
    const previous = nextNativeSegmentedImageGeneration({
      now: 2_000,
      epoch: 1,
      token: 1,
    });
    const next = nextNativeSegmentedImageGeneration({
      now: 1_000,
      previousGeneration: previous,
      epoch: 1,
      token: 2,
    });
    expect(next.localeCompare(previous)).toBeGreaterThan(0);
  });

  it("reserves the complete manifest envelope inside the caller byte cap", () => {
    const callerCap = 20 * 1024 * 1024;
    expect(getNativeSegmentedImagePayloadByteLimit(callerCap)).toBe(
      callerCap - NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES,
    );
    expect(
      getNativeSegmentedImagePayloadByteLimit(
        NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES,
      ),
    ).toBe(0);
  });

  it("enforces a stricter caller tile policy below the global hard limits", () => {
    expect(
      isNativeSegmentedImageTileWithinPolicy(
        { width: 1_000, height: 2_000 },
        { maxDimension: 2_000, maxPixels: 2_000_000 },
      ),
    ).toBe(true);
    expect(
      isNativeSegmentedImageTileWithinPolicy(
        { width: 1_001, height: 2_000 },
        { maxDimension: 2_000, maxPixels: 2_000_000 },
      ),
    ).toBe(false);
    expect(
      isNativeSegmentedImageTileWithinPolicy(
        { width: 1_000, height: 2_001 },
        { maxDimension: 2_000, maxPixels: 8_000_000 },
      ),
    ).toBe(false);
  });
});
