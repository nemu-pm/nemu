import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  subscribeMobileDataChanges,
  useMobileDataRevision,
} from "@/data/mobileDataEvents";
import type { InstalledSource } from "@/data/schema";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
  type MobileSourceSettingsReader,
} from "@/lib/mobileSourceSettings";
import {
  resolveCachedMobileSourceImageRequest,
  type MobileSourceImageRequest,
} from "@/sources/mobileSourceImages";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";

/**
 * Resolved per-source settings, shared by every cover on screen.
 *
 * Each miss costs 3-4 store reads (SQLite plus the Keychain-backed vault) and
 * a merge against the package's setting defaults, and the source-image path
 * used to pay that once per cover card — on Library mount and again on every
 * `sourceSettings` save. Keying on the settings revision keeps one in-flight
 * promise per source per revision instead.
 */
const sourceImageSettingsCache = new Map<
  string,
  Promise<Record<string, unknown>>
>();
const MAX_SOURCE_IMAGE_SETTINGS_CACHE_SIZE = 64;

export function clearMobileSourceImageSettingsCache(): void {
  sourceImageSettingsCache.clear();
}

// A settings save already bumps the revision every mounted cover keys on, so
// the stale generations are unreachable; dropping them keeps the map bounded.
subscribeMobileDataChanges((scope) => {
  if (scope === "sourceSettings" || scope === "all") {
    clearMobileSourceImageSettingsCache();
  }
});

registerMobileSourceProfileTransitionHandler(
  "source-image-settings-cache",
  clearMobileSourceImageSettingsCache,
);

export function makeMobileSourceImageSettingsCacheKey(
  source: InstalledSource,
  settingsRevision: number,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  return [
    executionScope,
    makeMobileRuntimeSourceKey(normalizeInstalledSource(source)),
    source.packageCacheKey ?? "",
    source.version,
    source.updatedAt ?? "",
    settingsRevision,
  ].join("|");
}

/**
 * Reads and merges one source's settings, deduplicated across every caller
 * sharing the same source and settings revision.
 */
export function loadMobileSourceImageSettings(
  reader: MobileSourceSettingsReader,
  source: InstalledSource,
  settingsRevision: number,
): Promise<Record<string, unknown>> {
  const key = makeMobileSourceImageSettingsCacheKey(source, settingsRevision);
  const cached = sourceImageSettingsCache.get(key);
  if (cached) return cached;

  if (sourceImageSettingsCache.size >= MAX_SOURCE_IMAGE_SETTINGS_CACHE_SIZE) {
    const oldestKey = sourceImageSettingsCache.keys().next().value;
    if (oldestKey) sourceImageSettingsCache.delete(oldestKey);
  }

  const pending = (async () => {
    const normalized = normalizeInstalledSource(source);
    const saved = await loadMobileSourceSettingsByKeys(reader, [
      makeMobileRuntimeSourceKey(normalized),
      ...getMobileInstalledSourceSettingsKeys(source),
    ]);
    return mergeSourceSettingValues(
      source.packageMetadata?.settings ?? [],
      saved?.values,
    );
  })().catch((error: unknown) => {
    // A failed read must not be latched for the life of the revision.
    if (sourceImageSettingsCache.get(key) === pending) {
      sourceImageSettingsCache.delete(key);
    }
    throw error;
  });
  sourceImageSettingsCache.set(key, pending);
  return pending;
}

export type MobileSourceImageRequestStatus = "idle" | "pending" | "settled";

export type MobileSourceImageRequestState = {
  /**
   * `pending` means the rewrite for this exact image has not come back yet, so
   * the caller does not know whether the URL needs headers. Callers that must
   * not paint a headerless source URL (covers on referer/auth gated sources)
   * use this to hold the previous image instead.
   */
  status: MobileSourceImageRequestStatus;
  request: MobileSourceImageRequest | null;
};

