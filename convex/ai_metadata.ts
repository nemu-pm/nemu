/**
 * AI-assisted metadata lookup using Gemini with Google Search grounding.
 * 
 * Used as fallback when exact title matching fails across all providers.
 * Searches for the original Japanese/official title of a manga given a
 * potentially localized/fan-translated title.
 */

import { v } from "convex/values"
import { action } from "./_generated/server"
import { GoogleGenAI } from "@google/genai"

function getGoogleAI() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY environment variable is not set")
  }
  return new GoogleGenAI({ apiKey })
}

// Using Google's model with search capabilities
const MODEL = "gemini-3-flash-preview"

/**
 * Find the original/Japanese title of a manga.
 * 
 * @param title - The title to search (possibly in Chinese/Korean/fan translation)
 * @param authors - Optional author names to help disambiguation
 * @returns The official Japanese title, or null if not found with certainty
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
- Return ONLY the verbatim Japanese title as it appears on official sources
- The title should be in Japanese characters (kanji/hiragana/katakana) OR the official romanized title
- If the input is already the Japanese/official title, return it as-is
- If you cannot find a 100% certain, exact match, respond with just "N/A"
- Do NOT guess or make up titles

Output format: Just the title (or N/A), nothing else. No explanation.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      })

      const result = (response.text ?? "").trim()
      
      // Validate result
      if (result === "N/A" || result.toLowerCase() === "n/a") {
        console.log("[ai_metadata.findJapaneseTitle] not found")
        return null
      }

      console.log("[ai_metadata.findJapaneseTitle] found:", result)
      return result
    } catch (e) {
      console.error("[ai_metadata.findJapaneseTitle] error:", e)
      return null
    }
  },
})

