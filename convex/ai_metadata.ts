/**
 * AI-assisted metadata lookup using Gemini with Google Search grounding.
 * 
 * Actions for finding localized titles, descriptions, and author names
 * when providers don't have them. Used for preferred language feature.
 */

import { v } from "convex/values"
import { action } from "./_generated/server"
import { GoogleGenAI, Type } from "@google/genai"

function getGoogleAI() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY environment variable is not set")
  }
  return new GoogleGenAI({ apiKey })
}

const MODEL = "gemini-3-flash-preview"

// Timing helper
function timer(label: string) {
  const start = Date.now()
  return {
    log: (msg: string) => console.log(`[${label}] ${msg} (${Date.now() - start}ms)`),
    end: () => Date.now() - start,
  }
}

const GEMINI_TIMEOUT_MS = 20_000

// Timeout wrapper for Gemini calls
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = GEMINI_TIMEOUT_MS): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([promise, timeout])
}

// =============================================================================
// Title Lookup
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
    const t = timer("findJapaneseTitle")
    const ai = getGoogleAI()
    t.log("GoogleAI initialized")
    
    const authorHint = authors?.length 
      ? `\nThe manga may be by: ${authors.join(", ")}`
      : ""

    console.log("[ai_metadata.findJapaneseTitle] searching:", { title, authors })

    try {
      t.log("Starting Gemini call...")
      const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: `Find the original Japanese title of the manga "${title}".${authorHint}

Search for this manga on Japanese publisher websites, Amazon Japan, or manga databases like MangaUpdates, AniList, MyAnimeList.

REQUIREMENTS:
- Return the verbatim Japanese title as it appears on official sources
- The title may be in Japanese characters OR official romanized title (e.g., "SPY×FAMILY")
- If the input is already the Japanese/official title, return it as-is
- Set found=false if you cannot find the title with certainty`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether the title was found with certainty" },
              title: { type: Type.STRING, description: "The Japanese title, or empty if not found", nullable: true },
            },
            required: ["found"],
          },
        },
      }))
      t.log("Gemini call completed")

      if (!response) {
        t.log("Timed out, returning null")
        return null
      }

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.title) {
        t.log("Not found, returning null")
        return null
      }

      t.log(`Found: ${result.title}`)
      return result.title as string
    } catch (e) {
      t.log(`Error: ${e}`)
      console.error("[ai_metadata.findJapaneseTitle] error:", e)
      return null
    }
  },
})

/**
 * Find the Chinese title of a manga (prefer Simplified Chinese).
 */
export const findChineseTitle = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const t = timer("findChineseTitle")
    const ai = getGoogleAI()
    t.log("GoogleAI initialized")
    
    const titleHint = englishTitle 
      ? `Japanese: "${japaneseTitle}", English: "${englishTitle}"`
      : `Japanese: "${japaneseTitle}"`

    console.log("[ai_metadata.findChineseTitle] searching:", { japaneseTitle, englishTitle })

    try {
      t.log("Starting Gemini call...")
      const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: `Find the official Chinese title of the manga ${titleHint}.

SEARCH PRIORITY (in order):
1. Bilibili Comics (哔哩哔哩漫画) - Simplified Chinese
2. Kuaikan Manhua (快看漫画) - Simplified Chinese  
3. Dongman Zhijia (动漫之家) - Simplified Chinese
4. Chinese Wikipedia (zh.wikipedia.org)
5. Taiwan/HK sources (Traditional Chinese) - as fallback

REQUIREMENTS:
- STRONGLY prefer Simplified Chinese sources over Traditional
- If only Traditional Chinese title is found, convert it to Simplified Chinese for the "simplified" field
- Return verbatim titles from official sources when possible
- Set found=false if no official Chinese title exists`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether any Chinese title was found" },
              simplified: { type: Type.STRING, description: "Simplified Chinese title (convert from Traditional if needed)", nullable: true },
              traditional: { type: Type.STRING, description: "Traditional Chinese title if found", nullable: true },
            },
            required: ["found"],
          },
        },
      }))
      t.log("Gemini call completed")

      if (!response) {
        t.log("Timed out, returning null")
        return { simplified: null, traditional: null }
      }

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found) {
        t.log("Not found, returning null")
        return { simplified: null, traditional: null }
      }

      const output = {
        simplified: result.simplified || null,
        traditional: result.traditional || null,
      }
      t.log(`Found: ${JSON.stringify(output)}`)
      return output
    } catch (e) {
      t.log(`Error: ${e}`)
      console.error("[ai_metadata.findChineseTitle] error:", e)
      return { simplified: null, traditional: null }
    }
  },
})

