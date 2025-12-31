import { httpAction } from "./_generated/server"
import { createGateway, stepCountIs, streamText, tool } from "ai"
import { z } from "zod"
import { buildPromptConfig } from "./prompts/nemu_chat"

const MODEL = "anthropic/claude-sonnet-4-5"

function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY environment variable is not set")
  }
  return createGateway({ apiKey })
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
  ichiranAnalysis: z.string().optional(),
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

export const chat = httpAction(async (_, request) => {
  const origin = request.headers.get("Origin")
  const allowAnyOrigin = process.env.NEMU_CHAT_ALLOW_ANY_ORIGIN === "true"
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
        "Access-Control-Allow-Headers": "Content-Type",
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
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
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
    const gateway = getGateway()
    const { systemPrompt, toolDescriptions, forcingMessage } = buildPromptConfig(hiddenContext, appLanguage)

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

    // Inject forcing message before the last user message (not persisted in history)
    // This helps the LLM comply with formatting rules
    if (aiMessages.length > 0) {
      const lastMsg = aiMessages[aiMessages.length - 1]
      if (lastMsg.role === "user") {
        // Remove last user message, insert forcing message, then re-add user message
        aiMessages.pop()
        aiMessages.push({ role: "user", content: forcingMessage })
        aiMessages.push(lastMsg)
      }
    }

    // Log entire LLM context for debugging
    console.log("[nemu_chat] LLM context:", JSON.stringify({
      system: systemPrompt,
      messages: aiMessages,
    }, null, 2))

    const stream = new ReadableStream({
      async start(controller) {
        const MAX_RETRIES = 2
        
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          let streamLogs: string[] = []
          let hadSpeakCall = false
          
          try {
            const result = streamText({
              model: gateway(MODEL),
              system: systemPrompt,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              messages: aiMessages as any,
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
                  streamLogs.push(JSON.stringify({ type: "text-delta", id: part.id, content: part.text }))
                  break

                case "tool-input-start":
                  streamLogs.push(
                    JSON.stringify({ type: "tool-input-start", id: part.id, toolName: part.toolName })
                  )
                  break

                case "tool-input-delta":
                  streamLogs.push(JSON.stringify({ type: "tool-input-delta", id: part.id, delta: part.delta }))
                  break

                case "tool-input-end":
                  streamLogs.push(JSON.stringify({ type: "tool-input-end", id: part.id }))
                  break

                case "tool-call":
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
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "error",
                error: err instanceof Error ? err.message : "Unknown streaming error",
              })}\n\n`)
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
