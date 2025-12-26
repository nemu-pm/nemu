/**
 * AniList metadata provider
 * API docs: https://anilist.gitbook.io/anilist-apiv2-docs/
 */

import type { MangaMetadata } from "@/data/schema";
import type { MetadataSearchResult } from "../types";
import { findMatchingTitle } from "../matching";
import { MangaStatus } from "@/lib/sources/types";

const API_URL = "https://graphql.anilist.co";

interface ALMedia {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  description?: string;
  coverImage?: {
    large?: string;
    extraLarge?: string;
  };
  genres?: string[];
  tags?: Array<{ name: string; rank: number }>;
  status?: string;
  chapters?: number;
  volumes?: number;
  synonyms?: string[];
  siteUrl?: string;
  staff?: {
    edges: Array<{
      role: string;
      node: { name: { full?: string } };
    }>;
  };
}

const SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english native }
        description
        coverImage { large extraLarge }
        genres
        tags { name rank }
        status
        chapters
        volumes
        synonyms
        siteUrl
        staff(sort: RELEVANCE, perPage: 10) {
          edges {
            role
            node { name { full } }
          }
        }
      }
    }
  }
`;

/**
 * Search AniList for a manga with validation
 */
export async function searchAniList(
  query: string
): Promise<MetadataSearchResult | null> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: query } }),
  });

  if (!res.ok) {
    console.error("[AniList] Search error:", res.status);
    return null;
  }

  const data = await res.json();
  const media = (data.data?.Page?.media || []) as ALMedia[];

  for (const m of media) {
    const names = [
      m.title.romaji,
      m.title.english,
      m.title.native,
      ...(m.synonyms || []),
    ].filter((n): n is string => Boolean(n));

    const matchedTitle = findMatchingTitle(query, names);
    if (matchedTitle) {
      return {
        source: "anilist",
        externalId: m.id,
        metadata: mapToMetadata(m),
        associatedTitles: names,
        coverUrl: m.coverImage?.extraLarge || m.coverImage?.large,
        sourceUrl: m.siteUrl,
      };
    }
  }

  return null;
}

/**
 * Search AniList without validation (for manual search UI)
 */
export async function searchAniListRaw(query: string): Promise<ALMedia[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: query } }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.data?.Page?.media || []) as ALMedia[];
}

/**
 * Fetch AniList manga by ID
 */
export async function fetchAniListById(id: number): Promise<ALMedia | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title { romaji english native }
        description
        coverImage { large extraLarge }
        genres
        tags { name rank }
        status
        chapters
        volumes
        synonyms
        siteUrl
        staff(sort: RELEVANCE, perPage: 10) {
          edges {
            role
            node { name { full } }
          }
        }
      }
    }
  `;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.data?.Media || null;
}

/**
 * Map AniList data to our metadata schema
 */
function mapToMetadata(m: ALMedia): MangaMetadata {
  // Map status
  let status: number = MangaStatus.Unknown;
  switch (m.status) {
    case "RELEASING":
      status = MangaStatus.Ongoing;
      break;
    case "FINISHED":
      status = MangaStatus.Completed;
      break;
    case "HIATUS":
      status = MangaStatus.Hiatus;
      break;
    case "CANCELLED":
      status = MangaStatus.Cancelled;
      break;
  }

  // Extract authors/artists from staff
  const authors: string[] = [];
  const artists: string[] = [];
  for (const edge of m.staff?.edges || []) {
    const name = edge.node.name.full;
    if (!name) continue;
    if (edge.role.includes("Story") || edge.role.includes("Original")) {
      authors.push(name);
    }
    if (edge.role.includes("Art")) {
      artists.push(name);
    }
  }

  // Combine genres and top tags
  const tags = [
    ...(m.genres || []),
    ...(m.tags?.slice(0, 10).map((t) => t.name) || []),
  ];

  // Clean description (remove HTML)
  const description = m.description
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  return {
    title: m.title.romaji || m.title.english || m.title.native || "",
    cover: m.coverImage?.extraLarge || m.coverImage?.large,
    authors: authors.length ? authors : undefined,
    artists: artists.length ? artists : undefined,
    description,
    tags: tags.length ? tags : undefined,
    status,
    url: m.siteUrl,
  };
}

export { mapToMetadata as mapAniListToMetadata };
export type { ALMedia };


