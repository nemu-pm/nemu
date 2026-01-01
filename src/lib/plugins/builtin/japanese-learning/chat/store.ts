/**
 * Nemu Chat Store - Just state, no business logic
 */

import { create } from 'zustand'
import type { ChatMessage, FollowUpSuggestion, HiddenContext, ToolCall, ToolResult } from './types'
import type { ChatToolContext } from './tools'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface NemuChatState {
  // UI state
  isOpen: boolean
  hiddenContext: HiddenContext | null
  contextProvider: (() => HiddenContext) | null
  toolContextProvider: (() => ChatToolContext) | null

  // Messages
  messages: ChatMessage[]
  followUpSuggestions: FollowUpSuggestion[]

  // Streaming state
  isStreaming: boolean
  streamingContent: string
  showTypingIndicator: boolean

  // Actions - pure state setters
  open: (hiddenContext: HiddenContext) => void
  close: () => void
  setContextProvider: (provider: (() => HiddenContext) | null) => void
  setToolContextProvider: (provider: (() => ChatToolContext) | null) => void
  getContextForRequest: (override?: Partial<HiddenContext>) => HiddenContext | null
  getToolContextForRequest: () => ChatToolContext | null

  addUserMessage: (content: string, displayContent?: string) => void
  upsertContextSnapshot: (key: string, content: string) => void
  addAssistantMessage: (
    content: string,
    toolCalls?: ToolCall[],
    options?: { hidden?: boolean; errorMessage?: string; kind?: 'text' | 'voice'; ttsText?: string }
  ) => string
  addToolResults: (results: ToolResult[]) => void
  truncateOldestHalf: () => void

  setStreaming: (streaming: boolean) => void
  setShowTypingIndicator: (show: boolean) => void
  markLastUserMessageRead: () => void
  appendStreamContent: (chunk: string) => void
  clearStreamContent: () => void

  setFollowUps: (suggestions: string[]) => void
  clearFollowUps: () => void

  // For API requests
  getMessagesForRequest: () => Array<
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
    | { role: 'tool'; toolResults: ToolResult[] }
  >

  reset: () => void
}

export const useNemuChatStore = create<NemuChatState>((set, get) => ({
  isOpen: false,
  hiddenContext: null,
  contextProvider: null,
  toolContextProvider: null,
  messages: [],
  followUpSuggestions: [],
  isStreaming: false,
  streamingContent: '',
  showTypingIndicator: false,

  open: (hiddenContext) => {
    set({ isOpen: true, hiddenContext })
  },

  close: () => {
    set({ isOpen: false })
  },

  setContextProvider: (provider) => {
    set({ contextProvider: provider })
  },

  setToolContextProvider: (provider) => {
    set({ toolContextProvider: provider })
  },

  getContextForRequest: (override) => {
    const base = get().contextProvider ? get().contextProvider?.() : get().hiddenContext
    if (!base || typeof base !== 'object') return null
    const merged = override ? { ...base, ...override } : base
    set({ hiddenContext: merged })
    return merged
  },

  getToolContextForRequest: () => {
    return get().toolContextProvider ? get().toolContextProvider?.() ?? null : null
  },

  addUserMessage: (content, displayContent) => {
    const msg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      displayContent,
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, msg] }))
  },

  upsertContextSnapshot: (key, content) => {
    const trimmedKey = (key ?? '').trim()
    if (!trimmedKey) return
    const trimmedContent = (content ?? '').trim()
    if (!trimmedContent) return

    set((s) => {
      // Dedupe: if the newest snapshot already has this key, do nothing.
      for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i]
        if (m.role !== 'user') continue
        if (!m.hidden) continue
        if (!m.content.startsWith('NEMU_CTX_SNAPSHOT_V1')) continue
        const firstLine = m.content.split('\n', 1)[0] ?? ''
        if (firstLine.includes(`key=${trimmedKey}`)) return { messages: s.messages }
        break
      }

      const snapshotMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        kind: 'text',
        content: trimmedContent,
        timestamp: Date.now(),
        hidden: true,
        isRead: true,
      }

      // Insert snapshot right before the most recent visible user message (the one that triggered it).
      const idx = [...s.messages]
        .map((m, i) => ({ m, i }))
        .reverse()
        .find(({ m }) => m.role === 'user' && !m.hidden)?.i

      if (idx == null) {
        return { messages: [...s.messages, snapshotMsg] }
      }

      const next = [...s.messages]
      next.splice(idx, 0, snapshotMsg)
      return { messages: next }
    })
  },

  addAssistantMessage: (content, toolCalls, options) => {
    const id = generateId()
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      kind: options?.kind ?? 'text',
      content,
      timestamp: Date.now(),
      toolCalls,
      hidden: options?.hidden,
      errorMessage: options?.errorMessage,
      ttsText: options?.ttsText,
    }
    set((s) => ({ messages: [...s.messages, msg] }))
    // Note: Haptic feedback on message receive won't work on iOS Safari
    // because it's not triggered by a direct user gesture
    return id
  },

  addToolResults: (results) => {
    // Tool results are tracked internally but not shown in UI
    // They're included in getMessagesForRequest
    const lastMsg = get().messages[get().messages.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
      // Store results alongside the message
      set((s) => ({
        messages: s.messages.map((m, i) =>
          i === s.messages.length - 1 ? { ...m, toolResults: results } : m
        ),
      }))
    }
  },

  truncateOldestHalf: () => {
    set((s) => {
      if (s.messages.length <= 2) return { messages: s.messages }
      const dropCount = Math.ceil(s.messages.length / 2)
      return { messages: s.messages.slice(dropCount) }
    })
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming })
  },

  setShowTypingIndicator: (show) => {
    set({ showTypingIndicator: show })
  },

  markLastUserMessageRead: () => {
    set((s) => {
      // Find last user message and mark it as read
      const messages = [...s.messages]
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user' && !messages[i].isRead) {
          messages[i] = { ...messages[i], isRead: true }
          break
        }
      }
      return { messages }
    })
  },

  appendStreamContent: (chunk) => {
    set((s) => ({ streamingContent: s.streamingContent + chunk }))
  },

  clearStreamContent: () => {
    set({ streamingContent: '' })
  },

  setFollowUps: (suggestions) => {
    set({
      followUpSuggestions: suggestions.map((text) => ({ id: generateId(), text })),
    })
  },

  clearFollowUps: () => {
    set({ followUpSuggestions: [] })
  },

  getMessagesForRequest: () => {
    const { messages } = get()
    const result: Array<
      | { role: 'user'; content: string }
      | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
      | { role: 'tool'; toolResults: ToolResult[] }
    > = []

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        result.push({ role: 'assistant', content: msg.content, toolCalls: msg.toolCalls })
        // If there are tool results, add them after
        if (msg.toolResults && msg.toolResults.length > 0) {
          result.push({ role: 'tool', toolResults: msg.toolResults })
        }
      }
    }

    return result
  },

  reset: () => {
    set({
      messages: [],
      followUpSuggestions: [],
      isStreaming: false,
      streamingContent: '',
      showTypingIndicator: false,
      hiddenContext: null,
      contextProvider: null,
      toolContextProvider: null,
    })
  },
}))
