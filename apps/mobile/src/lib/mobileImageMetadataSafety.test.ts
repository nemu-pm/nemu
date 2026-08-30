import { describe, expect, test } from "bun:test";
import {
  MOBILE_IMAGE_MAX_DECODED_PIXELS,
  MOBILE_IMAGE_MAX_DIMENSION,
  MOBILE_IMAGE_MAX_HEADER_BYTES,
  assertMobileBase64ImageMetadataSafety,
  assertMobileImageMetadataSafety,
  decodeMobileImageBase64Header,
} from "./mobileImageMetadataSafety";

function writeBe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeLe24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function ascii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  ascii(bytes, 12, "IHDR");
  writeBe32(bytes, 16, width);
  writeBe32(bytes, 20, height);
  return bytes;
}

function gif(width: number, height: number, frameCount = 1): Uint8Array {
  const bytes = new Uint8Array(13 + 6 + frameCount * 14 + 1);
  ascii(bytes, 0, "GIF89a");
  bytes[6] = width & 0xff;
  bytes[7] = (width >>> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >>> 8) & 0xff;
  bytes[10] = 0x80;
  let offset = 19;
  for (let index = 0; index < frameCount; index += 1) {
    bytes[offset] = 0x2c;
    bytes[offset + 5] = width & 0xff;
    bytes[offset + 6] = (width >>> 8) & 0xff;
    bytes[offset + 7] = height & 0xff;
    bytes[offset + 8] = (height >>> 8) & 0xff;
    bytes[offset + 10] = 0x02;
    bytes[offset + 11] = 0x01;
    bytes[offset + 12] = 0x00;
    bytes[offset + 13] = 0x00;
    offset += 14;
  }
  bytes[offset] = 0x3b;
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc2, 0x00, 0x07, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
  ]);
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  ascii(bytes, 0, "RIFF");
  ascii(bytes, 8, "WEBP");
  ascii(bytes, 12, "VP8X");
  writeLe24(bytes, 24, width - 1);
  writeLe24(bytes, 27, height - 1);
  return bytes;
}

function isoImage(
  brand: "avif" | "heic",
  dimensions: Array<{ width: number; height: number }>,
): Uint8Array {
  const ftypSize = 24;
  const bytes = new Uint8Array(ftypSize + dimensions.length * 20);
  writeBe32(bytes, 0, ftypSize);
  ascii(bytes, 4, "ftyp");
  ascii(bytes, 8, brand);
  ascii(bytes, 16, "mif1");
  ascii(bytes, 20, brand);
  dimensions.forEach((dimension, index) => {
    const offset = ftypSize + index * 20;
    writeBe32(bytes, offset, 20);
    ascii(bytes, offset + 4, "ispe");
    writeBe32(bytes, offset + 12, dimension.width);
    writeBe32(bytes, offset + 16, dimension.height);
  });
  return bytes;
}

describe("mobile decoded-image metadata safety", () => {
  test("accepts common image headers without decoding pixels", () => {
    const fixtures = [
      [png(2_000, 3_000), "png"],
      [gif(2_000, 3_000), "gif"],
      [jpeg(2_000, 3_000), "jpeg"],
      [webp(2_000, 3_000), "webp"],
      [isoImage("avif", [{ width: 2_000, height: 3_000 }]), "avif"],
      [isoImage("heic", [{ width: 2_000, height: 3_000 }]), "heic"],
    ] as const;

    for (const [bytes, format] of fixtures) {
      expect(assertMobileImageMetadataSafety(bytes)).toEqual({
        format,
        width: 2_000,
        height: 3_000,
        pixelCount: 6_000_000,
      });
    }
  });

  test("accepts the exact shared boundary", () => {
    expect(MOBILE_IMAGE_MAX_DIMENSION).toBe(16_384);
    expect(MOBILE_IMAGE_MAX_DECODED_PIXELS).toBe(8 * 1_024 * 1_024);
    expect(assertMobileImageMetadataSafety(png(16_384, 512)).pixelCount)
      .toBe(MOBILE_IMAGE_MAX_DECODED_PIXELS);
  });

  test("rejects crafted oversized dimensions in every supported container", () => {
    const oversized = [
      png(16_385, 1),
      gif(16_385, 1),
      jpeg(16_385, 1),
      webp(16_385, 1),
      isoImage("avif", [{ width: 16_385, height: 1 }]),
    ];
    for (const bytes of oversized) {
      expect(() => assertMobileImageMetadataSafety(bytes)).toThrow("safety limit");
    }
    expect(() => assertMobileImageMetadataSafety(png(4_096, 4_096)))
      .toThrow("safety limit");
  });

  test("validates all ISO spatial extents instead of trusting a small decoy", () => {
    const crafted = isoImage("avif", [
      { width: 100, height: 100 },
      { width: 8_192, height: 8_192 },
    ]);
    expect(() => assertMobileImageMetadataSafety(crafted)).toThrow("safety limit");
  });

  test("rejects animated or incomplete containers before native decode", () => {
    expect(() => assertMobileImageMetadataSafety(gif(1_000, 1_000, 2)))
      .toThrow("Animated GIF");
    expect(() => assertMobileImageMetadataSafety(gif(1_000, 1_000), "GIF", {
      completeFile: false,
    })).toThrow("complete bounded container");
    const animatedWebP = webp(1_000, 1_000);
    animatedWebP[20] = 0x02;
    expect(() => assertMobileImageMetadataSafety(animatedWebP))
      .toThrow("Animated WebP");
  });

  test("decodes only a base64 header and applies the same dimension gate", () => {
    const safePayload = Buffer.from(png(1_600, 2_400)).toString("base64");
    const oversizedPayload = Buffer.from(png(16_385, 1)).toString("base64");
    expect(assertMobileBase64ImageMetadataSafety(safePayload)).toMatchObject({
      width: 1_600,
      height: 2_400,
    });
    expect(() => assertMobileBase64ImageMetadataSafety(oversizedPayload))
      .toThrow("safety limit");
    expect(decodeMobileImageBase64Header(`${safePayload}${"A".repeat(2_000_000)}`))
      .toHaveLength(MOBILE_IMAGE_MAX_HEADER_BYTES);
  });

  test("fails closed on zero, malformed, truncated, or unsupported headers", () => {
    expect(() => assertMobileImageMetadataSafety(png(0, 100))).toThrow("safety limit");
    expect(() => assertMobileImageMetadataSafety(Uint8Array.from([0xff, 0xd8])))
      .toThrow("dimensions were not found");
    expect(() => assertMobileImageMetadataSafety(new Uint8Array(24)))
      .toThrow("Unsupported or malformed");
    expect(() => assertMobileBase64ImageMetadataSafety("!!!!"))
      .toThrow("Invalid base64");
  });
});
