/**
 * Test Script 2: Provider Title Extraction
 * 
 * Test extracting Japanese/Chinese titles from each provider's response.
 * Run: bun scripts/test-provider-title-extraction.ts
 */

type Language = "ja" | "zh" | "en" | "unknown";

function detectLanguage(title: string): Language {
  const hasHiragana = /[\u3040-\u309F]/.test(title);
  const hasKatakana = /[\u30A0-\u30FF]/.test(title);
  const hasKanji = /[\u4E00-\u9FAF]/.test(title);
  
  if (hasHiragana || hasKatakana) return "ja";
  if (hasKanji) return "zh"; // Ambiguous but likely Chinese if no kana
  return "en";
}

// ============================================================================
// MangaUpdates - Extract from associated[]
// ============================================================================

async function testMUTitleExtraction(query: string) {
  console.log(`\n--- MangaUpdates: "${query}" ---`);
  
  const res = await fetch("https://api.mangaupdates.com/v1/series/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; test/1.0)",
    },
    body: JSON.stringify({ search: query, per_page: 1 }),
  });

  if (!res.ok) {
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const results = data.results as Array<{ record: { series_id: number } }>;
  if (results.length === 0) {
    console.log("No results");
    return;
  }

  // Fetch full details
  const detailRes = await fetch(
    `https://api.mangaupdates.com/v1/series/${results[0].record.series_id}`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; test/1.0)" } }
  );
  const detail = await detailRes.json();

  const allTitles = [
    { title: detail.title, source: "main" },
    ...(detail.associated?.map((a: { title: string }) => ({ title: a.title, source: "associated" })) || []),
  ];

  console.log("Primary:", detail.title);
  console.log("\nAll titles by detected language:");
  
  const byLang: Record<Language, string[]> = { ja: [], zh: [], en: [], unknown: [] };
  for (const { title } of allTitles) {
    const lang = detectLanguage(title);
    byLang[lang].push(title);
  }
  
  for (const [lang, titles] of Object.entries(byLang)) {
    if (titles.length > 0) {
      console.log(`  ${lang.toUpperCase()}: ${titles.join(" | ")}`);
    }
  }
}

// ============================================================================
// AniList - Extract from title fields and synonyms
// ============================================================================

async function testALTitleExtraction(query: string) {
  console.log(`\n--- AniList: "${query}" ---`);
  
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 1) {
        media(search: $search, type: MANGA) {
          id
          title { romaji english native }
          synonyms
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
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const media = data.data?.Page?.media?.[0];
  if (!media) {
    console.log("No results");
    return;
  }

  console.log("Title fields:");
  console.log(`  romaji: ${media.title.romaji}`);
  console.log(`  english: ${media.title.english || "(null)"}`);
  console.log(`  native: ${media.title.native} -> detected: ${detectLanguage(media.title.native || "")}`);
  
  if (media.synonyms?.length > 0) {
    console.log("\nSynonyms by detected language:");
    const byLang: Record<Language, string[]> = { ja: [], zh: [], en: [], unknown: [] };
    for (const syn of media.synonyms) {
      const lang = detectLanguage(syn);
      byLang[lang].push(syn);
    }
    for (const [lang, titles] of Object.entries(byLang)) {
      if (titles.length > 0) {
        console.log(`  ${lang.toUpperCase()}: ${titles.join(" | ")}`);
      }
    }
  }
}

// ============================================================================
// Jikan/MAL - Extract from title fields
// ============================================================================

async function testMALTitleExtraction(query: string) {
  console.log(`\n--- Jikan/MAL: "${query}" ---`);
  
  await new Promise(r => setTimeout(r, 400)); // Rate limit
  
  const params = new URLSearchParams({ q: query, limit: "1" });
  const res = await fetch(`https://api.jikan.moe/v4/manga?${params}`);

  if (!res.ok) {
    console.log("Search failed:", res.status);
    return;
  }

  const data = await res.json();
  const manga = data.data?.[0];
  if (!manga) {
    console.log("No results");
    return;
  }

  console.log("Title fields:");
  console.log(`  title (romaji): ${manga.title}`);
  console.log(`  title_english: ${manga.title_english || "(null)"}`);
  console.log(`  title_japanese: ${manga.title_japanese} -> detected: ${detectLanguage(manga.title_japanese || "")}`);
  
  if (manga.title_synonyms?.length > 0) {
    console.log("\nSynonyms by detected language:");
    const byLang: Record<Language, string[]> = { ja: [], zh: [], en: [], unknown: [] };
    for (const syn of manga.title_synonyms) {
      const lang = detectLanguage(syn);
      byLang[lang].push(syn);
    }
    for (const [lang, titles] of Object.entries(byLang)) {
      if (titles.length > 0) {
        console.log(`  ${lang.toUpperCase()}: ${titles.join(" | ")}`);
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================

const TEST_MANGA = [
  "Tamon-kun Ima Docchi",  // Has Chinese translation
  "Chainsaw Man",
  "Spy x Family",
  "Jujutsu Kaisen",        // 呪術廻戦 - kanji only Japanese
  "One Piece",
  "Attack on Titan",
];

async function main() {
  console.log("=".repeat(60));
  console.log("Provider Title Extraction Test");
  console.log("=".repeat(60));

  for (const query of TEST_MANGA) {
    console.log("\n\n" + "#".repeat(60));
    console.log(`# ${query}`);
    console.log("#".repeat(60));

    await testMUTitleExtraction(query);
    await testALTitleExtraction(query);
    await testMALTitleExtraction(query);
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("\nKey findings:");
  console.log("- AniList 'native' field is ALWAYS Japanese (not Chinese)");
  console.log("- MAL 'title_japanese' field is ALWAYS Japanese");
  console.log("- MangaUpdates 'associated' has mixed languages (need detection)");
  console.log("- AniList 'synonyms' can have Chinese (detected via no kana + has kanji)");
  console.log("- For Chinese titles: MU associated > AniList synonyms > Gemini fallback");
}

main().catch(console.error);

