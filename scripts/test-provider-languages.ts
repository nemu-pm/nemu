/**
 * Test what language metadata different providers return
 * Run: bun scripts/test-provider-languages.ts
 */

// Test both Chinese and Japanese titles
const QUERIES = [
  "现在多闻君是哪一面！？",  // Chinese
  "多聞くん今どっち！？",    // Japanese
  "Tamon-kun Ima Docchi",   // Romaji
];

// ============================================================================
// MangaUpdates
// ============================================================================

async function searchMangaUpdates(query: string) {
  console.log("\n=== MangaUpdates ===");
  console.log(`Searching: "${query}"\n`);

  const res = await fetch("https://api.mangaupdates.com/v1/series/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; test/1.0)",
    },
    body: JSON.stringify({ search: query, per_page: 3 }),
  });

  if (!res.ok) {
    console.error("MU search failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const results = data.results as Array<{ record: { series_id: number; title: string } }>;

  if (results.length === 0) {
    console.log("No results found");
    return;
  }

  // Fetch full details for first result
  for (const r of results.slice(0, 2)) {
    const detailRes = await fetch(`https://api.mangaupdates.com/v1/series/${r.record.series_id}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
    });
    
    if (!detailRes.ok) {
      console.error("MU detail failed:", detailRes.status);
      continue;
    }

    const detail = await detailRes.json();
    console.log("Result:", {
      series_id: detail.series_id,
      title: detail.title,
      associated: detail.associated?.map((a: { title: string }) => a.title),
      description: detail.description?.slice(0, 200) + "...",
      genres: detail.genres?.map((g: { genre: string }) => g.genre),
      categories: detail.categories?.slice(0, 5).map((c: { category: string }) => c.category),
    });
    console.log("---");
  }
}

// ============================================================================
// AniList
// ============================================================================

async function searchAniList(query: string) {
  console.log("\n=== AniList ===");
  console.log(`Searching: "${query}"\n`);

  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: MANGA) {
          id
          title { romaji english native }
          description
          genres
          tags { name rank }
          synonyms
          siteUrl
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: gqlQuery, variables: { search: query } }),
  });

  if (!res.ok) {
    console.error("AniList search failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const media = data.data?.Page?.media || [];

  if (media.length === 0) {
    console.log("No results found");
    return;
  }

  for (const m of media.slice(0, 3)) {
    console.log("Result:", {
      id: m.id,
      title_romaji: m.title.romaji,
      title_english: m.title.english,
      title_native: m.title.native,
      synonyms: m.synonyms,
      description: m.description?.replace(/<[^>]+>/g, "").slice(0, 200) + "...",
      genres: m.genres,
      tags: m.tags?.slice(0, 5).map((t: { name: string }) => t.name),
    });
    console.log("---");
  }
}

// ============================================================================
// Jikan (MyAnimeList)
// ============================================================================

async function searchJikan(query: string) {
  console.log("\n=== Jikan (MAL) ===");
  console.log(`Searching: "${query}"\n`);

  const params = new URLSearchParams({ q: query, limit: "5" });
  const res = await fetch(`https://api.jikan.moe/v4/manga?${params}`);

  if (!res.ok) {
    console.error("Jikan search failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const results = data.data || [];

  if (results.length === 0) {
    console.log("No results found");
    return;
  }

  for (const m of results.slice(0, 3)) {
    console.log("Result:", {
      mal_id: m.mal_id,
      title: m.title,
      title_english: m.title_english,
      title_japanese: m.title_japanese,
      title_synonyms: m.title_synonyms,
      synopsis: m.synopsis?.slice(0, 200) + "...",
      genres: m.genres?.map((g: { name: string }) => g.name),
      themes: m.themes?.map((t: { name: string }) => t.name),
    });
    console.log("---");
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  for (const query of QUERIES) {
    console.log("\n\n########################################");
    console.log(`# Testing: "${query}"`);
    console.log("########################################");

    await searchMangaUpdates(query);
    await searchAniList(query);
    
    // Rate limit for Jikan
    await new Promise(r => setTimeout(r, 400));
    await searchJikan(query);
  }

  console.log("\n\n========================================");
  console.log("Done!");
}

main().catch(console.error);

