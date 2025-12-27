/**
 * Test Gemini API speed directly (without Convex)
 * Run: bun scripts/test-gemini-speed.ts
 */

import { GoogleGenAI, Type } from "@google/genai"

const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
if (!apiKey) {
  console.error("Set GOOGLE_AI_STUDIO_API_KEY env var")
  process.exit(1)
}

const ai = new GoogleGenAI({ apiKey })
const MODEL = "gemini-3-flash-preview"

async function testFindChineseDescription(japaneseTitle: string, englishTitle?: string) {
  const titleHint = englishTitle
    ? `"${japaneseTitle}" (English: ${englishTitle})`
    : `"${japaneseTitle}"`

  console.log(`\n[findChineseDescription] Testing: ${titleHint}`)
  const start = Date.now()

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Chinese synopsis/description (简介) of the manga ${titleHint}.

SEARCH PRIORITY (in order):
1. 哔哩哔哩漫画 - Simplified Chinese
2. 动漫之家 - Simplified Chinese
3. Other Simplified Chinese sources
4. Traditional Chinese sources - as fallback

REQUIREMENTS:
- STRONGLY prefer Simplified Chinese (简体中文) sources
- If only Traditional Chinese description is found, convert it to Simplified Chinese
- Preserve paragraph breaks and newlines from the original
- Set found=false if no official Chinese description exists`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN, description: "Whether an official description was found" },
          description: { type: Type.STRING, description: "The Chinese description in Simplified Chinese (can include newlines)", nullable: true },
        },
        required: ["found"],
      },
    },
  })

  const elapsed = Date.now() - start
  const result = JSON.parse(response.text ?? "{}")

  console.log(`[findChineseDescription] Completed in ${elapsed}ms`)
  console.log(`[findChineseDescription] Found: ${result.found}`)
  if (result.description) {
    console.log(`[findChineseDescription] Description: ${result.description.slice(0, 100)}...`)
  }

  return { elapsed, result }
}

async function testWithoutGoogleSearch(japaneseTitle: string, englishTitle?: string) {
  const titleHint = englishTitle
    ? `"${japaneseTitle}" (English: ${englishTitle})`
    : `"${japaneseTitle}"`

  console.log(`\n[WITHOUT Google Search] Testing: ${titleHint}`)
  const start = Date.now()

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Chinese synopsis/description (简介) of the manga ${titleHint}.

REQUIREMENTS:
- Prefer Simplified Chinese (简体中文)
- Set found=false if you don't know the Chinese description`,
    config: {
      // NO google search tool
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN, description: "Whether an official description was found" },
          description: { type: Type.STRING, description: "The Chinese description in Simplified Chinese", nullable: true },
        },
        required: ["found"],
      },
    },
  })

  const elapsed = Date.now() - start
  const result = JSON.parse(response.text ?? "{}")

  console.log(`[WITHOUT Google Search] Completed in ${elapsed}ms`)
  console.log(`[WITHOUT Google Search] Found: ${result.found}`)
  if (result.description) {
    console.log(`[WITHOUT Google Search] Description: ${result.description.slice(0, 100)}...`)
  }

  return { elapsed, result }
}

// Test cases
const testCases = [
  { ja: "メダリスト", en: "Medalist" },
  { ja: "SPY×FAMILY", en: "Spy x Family" },
  { ja: "葬送のフリーレン", en: "Frieren: Beyond Journey's End" },
]

async function main() {
  console.log("=".repeat(60))
  console.log("Testing Gemini API speed (direct, no Convex)")
  console.log("=".repeat(60))

  for (const { ja, en } of testCases) {
    console.log("\n" + "-".repeat(60))

    // With Google Search (original slow version)
    const withSearch = await testFindChineseDescription(ja, en)

    // Without Google Search (baseline)
    const withoutSearch = await testWithoutGoogleSearch(ja, en)

    console.log(`\n>>> Google Search overhead: ${withSearch.elapsed - withoutSearch.elapsed}ms`)
  }
}

main().catch(console.error)

