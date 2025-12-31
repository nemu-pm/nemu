/**
 * Test the new ai_metadata architecture
 * 
 * Tests:
 * 1. searchJapaneseDescription (with Google Search grounding)
 * 2. translateToSimplifiedChinese (no grounding)
 * 3. Full flow: Japanese description → Chinese translation
 * 
 * Run: bun scripts/test-chinese-description-providers.ts
 */

import { google } from "@ai-sdk/google"
import { generateText } from "ai"

// Set API key
const GOOGLE_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY
if (!GOOGLE_API_KEY) {
  console.error("Missing GOOGLE_AI_STUDIO_API_KEY")
  process.exit(1)
}
process.env.GOOGLE_GENERATIVE_AI_API_KEY = GOOGLE_API_KEY

const MODEL = "gemini-2.5-flash-lite"
const TEST_MANGA = "放課後、僕らは宇宙に惑う"

// =============================================================================
// Test Functions
// =============================================================================

function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

async function testSearchJapaneseDescription() {
  console.log("\n" + "=".repeat(70))
  console.log("Test 1: Search Japanese Description")
  console.log("=".repeat(70))
  
  const start = Date.now()
  
  const { text, providerMetadata } = await generateText({
    model: google(MODEL),
    // @ts-expect-error - type compatibility
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: `漫画「${TEST_MANGA}」の公式あらすじ・作品紹介を検索してください。

検索先:
- 出版社公式サイト（集英社、講談社、小学館など）
- 少年ジャンプ+、ComicWalker
- Amazon Japan、BookWalker Japan

要件:
- 公式ソースに記載されているあらすじをそのまま返してください
- 翻訳や言い換えはしないでください
- 見つからない場合は found=false

JSON形式で回答: {"found": boolean, "description": string | null}`,
  })
  
  const elapsed = Date.now() - start
  const groundingUsed = !!(providerMetadata?.google as any)?.groundingMetadata
  
  console.log(`Time: ${elapsed}ms`)
  console.log(`Grounding used: ${groundingUsed}`)
  
  const parsed = extractJson<{ found: boolean; description?: string }>(text)
  
  if (parsed?.found && parsed.description) {
    console.log(`Found: YES (${parsed.description.length} chars)`)
    console.log(`\nDescription:\n${parsed.description}`)
    return parsed.description
  } else {
    console.log("Found: NO")
    return null
  }
}

async function testTranslateToChineseDescription(japaneseText: string) {
  console.log("\n" + "=".repeat(70))
  console.log("Test 2: Translate to Chinese (no grounding)")
  console.log("=".repeat(70))
  
  const start = Date.now()
  
  const { text } = await generateText({
    model: google(MODEL),
    prompt: `将以下日文翻译成简体中文。保持原意，不要添加或删除内容。

日文原文:
${japaneseText}

只输出翻译后的简体中文，不要包含其他内容。`,
  })
  
  const elapsed = Date.now() - start
  const translated = text.trim()
  
  console.log(`Time: ${elapsed}ms`)
  console.log(`Length: ${translated.length} chars`)
  console.log(`\nTranslation:\n${translated}`)
  
  return translated
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("Testing ai_metadata architecture with new two-step approach")
  console.log(`Manga: ${TEST_MANGA}`)
  console.log(`Model: ${MODEL}`)
  
  // Step 1: Search for Japanese description
  const japaneseDescription = await testSearchJapaneseDescription()
  
  if (!japaneseDescription) {
    console.log("\n❌ Could not find Japanese description, cannot test translation")
    return
  }
  
  // Step 2: Translate to Chinese
  const chineseDescription = await testTranslateToChineseDescription(japaneseDescription)
  
  // Summary
  console.log("\n" + "=".repeat(70))
  console.log("SUMMARY")
  console.log("=".repeat(70))
  console.log(`✅ Japanese description: ${japaneseDescription.length} chars`)
  console.log(`✅ Chinese translation: ${chineseDescription.length} chars`)
}

main().catch(console.error)
