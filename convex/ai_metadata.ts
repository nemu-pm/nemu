/**
 * AI-assisted metadata lookup using Gemini with Google Search grounding.
 *
 * Architecture:
 * - SDK: @ai-sdk/google with google.tools.googleSearch({})
 * - Model: gemini-2.5-flash-lite (fast, cheap, good at retrieval)
 * - Search tasks: Use Google Search grounding
 * - Translation tasks: No grounding needed
 *
 * For Chinese content:
 * - Step 1: Find Japanese description (search, Japanese prompt)
 * - Step 2: Translate Japanese → Chinese (no grounding)
 */

import { v } from "convex/values"
import { action } from "./_generated/server"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"

const SEARCH_MODEL = "gemini-2.5-flash-lite" // Fast, cheap, good at retrieval
const TRANSLATE_MODEL = "gemini-2.5-flash-lite" // Simple translation doesn't need heavy model

// Create google provider with API key (must be called inside handlers for Convex)
function getGoogle() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY environment variable is not set")
  }
  return createGoogleGenerativeAI({ apiKey })
}

const TIMEOUT_MS = 30_000

// Timing helper
function timer(label: string) {
  const start = Date.now()
  return {
    log: (msg: string) => console.log(`[${label}] ${msg} (${Date.now() - start}ms)`),
    end: () => Date.now() - start,
  }
}

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = TIMEOUT_MS): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([promise, timeout])
}

// Extract JSON from text response
function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

// =============================================================================
// Internal Search Functions (with Google Search grounding)
// =============================================================================

/**
 * Internal: Search for Japanese title (English input → Japanese title)
 */
async function searchJapaneseTitle(title: string, authors?: string[]): Promise<string | null> {
  const t = timer("searchJapaneseTitle")
  const authorHint = authors?.length ? `\nAuthors: ${authors.join(", ")}` : ""

  try {
    const result = await withTimeout(
      generateText({
        model: getGoogle()(SEARCH_MODEL),
        // @ts-expect-error - google.tools.googleSearch type is not fully compatible but works at runtime
        tools: { google_search: getGoogle().tools.googleSearch({}) },
        prompt: `Find the original Japanese title of the manga "${title}".${authorHint}

Search on:
- Japanese publisher websites (Shueisha, Kodansha, Shogakukan)
- Amazon Japan
- MangaUpdates, AniList, MyAnimeList

Requirements:
- Return the verbatim Japanese title as it appears on official sources
- The title may be in Japanese characters OR official romanized title (e.g., "SPY×FAMILY")
- If the input is already the Japanese/official title, return it as-is
- Set found=false if you cannot find the title with certainty

Respond in JSON: {"found": boolean, "title": string | null}`,
      })
    )
    t.log("Search completed")

    if (!result) {
      t.log("Timed out")
      return null
    }

    const parsed = extractJson<{ found: boolean; title?: string }>(result.text)
    if (!parsed?.found || !parsed.title) {
      t.log("Not found")
      return null
    }

    t.log(`Found: ${parsed.title}`)
    return parsed.title
  } catch (e) {
    t.log(`Error: ${e}`)
    return null
  }
}

/**
 * Internal: Search for Japanese description
 */
