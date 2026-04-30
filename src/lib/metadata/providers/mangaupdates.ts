/**
 * MangaUpdates metadata provider
 * API docs: https://api.mangaupdates.com/openapi.yaml
 * 
 * Uses CORS proxy for all requests since MangaUpdates API doesn't support CORS.
 */

import type { MangaMetadata } from "@/data/schema";
import type { MetadataSearchResult } from "../types";
import { findMatchingTitle } from "../matching";
import { MangaStatus } from "@/lib/sources/types";
import { convexProxyUrl } from "@/config";
import { isNative, nativeFetch } from "@/lib/native-fetch";

const API_BASE = "https://api.mangaupdates.com/v1";

// MangaUpdates blocks Cloudflare IPs, use Convex proxy instead.
// On native (iOS/Android) the native HTTP stack hits the API directly.
async function muFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isNative()) {
    return nativeFetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Nemu/1.0)",
        ...(options.headers || {}),
      },
    });
  }
  return fetch(convexProxyUrl(url), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-proxy-user-agent": "Mozilla/5.0 (compatible; Nemu/1.0)",
      ...(options.headers || {}),
    },
  });
}

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

export interface MUSeriesDetail {
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
  authors?: Array<{ name: string; type: string; author_id?: number }>;
  associated?: Array<{ title: string }>;
  latest_chapter?: number;
}

export interface MUAuthorDetail {
  id: number;
  name: string;
  actualname?: string;
  associated?: Array<{ name: string }>;
}

/**
 * Search MangaUpdates for a manga
 */
export async function searchMangaUpdates(
  query: string,
  maxResults = 5
): Promise<MetadataSearchResult | null> {
  const res = await muFetch(`${API_BASE}/series/search`, {
    method: "POST",
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
  const res = await muFetch(`${API_BASE}/series/${seriesId}`);
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
  const res = await muFetch(`${API_BASE}/series/search`, {
    method: "POST",
    body: JSON.stringify({ search: query, per_page: maxResults }),
  });

  if (!res.ok) {
    console.error("[MangaUpdates] Search failed:", res.status, await res.text().catch(() => ""));
    return [];
  }

  const data = await res.json();
  const results = data.results as Array<{ record: MUSeriesSearchResult }>;

  // Fetch full details for each result
  const details = await Promise.all(
    results.map((r) => fetchSeriesDetail(r.record.series_id))
  );

  return details.filter((d): d is MUSeriesDetail => d !== null);
}

/**
 * Fetch author details from MangaUpdates
 */
export async function fetchMUAuthor(authorId: number): Promise<MUAuthorDetail | null> {
  const res = await muFetch(`${API_BASE}/authors/${authorId}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Get Japanese name for an author (from actualname field)
 */
export function getMUAuthorJapaneseName(author: MUAuthorDetail): string | null {
  // actualname is typically the Japanese name
  if (author.actualname) {
    return author.actualname;
  }
  // Fallback: look in associated names for Japanese characters
  if (author.associated?.length) {
    for (const assoc of author.associated) {
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(assoc.name)) {
        // Prefer names with hiragana/katakana (definitely Japanese)
        if (/[\u3040-\u309F\u30A0-\u30FF]/.test(assoc.name)) {
          return assoc.name;
        }
      }
    }
    // Fallback to kanji-only if no kana found
    for (const assoc of author.associated) {
      if (/[\u4E00-\u9FAF]/.test(assoc.name)) {
        return assoc.name;
      }
    }
  }
  return null;
}

/**
 * Fetch Japanese author names for a series
 * Returns map of romanized name -> Japanese name
 */
export async function fetchMUAuthorJapaneseNames(
  detail: MUSeriesDetail
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  for (const author of detail.authors || []) {
    if (!author.author_id) continue;
    
    const authorDetail = await fetchMUAuthor(author.author_id);
    if (!authorDetail) continue;
    
    const japaneseName = getMUAuthorJapaneseName(authorDetail);
    if (japaneseName) {
      result.set(author.name, japaneseName);
    }
  }
  
  return result;
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

  // Combine authors and artists into single array (deduped)
  const allCreators = detail.authors?.map((a) => a.name) || [];
  const uniqueCreators = [...new Set(allCreators)];

  // Use only genres (36 fixed items), exclude user-generated categories
  const tags = detail.genres?.map((g) => g.genre) || [];

  return {
    title: detail.title,
    cover: detail.image?.url.original,
    authors: uniqueCreators.length ? uniqueCreators : undefined,
    description: detail.description,
    tags: tags.length ? tags : undefined,
    status,
    url: detail.url,
  };
}


