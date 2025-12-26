/**
 * Jikan (MyAnimeList) metadata provider
 * API docs: https://docs.api.jikan.moe/
 */

import type { MangaMetadata } from "@/data/schema";
import type { MetadataSearchResult } from "../types";
import { findMatchingTitle } from "../matching";
import { MangaStatus } from "@/lib/sources/types";

const API_BASE = "https://api.jikan.moe/v4";

// Rate limit: 3 requests per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 350; // ms

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((r) =>
      setTimeout(r, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();
  return fetch(url);
}

interface JikanManga {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  url?: string;
  images?: {
    jpg?: { large_image_url?: string };
    webp?: { large_image_url?: string };
  };
  synopsis?: string;
  status?: string;
  chapters?: number;
  volumes?: number;
  genres?: Array<{ name: string }>;
  themes?: Array<{ name: string }>;
  authors?: Array<{ name: string }>;
}

/**
 * Search Jikan for a manga with validation
 */
export async function searchJikan(
  query: string
): Promise<MetadataSearchResult | null> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  const res = await rateLimitedFetch(`${API_BASE}/manga?${params}`);

  if (!res.ok) {
    console.error("[Jikan] Search error:", res.status);
    return null;
  }

  const data = await res.json();
  const results = (data.data || []) as JikanManga[];

  for (const m of results) {
    const names = [
      m.title,
      m.title_english,
      m.title_japanese,
      ...(m.title_synonyms || []),
    ].filter((n): n is string => Boolean(n));

    const matchedTitle = findMatchingTitle(query, names);
    if (matchedTitle) {
      return {
        source: "mal",
        externalId: m.mal_id,
        metadata: mapToMetadata(m),
        associatedTitles: names,
        coverUrl:
          m.images?.webp?.large_image_url || m.images?.jpg?.large_image_url,
        sourceUrl: m.url,
      };
    }
  }

  return null;
}

/**
 * Search Jikan without validation (for manual search UI)
 */
export async function searchJikanRaw(query: string): Promise<JikanManga[]> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  const res = await rateLimitedFetch(`${API_BASE}/manga?${params}`);

  if (!res.ok) return [];

  const data = await res.json();
  return (data.data || []) as JikanManga[];
}

/**
 * Fetch Jikan manga by MAL ID
 */
export async function fetchJikanById(malId: number): Promise<JikanManga | null> {
  const res = await rateLimitedFetch(`${API_BASE}/manga/${malId}`);
  if (!res.ok) return null;

  const data = await res.json();
  return data.data || null;
}

/**
 * Map Jikan data to our metadata schema
 */
function mapToMetadata(m: JikanManga): MangaMetadata {
  // Map status
  let status: number = MangaStatus.Unknown;
  if (m.status) {
    const statusLower = m.status.toLowerCase();
    if (statusLower.includes("publishing")) status = MangaStatus.Ongoing;
    else if (statusLower.includes("finished")) status = MangaStatus.Completed;
    else if (statusLower.includes("hiatus")) status = MangaStatus.Hiatus;
    else if (statusLower.includes("discontinued"))
      status = MangaStatus.Cancelled;
  }

  // Combine genres and themes as tags
  const tags = [
    ...(m.genres?.map((g) => g.name) || []),
    ...(m.themes?.map((t) => t.name) || []),
  ];

  return {
    title: m.title,
    cover: m.images?.webp?.large_image_url || m.images?.jpg?.large_image_url,
    authors: m.authors?.map((a) => a.name),
    description: m.synopsis,
    tags: tags.length ? tags : undefined,
    status,
    url: m.url,
  };
}

export { mapToMetadata as mapJikanToMetadata };
export type { JikanManga };


