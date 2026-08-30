export const NATIVE_SEGMENTED_IMAGE_MANIFEST_VERSION = 1 as const;
export const NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES = 64 * 1024;
export const NATIVE_SEGMENTED_IMAGE_MAX_TILES = 32;
export const NATIVE_SEGMENTED_IMAGE_MAX_PIXELS = 64 * 1024 * 1024;
export const NATIVE_SEGMENTED_IMAGE_MAX_LONG_SIDE = 65_535;
export const NATIVE_SEGMENTED_IMAGE_MAX_SHORT_SIDE = 2_048;
export const NATIVE_SEGMENTED_IMAGE_TARGET_TILE_PIXELS = 2 * 1024 * 1024;
// JPEG source boundaries are aligned to at most one 32-row MCU. The final
// encoded tile can therefore carry at most 31 extra rows beyond the target.
export const NATIVE_SEGMENTED_IMAGE_MAX_TILE_PIXELS =
  NATIVE_SEGMENTED_IMAGE_TARGET_TILE_PIXELS +
  31 * NATIVE_SEGMENTED_IMAGE_MAX_SHORT_SIDE;

export function getNativeSegmentedImagePayloadByteLimit(
  maximumEntryBytes: number,
): number {
  if (!Number.isSafeInteger(maximumEntryBytes) || maximumEntryBytes <= 0) {
    return 0;
  }
  return Math.max(
    0,
    maximumEntryBytes - NATIVE_SEGMENTED_IMAGE_MANIFEST_MAX_BYTES,
  );
}

export function isNativeSegmentedImageTileWithinPolicy(
  tile: { width: number; height: number },
  policy: { maxDimension: number; maxPixels: number },
): boolean {
  return (
    Number.isSafeInteger(tile.width) &&
    tile.width > 0 &&
    Number.isSafeInteger(tile.height) &&
    tile.height > 0 &&
    Number.isSafeInteger(policy.maxDimension) &&
    policy.maxDimension > 0 &&
    Number.isSafeInteger(policy.maxPixels) &&
    policy.maxPixels > 0 &&
    tile.width <= policy.maxDimension &&
    tile.height <= policy.maxDimension &&
    tile.width * tile.height <= policy.maxPixels &&
    tile.width * tile.height <= NATIVE_SEGMENTED_IMAGE_MAX_TILE_PIXELS
  );
}

const SEGMENT_GENERATION_PATTERN =
  /^([a-z0-9]{10})-([a-z0-9]{6})-([a-z0-9]{10})$/;

export type NativeSegmentedImageCacheMember = Readonly<{
  fileName: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
}>;

export type NativeSegmentedImageCacheManifest = Readonly<{
  kind: "nemu-segmented-image";
  manifestVersion: 1;
  generation: string;
  byteLength: number;
  width: number;
  height: number;
  segments: ReadonlyArray<NativeSegmentedImageCacheMember>;
}>;

const isSafePositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Generates a lexicographically monotonic cache generation even when the
 * device clock moves backwards. The fixed-width first field is the ordering
 * key; lease fields only disambiguate publishers at the same ordinal.
 */
export function nextNativeSegmentedImageGeneration(input: {
  now: number;
  previousGeneration?: string | null;
  epoch: number;
  token: number;
}): string {
  const previousMatch = input.previousGeneration
    ? SEGMENT_GENERATION_PATTERN.exec(input.previousGeneration)
    : null;
  const previousOrdinal = previousMatch
    ? Number.parseInt(previousMatch[1]!, 36)
    : -1;
  if (
    previousMatch &&
    ![
      previousOrdinal,
      Number.parseInt(previousMatch[2]!, 36),
      Number.parseInt(previousMatch[3]!, 36),
    ].every(Number.isSafeInteger)
  ) {
    throw new Error("Invalid previous segmented image cache generation.");
  }
  const roundedNow = Math.max(0, Math.floor(input.now));
  const ordinal = Math.max(
    roundedNow,
    Number.isSafeInteger(previousOrdinal) ? previousOrdinal + 1 : 0,
  );
  if (
    !Number.isSafeInteger(ordinal) ||
    !Number.isSafeInteger(input.epoch) ||
    input.epoch < 0 ||
    !Number.isSafeInteger(input.token) ||
    input.token < 0
  ) {
    throw new Error("Invalid segmented image cache generation.");
  }
  return `${ordinal.toString(36).padStart(10, "0")}-${input.epoch
    .toString(36)
    .padStart(6, "0")}-${input.token.toString(36).padStart(10, "0")}`;
}

