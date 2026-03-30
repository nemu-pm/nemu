import { httpAction } from "./_generated/server"
import { stepCountIs, streamText, tool } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { buildPromptConfig } from "./prompts/nemu_chat"
import { getHttpSession } from "./auth"

const MODEL = "anthropic/claude-sonnet-4-5"
const MAX_INPUT_TOKENS_BUDGET = 80_000
const CTX_SNAPSHOT_PREFIX = "NEMU_CTX_SNAPSHOT_V1"
const EPHEMERAL_PREFIX = "NEMU_EPHEMERAL_V1"

function getAnthropicModelId(model: string): string {
  // Keep the same model identity while adapting from Gateway IDs ("anthropic/<id>")
  // to Anthropic provider IDs ("<id>").
  return model.startsWith("anthropic/") ? model.slice("anthropic/".length) : model
}

function estimateTokenCountFromText(text: string): number {
  // Cheap token estimator (provider-agnostic):
  // - ASCII tends to be ~4 chars/token
  // - Non-ASCII (JP/CJK) tends to be denser; estimate ~1.5 chars/token
  let ascii = 0
  let nonAscii = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x7f) ascii++
    else nonAscii++
  }
  return Math.ceil(ascii / 4 + nonAscii / 1.5)
}

function estimateTokenCountFromAny(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "string") return estimateTokenCountFromText(value)
  try {
    return estimateTokenCountFromText(JSON.stringify(value))
  } catch {
    return 0
  }
}

// Works on the "model messages" we pass into `streamText` (system/user/assistant/tool).
function estimateTokenCountFromModelMessages(messages: Array<{ role: string; content: unknown }>): number {
  let tokens = 0
  for (const msg of messages) {
    const content = (msg as any).content
    if (typeof content === "string") {
      tokens += estimateTokenCountFromText(content)
      continue
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue
        const type = (part as any).type
        if (type === "text") tokens += estimateTokenCountFromText(String((part as any).text ?? ""))
        else if (type === "tool-call") {
          tokens += estimateTokenCountFromAny((part as any).toolName)
          tokens += estimateTokenCountFromAny((part as any).input)
        } else if (type === "tool-result") {
          tokens += estimateTokenCountFromAny((part as any).toolName)
          tokens += estimateTokenCountFromAny((part as any).output)
        } else {
          tokens += estimateTokenCountFromAny(part)
        }
      }
      continue
    }
    tokens += estimateTokenCountFromAny(content)
  }
  return tokens
}

function fnv1a32(text: string): string {
  // Small deterministic hash for short keys (NOT cryptographic).
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // >>> 0 to keep unsigned.
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function parseContextSnapshotKeyFromContent(content: string): string | null {
  if (!content.startsWith(CTX_SNAPSHOT_PREFIX)) return null
  const firstLine = content.split("\n", 1)[0] ?? ""
  const match = firstLine.match(/key=([a-z0-9]+)/i)
  return match?.[1] ?? null
}

function getLastContextSnapshotKeyFromClientMessages(
  messages: Array<{ role: "user" | "assistant" | "tool"; content?: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as any
    if (m?.role !== "user") continue
    if (typeof m.content !== "string") continue
    const key = parseContextSnapshotKeyFromContent(m.content)
    if (key) return key
  }
  return null
}

function makeContextSnapshotKey(options: {
  locale: string
  appLanguage: string
  hiddenContext: {
    mangaTitle: string
    mangaGenres?: string[]
    chapterTitle?: string
    chapterNumber?: number
    volumeNumber?: number
    currentPage: number
    pageCount?: number
    pageTranscript?: string
    responseMode?: string
  }
}): string {
  const c = options.hiddenContext
  const normalizedGenres = Array.isArray(c.mangaGenres) ? [...c.mangaGenres].sort() : undefined
  const payload = {
    v: 1,
    locale: options.locale,
    appLanguage: options.appLanguage,
    responseMode: c.responseMode ?? null,
    mangaTitle: c.mangaTitle,
    mangaGenres: normalizedGenres ?? null,
    chapterTitle: c.chapterTitle ?? null,
    chapterNumber: c.chapterNumber ?? null,
    volumeNumber: c.volumeNumber ?? null,
    currentPage: c.currentPage,
    pageCount: c.pageCount ?? null,
    pageTranscriptHash: c.pageTranscript ? fnv1a32(c.pageTranscript) : null,
    hasTranscript: Boolean(c.pageTranscript),
  }
  return fnv1a32(JSON.stringify(payload))
}

// =============================================================================
// Schema Definitions
// =============================================================================

const HiddenContextSchema = z.object({
  mangaTitle: z.string(),
  mangaGenres: z.array(z.string()).optional(),
  chapterTitle: z.string().optional(),
  chapterNumber: z.number().optional(),
  volumeNumber: z.number().optional(),
  currentPage: z.number(),
  pageCount: z.number().optional(),
  pageTranscript: z.string().optional(),
  ephemeralContext: z.string().optional(),
  responseMode: z.enum(["app", "jlpt"]).optional(),
})

// Tool result from client execution
const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.string(),
  isError: z.boolean().optional(),
})

