import type { MobileLiveSearchManga } from "@/sources/mobileSourceSearch";

/**
 * Short-lived hand-off of the tapped card's data into the source manga
 * screen, so the detail page can render the cover/title the user just tapped
 * instead of a blank skeleton while details+chapters load. Keys are
 * `${registryId}:${sourceId}:${mangaId}`; entries are consumed once and
 * evicted oldest-first.
 */
const MOBILE_SOURCE_DETAIL_SEED_LIMIT = 32;

const seeds = new Map<string, MobileLiveSearchManga>();

export function makeMobileSourceDetailSeedKey(
  registryId: string,
  sourceId: string,
  mangaId: string,
): string {
  return `${registryId}:${sourceId}:${mangaId}`;
}

export function setMobileSourceDetailSeed(
  registryId: string,
  sourceId: string,
  mangaId: string,
  manga: MobileLiveSearchManga,
): void {
  const key = makeMobileSourceDetailSeedKey(registryId, sourceId, mangaId);
  seeds.delete(key);
  seeds.set(key, manga);
  while (seeds.size > MOBILE_SOURCE_DETAIL_SEED_LIMIT) {
    const firstKey = seeds.keys().next().value;
    if (!firstKey) break;
    seeds.delete(firstKey);
  }
}

export function takeMobileSourceDetailSeed(
  registryId: string,
  sourceId: string,
  mangaId: string,
): MobileLiveSearchManga | null {
  const key = makeMobileSourceDetailSeedKey(registryId, sourceId, mangaId);
  const seed = seeds.get(key);
  if (seed) seeds.delete(key);
  return seed ?? null;
}
