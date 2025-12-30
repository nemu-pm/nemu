/**
 * Nemu Chat Service - Pure TypeScript, UI-agnostic LLM layer
 * No React imports. Just async functions.
 */

import type { HiddenContext, ToolCall, ToolResult, ChatStreamEvent } from './types'
import type { ChatToolContext } from './tools'
import { useTextDetectorStore } from '../store'

// Track current request for client-side cancellation
let currentAbortController: AbortController | null = null

type MessageForRequest =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolResults: ToolResult[] }

export interface ChatStreamCallbacks {
  onText: (text: string) => void
  onSpeak: (text: string) => void
  onToolCall: (toolCall: ToolCall) => void
  onToolsAwaiting: (toolCalls: ToolCall[], partialContent: string) => void
  onToolResults: (toolResults: ToolResult[]) => void
  onFollowups: (suggestions: string[]) => void
  onDone: () => void
  onError: (error: string) => void
  onCancelled: () => void
}

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string

function getClientEnvInfo(baseUrl: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown'
  const href = typeof window !== 'undefined' ? window.location.href : 'unknown'
  const online = typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'
  return { baseUrl, origin, href, online }
}

function formatNetworkError(err: unknown, baseUrl: string): string {
  const message = err instanceof Error ? err.message : String(err)
  const detail = {
    error: 'fetch_failed',
    message,
    ...getClientEnvInfo(baseUrl),
  }
  return JSON.stringify(detail, null, 2)
}

function formatHttpError(status: number, statusText: string, body: string, baseUrl: string): string {
  const detail = {
    error: 'http_error',
    status,
    statusText,
    body: body.slice(0, 2000),
    ...getClientEnvInfo(baseUrl),
  }
  return JSON.stringify(detail, null, 2)
}

/**
 * Execute a client-side tool and return the result
 */