// =============================================================================
// Description Lookup
// =============================================================================

/**
 * Find the official Japanese description/synopsis of a manga.
 */
export const findJapaneseDescription = action({
  args: {
    japaneseTitle: v.string(),
    romajiTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, romajiTitle }) => {
    const t = timer("findJapaneseDescription")
    const ai = getGoogleAI()
    t.log("GoogleAI initialized")
    
    const titleHint = romajiTitle 
      ? `"${japaneseTitle}" (${romajiTitle})`
      : `"${japaneseTitle}"`

    console.log("[ai_metadata.findJapaneseDescription] searching:", { japaneseTitle, romajiTitle })

    try {
      t.log("Starting Gemini call...")
      const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: `Find the official Japanese synopsis/description (あらすじ) of the manga ${titleHint}.

Search for this on:
- Official publisher websites (集英社, 講談社, 小学館, etc.)
- Shonen Jump Plus
- Comic Walker
- Amazon Japan
- Bookwalker Japan

REQUIREMENTS:
- Return the verbatim Japanese description as it appears on the source
- Do NOT translate or paraphrase
- Set found=false if no official Japanese description exists`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether an official description was found" },
              description: { type: Type.STRING, description: "The Japanese description", nullable: true },
            },
            required: ["found"],
          },
        },
      }))
      t.log("Gemini call completed")

      if (!response) {
        t.log("Timed out, returning null")
        return null
      }

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.description) {
        t.log("Not found, returning null")
        return null
      }

      t.log(`Found: ${result.description.slice(0, 50)}...`)
      return result.description as string
    } catch (e) {
      t.log(`Error: ${e}`)
      console.error("[ai_metadata.findJapaneseDescription] error:", e)
      return null
    }
  },
})

/**
 * Find the official Chinese description/synopsis of a manga (prefer Simplified Chinese).
 */
export const findChineseDescription = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const t = timer("findChineseDescription")
    const ai = getGoogleAI()
    t.log("GoogleAI initialized")
    
    const titleHint = englishTitle 
      ? `"${japaneseTitle}" (English: ${englishTitle})`
      : `"${japaneseTitle}"`

    console.log("[ai_metadata.findChineseDescription] searching:", { japaneseTitle, englishTitle })

    try {
      t.log("Starting Gemini call...")
      const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: `Find the official Chinese synopsis/description (简介) of the manga ${titleHint}.

SEARCH PRIORITY (in order):
1. Bilibili Comics (哔哩哔哩漫画) - Simplified Chinese
2. Kuaikan Manhua (快看漫画) - Simplified Chinese
3. Dongman Zhijia (动漫之家) - Simplified Chinese
4. WeChat Reading / QQ Reading
5. Taiwan/HK sources - as fallback

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
      }))
      t.log("Gemini call completed")

      if (!response) {
        t.log("Timed out, returning null")
        return null
      }

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.description) {
        t.log("Not found, returning null")
        return null
      }

      t.log(`Found: ${result.description.slice(0, 50)}...`)
      return result.description as string
    } catch (e) {
      t.log(`Error: ${e}`)
      console.error("[ai_metadata.findChineseDescription] error:", e)
      return null
    }
  },
})

// =============================================================================
// Author Name Lookup
// =============================================================================

/**
 * Find the Japanese name of a manga author/artist given their romanized name.
 */
export const findAuthorJapaneseName = action({
  args: {
    englishName: v.string(),
  },
  handler: async (_, { englishName }) => {
    const t = timer("findAuthorJapaneseName")
    const ai = getGoogleAI()
    t.log("GoogleAI initialized")

    console.log("[ai_metadata.findAuthorJapaneseName] searching:", englishName)

    try {
      t.log("Starting Gemini call...")
      const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: `Find the original Japanese name of the manga author/artist "${englishName}".

Search on:
- MyAnimeList
- AniList
- Wikipedia Japan
- Official manga publisher sites

REQUIREMENTS:
- Return the Japanese name (in kanji/hiragana)
- If the author uses a pen name, return that pen name in Japanese
- Set found=false if you cannot find the Japanese name with certainty`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether the Japanese name was found" },
              name: { type: Type.STRING, description: "The Japanese name", nullable: true },
            },
            required: ["found"],
          },
        },
      }))
      t.log("Gemini call completed")

      if (!response) {
        t.log("Timed out, returning null")
        return null
      }

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.name) {
        t.log("Not found, returning null")
        return null
      }

      t.log(`Found: ${result.name}`)
      return result.name as string
    } catch (e) {
      t.log(`Error: ${e}`)
      console.error("[ai_metadata.findAuthorJapaneseName] error:", e)
      return null
    }
  },
})
