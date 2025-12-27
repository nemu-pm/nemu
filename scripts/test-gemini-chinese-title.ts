/**
 * Test Script 3: Gemini Chinese Title Lookup
 * 
 * Test Gemini's ability to find Chinese titles when providers don't have them.
 * Run: bun scripts/test-gemini-chinese-title.ts
 */

import { GoogleGenAI } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_AI_STUDIO_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
const MODEL = "gemini-3-flash-preview";

interface ChineseTitleResult {
  simplified: string | null;
  traditional: string | null;
  source: string | null;
}

async function findChineseTitle(
  japaneseTitle: string,
  englishTitle?: string
): Promise<ChineseTitleResult> {
  const titleHint = englishTitle 
    ? `Japanese: "${japaneseTitle}", English: "${englishTitle}"`
    : `Japanese: "${japaneseTitle}"`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Chinese title(s) of the manga ${titleHint}.

Search on:
- Bilibili Comics (哔哩哔哩漫画)
- Dongman Zhijia (动漫之家)
- WeChat Reading / QQ Reading
- Taiwan manga publishers
- Chinese Wikipedia

REQUIREMENTS:
- Return the Simplified Chinese title AND Traditional Chinese title if both exist
- Return ONLY verbatim titles as they appear on official sources
- Do NOT translate yourself - only return titles found on actual websites
- If you cannot find an official Chinese title, respond with "N/A"

Output format (JSON):
{
  "simplified": "简体中文标题 or null",
  "traditional": "繁體中文標題 or null"
}`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text?.trim() || "";
  
  // Extract source URL
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks || [];
  let source: string | null = null;
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      source = chunk.web.uri;
      break;
    }
  }

  // Parse JSON response
  try {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        simplified: parsed.simplified === "null" || parsed.simplified === "N/A" ? null : parsed.simplified,
        traditional: parsed.traditional === "null" || parsed.traditional === "N/A" ? null : parsed.traditional,
        source,
      };
    }
  } catch (e) {
    // Fallback: try to extract Chinese text directly
    const hasChinese = /[\u4E00-\u9FAF]/.test(text);
    if (hasChinese && !text.includes("N/A")) {
      return { simplified: text, traditional: null, source };
    }
  }

  return { simplified: null, traditional: null, source: null };
}

// Test cases - manga that may or may not have Chinese titles in providers
const TEST_CASES = [
  { japanese: "多聞くん今どっち!?", english: "Tamon's B-Side" },
  { japanese: "チェンソーマン", english: "Chainsaw Man" },
  { japanese: "SPY×FAMILY", english: "Spy x Family" },
  { japanese: "呪術廻戦", english: "Jujutsu Kaisen" },
  { japanese: "ワンピース", english: "One Piece" },
  { japanese: "進撃の巨人", english: "Attack on Titan" },
  { japanese: "鬼滅の刃", english: "Demon Slayer" },
  { japanese: "僕のヒーローアカデミア", english: "My Hero Academia" },
];

async function main() {
  console.log("=".repeat(60));
  console.log("Gemini Chinese Title Lookup Test");
  console.log("=".repeat(60));

  for (const { japanese, english } of TEST_CASES) {
    console.log(`\n📖 ${japanese} (${english})`);

    try {
      const result = await findChineseTitle(japanese, english);
      
      if (result.simplified || result.traditional) {
        if (result.simplified) console.log(`   🇨🇳 Simplified: ${result.simplified}`);
        if (result.traditional) console.log(`   🇹🇼 Traditional: ${result.traditional}`);
        if (result.source) console.log(`   🔗 Source: ${result.source}`);
      } else {
        console.log("   ❌ No Chinese title found");
      }
    } catch (e: any) {
      console.log(`   ⚠️ Error: ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
}

main().catch(console.error);

