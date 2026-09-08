/**
 * One bounded repair for a processed cover whose file is gone.
 *
 * A source that exports `process_cover_image` has its covers materialized as
 * app-local `file://` entries, and the resolved `{ uri, headers }` pair is
 * memoized in the image-request cache in `sources/mobileSourceImages.ts`.
 * The two caches are bounded independently, so a file can be pruned (or lost
 * to a disk-quota sweep, or a crash mid-publish) while its URI is still the
 * memoized answer for that image — and nothing ever re-resolves it, because
 * the memoized entry is a hit. The cover then stays broken for the life of the
 * process.
 *
 * The render path is the only place that learns the file is gone, so it
 * reports the failing URI here and whichever request hook is holding that URI
 * drops its cache entry and resolves once more. "Once" is the whole point: a
 * cover that is genuinely unpaintable must not loop between the loader and the
 * source, so each (image identity, URI) pair is repaired a single time.
 */

type MobileSourceImageUriListener = (uri: string) => void;

const listeners = new Set<MobileSourceImageUriListener>();
const repairListeners = new Set<MobileSourceImageUriListener>();

function notify(
  targets: ReadonlySet<MobileSourceImageUriListener>,
  uri: string,
): void {
  if (typeof uri !== "string" || uri.length === 0) return;
  if (targets.size === 0) return;
  for (const listener of Array.from(targets)) {
    try {
      listener(uri);
    } catch {
      // A listener is one mounted hook or view; a throw there must not stop
      // the rest.
    }
  }
}

/**
 * Called by the render path when an app-local image URI failed to load.
 * Cheap and synchronous: with no subscriber holding that URI it does nothing.
 */
export function reportMobileSourceImageLoadFailure(uri: string): void {
  notify(listeners, uri);
}

export function subscribeMobileSourceImageLoadFailures(
  listener: MobileSourceImageUriListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announces that a repair finished and the URI is worth another attempt.
 *
 * A processed cover's file name is a hash of its cache key, so the repaired
 * file comes back under the *same* URI. Nothing about the rendered source
 * changes, so the view that reported the failure would otherwise keep its
 * latched failure and its stale URI verdict forever. This is the other half of
 * the handshake: the holder says "the file is back", and the view re-evaluates
 * that one URI exactly once.
 */
export function reportMobileSourceImageRepaired(uri: string): void {
  notify(repairListeners, uri);
}

export function subscribeMobileSourceImageRepairs(
  listener: MobileSourceImageUriListener,
): () => void {
  repairListeners.add(listener);
  return () => {
    repairListeners.delete(listener);
  };
}

/** Test seam: drops every subscription. */
export function clearMobileSourceImageLoadFailureListeners(): void {
  listeners.clear();
  repairListeners.clear();
}

/**
 * Whether a URI that failed to load is one re-resolving the source image
 * request could plausibly bring back.
 *
 * Only the app's own processed-cover path ever puts a local URI into a
 * resolved source image request, and the memoized entry is the only thing that
 * can mint a new one — so a local scheme is the repairable case. A remote
 * `http(s)` URL that fails is the image cache's business, not this cache's,
 * and a `data:` URI carries its own bytes so there is nothing to re-resolve.
 *
 * Deliberately NOT `isMobileAppLocalImageUri`: pruning a processed cover also
 * unregisters its URI, which is exactly the failure being repaired here, so
 * the registry says "no" precisely when the repair is needed.
 */
export function isRepairableMobileSourceImageUri(uri: string): boolean {
  if (typeof uri !== "string" || uri.length === 0) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase();
  if (!scheme) return false;
  return scheme !== "http" && scheme !== "https" && scheme !== "data";
}

export type MobileSourceImageRepairDecision = {
  /** The URI the render path could not load. */
  failedUri: string;
  /** The URL of the request this holder currently has resolved. */
  requestUrl: string | null | undefined;
  /** Whether this holder already spent its one repair on that pair. */
  alreadyRepaired: boolean;
  /** Injection seam; defaults to `isRepairableMobileSourceImageUri`. */
  isRepairableUri?: (uri: string) => boolean;
};

/**
 * Whether a reported load failure should drop this holder's memoized request
 * and resolve it again.
 *
 * Only the holder that actually resolved the failing URI repairs it, only a
 * repairable (local, non-`data:`) URI is eligible, and only once.
 */
export function shouldRepairMobileSourceImageRequest(
  decision: MobileSourceImageRepairDecision,
): boolean {
  const { failedUri, requestUrl, alreadyRepaired } = decision;
  if (alreadyRepaired) return false;
  if (typeof failedUri !== "string" || failedUri.length === 0) return false;
  if (!requestUrl || requestUrl !== failedUri) return false;
  const isRepairableUri =
    decision.isRepairableUri ?? isRepairableMobileSourceImageUri;
  return isRepairableUri(failedUri);
}
