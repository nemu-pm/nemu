import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { InstalledSource, LibraryEntry } from "@/data/schema";
import { resolveMobileEntryDisplayCover } from "@/lib/mobileEntryCover";
import { isMobileUsableCoverUrl } from "@/lib/mobileCoverPlaceholder";
import {
  getMobileCoverSizeVariants,
  isMobileCoverBelowSharp,
  isMobileSameCoverArt,
  pickMobileSharperCover,
} from "@/lib/mobileCoverPreference";
import {
  getCachedMobileSourceDetail,
  makeMobileSourceDetailCacheKey,
} from "@/lib/mobileSourceDetailCache";
import { measureMobileCoverPixelWidth, sampleMobileCoverFingerprint } from "@/lib/useMobileCoverTint";
import {
  markMobileExploreCoverCompared,
  setMobileExploreCoverPreference,
  wasMobileExploreCoverCompared,
} from "./mobileExploreCoverPreference";
import { hasMobileUserCover, useMobileExploreEntryCover } from "./mobileExploreCover";

type Measured = { width: number | null; pixels: Uint8Array | null };

/**
 * Draws nothing. Measures a title's own cover and, when it is a thumbnail
 * that would be shown small, the larger sizes its source serves for the same
 * URL and the covers its other linked sources reported (`known`, plus
 * whatever their cached details hold). A clearly sharper copy of the same
 * artwork is remembered for every surface (`mobileCoverPreference`); another
 * artwork never is. Once per title per session; local only (known URLs,
 * cached details, the shared image cache).
 */
export const ExploreSharperCoverProbe = memo(function ExploreSharperCoverProbe({
  entry,
  installedSources,
  known,
}: {
  entry: LibraryEntry;
  installedSources: InstalledSource[];
  /** Covers the linked sources reported on this screen (link id → URL). */
  known?: Readonly<Record<string, string | null | undefined>>;
}) {
  const id = entry.item.libraryItemId;
  const skip = hasMobileUserCover(entry) || wasMobileExploreCoverCompared(id);
  const own = resolveMobileEntryDisplayCover(entry) ?? null;
  const [measured, setMeasured] = useState<Record<string, Measured>>({});
  const [cached, setCached] = useState<string[] | null>(null);
  const ownWidth = own && own in measured ? measured[own]!.width : undefined;
  const lookFurther = !skip && isMobileCoverBelowSharp(ownWidth);

  // The other sources' covers from their cached details (no network).
  const links = useMemo(
    () => entry.sources.filter((link) => link.removed !== true),
    [entry.sources],
  );
  useEffect(() => {
    if (!lookFurther || cached !== null) return undefined;
    let cancelled = false;
    void Promise.all(
      links.map((link) =>
        getCachedMobileSourceDetail(
          makeMobileSourceDetailCacheKey(link.registryId, link.sourceId, link.sourceMangaId),
        )
          .then((hit) => hit?.payload.metadata.cover ?? null)
          .catch(() => null),
      ),
    ).then((covers) => {
      if (!cancelled) setCached(covers.filter((cover): cover is string => Boolean(cover)));
    });
    return () => {
      cancelled = true;
    };
  }, [cached, links, lookFurther]);

  const candidates = useMemo(() => {
    if (!lookFurther) return [];
    const urls = new Set<string>();
    for (const url of [...getMobileCoverSizeVariants(own), ...Object.values(known ?? {}), ...(cached ?? [])]) {
      const trimmed = url?.trim();
      if (trimmed && trimmed !== own && isMobileUsableCoverUrl(trimmed)) urls.add(trimmed);
    }
    return [...urls];
  }, [cached, known, lookFurther, own]);

  // Decide once the own cover says "full size", or every candidate is measured.
  useEffect(() => {
    if (skip || !own || ownWidth === undefined) return;
    if (!lookFurther) {
      if (ownWidth !== null) {
        setMobileExploreCoverPreference(id, null);
      }
      return;
    }
    if (cached === null || candidates.some((url) => !(url in measured))) return;
    const ownPixels = measured[own]?.pixels ?? null;
    const pick = pickMobileSharperCover(
      { url: own, width: ownWidth },
      candidates.map((url) => ({
        url,
        width: measured[url]?.width ?? null,
        sameArt: isMobileSameCoverArt(ownPixels, measured[url]?.pixels),
      })),
    );
    if (pick) setMobileExploreCoverPreference(id, pick);
    else markMobileExploreCoverCompared(id);
  }, [cached, candidates, id, lookFurther, measured, own, ownWidth, skip]);

  const report = useCallback((url: string, result: Measured) => {
    setMeasured((previous) => (url in previous ? previous : { ...previous, [url]: result }));
  }, []);
  if (skip || !own) return null;
  return (
    <>
      <CoverMeasure entry={entry} installedSources={installedSources} url={own} onWidth={report} />
      {candidates.map((url) => (
        <CoverMeasure key={url} entry={entry} installedSources={installedSources} url={url} onWidth={report} />
      ))}
    </>
  );
});

function CoverMeasure({
  entry,
  installedSources,
  url,
  onWidth,
}: {
  entry: LibraryEntry;
  installedSources: InstalledSource[];
  url: string;
  onWidth: (url: string, result: Measured) => void;
}) {
  // Requested through the source that owns this URL, as a cover view would.
  const request = useMobileExploreEntryCover(entry, installedSources, url);
  const uri = request?.uri ?? null;
  const headersKey = request?.headers ? JSON.stringify(request.headers) : "";
  useEffect(() => {
    if (!uri) return undefined;
    let cancelled = false;
    const headers = headersKey ? (JSON.parse(headersKey) as Record<string, string>) : undefined;
    void Promise.all([
      measureMobileCoverPixelWidth({ uri, headers }),
      sampleMobileCoverFingerprint({ uri, headers }),
    ]).then(([width, pixels]) => {
      if (!cancelled) onWidth(url, { width, pixels });
    });
    return () => {
      cancelled = true;
    };
  }, [headersKey, onWidth, uri, url]);
  return null;
}
