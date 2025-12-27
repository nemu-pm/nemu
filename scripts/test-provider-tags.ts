/**
 * Test if providers have enumerated tag/genre lists
 * Run: bun scripts/test-provider-tags.ts
 */

// ============================================================================
// MangaUpdates - Genres & Categories
// ============================================================================

async function getMUGenres() {
  console.log("\n=== MangaUpdates Genres ===");
  
  const res = await fetch("https://api.mangaupdates.com/v1/genres", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
  });

  if (!res.ok) {
    console.log("Failed:", res.status);
    return;
  }

  const data = await res.json();
  console.log("Total genres:", data.length);
  console.log("Genres:", data.map((g: { genre: string }) => g.genre));
}

async function getMUCategories() {
  console.log("\n=== MangaUpdates Categories ===");
  
  // Categories might not have a list endpoint - let's check
  const res = await fetch("https://api.mangaupdates.com/v1/categories", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
  });

  if (!res.ok) {
    console.log("No categories endpoint (status:", res.status, ")");
    console.log("Categories are likely user-generated/dynamic");
    return;
  }

  const data = await res.json();
  console.log("Response:", data);
}

// ============================================================================
// AniList - Genres & Tags
// ============================================================================

async function getALGenres() {
  console.log("\n=== AniList Genres ===");
  
  const query = `
    query {
      GenreCollection
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    console.log("Failed:", res.status);
    return;
  }

  const data = await res.json();
  const genres = data.data?.GenreCollection || [];
  console.log("Total genres:", genres.length);
  console.log("Genres:", genres);
}

async function getALTags() {
  console.log("\n=== AniList Tags (Media Tags) ===");
  
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

  if (!res.ok) {
    console.log("Failed:", res.status);
    return;
  }

  const data = await res.json();
  const tags = data.data?.MediaTagCollection || [];
  console.log("Total tags:", tags.length);
  
  // Group by category
  const byCategory = new Map<string, string[]>();
  for (const tag of tags) {
    const cat = tag.category || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(tag.name);
  }
  
  console.log("\nCategories:");
  for (const [cat, tagNames] of byCategory) {
    console.log(`  ${cat}: ${tagNames.length} tags`);
  }
  
  console.log("\nSample tags:");
  for (const tag of tags.slice(0, 10)) {
    console.log(`  - ${tag.name} (${tag.category}): ${tag.description?.slice(0, 60)}...`);
  }
}

// ============================================================================
// Jikan (MAL) - Genres & Themes
// ============================================================================

async function getMALGenres() {
  console.log("\n=== Jikan/MAL Manga Genres ===");
  
  await new Promise(r => setTimeout(r, 400)); // Rate limit
  
  const res = await fetch("https://api.jikan.moe/v4/genres/manga");

  if (!res.ok) {
    console.log("Failed:", res.status);
    return;
  }

  const data = await res.json();
  const genres = data.data || [];
  console.log("Total genres:", genres.length);
  console.log("Genres:", genres.map((g: { name: string; mal_id: number }) => `${g.name} (${g.mal_id})`));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("========================================");
  console.log("Provider Tags/Genres Investigation");
  console.log("========================================");

  await getMUGenres();
  await getMUCategories();
  await getALGenres();
  await getALTags();
  await getMALGenres();

  console.log("\n\n========================================");
  console.log("Summary");
  console.log("========================================");
}

main().catch(console.error);

