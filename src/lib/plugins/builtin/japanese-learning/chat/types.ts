/**
 * Nemu Chat Types
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  kind?: 'text' | 'voice'
  content: string
  timestamp: number
  /** Display text (may differ from content sent to AI) */
  displayContent?: string
  /** Voice text for TTS (may include audio tags) */
  ttsText?: string
  /** Error message if any */
  errorMessage?: string
  /** Hidden from UI (e.g., system prompts) */
  hidden?: boolean
  /** Tool calls made by assistant */
  toolCalls?: ToolCall[]
  /** Tool results (stored with the assistant message that requested them) */
  toolResults?: ToolResult[]
  /** Read status for user messages (LINE-style per-message read receipt) */
  isRead?: boolean
}

export interface FollowUpSuggestion {
  id: string
  text: string
}

export interface HiddenContext {
  mangaTitle: string
  mangaGenres?: string[]
  chapterTitle?: string
  chapterNumber?: number
  volumeNumber?: number
  currentPage: number
  pageCount?: number
  pageTranscript?: string
  /**
   * One-turn-only extra context injected into the forcing message.
   * Used for things like sentence/grammar analysis dumps, OCR details, etc.
   */
  ephemeralContext?: string
  responseMode?: 'app' | 'jlpt'
}

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  toolName: string
  result: string
  isError?: boolean
}

export interface ChatStreamEvent {
  type:
    | 'text'
    | 'speak'
    | 'voice'
    | 'done'
    | 'error'
    | 'followups'
    | 'tool_call'
    | 'awaiting_tool_results'
    | 'activity'
    | 'context_snapshot'
  content?: string
  key?: string
  error?: string
  suggestions?: string[]
  toolCallId?: string
  toolName?: string
  args?: Record<string, unknown>
  toolCalls?: ToolCall[]
  partialContent?: string
  activity?: 'llm' | 'client_tools'
  activityToolName?: string
}

export interface ChatStreamRequest {
  messages: Array<
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
    | { role: 'tool'; toolResults: ToolResult[] }
  >
  hiddenContext: HiddenContext
  appLanguage: string
}
