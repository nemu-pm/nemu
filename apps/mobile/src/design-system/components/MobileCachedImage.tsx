import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  type ImageProps,
  type ImageURISource,
} from "react-native";
import {
  getCachedMobileImageUriSync,
  getMobileImageCacheSourceKey,
  invalidateCachedMobileImage,
  MOBILE_IMAGE_CACHE_REQUIRES_LOCAL_FILE,
  resolveCachedMobileImageUri,
  type MobileImageCacheSource,
} from "@/lib/mobileImageCache";
import { shouldRetryCachedMobileImageError } from "@/lib/mobileImageCacheCoordinator";
import {
  getMobileImageUriPolicy,
  type MobileImageUriOwnership,
} from "@/lib/mobileImageUriPolicy";

type MobileCachedImageSource = ImageURISource &
  MobileImageCacheSource & {
    uri: string;
  };

type MobileCachedImageProps = Omit<ImageProps, "source" | "onError"> & {
  source: MobileCachedImageSource;
  /**
   * `source` is third-party data and may only use HTTP(S). `app` is a local
   * value created by Nemu and may only use an approved local/data URI scheme.
   */
  uriOwnership: MobileImageUriOwnership;
  cacheKey?: string;
  fallback?: ReactNode;
  onError?: (error: string) => void;
};

