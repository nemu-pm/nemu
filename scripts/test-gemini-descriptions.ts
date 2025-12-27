/**
 * Test Gemini for finding Japanese and Chinese manga descriptions
 * Run: bun scripts/test-gemini-descriptions.ts
 */

import { GoogleGenAI } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_AI_STUDIO_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
const MODEL = "gemini-3-flash-preview";

// Test manga with known Japanese/Chinese releases
const TEST_MANGA = [
  {
    romaji: "Tamon-kun Ima Docchi!?",
    japanese: "多聞くん今どっち！？",
    english: "Tamon's B-Side",
  },
  {
    romaji: "Chainsaw Man",
    japanese: "チェンソーマン",
    english: "Chainsaw Man",
  },
  {
    romaji: "Spy x Family",
    japanese: "SPY×FAMILY",
    english: "Spy x Family",
  },
];

// ============================================================================
// Find Japanese Description
// ============================================================================

async function findJapaneseDescription(manga: {
  romaji: string;
  japanese: string;
}) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Japanese synopsis/description (あらすじ) of the manga "${manga.japanese}" (${manga.romaji}).

Search for this on:
- Official publisher websites (集英社, 講談社, 小学館, etc.)
- Shonen Jump Plus
- Comic Walker
- Amazon Japan
- Bookwalker Japan

REQUIREMENTS:
- Return ONLY the verbatim Japanese description as it appears on the source
- The description MUST be entirely in Japanese
- Do NOT translate or paraphrase
- If you cannot find an official Japanese description, respond with just "N/A"

Output format: Just the Japanese description text (or N/A), nothing else.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text?.trim() || "N/A";

  // Extract grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks || [];

  let sourceUrl: string | null = null;
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      sourceUrl = chunk.web.uri;
      break;
    }
  }

  // Validate - must have Japanese characters
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);

  return {
    description: text === "N/A" || !hasJapanese ? null : text,
    sourceUrl,
  };
}

// ============================================================================
// Find Chinese Description
// ============================================================================

async function findChineseDescription(manga: {
  romaji: string;
  japanese: string;
  english: string;
}) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Chinese synopsis/description (简介/劇情介紹) of the manga "${manga.japanese}" (English: ${manga.english}).

Search for this on:
- Bilibili Comics (哔哩哔哩漫画)
- Kuaikan Manhua (快看漫画)
- Dongman (动漫之家)
- WeChat Reading
- Taiwan/HK publisher sites

REQUIREMENTS:
- Return ONLY the verbatim Chinese description as it appears on the source
- The description MUST be in Chinese characters (Simplified or Traditional)
- Do NOT translate or paraphrase
- If you cannot find an official Chinese description, respond with just "N/A"

Output format: Just the Chinese description text (or N/A), nothing else.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text?.trim() || "N/A";

  // Extract grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks || [];

  let sourceUrl: string | null = null;
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      sourceUrl = chunk.web.uri;
      break;
    }
  }

  // Validate - must have Chinese characters (excluding Japanese-only kanji combinations)
  const hasChinese = /[\u4E00-\u9FAF]/.test(text);
  // Check it's not mostly Japanese by looking for hiragana/katakana
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);

  return {
    description: text === "N/A" || !hasChinese || isJapanese ? null : text,
    sourceUrl,
  };
}

// ============================================================================
// Find Author Japanese Name
// ============================================================================

async function findAuthorJapaneseName(englishName: string) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the original Japanese name of the manga author/artist "${englishName}".

Search on:
- MyAnimeList
- AniList
- Wikipedia Japan
- Official manga publisher sites

REQUIREMENTS:
- Return ONLY the Japanese name (in kanji/hiragana)
- If the author's real name is unknown and they use a pen name, return that pen name in Japanese
- If you cannot find the Japanese name with certainty, respond with just "N/A"

Output format: Just the Japanese name (or N/A), nothing else.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text?.trim() || "N/A";

  // Extract grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks || [];

  let sourceUrl: string | null = null;
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      sourceUrl = chunk.web.uri;
      break;
    }
  }

  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);

  return {
    japaneseName: text === "N/A" || !hasJapanese ? null : text,
    sourceUrl,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("Gemini Description Finder Test (gemini-3-flash-preview)");
  console.log("=".repeat(60));

  // Test descriptions
  for (const manga of TEST_MANGA) {
    console.log(`\n\n${"#".repeat(50)}`);
    console.log(`# ${manga.romaji}`);
    console.log(`${"#".repeat(50)}`);

    console.log("\n📘 Japanese Description:");
    try {
      const jpResult = await findJapaneseDescription(manga);
      if (jpResult.description) {
        console.log(`   ✅ Found (${jpResult.description.length} chars)`);
        console.log(`   ${jpResult.description.slice(0, 200)}...`);
        if (jpResult.sourceUrl) console.log(`   🔗 ${jpResult.sourceUrl}`);
      } else {
        console.log("   ❌ Not found");
      }
    } catch (e: any) {
      console.log(`   ⚠️ Error: ${e.message}`);
    }

    console.log("\n📙 Chinese Description:");
    try {
      const zhResult = await findChineseDescription(manga);
      if (zhResult.description) {
        console.log(`   ✅ Found (${zhResult.description.length} chars)`);
        console.log(`   ${zhResult.description.slice(0, 200)}...`);
        if (zhResult.sourceUrl) console.log(`   🔗 ${zhResult.sourceUrl}`);
      } else {
        console.log("   ❌ Not found");
      }
    } catch (e: any) {
      console.log(`   ⚠️ Error: ${e.message}`);
    }
  }

  // Test author name lookup
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("Author Japanese Name Lookup");
  console.log("=".repeat(60));

  const TEST_AUTHORS = ["Eiichiro Oda", "Kohei Horikoshi", "Tatsuki Fujimoto"];

  for (const author of TEST_AUTHORS) {
    console.log(`\n👤 "${author}":`);
    try {
      const result = await findAuthorJapaneseName(author);
      if (result.japaneseName) {
        console.log(`   ✅ ${result.japaneseName}`);
        if (result.sourceUrl) console.log(`   🔗 ${result.sourceUrl}`);
      } else {
        console.log("   ❌ Not found");
      }
    } catch (e: any) {
      console.log(`   ⚠️ Error: ${e.message}`);
    }
  }

  console.log("\n\nDone!");
}

main().catch(console.error);

