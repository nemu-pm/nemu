export const MOBILE_IMAGE_MAX_DIMENSION = 16_384;
export const MOBILE_IMAGE_MAX_DECODED_PIXELS = 8 * 1_024 * 1_024;
export const MOBILE_IMAGE_MAX_HEADER_BYTES = 1 * 1_024 * 1_024;

export type MobileImageFormat = "avif" | "gif" | "heic" | "jpeg" | "png" | "webp";

export type MobileImageDimensions = {
  format: MobileImageFormat;
  width: number;
  height: number;
  pixelCount: number;
};

export type MobileImageMetadataSafetyOptions = {
  maxDimension?: number;
  maxPixels?: number;
  completeFile?: boolean;
};

const ISO_IMAGE_BRANDS = new Set([
  "avif",
  "avis",
  "heic",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);

const BASE64_VALUES = new Int16Array(128).fill(-1);
for (let index = 0; index < 26; index += 1) {
  BASE64_VALUES[0x41 + index] = index;
  BASE64_VALUES[0x61 + index] = index + 26;
}
for (let index = 0; index < 10; index += 1) {
  BASE64_VALUES[0x30 + index] = index + 52;
}
BASE64_VALUES[0x2b] = 62;
BASE64_VALUES[0x2f] = 63;

function byte(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset >= bytes.byteLength) {
    throw new Error("Truncated image header.");
  }
  return bytes[offset]!;
}

function matchesAscii(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  if (offset < 0 || offset + expected.length > bytes.byteLength) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function matchesBytes(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (offset < 0 || offset + expected.length > bytes.byteLength) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return "";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]!);
  }
  return value;
}

function be16(bytes: Uint8Array, offset: number): number {
  return (byte(bytes, offset) << 8) | byte(bytes, offset + 1);
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    byte(bytes, offset) * 0x1_00_00_00 +
    (byte(bytes, offset + 1) << 16) +
    (byte(bytes, offset + 2) << 8) +
    byte(bytes, offset + 3)
  );
}

function le16(bytes: Uint8Array, offset: number): number {
  return byte(bytes, offset) | (byte(bytes, offset + 1) << 8);
}

function le24(bytes: Uint8Array, offset: number): number {
  return (
    byte(bytes, offset) |
    (byte(bytes, offset + 1) << 8) |
    (byte(bytes, offset + 2) << 16)
  );
}

type HeaderDimensions = {
  format: MobileImageFormat;
  width: number;
  height: number;
};

function inspectPng(bytes: Uint8Array): HeaderDimensions[] {
  if (bytes.byteLength < 24 || !matchesAscii(bytes, 12, "IHDR")) {
    throw new Error("Malformed PNG image header.");
  }
  return [{ format: "png", width: be32(bytes, 16), height: be32(bytes, 20) }];
}

function skipGifSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.byteLength) {
    const length = bytes[offset]!;
    offset += 1;
    if (length === 0) return offset;
    if (offset + length > bytes.byteLength) {
      throw new Error("Truncated GIF data block.");
    }
    offset += length;
  }
  throw new Error("Truncated GIF data block.");
}

function inspectGif(
  bytes: Uint8Array,
  completeFile: boolean,
): HeaderDimensions[] {
  if (!completeFile) {
    throw new Error("GIF image safety requires the complete bounded container.");
  }
  if (bytes.byteLength < 13) throw new Error("Malformed GIF image header.");
  const canvas = { format: "gif" as const, width: le16(bytes, 6), height: le16(bytes, 8) };
  let offset = 13;
  const logicalScreenPacked = bytes[10]!;
  if ((logicalScreenPacked & 0x80) !== 0) {
    offset += 3 * (1 << ((logicalScreenPacked & 0x07) + 1));
  }
  if (offset > bytes.byteLength) throw new Error("Malformed GIF color table.");

  const dimensions: HeaderDimensions[] = [canvas];
  let frameCount = 0;
  while (offset < bytes.byteLength) {
    const blockType = bytes[offset]!;
    if (blockType === 0x3b) {
      if (frameCount !== 1) {
        throw new Error("Animated or empty GIF images are not supported safely.");
      }
      return dimensions;
    }
    if (blockType === 0x21) {
      if (offset + 2 > bytes.byteLength) throw new Error("Malformed GIF extension.");
      offset = skipGifSubBlocks(bytes, offset + 2);
      continue;
    }
    if (blockType !== 0x2c || offset + 10 > bytes.byteLength) {
      throw new Error("Malformed GIF block stream.");
    }
    frameCount += 1;
    if (frameCount > 1) {
      throw new Error("Animated GIF images are not supported safely.");
    }
    const left = le16(bytes, offset + 1);
    const top = le16(bytes, offset + 3);
    const frame = {
      format: "gif" as const,
      width: le16(bytes, offset + 5),
      height: le16(bytes, offset + 7),
    };
    if (left + frame.width > canvas.width || top + frame.height > canvas.height) {
      throw new Error("GIF frame exceeds its logical screen.");
    }
    dimensions.push(frame);
    const framePacked = bytes[offset + 9]!;
    offset += 10;
    if ((framePacked & 0x80) !== 0) {
      offset += 3 * (1 << ((framePacked & 0x07) + 1));
    }
    if (offset >= bytes.byteLength) throw new Error("Malformed GIF image data.");
    offset += 1;
    offset = skipGifSubBlocks(bytes, offset);
  }
  throw new Error("GIF image is missing its trailer.");
}

