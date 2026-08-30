import { Directory, File, Paths } from "expo-file-system";
import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import type {
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
} from "../../modules/nemu-aidoku/src/NemuAidoku.types";
import {
  createMobileNativeHttpRequestId,
  runAbortableMobileNativeHttpRequest,
} from "./mobileNativeHttpAbort";
import {
  assertMobileNativeHttpCapability,
  resolveMobileNativeHttpCapabilityStatus,
} from "./mobileNativeHttpCapabilities";
import {
  MOBILE_IMAGE_MAX_DECODED_PIXELS,
  MOBILE_IMAGE_MAX_DIMENSION,
} from "@/lib/mobileImageMetadataSafety";
import {
  getNativeSegmentedImagePayloadByteLimit,
  isNativeSegmentedImageTileWithinPolicy,
} from "@/data/nativeSegmentedImageCache";
import { collectNativeSegmentTemporaryUrisForCleanup } from "./mobileNativeHttpFileCleanup";

export type MobileNativeHttpFileRequest = Omit<
  NemuAidokuHttpFileRequest,
  "requestId"
>;
type MobileNativeHttpResponseBase = Omit<
  NemuAidokuHttpFileResponse,
  | "kind"
  | "fileUri"
  | "byteLength"
  | "manifestVersion"
  | "imageWidth"
  | "imageHeight"
  | "imageSegments"
>;

export type MobileNativeHttpFileResponse = MobileNativeHttpResponseBase & {
  kind: "file";
  fileUri: string;
  byteLength: number;
};

export type MobileNativeHttpImageSegment = Readonly<{
  fileUri: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
}>;

export type MobileNativeHttpSegmentedImageResponse =
  MobileNativeHttpResponseBase & {
    kind: "segmented-image";
    byteLength: number;
    manifestVersion: 1;
    imageWidth: number;
    imageHeight: number;
    imageSegments: MobileNativeHttpImageSegment[];
  };

export type MobileNativeHttpDownloadResponse =
  | MobileNativeHttpFileResponse
  | MobileNativeHttpSegmentedImageResponse;

const MAX_SEGMENTED_IMAGE_PIXELS = 64 * 1024 * 1024;
const MAX_SEGMENTED_IMAGE_LONG_SIDE = 65_535;
const MAX_SEGMENTED_IMAGE_SHORT_SIDE = 2_048;
const MAX_SEGMENTED_IMAGE_TILES = 32;
const NATIVE_HTTP_TEMP_DIRECTORY_URI = new Directory(
  Paths.cache,
  "nemu-native-http-downloads",
).uri.replace(/\/+$/, "");
const NATIVE_HTTP_TEMP_FILE_PATTERN =
  /^nemu-http-(?:\d+|output-\d+|output-segment-\d{2}-\d+)\.part$/;

function isOwnedNativeTemporaryFileUri(fileUri: string): boolean {
  const prefix = `${NATIVE_HTTP_TEMP_DIRECTORY_URI}/`;
  if (!fileUri.startsWith(prefix)) return false;
  const name = fileUri.slice(prefix.length);
  return !name.includes("/") && NATIVE_HTTP_TEMP_FILE_PATTERN.test(name);
}

function removeNativeTemporaryFile(fileUri: string | null): void {
  if (!fileUri || !isOwnedNativeTemporaryFileUri(fileUri)) return;
  try {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  } catch {
    // The native side owns partial-file cleanup. This is only the final guard
    // for an abort that races with a successful bridge response.
  }
}