// Message can be user, assistant, or tool result
const MessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.string(),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string(),
    // Tool calls made by this assistant message (for history reconstruction)
    toolCalls: z.array(z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      args: z.record(z.string(), z.unknown()),
    })).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    toolResults: z.array(ToolResultSchema),
  }),
])

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema),
  hiddenContext: HiddenContextSchema,
  appLanguage: z.string(),
})

// =============================================================================
// Tool Definitions (client-executable)
// =============================================================================

// Tool schemas (used for both definition and validation)
const requestTranscriptSchema = z.object({
  pageNumber: z.number().int().min(1).describe("The 1-indexed page number to get transcript for"),
  reason: z.string().optional().describe("Brief reason why you need this page (shown to user as status)"),
})

const triggerOcrSchema = z.object({
  pageNumber: z.number().int().min(1).describe("The 1-indexed page number to run OCR for"),
})

const suggestFollowupsSchema = z.object({
  suggestions: z
    .array(z.string().describe("A natural follow-up question"))
    .min(1)
    .max(4)
    .describe("List of follow-up questions"),
})

const speakSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("A short LINE-style bubble (1-2 sentences, ~20-80 characters). Split long replies into multiple calls."),
})

const sendVoiceSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Voice message text to send to the user. May include audio tags in brackets."),
})

// Tools that require client execution
const CLIENT_TOOLS = new Set(["request_transcript", "trigger_ocr"])

// =============================================================================
// Prompt Builder
// =============================================================================

// =============================================================================
// Main Chat Handler
// =============================================================================

