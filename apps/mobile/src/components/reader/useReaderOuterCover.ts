import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, type AppStateStatus } from "react-native";
import type { InstalledSource, LibraryEntry } from "@/data/schema";
import { useMobileExploreEntryCover } from "@/components/explore/mobileExploreCover";
import { isMobileAppLocalImageUri } from "@/lib/mobileAppLocalImageUris";
import { resolveCachedMobileImageUri } from "@/lib/mobileImageCache";
import { getMobileImageUriPolicy } from "@/lib/mobileImageUriPolicy";
import { resolveMobileLocalArchiveImageUri } from "@/lib/mobileLocalArchiveImageUri";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  mobileOuterCoverAfterCameraAccess,
  mobileOuterCoverBackgroundColor,
  mobileOuterCoverToggleVisible,
  shouldRunMobileOuterCover,
} from "@/lib/mobileOuterCover";
import {
  getCachedMobileSourceDetail,
  makeMobileSourceDetailCacheKey,
} from "@/lib/mobileSourceDetailCache";
import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";
import { useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import {
  cameraAccessStatus,
  clearOuterCover,
  isOuterCoverSupported,
  makeOuterCoverOwner,
  requestCameraAccess,
  setOuterCover,
} from "../../../modules/nemu-outer-cover";

type CoverSource = { uri: string; headers?: Record<string, string> } | null;

/**
 * Show Cover on Outer Display (iPhone Duo) for one reader: the toggle's
 * state, the camera permission prompt, and what the native module shows.
 * Everything is inert (no cover lookups, no sampling, no native calls but
 * `clearOuterCover`) unless the toggle is visible and on.
 */
export function useReaderOuterCover(input: {
  /** The persisted switch (default off). */
  enabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  entry: LibraryEntry | null;
  installedSources: InstalledSource[];
  /** The route's source, for a title read outside the library. */
  routeSource: InstalledSource | null;
  registryId: string;
  sourceId: string;
  mangaId: string;
  title: string | null;
  readerFocused: boolean;
  /** The app window's observed layout (hinge, fold, full screen). */
  layout: MobileWindowLayout | null;
  strings: MobileStrings;
}): {
  toggleVisible: boolean;
  /** What the switch shows: on while the permission prompt is up. */
  toggleOn: boolean;
  cameraDenied: boolean;
  onToggle: (enabled: boolean) => void;
  onOpenSettings: () => void;
  /** The native anchor's `active`. */
  running: boolean;
} {
  const { enabled, setEnabled, entry, routeSource, registryId, sourceId, mangaId, layout, strings, readerFocused } = input;
  const nativeSupported = useMemo(() => isOuterCoverSupported(), []);
  // This reader's owner id: native ignores a clear from any other reader.
  const [owner] = useState(makeOuterCoverOwner);
  const toggleVisible = mobileOuterCoverToggleVisible({ nativeSupported, layout });
  const [appState, setAppState] = useState<AppStateStatus | string>(() => AppState.currentState ?? "active");
  const [asking, setAsking] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [access, setAccess] = useState(() => (nativeSupported ? cameraAccessStatus() : "denied"));

  useEffect(() => {
    if (!nativeSupported) return undefined;
    const subscription = AppState.addEventListener("change", (next) => {
      setAppState(next);
      // Back from Settings: camera access may have changed either way.
      if (next === "active") setAccess(cameraAccessStatus());
    });
    return () => subscription.remove();
  }, [nativeSupported]);

  // Access revoked in Settings while the switch is on: it turns off with the note.
  useEffect(() => {
    if (!toggleVisible || !enabled || asking || access === "granted" || access === "undetermined") return;
    setCameraDenied(true);
    void setEnabled(false).catch(() => undefined);
  }, [access, asking, enabled, setEnabled, toggleVisible]);
  useEffect(() => {
    if (access === "granted") setCameraDenied(false);
  }, [access]);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onToggle = useCallback(
    (next: boolean) => {
      if (!next) {
        setCameraDenied(false);
        void setEnabled(false).catch(() => undefined);
        return;
      }
      if (enabledRef.current || asking) return;
      setAsking(true);
      // The only place the app asks for the camera.
      void requestCameraAccess()
        .then(async (answer) => {
          setAccess(answer);
          const outcome = mobileOuterCoverAfterCameraAccess(answer);
          setCameraDenied(outcome.deniedNote);
          if (outcome.enabled) await setEnabled(true);
        })
        .catch(() => undefined)
        .finally(() => setAsking(false));
    },
    [asking, setEnabled],
  );
  const onOpenSettings = useCallback(() => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  const wanted = toggleVisible && enabled && access === "granted";
  const running = shouldRunMobileOuterCover({
    toggleVisible,
    enabled: wanted,
    readerFocused: input.readerFocused,
    appState,
    layout: layout ?? {},
  });

  // The cover, looked up only while the switch is on: the library's display
  // cover (as the library paints it), else the source's cached details.
  const libraryCover = useMobileExploreEntryCover(wanted ? entry : null, input.installedSources);
  const [detailCover, setDetailCover] = useState<string | null>(null);
  useEffect(() => {
    setDetailCover(null);
    if (!wanted || entry) return undefined;
    let cancelled = false;
    void getCachedMobileSourceDetail(makeMobileSourceDetailCacheKey(registryId, sourceId, mangaId))
      .then((cached) => {
        if (!cancelled) setDetailCover(cached?.payload.metadata.cover?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entry, mangaId, registryId, sourceId, wanted]);
  const detailRequest = useMobileSourceImageRequest(routeSource, wanted && !entry ? detailCover : null);
  const cover = useMemo<CoverSource>(() => {
    if (!wanted) return null;
    if (entry) return libraryCover;
    const uri = detailRequest?.url ?? detailCover;
    return uri ? { uri, headers: detailRequest?.headers } : null;
  }, [detailCover, detailRequest?.headers, detailRequest?.url, entry, libraryCover, wanted]);
  const coverKey = entry?.item.libraryItemId ?? `${registryId}:${sourceId}:${mangaId}`;
  const tint = useMobileCoverTint(cover, entry ? `item:${entry.item.libraryItemId}` : undefined);
  const coverFile = useOuterCoverFile(cover);

  const backgroundColor = mobileOuterCoverBackgroundColor(tint);
  const accessibilityLabel = input.title
    ? formatMobileString(strings.reader.outerCoverAccessibility, { title: input.title })
    : strings.reader.outerCoverAccessibilityUntitled;

  useEffect(() => {
    // An unfocused reader (another reader pushed over it) never writes: the
    // focused one owns the content, and this clear is ignored unless it
    // was this reader's.
    if (!wanted || !readerFocused) {
      clearOuterCover(owner);
      return;
    }
    setOuterCover({ owner, enabled: running, coverUri: coverFile, coverKey, backgroundColor, accessibilityLabel });
  }, [accessibilityLabel, backgroundColor, coverFile, coverKey, owner, readerFocused, running, wanted]);
  // Leaving the reader stops the camera and withdraws the content (unless
  // another reader has configured it since).
  useEffect(() => () => clearOuterCover(owner), [owner]);

  return {
    toggleVisible,
    toggleOn: enabled || asking,
    cameraDenied: toggleVisible && cameraDenied,
    onToggle,
    onOpenSettings,
    running,
  };
}

/**
 * The cover as a local file for the native side, which reads files only: a
 * source's remote cover through the app's policy-checked cover cache (the
 * same file the library paints), an app-local file (imported archives,
 * processed covers) as it is. Anything else: null (the colour alone).
 */
function useOuterCoverFile(cover: CoverSource): string | null {
  const [file, setFile] = useState<{ key: string; uri: string | null } | null>(null);
  const headersKey = cover?.headers ? JSON.stringify(cover.headers) : "";
  const key = cover ? `${cover.uri}|${headersKey}` : "";
  useEffect(() => {
    if (!cover) return undefined;
    const uri = resolveMobileLocalArchiveImageUri(cover.uri);
    const remote = getMobileImageUriPolicy(uri, "source");
    if (!remote.allowed) {
      const local = getMobileImageUriPolicy(uri, "app");
      const usable = local.allowed && uri.startsWith("file:") && isMobileAppLocalImageUri(uri);
      setFile({ key, uri: usable ? uri : null });
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    void resolveCachedMobileImageUri({ uri, headers: cover.headers, cacheKind: "cover" }, undefined, undefined, {
      signal: controller.signal,
    })
      .then((resolved) => {
        // A segmented cache entry (a manifest, not an image) is not a cover file.
        const usable = resolved?.startsWith("file:") && !resolved.endsWith(".json");
        if (!cancelled) setFile({ key, uri: usable ? resolved : null });
      })
      .catch(() => {
        if (!cancelled) setFile({ key, uri: null });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `key` is the cover's identity; `cover` itself is a fresh object per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return file?.key === key ? file.uri : null;
}