function boundedLocalImageSourceKey(
  uri: string,
  uriOwnership: MobileImageUriOwnership,
  cacheKey?: string,
): string {
  // A reader data URI can retain tens of MiB as UTF-16. Never concatenate the
  // URI into another state key; two independent 32-bit hashes plus length keep
  // identity bounded without retaining a second copy of the image payload.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < uri.length; index += 1) {
    const code = uri.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${uriOwnership}:${cacheKey ?? ""}:${uri.length}:${first >>> 0}:${second >>> 0}`;
}

export function MobileCachedImage({
  source,
  uriOwnership,
  cacheKey,
  fallback,
  onError,
  onLoad,
  ...props
}: MobileCachedImageProps) {
  const sourceUri = source.uri;
  const sourceHeaders = source.headers;
  const uriPolicy = useMemo(
    () => getMobileImageUriPolicy(sourceUri, uriOwnership),
    [sourceUri, uriOwnership],
  );
  const sourceKey = useMemo(
    () => {
      if (uriPolicy.allowed && uriPolicy.kind === "source-remote") {
        return `${uriOwnership}:${getMobileImageCacheSourceKey(
          { uri: sourceUri, headers: sourceHeaders },
          cacheKey,
        )}`;
      }
      return boundedLocalImageSourceKey(sourceUri, uriOwnership, cacheKey);
    },
    [cacheKey, sourceHeaders, sourceUri, uriOwnership, uriPolicy],
  );
  const cacheSource = useMemo(
    () => ({
      uri: source.uri,
      headers: source.headers,
    }),
    [source.headers, source.uri],
  );
  const [cachedState, setCachedState] = useState<{
    sourceKey: string;
    uri: string | null;
  }>(() => ({
    sourceKey,
    uri: getCachedMobileImageUriSync(cacheSource, cacheKey),
  }));
  const retriedSourceKeyRef = useRef<string | null>(null);
  const reportedErrorSourceKeyRef = useRef<string | null>(null);
  const activeSourceKeyRef = useRef(sourceKey);
  const onErrorRef = useRef(onError);
  const cacheResolveAbortControllerRef = useRef<AbortController | null>(null);
  const requiresLocalFile =
    MOBILE_IMAGE_CACHE_REQUIRES_LOCAL_FILE &&
    uriPolicy.allowed &&
    uriPolicy.kind === "source-remote";
  const [failedSourceKey, setFailedSourceKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useLayoutEffect(() => {
    cacheResolveAbortControllerRef.current?.abort();
    cacheResolveAbortControllerRef.current = null;
    activeSourceKeyRef.current = sourceKey;
    retriedSourceKeyRef.current = null;
    reportedErrorSourceKeyRef.current = null;
    return () => {
      cacheResolveAbortControllerRef.current?.abort();
      cacheResolveAbortControllerRef.current = null;
    };
  }, [sourceKey]);

  const reportError = useCallback(
    (error: string) => {
      if (activeSourceKeyRef.current !== sourceKey) return;
      setFailedSourceKey(sourceKey);
      if (reportedErrorSourceKeyRef.current === sourceKey) return;
      reportedErrorSourceKeyRef.current = sourceKey;
      onErrorRef.current?.(error);
    },
    [sourceKey],
  );

  useEffect(() => {
    if (!uriPolicy.allowed) {
      const timer = setTimeout(() => {
        reportError(uriPolicy.error);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (uriPolicy.kind === "app-local" || !requiresLocalFile) return;

    let active = true;
    const controller = new AbortController();
    cacheResolveAbortControllerRef.current?.abort();
    cacheResolveAbortControllerRef.current = controller;
    void resolveCachedMobileImageUri(cacheSource, cacheKey, undefined, {
      signal: controller.signal,
    })
      .then((uri) => {
        if (!active) return;
        if (uri) {
          setFailedSourceKey((current) =>
            current === sourceKey ? null : current,
          );
          setCachedState({ sourceKey, uri });
        } else if (requiresLocalFile && !controller.signal.aborted) {
          reportError("The remote image could not be cached safely.");
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        reportError(
          error instanceof Error
            ? error.message
            : "The remote image could not be cached safely.",
        );
      })
      .finally(() => {
        if (cacheResolveAbortControllerRef.current === controller) {
          cacheResolveAbortControllerRef.current = null;
        }
      });

    return () => {
      active = false;
      controller.abort();
      if (cacheResolveAbortControllerRef.current === controller) {
        cacheResolveAbortControllerRef.current = null;
      }
    };
  }, [
    cacheKey,
    cacheSource,
    reportError,
    requiresLocalFile,
    sourceKey,
    uriPolicy,
  ]);

  const synchronouslyCachedUri = getCachedMobileImageUriSync(cacheSource, cacheKey);
  const cachedUri =
    cachedState.sourceKey === sourceKey
      ? (cachedState.uri ?? synchronouslyCachedUri)
      : synchronouslyCachedUri;
  const failed = failedSourceKey === sourceKey;
  const imageSource = failed
    ? undefined
    : cachedUri
      ? { uri: cachedUri }
      : uriPolicy.allowed && !requiresLocalFile
        ? source
        : undefined;

  const handleImageError = useCallback<NonNullable<ImageProps["onError"]>>(
    (event) => {
      const error =
        event.nativeEvent.error || "The image could not be displayed.";
      reportError(error);
      if (
        shouldRetryCachedMobileImageError({
          cachedUri,
          retriedSourceKey: retriedSourceKeyRef.current,
          sourceKey,
        })
      ) {
        retriedSourceKeyRef.current = sourceKey;
        // Drop the stale file URI immediately while one bounded repair runs.
        // Native never falls back to the original remote URL because that
        // would bypass the native destination policy.
        const invalidation = invalidateCachedMobileImage(cacheSource, cacheKey);
        setCachedState({ sourceKey, uri: null });
        const controller = new AbortController();
        cacheResolveAbortControllerRef.current?.abort();
        cacheResolveAbortControllerRef.current = controller;
        void invalidation
          .catch(() => undefined)
          .then(() => {
            if (controller.signal.aborted) return null;
            return resolveCachedMobileImageUri(
              cacheSource,
              cacheKey,
              undefined,
              { signal: controller.signal },
            );
          })
          .then((uri) => {
            if (activeSourceKeyRef.current !== sourceKey) return;
            if (!uri) {
              reportError("The remote image could not be cached safely.");
              return;
            }
            setFailedSourceKey((current) =>
              current === sourceKey ? null : current,
            );
            setCachedState({ sourceKey, uri });
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            reportError(
              error instanceof Error
                ? error.message
                : "The remote image could not be cached safely.",
            );
          })
          .finally(() => {
            if (cacheResolveAbortControllerRef.current === controller) {
              cacheResolveAbortControllerRef.current = null;
            }
          });
      }
    }, [cacheKey, cacheSource, cachedUri, reportError, sourceKey],
  );

  const handleImageLoad = useCallback<NonNullable<ImageProps["onLoad"]>>(
    (event) => {
      if (activeSourceKeyRef.current === sourceKey) {
        setFailedSourceKey((current) => (current === sourceKey ? null : current));
        reportedErrorSourceKeyRef.current = null;
      }
      onLoad?.(event);
    },
    [onLoad, sourceKey],
  );

  if (!imageSource && fallback !== undefined) return fallback;

  return (
    <Image
      {...props}
      onError={handleImageError}
      onLoad={handleImageLoad}
      source={imageSource}
    />
  );
}
