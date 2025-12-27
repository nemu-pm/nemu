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

const MODEL = "google/gemini-3-flash-preview"

async function withRetries<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Normalize text and extract proper nouns (prepass for Ichiran/grammar analysis).
 * Retries up to 2 times before failing.
 */
export const normalize = action({
  args: {
    text: v.string(),
  },
  handler: async (_, { text }) => {
    const openrouter = getOpenRouter()
    const clean = (text ?? "").trim()
    if (!clean) return { normalized: "", proper_nouns: [] as string[] }

    const run = async () => {
      console.log("[japanese-learning.normalize] start", { len: clean.length })
      const { object } = await generateObject({
        model: openrouter(MODEL),
        schema: z.object({
          normalized: z
            .string()
            .describe(
              `
Normalized Japanese text with natural 、(touten) placement.
- Add 、only where a native writer would to improve readability (clause boundaries, after topic markers like は/も, before conjunctions).
- Do NOT tokenize every word; keep it natural.
- Do NOT add 、around existing punctuation (。！？、).
- Do NOT add copulas or endings (no だ／です／だよ).
- Remove stutters/fillers (ぼ、ぼく→ぼく; あ、あの→あの; drop えっと／あのー／うーん).
- Collapse emphasis (ー/〜/repeated っ・kana).
- Reduce repeats (!!!→! ???→? ……→……).
- Dialect → standard Japanese (no appended copulas).
- No paraphrasing; keep meaning intact.
- Single line output (no newlines).
              `.trim()
            ),
          proper_nouns: z
            .array(z.string())
            .describe(
              `
Proper nouns (people, places, orgs, titles, etc.) from ANY language.
- Must appear in the NORMALIZED text (surface-form substring match, ignoring inserted 、).
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
Normalize the Japanese text and extract proper nouns.

NORMALIZATION:
- Add 、only where natural (clause breaks, after は/も topic markers, before conjunctions). NOT between every word.
- Clean stutters/fillers, collapse emphasis, reduce excessive punctuation.
- Keep the original meaning; no paraphrasing.
- Single line, no newlines.

PROPER NOUNS:
- Return proper nouns that appear in your normalized output.
- Unique list (no duplicates).
- Focus on named entities (names, places, orgs, series titles).
- If unsure, omit.

TEXT:
${clean}
                `.trim(),
              },
            ],
          },
        ],
      })

      // sanitize proper nouns: unique, non-empty, must exist in normalized text (ignoring 、)
      const normalizedForCheck = object.normalized.replace(/、/g, "")
      const seen = new Set<string>()
      const out: string[] = []
      for (const raw of object.proper_nouns ?? []) {
        const s = (raw ?? "").trim()
        if (!s) continue
        if (!normalizedForCheck.includes(s)) continue
        if (seen.has(s)) continue
        seen.add(s)
        out.push(s)
      }
      console.log("[japanese-learning.normalize] done", {
        normalizedLen: object.normalized.length,
        properNounCount: out.length,
      })
      return { normalized: object.normalized.trim(), proper_nouns: out }
    }

    return await withRetries(run, 2)
  },
})

