import { httpAction } from "./_generated/server"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"

const MODEL = "gemini-2.5-flash-lite"
const ELEVENLABS_MODEL_ID = "eleven_v3"
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
const TRANSCRIPT_LIMIT = 500

const AUDIO_TAG_PROMPT = `
# 指示

## 1. 役割と目的
あなたは、**音声生成（TTS）向けのセリフ表現を強化するAIアシスタント**である。
主目的は、**元のセリフ本文や意味を一切変更せずに**、日本語の**音声タグ（擬音語・擬態語・話し方表現）**を動的に追加し、聴覚的に表情豊かで臨場感のある対話にすることである。
本指示に記載されたルールは**必ず厳守**すること。

---

## 2. 基本ルール

### 必ず行うこと
- 日本語の**擬音語・擬態語・話し方表現**を用いた音声タグを追加すること
- 音声タグは**声・息・間・話し方・感情の出方など、聴覚的に表現可能なもののみ**を使用すること
- 各セリフの文脈・感情・空気感を正確に読み取り、**自然で効果的な音声タグ**を選ぶこと
- 会話全体として、緊張・戸惑い・喜び・驚き・思案など、**感情表現に幅を持たせること**
- 音声タグは、影響するセリフの**直前・直後・自然な間**に配置すること

### 絶対に行ってはいけないこと
- **セリフ本文を一文字たりとも変更しないこと**
  - 追加・削除・言い換えは禁止
  - セリフ本文を角括弧 \`[]\` の中に入れることも禁止
- 地の文や描写を音声タグに置き換えないこと
- 声以外の行動・状態・環境を示すタグを使用しないこと
  - 例：\`[立ち上がる]\` \`[微笑む]\` \`[歩き回る]\` \`[音楽]\`
- 効果音・環境音・BGMを示すタグを使用しないこと
- 新しいセリフを作らないこと
- セリフの意味や感情をねじ曲げる音声タグを付けないこと
- 不適切・過激・センシティブな内容を示唆しないこと

---

## 3. 作業手順
1. 各セリフの感情・心理・間の取り方を丁寧に読み取る
2. 文脈に合った日本語の音声タグを選定する
3. 最も自然で効果的な位置に、角括弧 \`[]\` で音声タグを挿入する
4. セリフ本文は変更せず、必要に応じて
   - 「！」「？」「……」を追加して感情を強調してよい
   - 一部を全角大文字で強調してもよい
5. すべてのルールを守っているか最終確認する

---

## 4. 出力形式
- **音声タグ付きのセリフ本文のみ**を出力すること
- 解説・注釈・説明は一切出力しないこと
- 音声タグは必ず \`[]\` で囲むこと
- 会話の流れと可読性を維持すること

---

## 5. 使用可能な音声タグ例（非網羅）

### 感情・話し方（擬態語を含む）
※ 声の質・話し方・空気感として**聴覚的に再現可能な場合のみ使用可**

- \`[ふわふわした声で]\`
- \`[やわらかく]\`
- \`[おずおずと]\`
- \`[そっと]\`
- \`[照れながら]\`
- \`[戸惑いながら]\`
- \`[自信なさげに]\`
- \`[驚いて]\`
- \`[わくわく]\`
- \`[にこにこしながら]\`
- \`[考え込むように]\`
- \`[小声で]\`
- \`[ささやくように]\`

### 非言語的な声・息・間
- \`[くすっ]\`
- \`[くすくす]\`
- \`[えへへ]\`
- \`[ははっ]\`
- \`[ふぅ…]\`
- \`[ため息]\`
- \`[息をのむ]\`
- \`[一拍置いて]\`
- \`[間をあけて]\`
- \`[長い沈黙]\`

---

## 6. 注意事項（重要）
- 「ふわふわ」「にこにこ」「わくわく」などの擬態語は、**必ず声や話し方として解釈できる場合のみ**使用すること
- 触覚・視覚・身体動作の描写にならないよう厳密に注意すること
- **音声として再生されたときに成立するか**を常に判断基準とする

---

## 7. 例

### 入力
「大丈夫だよ、そんなに緊張しなくていい」

### 出力
「[ふわふわした声で] 大丈夫だよ、そんなに緊張しなくていい」

---

### 入力
「え、ぼくがやるの？」

### 出力
「[おずおずと] え、ぼくがやるの？」
`.trim()

const allowedOrigins = [process.env.SITE_URL, process.env.DEV_URL].filter(Boolean) as string[]

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "*"
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  }
}

function getGoogle() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY environment variable is not set")
  }
  return createGoogleGenerativeAI({ apiKey })
}

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

