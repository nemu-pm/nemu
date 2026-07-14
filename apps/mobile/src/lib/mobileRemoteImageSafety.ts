/**
 * Remote source artwork is untrusted. Keep the compressed file bounded while
 * the native downloader streams it to disk; decoded dimensions are enforced
 * separately by mobileImageMetadataSafety before the file is published.
 * Exactly 20 MiB is accepted; only larger payloads are rejected.
 */
export const MOBILE_REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function assertMobileRemoteImageByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MOBILE_REMOTE_IMAGE_MAX_BYTES
  ) {
    throw new Error(
      `Remote image exceeds the ${MOBILE_REMOTE_IMAGE_MAX_BYTES} byte safety limit.`,
    );
  }
}
