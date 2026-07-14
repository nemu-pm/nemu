/** Memory budgets shared by every mobile dual-reader image path. */

export const MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL = 4;
// Decode work is serialized, but the native bridge still materializes encoded
// bytes and base64 before Skia allocates the decoded surface. Eight MiB keeps
// that transient stack bounded consistently with OCR/page processing.
export const MOBILE_DUAL_READER_MAX_ENCODED_BYTES = 8 * 1024 * 1024;
export const MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION = 8192;
export const MOBILE_DUAL_READER_MAX_DECODED_PIXELS = 8 * 1024 * 1024;
export const MOBILE_DUAL_READER_MAX_DECODED_BYTES =
  MOBILE_DUAL_READER_MAX_DECODED_PIXELS *
  MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL;

// Hashing only needs enough spatial detail for content bounds and dHash. Keep
// the JS-visible RGBA allocation to at most 4 MiB even when the source image is
// near the accepted full-image limit.
export const MOBILE_DUAL_READER_HASH_MAX_DIMENSION = 1024;
export const MOBILE_DUAL_READER_HASH_MAX_PIXELS = 1024 * 1024;

export const MOBILE_DUAL_READER_MAX_SURFACE_PIXELS = 8 * 1024 * 1024;
export const MOBILE_DUAL_READER_MAX_SURFACE_BYTES =
  MOBILE_DUAL_READER_MAX_SURFACE_PIXELS *
  MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL;

// Native SkImages/snapshots live outside the JS heap. Bound their aggregate
// estimated RGBA footprint as well as their count in the store.
export const MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS = 12 * 1024 * 1024;
export const MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES =
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS *
  MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL;

export type MobileDualReaderImageCost = {
  width: number;
  height: number;
  pixelCount: number;
  byteSize: number;
};

function checkedDimensions(
  width: number,
  height: number,
  label: string,
): MobileDualReaderImageCost {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`${label} has invalid dimensions ${width}x${height}.`);
  }
  const pixelCount = width * height;
  const byteSize = pixelCount * MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL;
  if (!Number.isSafeInteger(pixelCount) || !Number.isSafeInteger(byteSize)) {
    throw new Error(`${label} dimensions exceed safe integer bounds.`);
  }
  return { width, height, pixelCount, byteSize };
}

export function assertMobileDualReaderEncodedByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MOBILE_DUAL_READER_MAX_ENCODED_BYTES
  ) {
    throw new Error(
      `Dual-reader encoded image exceeds the ${MOBILE_DUAL_READER_MAX_ENCODED_BYTES} byte safety limit.`,
    );
  }
}

export function assertMobileDualReaderDecodedImageBudget(
  width: number,
  height: number,
  label = "Dual-reader decoded image",
): MobileDualReaderImageCost {
  const cost = checkedDimensions(width, height, label);
  if (
    width > MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION ||
    height > MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION ||
    cost.pixelCount > MOBILE_DUAL_READER_MAX_DECODED_PIXELS ||
    cost.byteSize > MOBILE_DUAL_READER_MAX_DECODED_BYTES
  ) {
    throw new Error(
      `${label} exceeds the ${MOBILE_DUAL_READER_MAX_DECODED_PIXELS} pixel / ${MOBILE_DUAL_READER_MAX_DECODED_BYTES} byte safety limit.`,
    );
  }
  return cost;
}

export function assertMobileDualReaderSurfaceBudget(
  width: number,
  height: number,
  label = "Dual-reader surface",
): MobileDualReaderImageCost {
  const cost = checkedDimensions(width, height, label);
  if (
    width > MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION ||
    height > MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION ||
    cost.pixelCount > MOBILE_DUAL_READER_MAX_SURFACE_PIXELS ||
    cost.byteSize > MOBILE_DUAL_READER_MAX_SURFACE_BYTES
  ) {
    throw new Error(
      `${label} exceeds the ${MOBILE_DUAL_READER_MAX_SURFACE_PIXELS} pixel / ${MOBILE_DUAL_READER_MAX_SURFACE_BYTES} byte safety limit.`,
    );
  }
  return cost;
}

export function assertMobileDualReaderRgbaDataLength(
  data: Uint8Array,
  width: number,
  height: number,
): void {
  const cost = assertMobileDualReaderDecodedImageBudget(width, height);
  if (data.byteLength !== cost.byteSize) {
    throw new Error(
      `Dual-reader RGBA length ${data.byteLength} does not match ${cost.byteSize} bytes for ${width}x${height}.`,
    );
  }
}

export function fitMobileDualReaderDimensionsToBudget({
  width,
  height,
  maxDimension,
  maxPixels,
}: {
  width: number;
  height: number;
  maxDimension: number;
  maxPixels: number;
}): { width: number; height: number } {
  const source = checkedDimensions(width, height, "Dual-reader source image");
  const scale = Math.min(
    1,
    maxDimension / width,
    maxDimension / height,
    Math.sqrt(maxPixels / source.pixelCount),
  );
  let fittedWidth = Math.max(1, Math.floor(width * scale));
  let fittedHeight = Math.max(1, Math.floor(height * scale));

  // Floating-point rounding near the exact boundary must fail closed.
  while (fittedWidth * fittedHeight > maxPixels) {
    if (fittedWidth >= fittedHeight && fittedWidth > 1) fittedWidth -= 1;
    else if (fittedHeight > 1) fittedHeight -= 1;
    else break;
  }
  return { width: fittedWidth, height: fittedHeight };
}

export function fitMobileDualReaderHashDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  return fitMobileDualReaderDimensionsToBudget({
    width,
    height,
    maxDimension: MOBILE_DUAL_READER_HASH_MAX_DIMENSION,
    maxPixels: MOBILE_DUAL_READER_HASH_MAX_PIXELS,
  });
}

export function fitMobileDualReaderSurfaceDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const fitted = fitMobileDualReaderDimensionsToBudget({
    width,
    height,
    maxDimension: MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION,
    maxPixels: MOBILE_DUAL_READER_MAX_SURFACE_PIXELS,
  });
  assertMobileDualReaderSurfaceBudget(fitted.width, fitted.height);
  return fitted;
}