function isJpegStartOfFrame(marker: number): boolean {
  return [
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ].includes(marker);
}

function inspectJpeg(bytes: Uint8Array): HeaderDimensions[] {
  let offset = 2;
  while (offset < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.byteLength) break;
    const segmentLength = be16(bytes, offset);
    if (segmentLength < 2) throw new Error("Malformed JPEG image header.");
    if (offset + segmentLength > bytes.byteLength) break;
    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) throw new Error("Malformed JPEG frame header.");
      return [{
        format: "jpeg",
        width: be16(bytes, offset + 5),
        height: be16(bytes, offset + 3),
      }];
    }
    offset += segmentLength;
  }
  throw new Error("JPEG dimensions were not found in the bounded header.");
}

function inspectWebP(bytes: Uint8Array): HeaderDimensions[] {
  if (bytes.byteLength < 20) throw new Error("Malformed WebP image header.");
  if (matchesAscii(bytes, 12, "VP8X")) {
    if (bytes.byteLength < 30) throw new Error("Malformed extended WebP header.");
    if (
      (bytes[20]! & 0x02) !== 0 ||
      bytes.some((_, offset) =>
        matchesAscii(bytes, offset, "ANIM") || matchesAscii(bytes, offset, "ANMF"))
    ) {
      throw new Error("Animated WebP images are not supported safely.");
    }
    return [{
      format: "webp",
      width: le24(bytes, 24) + 1,
      height: le24(bytes, 27) + 1,
    }];
  }
  if (matchesAscii(bytes, 12, "VP8 ")) {
    if (
      bytes.byteLength < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      throw new Error("Malformed lossy WebP header.");
    }
    return [{
      format: "webp",
      width: le16(bytes, 26) & 0x3fff,
      height: le16(bytes, 28) & 0x3fff,
    }];
  }
  if (matchesAscii(bytes, 12, "VP8L")) {
    if (bytes.byteLength < 25 || bytes[20] !== 0x2f) {
      throw new Error("Malformed lossless WebP header.");
    }
    const b1 = bytes[21]!;
    const b2 = bytes[22]!;
    const b3 = bytes[23]!;
    const b4 = bytes[24]!;
    return [{
      format: "webp",
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    }];
  }
  throw new Error("Unsupported WebP image header.");
}

function inspectIsoBaseMedia(bytes: Uint8Array): HeaderDimensions[] {
  if (bytes.byteLength < 16) throw new Error("Malformed ISO image header.");
  const ftypSize = be32(bytes, 0);
  if (ftypSize < 16 || ftypSize > bytes.byteLength) {
    throw new Error("Malformed ISO image brand box.");
  }
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
    brands.push(ascii(bytes, offset, 4));
  }
  if (!brands.some((brand) => ISO_IMAGE_BRANDS.has(brand))) {
    throw new Error("Unsupported ISO image brand.");
  }
  if (brands.some((brand) => brand === "avis" || brand === "msf1")) {
    throw new Error("Animated ISO image sequences are not supported safely.");
  }
  const format: MobileImageFormat = brands.some((brand) =>
    brand.startsWith("av")) ? "avif" : "heic";
  const dimensions: HeaderDimensions[] = [];
  for (let typeOffset = 4; typeOffset + 16 <= bytes.byteLength; typeOffset += 1) {
    if (!matchesAscii(bytes, typeOffset, "ispe")) continue;
    const boxStart = typeOffset - 4;
    const boxSize = be32(bytes, boxStart);
    if (boxSize < 20 || boxStart + boxSize > bytes.byteLength) continue;
    dimensions.push({
      format,
      width: be32(bytes, typeOffset + 8),
      height: be32(bytes, typeOffset + 12),
    });
  }
  if (dimensions.length === 0) {
    throw new Error("ISO image dimensions were not found in the bounded header.");
  }
  return dimensions;
}