export async function executeTool(toolCall: ToolCall, toolContext?: ChatToolContext): Promise<ToolResult> {
  const { toolCallId, toolName, args } = toolCall

  try {
    switch (toolName) {
      case 'request_transcript':
        return await executeRequestTranscript(toolCallId, toolName, args, toolContext)
      case 'trigger_ocr':
        return await executeTriggerOcr(toolCallId, toolName, args, toolContext)
      default:
        return { toolCallId, toolName, result: `Unknown tool: ${toolName}`, isError: true }
    }
  } catch (err) {
    return {
      toolCallId,
      toolName,
      result: `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      isError: true,
    }
  }
}

/**
 * Execute the request_transcript tool
 */
async function executeRequestTranscript(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  toolContext?: ChatToolContext
): Promise<ToolResult> {
  const pageNumber = args.pageNumber as number
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return { toolCallId, toolName, result: 'Invalid page number provided.', isError: true }
  }
  const resolvedIndex = toolContext?.resolvePageIndex?.(pageNumber, toolContext.chapterId)
  if (toolContext?.resolvePageIndex && resolvedIndex == null) {
    return { toolCallId, toolName, result: 'Page not found in the current chapter.', isError: true }
  }
  const pageIndex = resolvedIndex ?? pageNumber - 1
  const store = useTextDetectorStore.getState()

  // Check existing transcript
  const existingTranscript = store.transcripts.get(pageIndex)
  if (existingTranscript && existingTranscript.length > 0) {
    const text = existingTranscript.map((line) => line.text).filter(Boolean).join('\n')
    return { toolCallId, toolName, result: text || 'No text found on this page.', isError: false }
  }

  // Wait if OCR is in progress
  if (store.ocrLoadingPages.has(pageIndex)) {
    const waited = await waitForTranscript(pageIndex)
    if (waited) {
      return { toolCallId, toolName, result: waited, isError: false }
    }
    return { toolCallId, toolName, result: 'OCR processing failed or timed out.', isError: true }
  }

  // Trigger OCR if we can fetch an image
  if (toolContext?.getPageImageBlob) {
    const imageBlob = await toolContext.getPageImageBlob(pageIndex)
    if (!imageBlob) {
      return {
        toolCallId,
        toolName,
        result: `Page ${pageNumber} image not available yet.`,
        isError: true,
      }
    }
    const cacheKey = toolContext.getCacheKey?.(pageIndex)
    useTextDetectorStore.getState().runOcr(pageIndex, imageBlob, cacheKey)
    const waited = await waitForTranscript(pageIndex)
    if (waited) {
      return { toolCallId, toolName, result: waited, isError: false }
    }
    return { toolCallId, toolName, result: 'OCR processing failed or timed out.', isError: true }
  }

  return {
    toolCallId,
    toolName,
    result: `Page ${pageNumber} transcript not available.`,
    isError: true,
  }
}

async function executeTriggerOcr(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  toolContext?: ChatToolContext
): Promise<ToolResult> {
  const pageNumber = args.pageNumber as number
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return { toolCallId, toolName, result: 'Invalid page number provided.', isError: true }
  }
  const resolvedIndex = toolContext?.resolvePageIndex?.(pageNumber, toolContext.chapterId)
  if (toolContext?.resolvePageIndex && resolvedIndex == null) {
    return { toolCallId, toolName, result: 'Page not found in the current chapter.', isError: true }
  }
  const pageIndex = resolvedIndex ?? pageNumber - 1
  const store = useTextDetectorStore.getState()

  if (store.transcripts.has(pageIndex)) {
    return { toolCallId, toolName, result: `Page ${pageNumber} OCR already available.`, isError: false }
  }

  if (store.ocrLoadingPages.has(pageIndex)) {
    const waited = await waitForTranscript(pageIndex)
    if (waited) {
      return { toolCallId, toolName, result: `OCR complete for page ${pageNumber}.`, isError: false }
    }
    return { toolCallId, toolName, result: 'OCR processing failed or timed out.', isError: true }
  }

  if (!toolContext?.getPageImageBlob) {
    return { toolCallId, toolName, result: 'OCR trigger unavailable.', isError: true }
  }

  const imageBlob = await toolContext.getPageImageBlob(pageIndex)
  if (!imageBlob) {
    return { toolCallId, toolName, result: `Page ${pageNumber} image not available yet.`, isError: true }
  }

  const cacheKey = toolContext.getCacheKey?.(pageIndex)
  store.runOcr(pageIndex, imageBlob, cacheKey)
  const waited = await waitForTranscript(pageIndex)
  if (waited) {
    return { toolCallId, toolName, result: `OCR complete for page ${pageNumber}.`, isError: false }
  }
  return { toolCallId, toolName, result: 'OCR processing failed or timed out.', isError: true }
}

async function waitForTranscript(pageIndex: number): Promise<string | null> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const current = useTextDetectorStore.getState()
    const transcript = current.transcripts.get(pageIndex)
    if (transcript && transcript.length > 0) {
      return transcript.map((line) => line.text).filter(Boolean).join('\n')
    }
    if (!current.ocrLoadingPages.has(pageIndex)) break
  }
  return null
}

/**
 * Stream a chat response from the backend.
 * Returns when streaming is complete (including any tool execution loops).
 */
export async function streamChat(
  messages: MessageForRequest[],
  hiddenContext: HiddenContext,
  appLanguage: string,
  callbacks: ChatStreamCallbacks,
  toolContext?: ChatToolContext
): Promise<void> {
  const baseUrl = CONVEX_SITE_URL

  // Cancel any existing request
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  // Create new abort controller for this request
  const abortController = new AbortController()
  currentAbortController = abortController

  let response: Response
  try {
    response = await fetch(`${baseUrl}/nemu-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, hiddenContext, appLanguage }),
      signal: abortController.signal,
    })
  } catch (err) {
    // Check if this was an abort
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onCancelled()
      return
    }
    throw new Error(formatNetworkError(err, baseUrl))
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(formatHttpError(response.status, response.statusText, bodyText, baseUrl))
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (!data) continue

        try {
          const event = JSON.parse(data) as ChatStreamEvent

          switch (event.type) {
            case 'text':
              callbacks.onText(event.content ?? '')
              break

            case 'speak':
              callbacks.onSpeak(event.content ?? '')
              break

            case 'tool_call':
              if (event.toolCallId && event.toolName) {
                callbacks.onToolCall({
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args ?? {},
                })
              }
              break

            case 'awaiting_tool_results':
              callbacks.onToolsAwaiting(event.toolCalls ?? [], event.partialContent ?? '')
              // Execute tools and continue streaming
              const toolResults = await Promise.all(
                (event.toolCalls ?? []).map((toolCall) => executeTool(toolCall, toolContext))
              )
              callbacks.onToolResults(toolResults)

              // Build new messages with tool results
              const newMessages: MessageForRequest[] = [
                ...messages,
                { role: 'assistant', content: event.partialContent ?? '', toolCalls: event.toolCalls },
                { role: 'tool', toolResults },
              ]

              // Recursively continue the conversation (reuse same abort controller context)
              await streamChat(newMessages, hiddenContext, appLanguage, callbacks, toolContext)
              return

            case 'followups':
              callbacks.onFollowups(event.suggestions ?? [])
              break

            case 'error':
              callbacks.onError(event.error ?? 'Unknown error')
              return

            case 'done':
              callbacks.onDone()
              return
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Stream ended without explicit done
    callbacks.onDone()
  } catch (err) {
    // Handle abort during read loop
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onCancelled()
      return
    }
    throw err
  }
}

/**
 * Send a message and stream the response.
 * This is the main entry point - just call this on button click.
 */
export async function sendMessageAndStream(
  userMessage: string,
  existingMessages: MessageForRequest[],
  hiddenContext: HiddenContext,
  appLanguage: string,
  callbacks: ChatStreamCallbacks,
  toolContext?: ChatToolContext
): Promise<void> {
  const messages: MessageForRequest[] = [...existingMessages, { role: 'user', content: userMessage }]
  await streamChat(messages, hiddenContext, appLanguage, callbacks, toolContext)
}
