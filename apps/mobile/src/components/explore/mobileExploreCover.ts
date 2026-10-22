import { useMemo } from "react";
import { router } from "expo-router";
import type { InstalledSource, LibraryEntry } from "@/data/schema";
import {
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
} from "@/lib/mobileEntryCover";
import { isMobileCoverSizeVariantOf } from "@/lib/mobileCoverPreference";
import { primeMobileExploreDetailHandoff } from "@/lib/mobileExploreDetailHandoff";
import {
  mobileReaderZoomIdForDetail,
  noteMobileReaderZoomSourceCover,
  primeMobileReaderZoomCover,
} from "@/lib/mobileReaderZoomHandoff";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { zoomTransitionAvailable } from "../../../modules/nemu-window-layout";
import { useMobileExploreCoverPreference } from "./mobileExploreCoverPreference";

type MobileExploreCoverSource = {
  uri: string;
  headers?: Record<string, string>;
};

/**
 * The library cover as `MobileCachedImage` paints it elsewhere, so the prototypes share one
 * cached file. A sharper copy from another linked source may replace it (`mobileCoverPreference`).
 */
export function useMobileExploreEntryCover(
  entry: LibraryEntry | null,
  installedSources: InstalledSource[],
  coverUrl?: string | null,
): MobileExploreCoverSource | null {
  const preferred = useMobileExploreCoverPreference(entry?.item.libraryItemId);
  const cover = entry
    ? (coverUrl ??
      (preferred && !hasMobileUserCover(entry) ? preferred : null) ??
      resolveMobileEntryDisplayCover(entry))
    : null;
  const installedSource = useMemo(
    () =>
      entry
        ? (resolveMobileEntryCoverSources(entry, installedSources, {
            cover: mobileExploreCoverOwnerUrl(entry, cover),
          })[0] ?? null)
        : null,
    [cover, entry, installedSources],
  );
  const request = useMobileSourceImageRequest(installedSource, cover);
  return useMemo(() => {
    const uri = request?.url ?? cover;
    return uri ? { uri, headers: request?.headers } : null;
  }, [cover, request?.headers, request?.url]);
}

/**
 * The URL whose owner requests `cover`: a larger size of the title's own cover
 * (`getMobileCoverSizeVariants`) is served by the same source with the same
 * headers, so it is requested as the own cover is.
 */
export function mobileExploreCoverOwnerUrl(
  entry: LibraryEntry,
  cover: string | null | undefined,
  knownSourceCovers?: Readonly<Record<string, string | null | undefined>>,
): string | null | undefined {
  const own = resolveMobileEntryDisplayCover(entry, knownSourceCovers);
  return isMobileCoverSizeVariantOf(cover, own) ? own : cover;
}

/** The user set this title's cover by hand: it is never swapped for another. */
export function hasMobileUserCover(entry: LibraryEntry): boolean {
  return Boolean(entry.item.overrides?.metadata?.cover?.trim());
}

/**
 * The detail route for a library title. With `zoomId` (and a binary that has
 * the zoom views) the detail screen zooms out of that source cover.
 */
function mobileExploreZoomHref(id: string, zoomId?: string | null) {
  const params: { id: string; zoom?: string } = { id };
  if (zoomId && zoomTransitionAvailable) params.zoom = zoomId;
  return { pathname: "/library/[id]" as const, params };
}

/**
 * Opens a library title's page out of the cover with `zoomId`. The page is
 * handed the title and the cover as the cell painted them, so the commit the
 * stack pushes already shows them (see `mobileExploreDetailHandoff`).
 */
export function pushMobileExploreDetail(
  entry: LibraryEntry,
  cover: MobileExploreCoverSource | null,
  zoomId: string,
) {
  if (zoomTransitionAvailable) primeMobileExploreDetailHandoff({ entry, cover });
  // The title page's Continue zooms the reader out of its hero: until the
  // hero resolves its own cover, it lands on the one this tile painted.
  noteMobileReaderZoomSourceCover(mobileReaderZoomIdForDetail(entry.item.libraryItemId), cover);
  router.push(mobileExploreZoomHref(entry.item.libraryItemId, zoomId));
}

/**
 * Adds the zoom source to a reader href (a string from getMobileSourceReaderHref).
 * `cover` is the source cover as it is painted: the zoom lands on it.
 */
export function withMobileExploreZoom<T>(
  href: T,
  zoomId?: string | null,
  cover?: MobileExploreCoverSource | null,
): T {
  if (!zoomId || !zoomTransitionAvailable || typeof href !== "string") return href;
  const landing = primeMobileReaderZoomCover(zoomId, cover);
  console.info("[reader-zoom] primed", {
    zoomId,
    cover: cover?.uri ? "own" : landing ? "known" : "none",
  });
  return `${href}${href.includes("?") ? "&" : "?"}zoom=${encodeURIComponent(zoomId)}` as T;
}

/**
 * Cover width of the Books-style hero for the width of the column it sits in
 * (the page's content width, or a pane's): a little over half of it, up to
 * 210 pt.
 */
export function getMobileBooksHeroCoverWidth(contentWidth: number): number {
  return Math.max(0, Math.min(210, Math.round(contentWidth * 0.55)));
}

/**
 * A source title's page that adds the title to the library as soon as its
 * details are in (design-explore: "Add to Library" in a listing cell's
 * context menu). The page adds through its own write path, as its button does.
 */
export function withMobileExploreAddIntent<T>(href: T): T {
  if (typeof href !== "string") return href;
  return `${href}${href.includes("?") ? "&" : "?"}add=1` as T;
}
