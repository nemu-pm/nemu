import { describe, expect, test } from "bun:test";
import {
  MOBILE_DUAL_READER_HASH_MAX_PIXELS,
  MOBILE_DUAL_READER_MAX_DECODED_BYTES,
  MOBILE_DUAL_READER_MAX_DECODED_PIXELS,
  MOBILE_DUAL_READER_MAX_ENCODED_BYTES,
  MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION,
  MOBILE_DUAL_READER_MAX_SURFACE_PIXELS,
  assertMobileDualReaderDecodedImageBudget,
  assertMobileDualReaderEncodedByteLength,
  assertMobileDualReaderRgbaDataLength,
  assertMobileDualReaderSurfaceBudget,
  fitMobileDualReaderHashDimensions,
  fitMobileDualReaderSurfaceDimensions,
} from "./mobileDualReaderImageSafety";

describe("mobile dual-reader image safety", () => {
  test("accepts the encoded-byte boundary and rejects the next byte", () => {
    expect(() =>
      assertMobileDualReaderEncodedByteLength(MOBILE_DUAL_READER_MAX_ENCODED_BYTES),
    ).not.toThrow();
    expect(() =>
      assertMobileDualReaderEncodedByteLength(
        MOBILE_DUAL_READER_MAX_ENCODED_BYTES + 1,
      ),
    ).toThrow(/encoded image exceeds/);
  });

  test("accepts the decoded pixel/byte boundary and rejects one row beyond it", () => {
    const exact = assertMobileDualReaderDecodedImageBudget(4096, 2048);
    expect(exact.pixelCount).toBe(MOBILE_DUAL_READER_MAX_DECODED_PIXELS);
    expect(exact.byteSize).toBe(MOBILE_DUAL_READER_MAX_DECODED_BYTES);
    expect(() =>
      assertMobileDualReaderDecodedImageBudget(4097, 2048),
    ).toThrow(/pixel.*byte safety limit/);
    expect(() =>
      assertMobileDualReaderDecodedImageBudget(
        MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION + 1,
        1,
      ),
    ).toThrow(/safety limit/);
  });

  test("accepts the surface boundary and rejects the next row", () => {
    expect(
      assertMobileDualReaderSurfaceBudget(4096, 2048).pixelCount,
    ).toBe(MOBILE_DUAL_READER_MAX_SURFACE_PIXELS);
    expect(() => assertMobileDualReaderSurfaceBudget(4097, 2048)).toThrow(
      /surface exceeds/,
    );
  });

  test("downsamples hash RGBA and oversized merge surfaces before allocation", () => {
    const hash = fitMobileDualReaderHashDimensions(4096, 2048);
    expect(hash.width * hash.height).toBeLessThanOrEqual(
      MOBILE_DUAL_READER_HASH_MAX_PIXELS,
    );
    expect(hash).toEqual({ width: 1024, height: 512 });

    const surface = fitMobileDualReaderSurfaceDimensions(8192, 4096);
    expect(surface.width * surface.height).toBeLessThanOrEqual(
      MOBILE_DUAL_READER_MAX_SURFACE_PIXELS,
    );
    expect(() =>
      assertMobileDualReaderSurfaceBudget(surface.width, surface.height),
    ).not.toThrow();
  });

  test("requires the RGBA payload to match the validated dimensions", () => {
    expect(() =>
      assertMobileDualReaderRgbaDataLength(new Uint8Array(16), 2, 2),
    ).not.toThrow();
    expect(() =>
      assertMobileDualReaderRgbaDataLength(new Uint8Array(15), 2, 2),
    ).toThrow(/does not match/);
  });
});