function useMobileSourceImageRequestState(
  source: InstalledSource | null | undefined,
  url: string | null | undefined,
): MobileSourceImageRequestState {
  const store = useMobileDataStore();
  const sourceSettingsRevision = useMobileDataRevision(["sourceSettings"]);
  // Identity: which image this is. A resolved request stays valid for the
  // same identity while a refresh is in flight.
  const imageIdentityKey = useMemo(
    () => (source && url ? [source.id, url].join("|") : ""),
    [source, url],
  );
  // Refresh: anything that can change the resolved headers. Bumping it
  // re-resolves in the background instead of dropping the current request —
  // a source-settings save must not blank every mounted cover, and covers
  // for referer/auth sources must never fall back to a headerless URL.
  const sourceRequestKey = useMemo(
    () =>
      source && url
        ? [
            imageIdentityKey,
            source.packageCacheKey ?? "",
            source.packageUri ?? "",
            source.updatedAt ?? "",
            source.version,
            sourceSettingsRevision,
          ].join("|")
        : "",
    [imageIdentityKey, source, sourceSettingsRevision, url],
  );
  const [state, setState] = useState<{
    identityKey: string;
    request: MobileSourceImageRequest | null;
  } | null>(null);
  const getSourceSettings = useCallback(
    (_sourceKey: string, sourceRecord: InstalledSource) =>
      loadMobileSourceImageSettings(store, sourceRecord, sourceSettingsRevision),
    [sourceSettingsRevision, store],
  );

  useEffect(() => {
    if (!source || !url || !sourceRequestKey) return;

    let active = true;
    void resolveCachedMobileSourceImageRequest(source, url, {
      getSourceSettings,
    })
      .catch(() => null)
      .then((request) => {
        if (!active) return;
        setState((current) =>
          // A failed refresh keeps the last good request for the same image.
          request === null &&
          current?.identityKey === imageIdentityKey &&
          current.request
            ? current
            : { identityKey: imageIdentityKey, request },
        );
      });

    return () => {
      active = false;
    };
  }, [getSourceSettings, imageIdentityKey, source, sourceRequestKey, url]);

  const settledRequest =
    state?.identityKey === imageIdentityKey ? state.request : null;
  const settled = Boolean(imageIdentityKey) && state?.identityKey === imageIdentityKey;
  return useMemo<MobileSourceImageRequestState>(
    () => ({
      status: !imageIdentityKey ? "idle" : settled ? "settled" : "pending",
      request: settledRequest,
    }),
    [imageIdentityKey, settled, settledRequest],
  );
}

export function useMobileSourceImageRequest(
  source: InstalledSource | null | undefined,
  url: string | null | undefined,
): MobileSourceImageRequest | null {
  return useMobileSourceImageRequestState(source, url).request;
}

export type MobileCoverImageSource = {
  uri: string;
  headers?: Record<string, string>;
};

export type MobileStickyCoverPaint = {
  request: MobileCoverImageSource;
  /**
   * `true` once the paint carries whatever headers the source resolved for it
   * (or the cover provably needs none). A `false` paint is a best-effort first
   * frame and must never displace an already resolved one.
   */
  resolved: boolean;
};

/**
 * `MobileCachedImage` keys its cache entry and its failed state on the URL *and*
 * the headers, so two paints of the same URL with and without headers are two
 * different images. Sticky-cover bookkeeping uses the same identity.
 */
export function makeMobileCoverRequestKey(
  request: MobileCoverImageSource | null | undefined,
): string {
  if (!request) return "";
  const headers = request.headers ?? {};
  const signature = Object.keys(headers)
    .sort()
    .map((name) => `${name}=${headers[name]}`)
    .join("&");
  return signature ? `${request.uri}|${signature}` : request.uri;
}

/**
 * Picks the cover to paint for one manga screen.
 *
 * Source listings resolve `modifyImageRequest` up front and hand the tapped
 * card's rewritten URL *and* headers to the detail screen. Details, on the
 * other hand, return the raw cover straight from the source, so the moment
 * they land the cover identity changes and the rewrite has to run again. While
 * that rewrite is in flight the request hook has nothing for the new identity,
 * and painting the bare URL is what made covers vanish: a referer-gated host
 * answers 403, and `MobileCachedImage` latches that failure for the whole
 * source key. So an unresolved cover keeps the last resolved one on screen and
 * only swaps once the new request settles.
 */
