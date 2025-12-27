/**
 * Test looking up author's original Japanese name from each provider
 * Run: bun scripts/test-author-lookup.ts
 */

// Test with authors from previous search results
const TEST_AUTHORS = [
  "Nojin", // From Tamon-kun manga - should be 野人 or similar
  "Kohei Horikoshi", // My Hero Academia author
  "Eiichiro Oda", // One Piece author
];

// ============================================================================
// MangaUpdates - Author Search
// ============================================================================

async function searchMUAuthor(name: string) {
  console.log(`\n--- MangaUpdates: "${name}" ---`);

  const res = await fetch("https://api.mangaupdates.com/v1/authors/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; test/1.0)",
    },
    body: JSON.stringify({ search: name, per_page: 3 }),
  });

  if (!res.ok) {
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const results = data.results as Array<{
    record: {
      id: number;
      name: string;
      url: string;
      associated?: Array<{ name: string }>;
    };
  }>;

  if (results.length === 0) {
    console.log("No results");
    return;
  }

  for (const r of results) {
    // Fetch full author details
    const detailRes = await fetch(
      `https://api.mangaupdates.com/v1/authors/${r.record.id}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" },
      }
    );

    if (!detailRes.ok) {
      console.log(`Detail fetch failed for ${r.record.name}`);
      continue;
    }

    const detail = await detailRes.json();
    console.log({
      name: detail.name,
      associated: detail.associated?.map((a: { name: string }) => a.name),
      url: detail.url,
    });
  }
}

// ============================================================================
// AniList - Staff Search
// ============================================================================

async function searchALStaff(name: string) {
  console.log(`\n--- AniList: "${name}" ---`);

  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        staff(search: $search) {
          id
          name {
            full
            native
            alternative
          }
          siteUrl
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { search: name } }),
  });

  if (!res.ok) {
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const staff = data.data?.Page?.staff || [];

  if (staff.length === 0) {
    console.log("No results");
    return;
  }

  for (const s of staff.slice(0, 3)) {
    console.log({
      full: s.name.full,
      native: s.name.native,
      alternative: s.name.alternative,
      url: s.siteUrl,
    });
  }
}

// ============================================================================
// Jikan - Person Search
// ============================================================================

async function searchJikanPerson(name: string) {
  console.log(`\n--- Jikan (MAL): "${name}" ---`);

  // Rate limit
  await new Promise((r) => setTimeout(r, 400));

  const params = new URLSearchParams({ q: name, limit: "3" });
  const res = await fetch(`https://api.jikan.moe/v4/people?${params}`);

  if (!res.ok) {
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const people = data.data || [];

  if (people.length === 0) {
    console.log("No results");
    return;
  }

  for (const p of people) {
    console.log({
      name: p.name,
      given_name: p.given_name,
      family_name: p.family_name,
      alternate_names: p.alternate_names,
      url: p.url,
    });
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("========================================");
  console.log("Author Japanese Name Lookup Test");
  console.log("========================================");

  for (const author of TEST_AUTHORS) {
    console.log(`\n\n${"#".repeat(50)}`);
    console.log(`# Author: "${author}"`);
    console.log(`${"#".repeat(50)}`);

    await searchMUAuthor(author);
    await searchALStaff(author);
    await searchJikanPerson(author);
  }

  console.log("\n\n========================================");
  console.log("Done!");
}

main().catch(console.error);

