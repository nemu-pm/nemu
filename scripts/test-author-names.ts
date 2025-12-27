/**
 * Test author name fields from each provider
 * Run: bun scripts/test-author-names.ts
 */

const TEST_MANGA = "Chainsaw Man";

// ============================================================================
// AniList - Check staff name fields
// ============================================================================

async function testAniListAuthors() {
  console.log("\n=== AniList Author Names ===");
  
  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        title { romaji }
        staff(sort: RELEVANCE, perPage: 10) {
          edges {
            role
            node {
              name {
                full
                native
                first
                last
                userPreferred
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { search: TEST_MANGA } }),
  });

  const data = await res.json();
  const media = data.data?.Media;
  
  console.log("Title:", media?.title?.romaji);
  console.log("\nStaff:");
  for (const edge of media?.staff?.edges || []) {
    console.log(`  ${edge.role}:`);
    console.log(`    full: ${edge.node.name.full}`);
    console.log(`    native: ${edge.node.name.native}`);
    console.log(`    first: ${edge.node.name.first}`);
    console.log(`    last: ${edge.node.name.last}`);
  }
}

// ============================================================================
// Jikan/MAL - Check author fields and person endpoint
// ============================================================================

async function testMALAuthors() {
  console.log("\n=== MAL/Jikan Author Names ===");
  
  // Search manga
  const searchRes = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(TEST_MANGA)}&limit=1`);
  const searchData = await searchRes.json();
  const manga = searchData.data?.[0];
  
  console.log("Title:", manga?.title);
  console.log("\nAuthors from manga endpoint:");
  for (const author of manga?.authors || []) {
    console.log(`  ${JSON.stringify(author)}`);
  }
  
  // If we have author ID, fetch person details
  if (manga?.authors?.[0]?.mal_id) {
    const authorId = manga.authors[0].mal_id;
    console.log(`\nFetching person details for ID ${authorId}...`);
    
    await new Promise(r => setTimeout(r, 400)); // Rate limit
    
    const personRes = await fetch(`https://api.jikan.moe/v4/people/${authorId}`);
    const personData = await personRes.json();
    const person = personData.data;
    
    console.log("Person details:");
    console.log(`  name: ${person?.name}`);
    console.log(`  given_name: ${person?.given_name}`);
    console.log(`  family_name: ${person?.family_name}`);
    console.log(`  alternate_names: ${JSON.stringify(person?.alternate_names)}`);
  }
}

// ============================================================================
// MangaUpdates - Check author fields
// ============================================================================

async function testMUAuthors() {
  console.log("\n=== MangaUpdates Author Names ===");
  
  const searchRes = await fetch("https://api.mangaupdates.com/v1/series/search", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; test/1.0)",
    },
    body: JSON.stringify({ search: TEST_MANGA, per_page: 1 }),
  });
  
  const searchData = await searchRes.json();
  const seriesId = searchData.results?.[0]?.record?.series_id;
  
  if (!seriesId) {
    console.log("No results found");
    return;
  }
  
  // Fetch full series details
  const detailRes = await fetch(`https://api.mangaupdates.com/v1/series/${seriesId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
  });
  const detail = await detailRes.json();
  
  console.log("Title:", detail.title);
  console.log("\nAuthors from series endpoint:");
  for (const author of detail.authors || []) {
    console.log(`  ${JSON.stringify(author)}`);
  }
  
  // Check if there's an author ID we can fetch
  if (detail.authors?.[0]?.author_id) {
    const authorId = detail.authors[0].author_id;
    console.log(`\nFetching author details for ID ${authorId}...`);
    
    const authorRes = await fetch(`https://api.mangaupdates.com/v1/authors/${authorId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
    });
    const authorData = await authorRes.json();
    console.log("Author details:", JSON.stringify(authorData, null, 2));
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("Author Name Fields Test");
  console.log("Test manga:", TEST_MANGA);
  console.log("=".repeat(60));

  await testAniListAuthors();
  await testMALAuthors();
  await testMUAuthors();
  
  console.log("\n" + "=".repeat(60));
  console.log("Done");
  console.log("=".repeat(60));
}

main().catch(console.error);

