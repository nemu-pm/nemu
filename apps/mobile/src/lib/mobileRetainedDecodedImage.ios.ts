import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";

/**
 * Registers a reader page (its local file:// URL) for native's small bounded
 * store of decoded pages (NemuReaderImageCacheLimits.m: the 16 most recently
 * registered URLs, at most 8 bitmaps / 48 MiB, emptied on a memory warning),
 * so a reopen's stand-in shows the reader's own decode instead of decoding
 * again. Only the paged reader's mounted pages (the current one and its
 * neighbours) and the stand-in register; every other file:// image keeps
 * React Native's default (never kept decoded).
 */
export function retainMobileDecodedReaderImage(uri: string): void {
  if (!uri.startsWith("file://")) return;
  try {
    NemuAidokuModule.retainReaderDecodedImage?.(uri);
  } catch {
    // Best-effort: an older native build simply keeps nothing.
  }
}
