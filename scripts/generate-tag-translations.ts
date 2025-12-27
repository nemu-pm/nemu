/**
 * Generate English tag/genre JSON files for translation mapping
 * Run: bun scripts/generate-tag-translations.ts
 */

import { mkdirSync, writeFileSync } from "fs";

const OUTPUT_DIR = "src/lib/metadata/translations";

// ============================================================================
// MangaUpdates Genres
// ============================================================================

async function fetchMUGenres(): Promise<string[]> {
  const res = await fetch("https://api.mangaupdates.com/v1/genres", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; nemu/1.0)" },
  });
  if (!res.ok) throw new Error(`MU genres failed: ${res.status}`);
  const data = await res.json();
  return data.map((g: { genre: string }) => g.genre);
}

// ============================================================================
// AniList Genres & Tags
// ============================================================================

async function fetchALGenres(): Promise<string[]> {
  const query = `query { GenreCollection }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`AL genres failed: ${res.status}`);
  const data = await res.json();
  return data.data?.GenreCollection || [];
}

interface ALTag {
  id: number;
  name: string;
  description: string;
  category: string;
  isGeneralSpoiler: boolean;
  isAdult: boolean;
}

async function fetchALTags(): Promise<ALTag[]> {
  const query = `
    query {
      MediaTagCollection {
        id
        name
        description
        category
        isGeneralSpoiler
        isAdult
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`AL tags failed: ${res.status}`);
  const data = await res.json();
  return data.data?.MediaTagCollection || [];
}

// ============================================================================
// MAL/Jikan Genres
// ============================================================================

interface MALGenre {
  mal_id: number;
  name: string;
  url: string;
  count: number;
}

async function fetchMALGenres(): Promise<MALGenre[]> {
  const res = await fetch("https://api.jikan.moe/v4/genres/manga");
  if (!res.ok) throw new Error(`MAL genres failed: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("Fetching data from providers...\n");

  // Fetch all data
  const [muGenres, alGenres, alTags, malGenres] = await Promise.all([
    fetchMUGenres(),
    fetchALGenres(),
    fetchALTags(),
    fetchMALGenres(),
  ]);

  console.log(`MangaUpdates: ${muGenres.length} genres`);
  console.log(`AniList: ${alGenres.length} genres, ${alTags.length} tags`);
  console.log(`MAL: ${malGenres.length} genres (with possible duplicates)`);

  // Dedupe MAL genres by mal_id
  const malUnique = new Map<number, MALGenre>();
  for (const g of malGenres) {
    if (!malUnique.has(g.mal_id)) {
      malUnique.set(g.mal_id, g);
    }
  }
  const malDeduped = Array.from(malUnique.values()).sort((a, b) => a.mal_id - b.mal_id);
  console.log(`MAL (deduped): ${malDeduped.length} genres`);

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. All provider genres combined (for reference)
  // Normalize to handle case differences (e.g., "Sci-Fi" vs "Sci-fi")
  const genreMap = new Map<string, string>(); // lowercase -> preferred form
  const addGenre = (g: string) => {
    const key = g.toLowerCase();
    if (!genreMap.has(key)) {
      genreMap.set(key, g);
    }
  };
  muGenres.forEach(addGenre);
  alGenres.forEach(addGenre);
  malDeduped.forEach(g => addGenre(g.name));
  
  const genresEn = Array.from(genreMap.values()).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  writeFileSync(
    `${OUTPUT_DIR}/genres-en.json`,
    JSON.stringify(genresEn, null, 2) + "\n"
  );
  console.log(`\nWrote ${genresEn.length} unique genres to genres-en.json`);

  // 2. AniList tags (with metadata for context)
  const anilistTagsEn: Record<string, { category: string; description: string }> = {};
  for (const tag of alTags) {
    anilistTagsEn[tag.name] = {
      category: tag.category,
      description: tag.description,
    };
  }
  writeFileSync(
    `${OUTPUT_DIR}/anilist-tags-en.json`,
    JSON.stringify(anilistTagsEn, null, 2) + "\n"
  );
  console.log(`Wrote ${alTags.length} AniList tags to anilist-tags-en.json`);

  console.log("\n✅ Done! Files created in", OUTPUT_DIR);
}

main().catch(console.error);