export const chat = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin")
  const allowAnyOrigin = process.env.ALLOW_ANY_ORIGIN === "true"
  const allowedOrigins = [process.env.SITE_URL, process.env.DEV_URL].filter(Boolean) as string[]
  const allowedOrigin = allowAnyOrigin
    ? origin || "*"
    : origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || "*"

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Better-Auth-Cookie",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    })
  }

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  }
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  }

  // Auth check
  const session = await getHttpSession(ctx, request)
  if (!session?.user) {
    return new Response(
      JSON.stringify({ code: "unauthorized" }),
      { status: 401, headers: jsonHeaders }
    )
  }

  const encoder = new TextEncoder()

  try {
    const rawBody = await request.json()
    const parseResult = ChatRequestSchema.safeParse(rawBody)

    if (!parseResult.success) {
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Invalid request: ${parseResult.error.message}` })}\n\n`
            )
          )
          controller.close()
        },
      })
      return new Response(errorStream, { headers })
    }

    const { messages, hiddenContext, appLanguage } = parseResult.data
    const { systemPrompt, toolDescriptions, contextSnapshotMessage, ephemeralContextMessage, locale } =
      buildPromptConfig(hiddenContext, appLanguage)

    // Convert messages to AI SDK format
    type AIMessage = 
      | { role: "user"; content: string }
      | { role: "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: Record<string, unknown> }> }
      | { role: "tool"; content: Array<{ type: "tool-result"; toolCallId: string; toolName: string; output: { type: "text" | "error-text"; value: string } }> }
    
    const aiMessages: AIMessage[] = []
    
    for (const m of messages) {
      if (m.role === "user") {
        aiMessages.push({ role: "user", content: m.content })
      } else if (m.role === "assistant") {
        if (m.toolCalls && m.toolCalls.length > 0) {
          aiMessages.push({
            role: "assistant",
            content: [
              { type: "text" as const, text: m.content },
              ...m.toolCalls.map(tc => ({
                type: "tool-call" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.args,
              })),
            ],
          })
        } else {
          aiMessages.push({ role: "assistant", content: m.content })
        }
      } else if (m.role === "tool") {
        aiMessages.push({
          role: "tool",
          content: m.toolResults.map(tr => ({
            type: "tool-result" as const,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: {
              type: tr.isError ? "error-text" : "text",
              value: tr.result,
            },
          })),
        })
      }
    }

    // Context snapshot architecture (Option A):
    // - Persisted snapshot messages live in the client-sent history.
    // - On any request where the context changed (page/transcript/etc), we insert a snapshot message
    //   right before the current user message and emit an SSE event telling the client to persist it.
    // - One-turn-only ephemeralContext is injected only for this request (never persisted).
    const lastSnapshotKeyFromClient = getLastContextSnapshotKeyFromClientMessages(messages as any)
    const snapshotKey = makeContextSnapshotKey({ locale, appLanguage, hiddenContext })
    const needsSnapshot = lastSnapshotKeyFromClient !== snapshotKey
    const snapshotContent = `${CTX_SNAPSHOT_PREFIX} key=${snapshotKey}\n\n${contextSnapshotMessage}`
    const hasEphemeral = Boolean(ephemeralContextMessage && ephemeralContextMessage.trim().length > 0)
    const ephemeralContent = ephemeralContextMessage
      ? `${EPHEMERAL_PREFIX}\n\n${ephemeralContextMessage}`
      : null

    // Insert before last user message (current user turn).
    if (aiMessages.length > 0) {
      const lastMsg = aiMessages[aiMessages.length - 1]
      if (lastMsg.role === "user") {
        aiMessages.pop()
        if (needsSnapshot) aiMessages.push({ role: "user", content: snapshotContent })
        if (ephemeralContent) aiMessages.push({ role: "user", content: ephemeralContent })
        aiMessages.push(lastMsg)
      }
    }

    // Build final model messages (system + history + forcing + user).
    //
    // Prompt caching notes (Anthropic):
    // - Tools, then system, then messages are cacheable blocks.
    // - We set an explicit cache breakpoint right BEFORE the forcing message.
    //   In our structure, forcing is the second-to-last message in `aiMessages`.
    // - We also cache the system prompt block.
    const cacheControl = { type: "ephemeral" as const, ttl: "1h" as const }
    const aiMessagesWithCaching: any[] = aiMessages.map((m) => ({ ...m }))
    // Cache breakpoint: right before the injected tail for this request.
    // Tail is always: [snapshot?] [ephemeral?] [current user]
    const tailCount = 1 + (needsSnapshot ? 1 : 0) + (hasEphemeral ? 1 : 0)
    const idxBreakpoint = aiMessagesWithCaching.length - tailCount - 1
    if (idxBreakpoint >= 0) {
      aiMessagesWithCaching[idxBreakpoint] = {
        ...aiMessagesWithCaching[idxBreakpoint],
        providerOptions: {
          ...(aiMessagesWithCaching[idxBreakpoint].providerOptions ?? {}),
          anthropic: { cacheControl },
        },
      }
    }

    const modelMessagesWithSystem: any[] = [
      {
        role: "system" as const,
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl } },
      },
      ...aiMessagesWithCaching,
    ]

    // Reject overly-long context (client will truncate + retry).
    const estimatedTokens = estimateTokenCountFromModelMessages(modelMessagesWithSystem as any)
    if (estimatedTokens > MAX_INPUT_TOKENS_BUDGET) {
      return new Response(
        JSON.stringify({
          code: "context_too_long",
          tokenBudget: MAX_INPUT_TOKENS_BUDGET,
          estimatedTokens,
          suggestedClientAction: "drop_oldest_half",
        }),
        { status: 413, headers: jsonHeaders }
      )
    }

    // Log entire LLM context for debugging
    console.log(
      "[nemu_chat] LLM context:",
      JSON.stringify(
        {
          system: systemPrompt,
          messages: aiMessagesWithCaching,
        },
        null,
        2
      )
    )

    const stream = new ReadableStream({
      async start(controller) {
        const MAX_RETRIES = 2
        // Emit snapshot event once per request (not per retry).
        if (needsSnapshot) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "context_snapshot",
                key: snapshotKey,
                content: snapshotContent,
              })}\n\n`
            )
          )
        }
        
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          let streamLogs: string[] = []
          let hadSpeakCall = false
          let lastActivitySentAt = 0
          let currentToolName: string | null = null

          const emitActivity = (toolName?: string) => {
            // No typing dots during followups generation.
            if (toolName === "suggest_followups") return
            const now = Date.now()
            // Throttle to avoid spamming SSE.
            if (now - lastActivitySentAt < 120) return
            lastActivitySentAt = now
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "activity",
                  activity: "llm",
                  activityToolName: toolName,
                })}\n\n`
              )
            )
          }
          
          try {
            const result = streamText({
              model: anthropic(getAnthropicModelId(MODEL)),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              messages: modelMessagesWithSystem as any,
              tools: {
                request_transcript: tool({
                  description: toolDescriptions.requestTranscript,
                  inputSchema: requestTranscriptSchema,
                }),
                trigger_ocr: tool({
                  description: toolDescriptions.triggerOcr,
                  inputSchema: triggerOcrSchema,
                }),
                suggest_followups: tool({
                  description: toolDescriptions.suggestFollowups,
                  inputSchema: suggestFollowupsSchema,
                }),
                speak: tool({
                  description: toolDescriptions.speak,
                  inputSchema: speakSchema,
                  execute: async () => ({ ok: true }),
                }),
                send_voice_recording: tool({
                  description: toolDescriptions.sendVoiceRecording,
                  inputSchema: sendVoiceSchema,
                  execute: async () => ({ ok: true }),
                }),
              },
              toolChoice: "required",
              stopWhen: stepCountIs(4),
              includeRawChunks: true,
              onFinish: ({ providerMetadata, totalUsage }) => {
                const meta = (providerMetadata as any)?.anthropic
                const cacheCreated = meta?.cacheCreationInputTokens
                const cachedIn = (totalUsage as any)?.cachedInputTokens
                const cacheWrite = (totalUsage as any)?.cacheCreationInputTokens
                // Log only when caching signals are present to avoid noise.
                if (cacheCreated != null || cachedIn != null || cacheWrite != null) {
                  console.log("[nemu_chat] Anthropic cache:", {
                    cacheCreationInputTokens: cacheCreated ?? cacheWrite,
                    cachedInputTokens: cachedIn,
                  })
                }
              },
            })

            let accumulatedText = ""
            const safeStringify = (value: unknown) => {
              try {
                return JSON.stringify(value)
              } catch {
                return String(value)
              }
            }
            let pendingClientToolCalls: Array<{
              toolCallId: string
              toolName: string
              args: Record<string, unknown>
            }> = []
            let collectedSuggestions: string[] = []

            // Process the stream
            for await (const part of result.fullStream) {
              switch (part.type) {
                case "text-delta":
                  accumulatedText += part.text
                  emitActivity()
                  streamLogs.push(JSON.stringify({ type: "text-delta", id: part.id, content: part.text }))
                  break

                case "tool-input-start":
                  currentToolName = part.toolName
                  emitActivity(part.toolName)
                  streamLogs.push(
                    JSON.stringify({ type: "tool-input-start", id: part.id, toolName: part.toolName })
                  )
                  break

                case "tool-input-delta":
                  emitActivity(currentToolName ?? undefined)
                  streamLogs.push(JSON.stringify({ type: "tool-input-delta", id: part.id, delta: part.delta }))
                  break

                case "tool-input-end":
                  emitActivity(currentToolName ?? undefined)
                  currentToolName = null
                  streamLogs.push(JSON.stringify({ type: "tool-input-end", id: part.id }))
                  break

                case "tool-call":
                  emitActivity(part.toolName)
                  streamLogs.push(
                    JSON.stringify({
                      type: "tool-call",
                      toolName: part.toolName,
                      toolCallId: part.toolCallId,
                      input: part.input,
                    })
                  )
                  // Check if this is a client-executable tool
                  if (CLIENT_TOOLS.has(part.toolName)) {
                    // Send tool_call event to client
                    const toolArgs = part.input as Record<string, unknown>
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "tool_call",
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        args: toolArgs,
                      })}\n\n`)
                    )
                    pendingClientToolCalls.push({
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      args: toolArgs,
                    })
                  } else if (part.toolName === "speak") {
                    const input = part.input as { text?: string }
                    const text = typeof input.text === "string" ? input.text.trim() : ""
                    if (text) {
                      hadSpeakCall = true
                      streamLogs.push(JSON.stringify({ type: "speak", content: text }))
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "speak", content: text })}\n\n`)
                      )
                    }
                  } else if (part.toolName === "send_voice_recording") {
                    const input = part.input as { text?: string }
                    const text = typeof input.text === "string" ? input.text.trim() : ""
                    if (text) {
                      hadSpeakCall = true
                      streamLogs.push(JSON.stringify({ type: "voice", content: text }))
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "voice", content: text })}\n\n`)
                      )
                    }
                  } else if (part.toolName === "suggest_followups") {
                    // Server-side tool - extract suggestions
                    const input = part.input as { suggestions: string[] }
                    collectedSuggestions = input.suggestions
                  }
                  break

                case "tool-result":
                  streamLogs.push(
                    JSON.stringify({
                      type: "tool-result",
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      output: part.output,
                    })
                  )
                  // Tool result processed by AI SDK
                  break

                case "raw":
                  streamLogs.push(JSON.stringify({ type: "raw", rawValue: safeStringify(part.rawValue) }))
                  break

                case "error":
                  streamLogs.push(JSON.stringify({ type: "stream-error", error: part.error instanceof Error ? part.error.message : String(part.error) }))
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: "error",
                      error: part.error instanceof Error ? part.error.message : String(part.error),
                    })}\n\n`)
                  )
                  break

                case "finish":
                  streamLogs.push(
                    JSON.stringify({ type: "finish", reason: part.finishReason, rawReason: part.rawFinishReason })
                  )
                  break
              }
            }

            // If we have pending client tool calls, tell client to execute and reconnect
            if (pendingClientToolCalls.length > 0) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "phase", phase: "client_tools" })}\n\n`)
              )
              const trimmed = accumulatedText.trim()
              if (trimmed) {
                streamLogs.push(JSON.stringify({ type: "assistant-text-ignored", content: trimmed }))
                accumulatedText = ""
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "awaiting_tool_results",
                  toolCalls: pendingClientToolCalls,
                  // Keep partial content empty; user-facing text is sent via speak events
                  partialContent: "",
                })}\n\n`)
              )
              if (streamLogs.length > 0) {
                console.log("[nemu_chat] LLM output logs:", streamLogs.join("\n"))
              }
              // Client will continue the conversation, close stream
              controller.close()
              return
            }
            
            // Check if we got a speak call - if not and we have retries left, retry
            if (!hadSpeakCall && attempt < MAX_RETRIES) {
              console.log(`[nemu_chat] No speak call on attempt ${attempt + 1}, retrying...`)
              if (streamLogs.length > 0) {
                console.log("[nemu_chat] LLM output logs (no speak, retrying):", streamLogs.join("\n"))
              }
              continue // retry
            }
            
            // No pending tools - send followups and done
            const trimmed = accumulatedText.trim()
            if (trimmed) {
              streamLogs.push(JSON.stringify({ type: "assistant-text-ignored", content: trimmed }))
              accumulatedText = ""
            }
            if (collectedSuggestions.length > 0) {
              streamLogs.push(JSON.stringify({ type: "followups", suggestions: collectedSuggestions }))
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "followups", suggestions: collectedSuggestions })}\n\n`)
              )
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))

            if (streamLogs.length > 0) {
              console.log("[nemu_chat] LLM output logs:", streamLogs.join("\n"))
            }
            // Success, close stream
            controller.close()
            return
          } catch (err) {
            if (streamLogs.length > 0) {
              console.log("[nemu_chat] LLM output logs (partial):", streamLogs.join("\n"))
            }
            const errorMessage = err instanceof Error ? err.message : "Unknown streaming error"
            // If our estimator missed and provider rejects for context size, tell client to truncate.
            const looksLikeTooLong =
              typeof errorMessage === "string" &&
              (errorMessage.toLowerCase().includes("too long") ||
                errorMessage.toLowerCase().includes("context length") ||
                errorMessage.toLowerCase().includes("prompt is too long") ||
                errorMessage.toLowerCase().includes("max tokens"))
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: looksLikeTooLong ? "context_too_long" : errorMessage,
                  code: looksLikeTooLong ? "context_too_long" : undefined,
                })}\n\n`
              )
            )
            // Error, close stream
            controller.close()
            return
          }
        }
        
        // If we exhausted all retries without speak, send done and close
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        controller.close()
      },
    })

    return new Response(stream, { headers })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    console.error("[nemu_chat] Error:", errorMsg)

    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`))
        controller.close()
      },
    })

    return new Response(errorStream, { headers })
  }
})
