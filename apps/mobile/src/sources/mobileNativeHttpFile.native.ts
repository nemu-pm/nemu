import { File } from "expo-file-system";
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

export type MobileNativeHttpFileRequest = Omit<
  NemuAidokuHttpFileRequest,
  "requestId"
>;
export type MobileNativeHttpFileResponse = NemuAidokuHttpFileResponse & {
  fileUri: string;
  byteLength: number;
};

function removeNativeTemporaryFile(fileUri: string | null): void {
  if (!fileUri) return;
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
): Promise<MobileNativeHttpFileResponse> {
  if (!Number.isSafeInteger(request.maxResponseBytes) || request.maxResponseBytes <= 0) {
    throw new Error("Invalid native HTTP file byte limit.");
  }
  const hasImageDimension = request.maxImageDimension != null;
  const hasImagePixels = request.maxImagePixels != null;
  if (
    hasImageDimension !== hasImagePixels ||
    (hasImageDimension && (
      !Number.isSafeInteger(request.maxImageDimension) ||
      request.maxImageDimension! <= 0 ||
      request.maxImageDimension! > MOBILE_IMAGE_MAX_DIMENSION ||
      !Number.isSafeInteger(request.maxImagePixels) ||
      request.maxImagePixels! <= 0 ||
      request.maxImagePixels! > MOBILE_IMAGE_MAX_DECODED_PIXELS
    ))
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
        return value;
      },
    });

    if (
      response.status < 200 ||
      response.status >= 300 ||
      response.error ||
      !nativeFileUri ||
      !Number.isSafeInteger(response.byteLength) ||
      (response.byteLength ?? 0) <= 0 ||
      (response.byteLength ?? 0) > request.maxResponseBytes
    ) {
      throw new Error(
        response.error ||
          `Native HTTP file download failed with status ${response.status}.`,
      );
    }

    completed = true;
    return {
      ...response,
      fileUri: nativeFileUri,
      byteLength: response.byteLength!,
    };
  } finally {
    if (!completed) removeNativeTemporaryFile(nativeFileUri);
  }
}
