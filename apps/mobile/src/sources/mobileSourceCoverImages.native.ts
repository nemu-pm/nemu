import { Directory, File, Paths } from "expo-file-system";
import {
  forgetMobileAppLocalImageUri,
  registerMobileAppLocalImageUri,
} from "@/lib/mobileAppLocalImageUris";
import {
  MOBILE_IMAGE_MAX_DECODED_PIXELS,
  MOBILE_IMAGE_MAX_DIMENSION,
} from "@/lib/mobileImageMetadataSafety";
import {
  downloadMobileNativeHttpFile,
  releaseMobileNativeHttpFile,
} from "./mobileNativeHttpFile";
import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import {
  isMobileProcessedCoverInputByteLengthAllowed,
  isMobileProcessedCoverOutputByteLengthAllowed,
  makeMobileProcessedCoverFileName,
  makeMobileProcessedCoverStagingFileName,
  selectMobileProcessedCoverEvictions,
  MOBILE_PROCESSED_COVER_DIRECTORY_NAME,
  MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES,
  type MobileProcessedCoverFileStat,
  type MobileProcessedCoverImageRequest,
} from "./mobileSourceCoverProcessing";

export type MobileProcessedCoverSource = Pick<
  MobileAidokuExecutorSource,
  "hasCoverImageProcessor" | "processCoverImage"
>;

export type MobileProcessedCoverInput = {
  source: MobileProcessedCoverSource;
  /** The source's own rewrite for this cover (url plus any headers). */
  request: MobileProcessedCoverImageRequest;
  /** Same identity the image-request cache keys on. */
  cacheKey: string;
  signal?: AbortSignal | null;
};

export type ResolveMobileProcessedCoverUri = (
  input: MobileProcessedCoverInput,
) => Promise<string | null>;

function processedCoverDirectory(): Directory {
  return new Directory(Paths.cache, MOBILE_PROCESSED_COVER_DIRECTORY_NAME);
}

function readProcessedCoverFileStats(
  directory: Directory,
): MobileProcessedCoverFileStat[] {
  const stats: MobileProcessedCoverFileStat[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File)) continue;
    let info: { size?: number | null; modificationTime?: number | null };
    try {
      info = entry.info();
    } catch {
      continue;
    }
    stats.push({
      name: entry.name,
      byteLength: info.size ?? 0,
      modifiedAt: info.modificationTime ?? 0,
    });
  }
  return stats;
}

function pruneProcessedCovers(
  directory: Directory,
  keepNames: readonly string[],
): void {
  try {
    if (!directory.exists) return;
    const evictions = selectMobileProcessedCoverEvictions(
      readProcessedCoverFileStats(directory),
      { now: Date.now(), keepNames },
    );
    for (const name of evictions) {
      try {
        const file = new File(directory, name);
        forgetMobileAppLocalImageUri(file.uri);
        if (file.exists) file.delete();
      } catch {
        // A file the OS is still holding is retried on the next publish.
      }
    }
  } catch {
    // Keeping the cache bounded is best effort; never fail a cover for it.
  }
}

function readPublishedProcessedCover(file: File): string | null {
  try {
    if (!file.exists) return null;
    if (isMobileProcessedCoverOutputByteLengthAllowed(file.info().size ?? 0)) {
      // The render path only trusts a local cover URI the app minted, and a
      // cache hit after a restart has never been registered in this process.
      registerMobileAppLocalImageUri(file.uri);
      return file.uri;
    }
    forgetMobileAppLocalImageUri(file.uri);
    file.delete();
  } catch {
    // Fall through and re-derive the cover.
  }
  return null;
}

/**
 * Materialize one source-processed cover as a local file.
 *
 * Sources that export `process_cover_image` expect every cover to go through
 * them, but `expo-image` can only paint a URI. The cover is therefore streamed
 * to a bounded native temporary file (the same SSRF-validated seam the reader
 * and image cache use), handed to the source's processor, and the returned PNG
 * is published under a content-addressed name in the app cache. Every failure
 * resolves to `null` so the caller falls back to the source's plain
 * url+headers request — a cover is never worth failing a screen over.
 */
export async function resolveMobileProcessedCoverUri(
  input: MobileProcessedCoverInput,
): Promise<string | null> {
  const { source, request, cacheKey } = input;
  const processCoverImage = source.processCoverImage;
  if (!source.hasCoverImageProcessor || !processCoverImage) return null;
  try {
    if (!(await source.hasCoverImageProcessor())) return null;
  } catch {
    return null;
  }
  if (input.signal?.aborted) return null;

  const directory = processedCoverDirectory();
  const fileName = makeMobileProcessedCoverFileName(cacheKey);
  const stagingName = makeMobileProcessedCoverStagingFileName(fileName);
  const published = readPublishedProcessedCover(new File(directory, fileName));
  if (published) return published;

  let downloadedUri: string | null = null;
  try {
    const response = await downloadMobileNativeHttpFile(
      {
        url: request.url,
        headers: request.headers,
        maxResponseBytes: MOBILE_PROCESSED_COVER_INPUT_MAX_BYTES,
        maxImageDimension: MOBILE_IMAGE_MAX_DIMENSION,
        maxImagePixels: MOBILE_IMAGE_MAX_DECODED_PIXELS,
      },
      input.signal,
    );
    // Long-strip segment manifests are a reader page shape, never a cover.
    if (response.kind !== "file") return null;
    downloadedUri = response.fileUri;
    if (!isMobileProcessedCoverInputByteLengthAllowed(response.byteLength)) {
      return null;
    }

    const bytes = await new File(downloadedUri).bytes();
    if (
      input.signal?.aborted ||
      !isMobileProcessedCoverInputByteLengthAllowed(bytes.byteLength)
    ) {
      return null;
    }
    const processed = await processCoverImage(
      bytes,
      request.url,
      request.headers,
      response.status,
      response.headers,
    );
    if (
      !processed ||
      input.signal?.aborted ||
      !isMobileProcessedCoverOutputByteLengthAllowed(processed.byteLength)
    ) {
      return null;
    }

    if (!directory.exists) directory.create({ intermediates: true });
    const staging = new File(directory, stagingName);
    if (staging.exists) staging.delete();
    staging.write(processed);
    if ((staging.info().size ?? 0) !== processed.byteLength) {
      staging.delete();
      return null;
    }
    const target = new File(directory, fileName);
    if (target.exists) target.delete();
    // The published name only ever appears through this rename, so a crash
    // mid-write leaves a staging file rather than a torn cover.
    await staging.move(target);
    const publishedUri = new File(directory, fileName).uri;
    registerMobileAppLocalImageUri(publishedUri);
    pruneProcessedCovers(directory, [fileName, stagingName]);
    return publishedUri;
  } catch {
    return null;
  } finally {
    releaseMobileNativeHttpFile(downloadedUri);
  }
}