function inspectMobileImageHeader(
  bytes: Uint8Array,
  completeFile: boolean,
): HeaderDimensions[] {
  const header = bytes.byteLength > MOBILE_IMAGE_MAX_HEADER_BYTES
    ? bytes.subarray(0, MOBILE_IMAGE_MAX_HEADER_BYTES)
    : bytes;
  if (matchesBytes(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return inspectPng(header);
  }
  if (matchesAscii(header, 0, "GIF87a") || matchesAscii(header, 0, "GIF89a")) {
    return inspectGif(header, completeFile);
  }
  if (header.byteLength >= 2 && header[0] === 0xff && header[1] === 0xd8) {
    return inspectJpeg(header);
  }
  if (matchesAscii(header, 0, "RIFF") && matchesAscii(header, 8, "WEBP")) {
    return inspectWebP(header);
  }
  if (matchesAscii(header, 4, "ftyp")) return inspectIsoBaseMedia(header);
  throw new Error("Unsupported or malformed image header.");
}

export function assertMobileImageMetadataSafety(
  bytes: Uint8Array,
  label = "Image",
  options: MobileImageMetadataSafetyOptions = {},
): MobileImageDimensions {
  const maxDimension = options.maxDimension ?? MOBILE_IMAGE_MAX_DIMENSION;
  const maxPixels = options.maxPixels ?? MOBILE_IMAGE_MAX_DECODED_PIXELS;
  if (
    !Number.isSafeInteger(maxDimension) ||
    !Number.isSafeInteger(maxPixels) ||
    maxDimension <= 0 ||
    maxPixels <= 0 ||
    maxDimension > MOBILE_IMAGE_MAX_DIMENSION ||
    maxPixels > MOBILE_IMAGE_MAX_DECODED_PIXELS
  ) {
    throw new Error("Invalid image metadata safety policy.");
  }
  const completeFile = options.completeFile ??
    bytes.byteLength <= MOBILE_IMAGE_MAX_HEADER_BYTES;
  const dimensions = inspectMobileImageHeader(bytes, completeFile).map((dimension) => {
    const pixelCount = dimension.width * dimension.height;
    if (
      !Number.isSafeInteger(dimension.width) ||
      !Number.isSafeInteger(dimension.height) ||
      !Number.isSafeInteger(pixelCount) ||
      dimension.width <= 0 ||
      dimension.height <= 0 ||
      dimension.width > maxDimension ||
      dimension.height > maxDimension ||
      pixelCount > maxPixels
    ) {
      throw new Error(
        `${label} exceeds the ${maxDimension}px / ${maxPixels} pixel safety limit.`,
      );
    }
    return { ...dimension, pixelCount };
  });
  return dimensions.reduce((largest, candidate) =>
    candidate.pixelCount > largest.pixelCount ? candidate : largest);
}

/** Decodes only the bounded metadata prefix, never the complete data URI. */
export function decodeMobileImageBase64Header(
  value: string,
  payloadStart = 0,
): Uint8Array {
  if (!Number.isSafeInteger(payloadStart) || payloadStart < 0 || payloadStart >= value.length) {
    throw new Error("Invalid base64 image payload.");
  }
  const output = new Uint8Array(
    Math.min(
      MOBILE_IMAGE_MAX_HEADER_BYTES,
      Math.floor(((value.length - payloadStart) * 3) / 4),
    ),
  );
  let outputOffset = 0;
  let bits = 0;
  let bitCount = 0;
  for (
    let index = payloadStart;
    index < value.length && outputOffset < output.length;
    index += 1
  ) {
    const code = value.charCodeAt(index);
    if (code === 0x3d) break;
    const sextet = code < BASE64_VALUES.length ? BASE64_VALUES[code]! : -1;
    if (sextet < 0) throw new Error("Invalid base64 image payload.");
    bits = (bits << 6) | sextet;
    bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    output[outputOffset] = (bits >> bitCount) & 0xff;
    outputOffset += 1;
    bits &= bitCount === 0 ? 0 : (1 << bitCount) - 1;
  }
  if (outputOffset <= 0) throw new Error("Invalid base64 image payload.");
  return output.subarray(0, outputOffset);
}

export function assertMobileBase64ImageMetadataSafety(
  value: string,
  payloadStart = 0,
  label = "Base64 image",
): MobileImageDimensions {
  const payloadLength = value.length - payloadStart;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decodedByteLength = Math.floor((payloadLength * 3) / 4) - padding;
  return assertMobileImageMetadataSafety(
    decodeMobileImageBase64Header(value, payloadStart),
    label,
    { completeFile: decodedByteLength <= MOBILE_IMAGE_MAX_HEADER_BYTES },
  );
}