async function searchJapaneseDescription(japaneseTitle: string, romajiTitle?: string): Promise<string | null> {
  const t = timer("searchJapaneseDescription")
  const titleHint = romajiTitle ? `「${japaneseTitle}」（${romajiTitle}）` : `「${japaneseTitle}」`

  try {
    const result = await withTimeout(
      generateText({
        model: getGoogle()(SEARCH_MODEL),
        // @ts-expect-error - google.tools.googleSearch type is not fully compatible but works at runtime
        tools: { google_search: getGoogle().tools.googleSearch({}) },
        prompt: `漫画${titleHint}の公式あらすじ・作品紹介を検索してください。

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
    )
    t.log("Search completed")

    if (!result) {
      t.log("Timed out")
      return null
    }

    const parsed = extractJson<{ found: boolean; description?: string }>(result.text)
    if (!parsed?.found || !parsed.description) {
      t.log("Not found")
      return null
    }

    t.log(`Found: ${parsed.description.slice(0, 50)}...`)
    return parsed.description
  } catch (e) {
    t.log(`Error: ${e}`)
    return null
  }
}

/**
 * Internal: Search for author's Japanese name (English input → Japanese name)
 */
async function searchAuthorJapaneseName(englishName: string): Promise<string | null> {
  const t = timer("searchAuthorJapaneseName")

  try {
    const result = await withTimeout(
      generateText({
        model: getGoogle()(SEARCH_MODEL),
        // @ts-expect-error - google.tools.googleSearch type is not fully compatible but works at runtime
        tools: { google_search: getGoogle().tools.googleSearch({}) },
        prompt: `Find the original Japanese name of the manga author/artist "${englishName}".

Search on:
- MyAnimeList, AniList
- Wikipedia Japan
- Official manga publisher sites

Requirements:
- Return the Japanese name (in kanji/hiragana)
- If the author uses a pen name, return that pen name in Japanese
- Set found=false if you cannot find the Japanese name with certainty

Respond in JSON: {"found": boolean, "name": string | null}`,
      })
    )
    t.log("Search completed")

    if (!result) {
      t.log("Timed out")
      return null
    }

    const parsed = extractJson<{ found: boolean; name?: string }>(result.text)
    if (!parsed?.found || !parsed.name) {
      t.log("Not found")
      return null
    }

    t.log(`Found: ${parsed.name}`)
    return parsed.name
  } catch (e) {
    t.log(`Error: ${e}`)
    return null
  }
}

/**
 * Internal: Search for Chinese title (Japanese input → Chinese title)
 */
async function searchChineseTitle(japaneseTitle: string): Promise<{ simplified: string | null; traditional: string | null }> {
  const t = timer("searchChineseTitle")

  try {
    const result = await withTimeout(
      generateText({
        model: getGoogle()(SEARCH_MODEL),
        // @ts-expect-error - google.tools.googleSearch type is not fully compatible but works at runtime
        tools: { google_search: getGoogle().tools.googleSearch({}) },
        prompt: `搜索漫画「${japaneseTitle}」的中文标题。

搜索网站（按优先级）:
1. 哔哩哔哩漫画 - 简体中文
2. 快看漫画 - 简体中文
3. 动漫之家 - 简体中文
4. 中文维基百科
5. 台湾/香港来源 - 繁体中文（备选）

要求:
- 优先返回简体中文标题
- 如果只找到繁体中文标题，请同时返回简体和繁体
- 返回官方来源的原始标题
- 找不到则设置 found=false

JSON格式回答: {"found": boolean, "simplified": string | null, "traditional": string | null}`,
      })
    )

    if (!result) {
      t.log("Timed out")
      return { simplified: null, traditional: null }
    }

    const parsed = extractJson<{ found: boolean; simplified?: string; traditional?: string }>(result.text)
    if (!parsed?.found) {
      t.log("Not found")
      return { simplified: null, traditional: null }
    }

    t.log(`Found: ${JSON.stringify(parsed)}`)
    return {
      simplified: parsed.simplified || null,
      traditional: parsed.traditional || null,
    }
  } catch (e) {
    t.log(`Error: ${e}`)
    return { simplified: null, traditional: null }
  }
}

// =============================================================================
// Translation Function (no grounding needed)
// =============================================================================

/**
 * Translate Japanese text to Simplified Chinese.
 * Simple translation task - no search grounding needed.
 */
async function translateToSimplifiedChinese(japaneseText: string): Promise<string | null> {
  const t = timer("translateToSimplifiedChinese")

  try {
    const result = await withTimeout(
      generateText({
        model: getGoogle()(TRANSLATE_MODEL),
        prompt: `将以下日文翻译成简体中文。保持原意，不要添加或删除内容。

日文原文:
${japaneseText}

只输出翻译后的简体中文，不要包含其他内容。`,
      })
    )

    if (!result) {
      t.log("Timed out")
      return null
    }

    const translated = result.text.trim()
    t.log(`Translated: ${translated.slice(0, 50)}...`)
    return translated
  } catch (e) {
    t.log(`Error: ${e}`)
    return null
  }
}

// =============================================================================
// Exported Convex Actions
// =============================================================================

/**
 * Find the original/Japanese title of a manga.
 */
export const findJapaneseTitle = action({
  args: {
    title: v.string(),
    authors: v.optional(v.array(v.string())),
  },
  handler: async (_, { title, authors }) => {
    console.log("[ai_metadata.findJapaneseTitle] searching:", { title, authors })
    return searchJapaneseTitle(title, authors)
  },
})

/**
 * Find the official Japanese description/synopsis of a manga.
 */
export const findJapaneseDescription = action({
  args: {
    japaneseTitle: v.string(),
    romajiTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, romajiTitle }) => {
    console.log("[ai_metadata.findJapaneseDescription] searching:", { japaneseTitle, romajiTitle })
    return searchJapaneseDescription(japaneseTitle, romajiTitle)
  },
})

/**
 * Find the Japanese name of a manga author/artist.
 */
export const findAuthorJapaneseName = action({
  args: {
    englishName: v.string(),
  },
  handler: async (_, { englishName }) => {
    console.log("[ai_metadata.findAuthorJapaneseName] searching:", englishName)
    return searchAuthorJapaneseName(englishName)
  },
})

/**
 * Find the Chinese title of a manga.
 * Strategy: Try search first, then fall back to translation.
 */
export const findChineseTitle = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const t = timer("findChineseTitle")
    console.log("[ai_metadata.findChineseTitle]", { japaneseTitle, englishTitle })

    // Step 1: Try to find official Chinese title via search
    const searchResult = await searchChineseTitle(japaneseTitle)
    if (searchResult.simplified || searchResult.traditional) {
      return searchResult
    }

    // Step 2: Fallback - translate Japanese title to Chinese
    t.log("Search failed, falling back to translation")
    const translated = await translateToSimplifiedChinese(japaneseTitle)

    return {
      simplified: translated,
      traditional: null,
    }
  },
})

/**
 * Find the Chinese description/synopsis of a manga.
 * Strategy: Find Japanese description first, then translate to Chinese.
 */
export const findChineseDescription = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const t = timer("findChineseDescription")
    console.log("[ai_metadata.findChineseDescription]", { japaneseTitle, englishTitle })

    // Step 1: Find Japanese description
    const japaneseDescription = await searchJapaneseDescription(japaneseTitle)

    if (!japaneseDescription) {
      t.log("Could not find Japanese description")
      return null
    }

    t.log(`Found Japanese description (${japaneseDescription.length} chars)`)

    // Step 2: Translate to Chinese
    const chineseDescription = await translateToSimplifiedChinese(japaneseDescription)

    if (!chineseDescription) {
      t.log("Translation failed")
      return null
    }

    t.log(`Translated to Chinese (${chineseDescription.length} chars)`)
    return chineseDescription
  },
})