export function parseNativeSegmentedImageCacheManifest(
  raw: unknown,
  expectedEncodedKey: string,
  maximumEncodedBytes: number,
): NativeSegmentedImageCacheManifest | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    maximumEncodedBytes <= 0 ||
    !Number.isSafeInteger(maximumEncodedBytes)
  ) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const generation =
    typeof value.generation === "string" ? value.generation : null;
  const generationMatch = generation
    ? SEGMENT_GENERATION_PATTERN.exec(generation)
    : null;
  const generationFieldsAreSafe = Boolean(
    generationMatch &&
    generationMatch
      .slice(1)
      .map((field) => Number.parseInt(field, 36))
      .every(Number.isSafeInteger),
  );
  if (
    value.kind !== "nemu-segmented-image" ||
    value.manifestVersion !== NATIVE_SEGMENTED_IMAGE_MANIFEST_VERSION ||
    !generationMatch ||
    !generationFieldsAreSafe ||
    !isSafePositiveInteger(value.byteLength) ||
    value.byteLength > maximumEncodedBytes ||
    !isSafePositiveInteger(value.width) ||
    value.width > NATIVE_SEGMENTED_IMAGE_MAX_SHORT_SIDE ||
    !isSafePositiveInteger(value.height) ||
    value.height > NATIVE_SEGMENTED_IMAGE_MAX_LONG_SIDE ||
    value.height < value.width * 8 ||
    value.width * value.height > NATIVE_SEGMENTED_IMAGE_MAX_PIXELS ||
    !Array.isArray(value.segments) ||
    value.segments.length < 1 ||
    value.segments.length > NATIVE_SEGMENTED_IMAGE_MAX_TILES
  ) {
    return null;
  }

  const filePattern = new RegExp(
    `^${escapeRegularExpression(expectedEncodedKey)}\\.segment-v1-${escapeRegularExpression(generation!)}-(\\d{2})\\.(png|jpg)$`,
  );
  const seenNames = new Set<string>();
  const segments: NativeSegmentedImageCacheMember[] = [];
  let aggregateBytes = 0;
  let aggregateHeight = 0;
  let expectedMimeType: "image/jpeg" | "image/png" | null = null;
  for (let index = 0; index < value.segments.length; index += 1) {
    const rawSegment = value.segments[index];
    if (!rawSegment || typeof rawSegment !== "object") return null;
    const segment = rawSegment as Record<string, unknown>;
    const match =
      typeof segment.fileName === "string"
        ? filePattern.exec(segment.fileName)
        : null;
    const mimeType = segment.mimeType;
    if (
      !match ||
      Number(match[1]) !== index ||
      seenNames.has(segment.fileName as string) ||
      !isSafePositiveInteger(segment.byteLength) ||
      segment.byteLength > maximumEncodedBytes - aggregateBytes ||
      !isSafePositiveInteger(segment.width) ||
      segment.width !== value.width ||
      !isSafePositiveInteger(segment.height) ||
      segment.height > 16_384 ||
      segment.width * segment.height > NATIVE_SEGMENTED_IMAGE_MAX_TILE_PIXELS ||
      segment.height > value.height - aggregateHeight ||
      (mimeType !== "image/png" && mimeType !== "image/jpeg") ||
      (match[2] === "png" && mimeType !== "image/png") ||
      (match[2] === "jpg" && mimeType !== "image/jpeg") ||
      (expectedMimeType != null && mimeType !== expectedMimeType)
    ) {
      return null;
    }
    seenNames.add(segment.fileName as string);
    aggregateBytes += segment.byteLength;
    aggregateHeight += segment.height;
    expectedMimeType = mimeType;
    segments.push({
      fileName: segment.fileName as string,
      byteLength: segment.byteLength,
      width: segment.width,
      height: segment.height,
      mimeType,
    });
  }
  if (aggregateBytes !== value.byteLength || aggregateHeight !== value.height) {
    return null;
  }
  return {
    kind: "nemu-segmented-image",
    manifestVersion: NATIVE_SEGMENTED_IMAGE_MANIFEST_VERSION,
    generation: generation!,
    byteLength: value.byteLength,
    width: value.width,
    height: value.height,
    segments,
  };
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
