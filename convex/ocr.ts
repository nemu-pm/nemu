import { v } from "convex/values"
import { action } from "./_generated/server"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateObject } from "ai"
import { z } from "zod"

function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set. Add it via: npx convex env set OPENROUTER_API_KEY <key>")
  }
  return createOpenRouter({ apiKey })
}

// Convert base64 to Uint8Array (Convex doesn't have Node Buffer)
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

const MODEL = "google/gemini-3-flash-preview"

async function withRetries<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      // small backoff
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * OCR action - extracts clean Japanese text from manga image
 */
export const extractText = action({
  args: {
    imageBase64: v.string(),
  },
  handler: async (_, { imageBase64 }) => {
    const openrouter = getOpenRouter()
    
    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    
    const { object } = await generateObject({
      model: openrouter(MODEL),
      schema: z.object({
        text: z
          .string()
          .describe(`
    All visible text from the image (any language).
    - FINAL OUTPUT: no newlines (replace all \\n with spaces).
    - Ignore furigana/ruby (small kana above/beside kanji); never output it.
    - Empty string if no text found.
          `.trim()),
        proper_nouns: z
          .array(z.string())
          .describe(`
    Proper nouns (people, places, orgs, titles, etc.) from ANY language.
    - Must appear in \`text\`.
    - Keep exact surface form (same spelling/case).
    - Do NOT include furigana-only strings.
          `.trim()),
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: base64ToUint8Array(base64Data) },
            {
              type: "text",
              text: `
    Extract ALL visible text from the image (Japanese + non-Japanese).
    
    OUTPUT:
    - Determine text per bubble/box in reading order (top→bottom, right→left).
    - Clean intra-box whitespace; keep punctuation/symbols.
    - FINAL OUTPUT MUST BE SINGLE-LINE: replace all \\n with spaces.
    
    FURIGANA / RUBY:
    - Ignore furigana (small kana above/beside kanji).
    - Use furigana only to interpret kanji; NEVER output it.
    - Example: 「鳩野」 with 「はとの」 → output 「鳩野」 only.
    
    JAPANESE NORMALIZATION:
    - Do NOT add words or endings (no だ／です／だよ).
    - Remove stutters/fillers (ぼ、ぼく→ぼく; あ、あの→あの; drop えっと／あのー／うーん).
    - Collapse emphasis (ー/〜/repeated っ・kana).
    - Reduce repeats (!!!→! ???→? ……→……).
    - Dialect → standard Japanese (no appended copulas).
    - No paraphrasing.
    
    PROPER NOUNS:
    - Extract all named entities appearing in the final \`text\` (any language).
    - Return exact surface forms; exclude furigana-only.
              `.trim(),
            },
          ],
        },
      ],
    });
    
    
    return {
      text: object.text.trim(),
      proper_nouns: object.proper_nouns,
    }
  },
})

/**
 * Proper noun extraction (prepass for Ichiran/grammar analysis).
 *
 * - Uses Gemini Flash via OpenRouter.
 * - Retries up to 2 times before failing.
 */
export const extractProperNouns = action({
  args: {
    text: v.string(),
  },
  handler: async (_, { text }) => {
    const openrouter = getOpenRouter()
    const clean = (text ?? "").trim()
    if (!clean) return { proper_nouns: [] as string[] }

    const run = async () => {
      console.log("[ocr.extractProperNouns] start", { len: clean.length })
      const { object } = await generateObject({
        model: openrouter(MODEL),
        schema: z.object({
          proper_nouns: z
            .array(z.string())
            .describe(
              `
Proper nouns (people, places, orgs, titles, etc.) from ANY language.
- Must appear in the provided text EXACTLY (surface-form substring match).
- Keep exact surface form (same spelling/case).
- Do NOT include furigana/ruby-only strings.
- Return [] if none.
              `.trim()
            ),
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
Extract proper nouns from the text below.

RULES:
- Return only strings that appear in the text verbatim (surface form).
- Unique list (no duplicates).
- Avoid generic nouns; focus on named entities (names, places, orgs, series titles).
- If unsure, omit.

TEXT:
${clean}
                `.trim(),
              },
            ],
          },
        ],
      })

      // sanitize: unique, non-empty, must exist in text
      const seen = new Set<string>()
      const out: string[] = []
      for (const raw of object.proper_nouns ?? []) {
        const s = (raw ?? "").trim()
        if (!s) continue
        if (!clean.includes(s)) continue
        if (seen.has(s)) continue
        seen.add(s)
        out.push(s)
      }
      console.log("[ocr.extractProperNouns] done", { count: out.length })
      return out
    }

    const proper_nouns = await withRetries(run, 2)
    return { proper_nouns }
  },
})
