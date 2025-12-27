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
    const ai = getGoogleAI()
    
    const authorHint = authors?.length 
      ? `\nThe manga may be by: ${authors.join(", ")}`
      : ""

    console.log("[ai_metadata.findJapaneseTitle] searching:", { title, authors })

    try {
      const response = await ai.models.generateContent({
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
      })

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.title) {
        console.log("[ai_metadata.findJapaneseTitle] not found")
        return null
      }

      console.log("[ai_metadata.findJapaneseTitle] found:", result.title)
      return result.title as string
    } catch (e) {
      console.error("[ai_metadata.findJapaneseTitle] error:", e)
      return null
    }
  },
})

/**
 * Find the Chinese title(s) of a manga (Simplified and/or Traditional).
 */
export const findChineseTitle = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const ai = getGoogleAI()
    
    const titleHint = englishTitle 
      ? `Japanese: "${japaneseTitle}", English: "${englishTitle}"`
      : `Japanese: "${japaneseTitle}"`

    console.log("[ai_metadata.findChineseTitle] searching:", { japaneseTitle, englishTitle })

    try {
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
- Return verbatim titles as they appear on official sources
- Do NOT translate yourself - only return titles found on actual websites
- Set found=false if no official Chinese title exists`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether any Chinese title was found" },
              simplified: { type: Type.STRING, description: "Simplified Chinese title", nullable: true },
              traditional: { type: Type.STRING, description: "Traditional Chinese title", nullable: true },
            },
            required: ["found"],
          },
        },
      })

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found) {
        console.log("[ai_metadata.findChineseTitle] not found")
        return { simplified: null, traditional: null }
      }

      const output = {
        simplified: result.simplified || null,
        traditional: result.traditional || null,
      }
      console.log("[ai_metadata.findChineseTitle] found:", output)
      return output
    } catch (e) {
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
    const ai = getGoogleAI()
    
    const titleHint = romajiTitle 
      ? `"${japaneseTitle}" (${romajiTitle})`
      : `"${japaneseTitle}"`

    console.log("[ai_metadata.findJapaneseDescription] searching:", { japaneseTitle, romajiTitle })

    try {
      const response = await ai.models.generateContent({
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
      })

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.description) {
        console.log("[ai_metadata.findJapaneseDescription] not found")
        return null
      }

      console.log("[ai_metadata.findJapaneseDescription] found:", result.description.slice(0, 100) + "...")
      return result.description as string
    } catch (e) {
      console.error("[ai_metadata.findJapaneseDescription] error:", e)
      return null
    }
  },
})

/**
 * Find the official Chinese description/synopsis of a manga.
 */
export const findChineseDescription = action({
  args: {
    japaneseTitle: v.string(),
    englishTitle: v.optional(v.string()),
  },
  handler: async (_, { japaneseTitle, englishTitle }) => {
    const ai = getGoogleAI()
    
    const titleHint = englishTitle 
      ? `"${japaneseTitle}" (English: ${englishTitle})`
      : `"${japaneseTitle}"`

    console.log("[ai_metadata.findChineseDescription] searching:", { japaneseTitle, englishTitle })

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Find the official Chinese synopsis/description (简介/劇情介紹) of the manga ${titleHint}.

Search for this on:
- Bilibili Comics (哔哩哔哩漫画)
- Kuaikan Manhua (快看漫画)
- Dongman (动漫之家)
- WeChat Reading
- Taiwan/HK publisher sites

REQUIREMENTS:
- Return the verbatim Chinese description as it appears on the source
- Do NOT translate or paraphrase
- Set found=false if no official Chinese description exists`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: "Whether an official description was found" },
              description: { type: Type.STRING, description: "The Chinese description", nullable: true },
            },
            required: ["found"],
          },
        },
      })

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.description) {
        console.log("[ai_metadata.findChineseDescription] not found")
        return null
      }

      console.log("[ai_metadata.findChineseDescription] found:", result.description.slice(0, 100) + "...")
      return result.description as string
    } catch (e) {
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
    const ai = getGoogleAI()

    console.log("[ai_metadata.findAuthorJapaneseName] searching:", englishName)

    try {
      const response = await ai.models.generateContent({
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
      })

      const result = JSON.parse(response.text ?? "{}")
      
      if (!result.found || !result.name) {
        console.log("[ai_metadata.findAuthorJapaneseName] not found")
        return null
      }

      console.log("[ai_metadata.findAuthorJapaneseName] found:", result.name)
      return result.name as string
    } catch (e) {
      console.error("[ai_metadata.findAuthorJapaneseName] error:", e)
      return null
    }
  },
})
