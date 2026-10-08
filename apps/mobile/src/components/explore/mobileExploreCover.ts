import { useMemo } from "react";
import { router } from "expo-router";
import type { InstalledSource, LibraryEntry, LocalSourceLink } from "@/data/schema";
import {
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
} from "@/lib/mobileEntryCover";
import { isMobileCoverSizeVariantOf } from "@/lib/mobileCoverPreference";
import { primeMobileExploreDetailHandoff } from "@/lib/mobileExploreDetailHandoff";
import { mobileInstalledSourceMatchesLink } from "@/lib/mobileInstalledSourceKeys";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { zoomTransitionAvailable } from "../../../modules/nemu-window-layout";
import { useMobileExploreCoverPreference } from "./mobileExploreCoverPreference";

export type MobileExploreCoverSource = {
  uri: string;
  headers?: Record<string, string>;
};

/**
 * The library cover as `MobileCachedImage` paints it everywhere else (same URL
 * resolution and source headers as the grid), so the prototypes share one
 * cached file with the grid and the detail hero. `null` (no title) has no cover.
 *
 * A sharper cover found on another linked source replaces the title's own
 * (`mobileCoverPreference`) unless the user set the cover by hand. `coverUrl`
 * asks for one specific cover of the title instead (requested through the
 * source that owns it), for comparing them.
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

export function mobileExploreSourceName(
  link: LocalSourceLink,
  installedSources: InstalledSource[],
): string {
  const installed = installedSources.find((source) =>
    mobileInstalledSourceMatchesLink(source, link),
  );
  return (
    installed?.name ??
    (link.sourceId.split(".").slice(1).join(".") || link.sourceId)
  );
}

/**
 * The detail route for a library title. With `zoomId` (and a binary that has
 * the zoom views) the detail screen zooms out of that source cover.
 */
export function mobileExploreZoomHref(id: string, zoomId?: string | null, sourceId?: string | null) {
  const params: { id: string; zoom?: string; source?: string } = { id };
  if (zoomId && zoomTransitionAvailable) params.zoom = zoomId;
  if (sourceId) params.source = sourceId;
  return { pathname: "/library/[id]" as const, params };
}

/**
 * Opens a library title's page out of the cover with `zoomId`. The page is
 * handed the title and the cover as the cell painted them, so the commit the
 * stack pushes already shows them (see `mobileExploreDetailHandoff`).
 * `sourceId` opens the page on that source's chapters: a Continue Reading
 * card (and the Now Reading accessory) open it on the source being read, so
 * the page's Up next, Latest and source agree with the card that was tapped.
 */
export function pushMobileExploreDetail(
  entry: LibraryEntry,
  cover: MobileExploreCoverSource | null,
  zoomId: string,
  sourceId?: string | null,
) {
  if (zoomTransitionAvailable) primeMobileExploreDetailHandoff({ entry, cover });
  router.push(mobileExploreZoomHref(entry.item.libraryItemId, zoomId, sourceId));
}

/** Adds the zoom source to a reader href (a string from getMobileSourceReaderHref). */
export function withMobileExploreZoom<T>(href: T, zoomId?: string | null): T {
  if (!zoomId || !zoomTransitionAvailable || typeof href !== "string") return href;
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