export function resolveMobileStickyCover(
  previous: MobileStickyCoverPaint | null,
  input: {
    cover?: string | null;
    coverHeaders?: Record<string, string> | null;
    requestState: MobileSourceImageRequestState;
    /** Source-remote covers may need headers; app-local ones never do. */
    requiresSourceRequest: boolean;
  },
): MobileStickyCoverPaint | null {
  // Reusing `previous` whenever it already describes the same paint keeps the
  // cover source referentially stable across the screen's ordinary rerenders.
  const keep = (next: MobileStickyCoverPaint): MobileStickyCoverPaint =>
    previous &&
    previous.resolved === next.resolved &&
    makeMobileCoverRequestKey(previous.request) ===
      makeMobileCoverRequestKey(next.request)
      ? previous
      : next;
  const cover = input.cover?.trim() ? input.cover : null;
  if (!cover) return null;

  const request = input.requestState.request;
  if (request) {
    return keep({
      request: { uri: request.url, headers: request.headers },
      resolved: true,
    });
  }
  const seedHeaders =
    input.coverHeaders && Object.keys(input.coverHeaders).length > 0
      ? input.coverHeaders
      : null;
  if (seedHeaders) {
    return keep({
      request: { uri: cover, headers: seedHeaders },
      resolved: true,
    });
  }
  if (!input.requiresSourceRequest || input.requestState.status === "settled") {
    return keep({ request: { uri: cover }, resolved: true });
  }
  return previous?.resolved
    ? previous
    : keep({ request: { uri: cover }, resolved: false });
}

/**
 * A cover that fails to load falls back to the last one that actually rendered
 * instead of dropping to the placeholder gradient.
 */
export function selectMobileCoverAfterError(
  candidate: MobileCoverImageSource | null,
  options: {
    failedKey: string | null;
    lastLoaded: MobileCoverImageSource | null;
  },
): MobileCoverImageSource | null {
  if (!candidate) return null;
  const candidateKey = makeMobileCoverRequestKey(candidate);
  if (!options.failedKey || options.failedKey !== candidateKey) return candidate;
  const lastLoaded = options.lastLoaded;
  if (lastLoaded && makeMobileCoverRequestKey(lastLoaded) !== candidateKey) {
    return lastLoaded;
  }
  return candidate;
}

export type MobileStickySourceCover = {
  source: MobileCoverImageSource | null;
  onCoverError: () => void;
  onCoverLoad: () => void;
};

/**
 * Cover source for a manga hero image that never flickers back to a headerless
 * URL or to the placeholder while a source rewrite is resolving.
 */
export function useMobileStickySourceCover({
  source,
  cover,
  coverHeaders,
}: {
  source: InstalledSource | null | undefined;
  cover: string | null | undefined;
  /** Headers already resolved for `cover` (listing seed / stored library row). */
  coverHeaders?: Record<string, string> | null;
}): MobileStickySourceCover {
  const requestState = useMobileSourceImageRequestState(source, cover);
  const [lastResolved, setLastResolved] =
    useState<MobileStickyCoverPaint | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<MobileCoverImageSource | null>(
    null,
  );

  const paint = resolveMobileStickyCover(lastResolved, {
    cover,
    coverHeaders,
    requestState,
    requiresSourceRequest: Boolean(source),
  });
  // Remember the resolved paint during render (React's "adjust state while
  // rendering" pattern): the next render has to be able to keep showing it
  // synchronously, before any effect could run, or the unresolved frame in
  // between would paint a headerless URL after all. Keyed so it settles.
  const resolvedKey = paint?.resolved
    ? makeMobileCoverRequestKey(paint.request)
    : null;
  if (
    resolvedKey &&
    resolvedKey !== (lastResolved ? makeMobileCoverRequestKey(lastResolved.request) : null)
  ) {
    setLastResolved(paint);
  }

  const displayed = selectMobileCoverAfterError(paint?.request ?? null, {
    failedKey,
    lastLoaded,
  });
  const displayedKey = makeMobileCoverRequestKey(displayed);
  const onCoverError = useCallback(() => {
    if (!displayedKey) return;
    setFailedKey(displayedKey);
  }, [displayedKey]);
  const onCoverLoad = useCallback(() => {
    if (!displayed) return;
    setLastLoaded(displayed);
    setFailedKey((current) => (current === displayedKey ? null : current));
  }, [displayed, displayedKey]);

  return useMemo(
    () => ({ source: displayed, onCoverError, onCoverLoad }),
    [displayed, onCoverError, onCoverLoad],
  );
}
