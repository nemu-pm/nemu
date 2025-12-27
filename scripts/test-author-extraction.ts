/**
 * Test the author name extraction functions
 * Run: bun scripts/test-author-extraction.ts
 */

import { searchAniListRaw } from "../src/lib/metadata/providers/anilist";
import { searchMangaUpdatesRaw, fetchMUAuthorJapaneseNames } from "../src/lib/metadata/providers/mangaupdates";
import { searchJikanRaw, fetchJikanAuthorJapaneseNames } from "../src/lib/metadata/providers/jikan";
import { getALJapaneseStaffNames, convertAuthorsToJapanese } from "../src/lib/metadata/matching";

const TEST_MANGA = "Chainsaw Man";

async function main() {
  console.log("=".repeat(60));
  console.log("Author Name Extraction Test");
  console.log("Test manga:", TEST_MANGA);
  console.log("=".repeat(60));

  // Test AniList
  console.log("\n=== AniList ===");
  const alResults = await searchAniListRaw(TEST_MANGA);
  if (alResults[0]) {
    const { authors, artists } = getALJapaneseStaffNames(alResults[0]);
    console.log("Japanese Authors:", authors);
    console.log("Japanese Artists:", artists);
  }

  // Test MAL/Jikan
  console.log("\n=== MAL/Jikan ===");
  const malResults = await searchJikanRaw(TEST_MANGA);
  if (malResults[0]) {
    console.log("Romanized Authors:", malResults[0].authors?.map(a => a.name));
    const nameMap = await fetchJikanAuthorJapaneseNames(malResults[0]);
    console.log("Name Map:", Object.fromEntries(nameMap));
    
    const japaneseAuthors = convertAuthorsToJapanese(
      malResults[0].authors?.map(a => a.name),
      nameMap
    );
    console.log("Japanese Authors:", japaneseAuthors);
  }

  // Test MangaUpdates
  console.log("\n=== MangaUpdates ===");
  const muResults = await searchMangaUpdatesRaw(TEST_MANGA);
  if (muResults[0]) {
    console.log("Romanized Authors:", muResults[0].authors?.map(a => a.name));
    const nameMap = await fetchMUAuthorJapaneseNames(muResults[0]);
    console.log("Name Map:", Object.fromEntries(nameMap));
    
    const japaneseAuthors = convertAuthorsToJapanese(
      muResults[0].authors?.filter(a => a.type === "Author").map(a => a.name),
      nameMap
    );
    console.log("Japanese Authors:", japaneseAuthors);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done");
}

main().catch(console.error);

