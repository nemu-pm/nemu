import {
  getEntryCover,
  type InstalledSource,
  type LibraryEntry,
  type LocalSourceLink,
} from "@/data/schema";
import { mobileInstalledSourceMatchesLink } from "./mobileInstalledSourceKeys";
import { sortMobileSourceLinks } from "./mobileSourceLinks";
import {
  getMobileRegistrableDomain,
  isMobileUsableCoverUrl,
} from "./mobileCoverPlaceholder";

/**
 * One cover per library title, everywhere.
 *
 * The cover a library title shows is its own (user override > stored library
 * cover > best known source cover), never "whatever the selected source
 * returned". It is also always *requested* through the source that owns the
 * URL: a cover is painted with the request settings (`modifyImageRequest`
 * headers) of some installed source, and using the wrong one is what broke the
 * detail header — Manhuagui's Referer on a MangaDex cover makes MangaDex serve
 * its "read this at mangadex.org" placeholder, and MangaDex's (absent) Referer
 * on a Manhuagui cover gets a 403 and no cover at all. The library grid, the
 * quick-action sheet, the detail header and the source screen all resolve the
 * owner here, so they share one request and therefore one image-cache entry.
 */

/** Per-link cover known from that link's cached/fetched details. */
export type MobileKnownSourceCovers = Readonly<
  Record<string, string | null | undefined>
>;

const MAX_REMEMBERED_COVER_OWNERS = 512;
const rememberedCoverOwners = new Map<string, string>();

function sourceIdentity(registryId: string, sourceId: string): string {
  return `${registryId}\u0000${sourceId}`;
}

/**
 * Records which source returned a cover URL (from a details fetch or the
 * details cache), so surfaces without per-link details (the library grid) can
 * still route that cover through its owner.
 */
export function rememberMobileSourceCoverOwner(
  cover: string | null | undefined,
  source: { registryId: string; sourceId: string },
): void {
  const url = cover?.trim();
  if (!url || !isMobileUsableCoverUrl(url)) return;
  rememberedCoverOwners.delete(url);
  rememberedCoverOwners.set(url, sourceIdentity(source.registryId, source.sourceId));
  while (rememberedCoverOwners.size > MAX_REMEMBERED_COVER_OWNERS) {
    const oldest = rememberedCoverOwners.keys().next().value;
    if (oldest === undefined) break;
    rememberedCoverOwners.delete(oldest);
  }
}

export function resetMobileSourceCoverOwnersForTesting(): void {
  rememberedCoverOwners.clear();
}

function installedSourceForLink(
  link: LocalSourceLink,
  installedSources: readonly InstalledSource[],
): InstalledSource | null {
  return (
    installedSources.find((source) =>
      mobileInstalledSourceMatchesLink(source, link),
    ) ?? null
  );
}

function sourceDomains(source: InstalledSource | null): string[] {
  const urls = source?.packageMetadata?.urls ?? [];
  return urls
    .map((url) => getMobileRegistrableDomain(url))
    .filter((domain): domain is string => Boolean(domain));
}

/**
 * The cover to show for a library entry: the entry's own cover unless it is
 * missing or a known placeholder, then the first usable cover a linked source
 * reported (in the user's source order).
 */
export function resolveMobileEntryDisplayCover(
  entry: LibraryEntry,
  knownSourceCovers: MobileKnownSourceCovers = {},
): string | undefined {
  const own = getEntryCover(entry);
  if (own && isMobileUsableCoverUrl(own)) return own;
  for (const link of sortMobileSourceLinks(entry.sources, entry.item.sourceOrder)) {
    const known = knownSourceCovers[link.id];
    if (known && isMobileUsableCoverUrl(known)) return known;
  }
  return own?.trim() ? own : undefined;
}

/**
 * Linked sources ordered by how likely they are to own `cover`:
 * 1. a link whose details reported exactly this cover (known or remembered),
 * 2. a link whose source package lists a URL on the cover's domain,
 * 3. the remaining links in the user's source order (primary first).
 */
export function resolveMobileEntryCoverSourceLinks(
  entry: LibraryEntry,
  installedSources: readonly InstalledSource[],
  options: {
    cover?: string | null;
    knownSourceCovers?: MobileKnownSourceCovers;
  } = {},
): LocalSourceLink[] {
  const links = sortMobileSourceLinks(
    entry.sources.filter((link) => link.removed !== true),
    entry.item.sourceOrder,
  );
  const cover = (options.cover ?? getEntryCover(entry))?.trim();
  if (!cover) return links;
  const known = options.knownSourceCovers ?? {};
  const rememberedOwner = rememberedCoverOwners.get(cover);
  const coverDomain = getMobileRegistrableDomain(cover);

  const rank = (link: LocalSourceLink): number => {
    if (known[link.id]?.trim() === cover) return 0;
    if (
      rememberedOwner &&
      rememberedOwner === sourceIdentity(link.registryId, link.sourceId)
    ) {
      return 0;
    }
    const installed = installedSourceForLink(link, installedSources);
    if (installed && rememberedOwner) {
      const installedIdentity = sourceIdentity(
        installed.registryId,
        installed.sourceId ?? link.sourceId,
      );
      if (installedIdentity === rememberedOwner) return 0;
    }
    if (coverDomain && sourceDomains(installed).includes(coverDomain)) return 1;
    return 2;
  };
  return links
    .map((link, index) => ({ link, index, rank: rank(link) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ link }) => link);
}

/**
 * Installed sources to try, in order, when requesting an entry's cover. The
 * first is the likely owner; later ones are fallbacks when a request fails.
 * Links without an install are skipped (their cover still paints bare).
 */
export function resolveMobileEntryCoverSources(
  entry: LibraryEntry,
  installedSources: readonly InstalledSource[],
  options: {
    cover?: string | null;
    knownSourceCovers?: MobileKnownSourceCovers;
  } = {},
): InstalledSource[] {
  const seen = new Set<string>();
  const result: InstalledSource[] = [];
  for (const link of resolveMobileEntryCoverSourceLinks(
    entry,
    installedSources,
    options,
  )) {
    const installed = installedSourceForLink(link, installedSources);
    if (!installed || seen.has(installed.id)) continue;
    seen.add(installed.id);
    result.push(installed);
  }
  return result;
}
