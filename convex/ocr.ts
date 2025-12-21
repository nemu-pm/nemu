import { v } from "convex/values"
import { action } from "./_generated/server"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"

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
    
    const { text } = await generateText({
      model: openrouter(MODEL),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: base64ToUint8Array(base64Data),
            },
            {
              type: "text",
              text: `Extract Japanese text from the manga panel image and normalize it for NLP.

Return ONLY the final Japanese text (no commentary/translation). If none, return "".
If multiple bubbles/boxes: output one line per bubble in reading order (top→bottom, right→left).
Within a bubble: remove extra spaces/line breaks; keep punctuation (。、！？「」『』〜…).

STRICT normalization:
- Do NOT add any words or endings not present in the image (especially no 「だ／です／だよ」 etc).
- Remove stutters/fillers: 「ぼ、ぼく」→「ぼく」, 「あ、あの」→「あの」, drop 「えっと／あのー／うーん」.
- Normalize emphasis inside words: collapse ー/〜 and repeated っ/kana: 「すごーーい／すご〜い／すごっっっ」→「すごい」.
- Reduce excessive repeats but keep type: 「！！！」→「！」, 「？？？」→「？」, 「！？！？？」→「！？」, 「…………」→「……」.
- Dialect → standard Japanese (use common dictionary forms), but never append copulas/endings.
- Don’t paraphrase; keep sentence structure as close as possible.`,
            },
          ],
        },
      ],
    })
    
    return { text: text.trim() }
  },
})