async function addAudioTags(text: string): Promise<string> {
  const prompt = `${AUDIO_TAG_PROMPT}\n\n## 入力\n${text}`.trim()
  const result = await generateText({
    model: getGoogle()(MODEL),
    prompt,
  })
  const output = result.text.trim()
  if (!output) {
    throw new Error("Empty audio tag response")
  }
  return output
}

export const tts = httpAction(async (_, request) => {
  const origin = request.headers.get("Origin")
  const corsHeaders = getCorsHeaders(origin)

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  let body: { text?: string; skipTagging?: boolean; source?: string } | null = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const rawText = typeof body?.text === "string" ? body.text : ""
  const cleanText = rawText.trim()
  if (!cleanText) {
    return new Response("Missing text", { status: 400, headers: corsHeaders })
  }

  if (body?.source === "transcript" && cleanText.length > TRANSCRIPT_LIMIT) {
    return new Response("Transcript too long for TTS", { status: 413, headers: corsHeaders })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) {
    console.error("[tts] Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID")
    return new Response("TTS not configured", { status: 500, headers: corsHeaders })
  }

  const hasTags = /\[[^\]]+\]/.test(cleanText)
  const shouldTag = !body?.skipTagging && !hasTags
  let ttsText = cleanText

  if (shouldTag) {
    try {
      ttsText = await withRetries(() => addAudioTags(cleanText), 1)
    } catch (err) {
      console.warn("[tts] Audio tag generation failed; using raw text", err)
      ttsText = cleanText
    }
  }

  console.log("[tts] post-tag text", { source: body?.source, text: ttsText })

  const elevenRes = await fetch(`${ELEVENLABS_API_BASE}/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: ttsText,
      model_id: ELEVENLABS_MODEL_ID,
      voice_settings: {
        stability: 0
      },
    }),
  })

  if (!elevenRes.ok) {
    const errorText = await elevenRes.text().catch(() => "")
    console.error("[tts] ElevenLabs error", elevenRes.status, errorText)
    return new Response(errorText || "TTS request failed", {
      status: elevenRes.status,
      headers: corsHeaders,
    })
  }

  if (!elevenRes.body) {
    return new Response("TTS stream missing", { status: 502, headers: corsHeaders })
  }

  const contentType = elevenRes.headers.get("Content-Type") || "audio/mpeg"
  const stream = new ReadableStream({
    start(controller) {
      const reader = elevenRes.body!.getReader()
      const pump = () => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              controller.close()
              return
            }
            if (value) controller.enqueue(value)
            pump()
          })
          .catch((err) => controller.error(err))
      }
      pump()
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  })
})

export const ttsAlignment = httpAction(async (_, request) => {
  const origin = request.headers.get("Origin")
  const corsHeaders = getCorsHeaders(origin)

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  let body: { text?: string; skipTagging?: boolean; source?: string } | null = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const rawText = typeof body?.text === "string" ? body.text : ""
  const cleanText = rawText.trim()
  if (!cleanText) {
    return new Response("Missing text", { status: 400, headers: corsHeaders })
  }

  if (body?.source === "transcript" && cleanText.length > TRANSCRIPT_LIMIT) {
    return new Response("Transcript too long for TTS", { status: 413, headers: corsHeaders })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) {
    console.error("[tts] Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID")
    return new Response("TTS not configured", { status: 500, headers: corsHeaders })
  }

  const hasTags = /\[[^\]]+\]/.test(cleanText)
  const shouldTag = !body?.skipTagging && !hasTags
  let ttsText = cleanText

  if (shouldTag) {
    try {
      ttsText = await withRetries(() => addAudioTags(cleanText), 1)
    } catch (err) {
      console.warn("[tts] Audio tag generation failed; using raw text", err)
      ttsText = cleanText
    }
  }

  console.log("[tts] post-tag text", { source: body?.source, text: ttsText })

  const elevenRes = await fetch(`${ELEVENLABS_API_BASE}/${voiceId}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: ttsText,
      model_id: ELEVENLABS_MODEL_ID,
      voice_settings: {
        stability: 0
      },
    }),
  })

  if (!elevenRes.ok) {
    const errorText = await elevenRes.text().catch(() => "")
    console.error("[tts] ElevenLabs alignment error", elevenRes.status, errorText)
    return new Response(errorText || "TTS alignment request failed", {
      status: elevenRes.status,
      headers: corsHeaders,
    })
  }

  const payload = await elevenRes.json().catch(() => null)
  if (!payload) {
    return new Response("Invalid alignment response", { status: 502, headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      alignment: payload.alignment ?? null,
      normalized_text: payload.normalized_text ?? payload.normalizedText ?? null,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  )
})