export async function downloadMobileNativeHttpFile(
  request: MobileNativeHttpFileRequest,
  signal?: AbortSignal | null,
): Promise<MobileNativeHttpDownloadResponse> {
  if (
    !Number.isSafeInteger(request.maxResponseBytes) ||
    request.maxResponseBytes <= 0
  ) {
    throw new Error("Invalid native HTTP file byte limit.");
  }
  if (request.requireHttps === true) {
    let protocol = "";
    try {
      protocol = new URL(request.url).protocol;
    } catch {
      // Native performs the authoritative destination/SSRF validation. This
      // early check only prevents a clearly non-HTTPS executable request from
      // ever entering the bridge.
    }
    if (protocol !== "https:") {
      throw new Error("This native HTTP file request requires HTTPS.");
    }
  }
  const hasImageDimension = request.maxImageDimension != null;
  const hasImagePixels = request.maxImagePixels != null;
  if (
    hasImageDimension !== hasImagePixels ||
    (request.allowLongStripSegments === true && !hasImageDimension) ||
    (hasImageDimension &&
      (!Number.isSafeInteger(request.maxImageDimension) ||
        request.maxImageDimension! <= 0 ||
        request.maxImageDimension! > MOBILE_IMAGE_MAX_DIMENSION ||
        !Number.isSafeInteger(request.maxImagePixels) ||
        request.maxImagePixels! <= 0 ||
        request.maxImagePixels! > MOBILE_IMAGE_MAX_DECODED_PIXELS))
  ) {
    throw new Error("Invalid native HTTP image dimension limit.");
  }
  assertMobileNativeHttpCapability(
    resolveMobileNativeHttpCapabilityStatus(
      NemuAidokuModule.getHttpClientStatus(),
      NemuAidokuModule,
    ),
  );

  const requestId = createMobileNativeHttpRequestId();
  let nativeFileUri: string | null = null;
  let nativeSegmentUris: string[] = [];
  let completed = false;
  try {
    const response = await runAbortableMobileNativeHttpRequest({
      requestId,
      signal,
      prepare: (id) => {
        NemuAidokuModule.prepareHttpRequest(id);
      },
      cancel: (id) => {
        NemuAidokuModule.cancelHttpRequest(id);
      },
      release: (id) => {
        NemuAidokuModule.releaseHttpRequest(id);
      },
      execute: async () => {
        const value = await NemuAidokuModule.downloadHttpFile({
          ...request,
          requestId,
        });
        nativeFileUri = value.fileUri?.trim() || null;
        // Collect owned members before trusting the discriminant or count so
        // every rejected/malformed bridge response still gets cleaned up.
        nativeSegmentUris = collectNativeSegmentTemporaryUrisForCleanup(
          value.imageSegments,
          isOwnedNativeTemporaryFileUri,
        );
        return value;
      },
    });

    if (response.status < 200 || response.status >= 300 || response.error) {
      throw new Error(
        response.error ||
          `Native HTTP file download failed with status ${response.status}.`,
      );
    }
    if (
      response.kind != null &&
      response.kind !== "file" &&
      response.kind !== "segmented-image"
    ) {
      throw new Error("Native HTTP file response kind is unsupported.");
    }

    if (response.kind === "segmented-image") {
      const segments = response.imageSegments;
      if (
        nativeFileUri != null ||
        request.allowLongStripSegments !== true ||
        response.manifestVersion !== 1 ||
        !Number.isSafeInteger(response.imageWidth) ||
        !Number.isSafeInteger(response.imageHeight) ||
        (response.imageWidth ?? 0) <= 0 ||
        (response.imageHeight ?? 0) <= 0 ||
        (response.imageWidth ?? 0) > MAX_SEGMENTED_IMAGE_SHORT_SIDE ||
        (response.imageHeight ?? 0) > MAX_SEGMENTED_IMAGE_LONG_SIDE ||
        (response.imageHeight ?? 0) < (response.imageWidth ?? 0) * 8 ||
        (response.imageWidth ?? 0) * (response.imageHeight ?? 0) >
          MAX_SEGMENTED_IMAGE_PIXELS ||
        !Number.isSafeInteger(response.byteLength) ||
        (response.byteLength ?? 0) <= 0 ||
        (response.byteLength ?? 0) >
          getNativeSegmentedImagePayloadByteLimit(request.maxResponseBytes) ||
        !Array.isArray(segments) ||
        segments.length < 1 ||
        segments.length > MAX_SEGMENTED_IMAGE_TILES
      ) {
        throw new Error("Native segmented image response is invalid.");
      }
      const seenUris = new Set<string>();
      let aggregateBytes = 0;
      let aggregateHeight = 0;
      let mimeType: "image/jpeg" | "image/png" | null = null;
      const validatedSegments: MobileNativeHttpImageSegment[] = [];
      for (const segment of segments) {
        if (!segment || typeof segment !== "object") {
          throw new Error("Native segmented image tile is invalid.");
        }
        const uri =
          typeof segment.fileUri === "string" ? segment.fileUri.trim() : "";
        if (
          !isOwnedNativeTemporaryFileUri(uri) ||
          seenUris.has(uri) ||
          !Number.isSafeInteger(segment.byteLength) ||
          segment.byteLength <= 0 ||
          segment.width !== response.imageWidth ||
          !isNativeSegmentedImageTileWithinPolicy(segment, {
            maxDimension: request.maxImageDimension!,
            maxPixels: request.maxImagePixels!,
          }) ||
          (segment.mimeType !== "image/png" &&
            segment.mimeType !== "image/jpeg") ||
          (mimeType != null && segment.mimeType !== mimeType) ||
          segment.byteLength > request.maxResponseBytes - aggregateBytes ||
          segment.height > (response.imageHeight ?? 0) - aggregateHeight
        ) {
          throw new Error("Native segmented image tile is invalid.");
        }
        seenUris.add(uri);
        mimeType = segment.mimeType;
        aggregateBytes += segment.byteLength;
        aggregateHeight += segment.height;
        validatedSegments.push({ ...segment, fileUri: uri });
      }
      if (
        aggregateBytes !== response.byteLength ||
        aggregateHeight !== response.imageHeight
      ) {
        throw new Error("Native segmented image aggregate is inconsistent.");
      }
      completed = true;
      return {
        ...response,
        kind: "segmented-image",
        byteLength: response.byteLength!,
        manifestVersion: 1,
        imageWidth: response.imageWidth!,
        imageHeight: response.imageHeight!,
        imageSegments: validatedSegments,
      };
    }

    if (
      !nativeFileUri ||
      (response.imageSegments != null &&
        (!Array.isArray(response.imageSegments) ||
          response.imageSegments.length !== 0)) ||
      !isOwnedNativeTemporaryFileUri(nativeFileUri) ||
      !Number.isSafeInteger(response.byteLength) ||
      (response.byteLength ?? 0) <= 0 ||
      (response.byteLength ?? 0) > request.maxResponseBytes
    ) {
      throw new Error("Native HTTP file response is invalid.");
    }

    completed = true;
    return {
      ...response,
      kind: "file",
      fileUri: nativeFileUri,
      byteLength: response.byteLength!,
    };
  } finally {
    if (!completed) {
      removeNativeTemporaryFile(nativeFileUri);
      nativeSegmentUris.forEach(removeNativeTemporaryFile);
    }
  }
}
