import { v } from "convex/values";
import { action } from "./_generated/server";
import { GoogleGenAI } from "@google/genai";

function getGoogleAI() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_AI_STUDIO_API_KEY environment variable is not set. Add it via: npx convex env set GOOGLE_AI_STUDIO_API_KEY <key>"
    );
  }
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

/**
 * Find Japanese title for a manga using Google AI with Search grounding.
 * This is a fallback for niche titles not found in MangaUpdates/AniList/MAL.
 */
export const findJapaneseTitle = action({
  args: {
    title: v.string(),
  },
  handler: async (_, { title }) => {
    const ai = getGoogleAI();

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Find the original Japanese title of the manga "${title}".

Search for this manga on Japanese publisher websites, Amazon Japan, or manga databases.

REQUIREMENTS:
- Return ONLY the verbatim Japanese title as it appears on the source webpage
- The title MUST be in Japanese characters (kanji/hiragana/katakana)
- If you cannot find a 100% exact, verbatim Japanese title, respond with just "N/A"

Output format: Just the Japanese title (or N/A), nothing else.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text?.trim() || "N/A";

    // Extract grounding metadata
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const chunks = (groundingMetadata as any)?.groundingChunks || [];

    // Find the first web source
    let sourceUrl: string | null = null;
    let sourceName: string | null = null;

    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        sourceUrl = chunk.web.uri;
        sourceName = chunk.web.title || null;
        break;
      }
    }

    // Validate - must have Japanese characters and not be N/A
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);

    if (text === "N/A" || !hasJapanese) {
      return { japaneseTitle: null, sourceUrl: null, sourceName: null };
    }

    return {
      japaneseTitle: text,
      sourceUrl,
      sourceName,
    };
  },
});

/**
 * Search MangaUpdates API (server-side to avoid CORS issues)
 */
export const searchMangaUpdates = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  handler: async (_, { query, maxResults = 5 }) => {
    const res = await fetch("https://api.mangaupdates.com/v1/series/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: query, per_page: maxResults }),
    });

    if (!res.ok) {
      console.error("[MangaUpdates] Search error:", res.status);
      return { results: [] };
    }

    const data = await res.json();
    const results = data.results as Array<{
      record: {
        series_id: number;
        title: string;
        url: string;
        description?: string;
        image?: { url: { original: string; thumb: string } };
        type?: string;
        year?: string;
      };
    }>;

    // Fetch full details for associated names
    const details = await Promise.all(
      results.slice(0, maxResults).map(async (r) => {
        const detailRes = await fetch(
          `https://api.mangaupdates.com/v1/series/${r.record.series_id}`
        );
        if (!detailRes.ok) return null;
        return detailRes.json();
      })
    );

    return {
      results: details
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map((d) => ({
          seriesId: d.series_id,
          title: d.title,
          url: d.url,
          description: d.description,
          cover: d.image?.url?.original,
          type: d.type,
          year: d.year,
          status: d.status,
          genres: d.genres?.map((g: { genre: string }) => g.genre) || [],
          associatedNames:
            d.associated?.map((a: { title: string }) => a.title) || [],
          authors:
            d.authors?.map((a: { name: string; type: string }) => ({
              name: a.name,
              type: a.type,
            })) || [],
        })),
    };
  },
});


