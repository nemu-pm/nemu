/**
 * MangaUpdates metadata provider
 * API docs: https://api.mangaupdates.com/openapi.yaml
 */

import type { MangaMetadata } from "@/data/schema";
import type { MetadataSearchResult } from "../types";
import { findMatchingTitle } from "../matching";
import { MangaStatus } from "@/lib/sources/types";

const API_BASE = "https://api.mangaupdates.com/v1";

interface MUSeriesSearchResult {
  series_id: number;
  title: string;
  url: string;
  description?: string;
  image?: {
    url: { original: string; thumb: string };
  };
  type?: string;
  year?: string;
  genres?: Array<{ genre: string }>;
}

interface MUSeriesDetail {
  series_id: number;
  title: string;
  url: string;
  description?: string;
  image?: {
    url: { original: string; thumb: string };
  };
  type?: string;
  year?: string;
  status?: string;
  genres?: Array<{ genre: string }>;
  categories?: Array<{ category: string }>;
  authors?: Array<{ name: string; type: string }>;
  associated?: Array<{ title: string }>;
  latest_chapter?: number;
}

/**
 * Search MangaUpdates for a manga
 */
export async function searchMangaUpdates(
  query: string,
  maxResults = 5
): Promise<MetadataSearchResult | null> {
  const res = await fetch(`${API_BASE}/series/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: query, per_page: maxResults }),
  });

  if (!res.ok) {
    console.error("[MangaUpdates] Search error:", res.status);
    return null;
  }

  const data = await res.json();
  const results = data.results as Array<{ record: MUSeriesSearchResult }>;

  // Search results don't include associated names - need to fetch full details
  for (const r of results) {
    const detail = await fetchSeriesDetail(r.record.series_id);
    if (!detail) continue;

    const names = [
      detail.title,
      ...(detail.associated?.map((a) => a.title) || []),
    ];

    const matchedTitle = findMatchingTitle(query, names);
    if (matchedTitle) {
      return {
        source: "mangaupdates",
        externalId: detail.series_id,
        metadata: mapToMetadata(detail),
        associatedTitles: names,
        coverUrl: detail.image?.url.original,
        sourceUrl: detail.url,
      };
    }
  }

  return null;
}

/**
 * Fetch full series details from MangaUpdates
 */
export async function fetchSeriesDetail(
  seriesId: number
): Promise<MUSeriesDetail | null> {
  const res = await fetch(`${API_BASE}/series/${seriesId}`);
  if (!res.ok) {
    console.error("[MangaUpdates] Fetch error:", res.status);
    return null;
  }
  return res.json();
}

/**
 * Search MangaUpdates without validation (for manual search UI)
 */
export async function searchMangaUpdatesRaw(
  query: string,
  maxResults = 10
): Promise<MUSeriesDetail[]> {
  const res = await fetch(`${API_BASE}/series/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search: query, per_page: maxResults }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const results = data.results as Array<{ record: MUSeriesSearchResult }>;

  // Fetch full details for each result
  const details = await Promise.all(
    results.map((r) => fetchSeriesDetail(r.record.series_id))
  );

  return details.filter((d): d is MUSeriesDetail => d !== null);
}

/**
 * Map MangaUpdates data to our metadata schema
 */
function mapToMetadata(detail: MUSeriesDetail): MangaMetadata {
  // Parse status string like "13 Volumes (Ongoing)"
  let status: number = MangaStatus.Unknown;
  if (detail.status) {
    const statusLower = detail.status.toLowerCase();
    if (statusLower.includes("ongoing")) status = MangaStatus.Ongoing;
    else if (statusLower.includes("complete")) status = MangaStatus.Completed;
    else if (statusLower.includes("hiatus")) status = MangaStatus.Hiatus;
    else if (statusLower.includes("discontinue") || statusLower.includes("cancel"))
      status = MangaStatus.Cancelled;
  }

  // Separate authors and artists
  const authors = detail.authors
    ?.filter((a) => a.type === "Author")
    .map((a) => a.name);
  const artists = detail.authors
    ?.filter((a) => a.type === "Artist")
    .map((a) => a.name);

  // Combine genres and top categories as tags
  const tags = [
    ...(detail.genres?.map((g) => g.genre) || []),
    ...(detail.categories?.slice(0, 10).map((c) => c.category) || []),
  ];

  return {
    title: detail.title,
    cover: detail.image?.url.original,
    authors: authors?.length ? authors : undefined,
    artists: artists?.length ? artists : undefined,
    description: detail.description,
    tags: tags.length ? tags : undefined,
    status,
    url: detail.url,
  };
}


