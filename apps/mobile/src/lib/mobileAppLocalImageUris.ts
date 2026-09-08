/**
 * URIs the app itself minted for images it produced locally.
 *
 * `getMobileImageUriPolicy(uri, "source")` deliberately refuses every
 * non-HTTP(S) URI, because a third-party source must never be able to point
 * the image loader at a `file:`, `content:` or `data:` URI. A source-processed
 * cover, though, *is* a local file — the app downloaded the remote cover,
 * handed it to the source's cover processor and wrote the returned PNG into
 * its own cache — so the render path needs a way to tell the two apart.
 *
 * Registration is the distinction: only the code that wrote the file records
 * its URI here, so a URI a source made up can never match no matter how it is
 * spelled. The set is bounded and process-local; nothing is persisted, and an
 * evicted or post-restart entry simply re-registers the next time the file is
 * resolved (which always happens before it can be painted).
 */

const MAX_APP_LOCAL_IMAGE_URIS = 512;

const appLocalImageUris = new Set<string>();

export function registerMobileAppLocalImageUri(uri: string): void {
  if (typeof uri !== "string" || uri.length === 0) return;
  // Re-register to refresh insertion order, so a cover still on screen is not
  // the next entry evicted.
  appLocalImageUris.delete(uri);
  if (appLocalImageUris.size >= MAX_APP_LOCAL_IMAGE_URIS) {
    const oldest = appLocalImageUris.values().next().value;
    if (oldest !== undefined) appLocalImageUris.delete(oldest);
  }
  appLocalImageUris.add(uri);
}

export function isMobileAppLocalImageUri(uri: string): boolean {
  return typeof uri === "string" && appLocalImageUris.has(uri);
}

export function forgetMobileAppLocalImageUri(uri: string): void {
  appLocalImageUris.delete(uri);
}

export function clearMobileAppLocalImageUris(): void {
  appLocalImageUris.clear();
}
