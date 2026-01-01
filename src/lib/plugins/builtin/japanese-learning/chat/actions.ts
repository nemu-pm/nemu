/**
 * Nemu Chat Actions - shared chat send/greeting logic
 */

import type { ChatStreamCallbacks } from './service'
import { ContextTooLongError, streamChat } from './service'
import { useNemuChatStore } from './store'
import type { HiddenContext, ToolCall } from './types'
import type { ChatToolContext } from './tools'
import { getGreetingPrompt } from './prompts'
import { useTtsStore } from '@/stores/tts'

const AUDIO_TAG_REGEX = /\[[^\]]+\]/g

function stripAudioTags(text: string): string {
  return text.replace(AUDIO_TAG_REGEX, '').replace(/\s{2,}/g, ' ').trim()
}

function getToolStatusText(toolCall: ToolCall): string {
  if (toolCall.toolName === 'request_transcript') {
    const pageNumber = toolCall.args?.pageNumber
    const reason = typeof toolCall.args?.reason === 'string' ? toolCall.args.reason.trim() : ''
    if (reason) return reason
    if (typeof pageNumber === 'number') return `Reading page ${pageNumber}...`
    return 'Reading page...'
  }
  if (toolCall.toolName === 'trigger_ocr') {
    const pageNumber = toolCall.args?.pageNumber
    if (typeof pageNumber === 'number') return `Scanning page ${pageNumber}...`
    return 'Scanning page...'
  }
  return `Calling ${toolCall.toolName}...`
}

export function createChatStreamCallbacks(): ChatStreamCallbacks {
  const {
    addAssistantMessage,
    setStreaming,
    setShowTypingIndicator,
    setFollowUps,
    addToolResults,
    markLastUserMessageRead,
    upsertContextSnapshot,
  } = useNemuChatStore.getState()

  let hasMarkedRead = false
  let bufferedText = ''
  let streamCompleted = false
  let currentPhase: 'assistant' | 'followups' | 'client_tools' | null = null
  let typingMode: 'activity' | 'client_tools' | 'optimistic' | null = null
  let typingPulseTimer: ReturnType<typeof setTimeout> | null = null
  let optimisticTypingTimer: ReturnType<typeof setTimeout> | null = null
  const speakQueue: string[] = []
  let processingSpeak = false
  let hasShownFirstSpeak = false
  let speakDelayTimer: ReturnType<typeof setTimeout> | null = null
  let speakGapTimer: ReturnType<typeof setTimeout> | null = null

  const clearSpeakTimers = () => {
    if (speakDelayTimer) {
      clearTimeout(speakDelayTimer)
      speakDelayTimer = null
    }
    if (speakGapTimer) {
      clearTimeout(speakGapTimer)
      speakGapTimer = null
    }
  }

  const clearTypingPulse = () => {
    if (typingPulseTimer) {
      clearTimeout(typingPulseTimer)
      typingPulseTimer = null
    }
  }

  const clearOptimisticTypingTimer = () => {
    if (optimisticTypingTimer) {
      clearTimeout(optimisticTypingTimer)
      optimisticTypingTimer = null
    }
  }

  const stopTyping = () => {
    typingMode = null
    clearTypingPulse()
    clearOptimisticTypingTimer()
    setShowTypingIndicator(false)
  }

  const startClientToolTyping = () => {
    typingMode = 'client_tools'
    clearTypingPulse()
    clearOptimisticTypingTimer()
    setShowTypingIndicator(true)
  }

  const pulseTypingFromActivity = () => {
    if (currentPhase === 'followups') return
    if (typingMode === 'client_tools') return
    typingMode = 'activity'
    setShowTypingIndicator(true)
    clearTypingPulse()
    clearOptimisticTypingTimer()
    typingPulseTimer = setTimeout(() => {
      typingPulseTimer = null
      if (typingMode === 'activity') {
        typingMode = null
        setShowTypingIndicator(false)
      }
    }, 700)
  }

  const markReadIfNeeded = () => {
    if (hasMarkedRead) return
    markLastUserMessageRead()
    hasMarkedRead = true
  }

  const getSpeakDelay = (text: string) => {
    const length = text.replace(/\s+/g, '').length
    const base = 300
    const perChar = 25
    const min = 500
    const max = 2200
    return Math.min(max, Math.max(min, base + length * perChar))
  }

  const maybeFinishStream = () => {
    if (streamCompleted && !processingSpeak && speakQueue.length === 0) {
      stopTyping()
      setStreaming(false)
    }
  }

  const processSpeakQueue = () => {
    if (processingSpeak) return
    const next = speakQueue.shift()
    if (!next) {
      maybeFinishStream()
      return
    }
    processingSpeak = true
    const delay = hasShownFirstSpeak ? getSpeakDelay(next) : 0
    const deliverSpeak = () => {
      // Speak bubbles are real output; don't show dots here.
      if (typingMode !== 'client_tools') stopTyping()
      addAssistantMessage(next)
      hasShownFirstSpeak = true
      processingSpeak = false
      speakGapTimer = setTimeout(() => {
        speakGapTimer = null
        if (speakQueue.length > 0) {
          processSpeakQueue()
          return
        }
        if (!streamCompleted) {
          // Don't show dots during silent waiting.
          return
        }
        maybeFinishStream()
      }, 350)
    }
    if (delay === 0) {
      deliverSpeak()
      return
    }
    speakDelayTimer = setTimeout(() => {
      speakDelayTimer = null
      deliverSpeak()
    }, delay)
  }

  const enqueueSpeak = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    speakQueue.push(trimmed)
    if (!processingSpeak && !speakGapTimer) {
      processSpeakQueue()
    }
  }

  return {
    onStreamStart: () => {
      // Flip read receipt ASAP for snappier UX.
      markReadIfNeeded()

      // Special-case: show dots briefly after send, then turn off unless real activity arrives.
      if (currentPhase === 'followups') return
      if (typingMode === 'client_tools') return
      typingMode = 'optimistic'
      setShowTypingIndicator(true)
      clearOptimisticTypingTimer()
      optimisticTypingTimer = setTimeout(() => {
        optimisticTypingTimer = null
        if (typingMode === 'optimistic') {
          typingMode = null
          setShowTypingIndicator(false)
        }
      }, 5000)
    },
    onText: (text) => {
      bufferedText += text
      currentPhase = 'assistant'
      pulseTypingFromActivity()
      markReadIfNeeded()
    },
    onSpeak: (text) => {
      enqueueSpeak(text)
      currentPhase = 'assistant'
      // No dots here; speak bubble is the output.
      markReadIfNeeded()
    },
    onVoice: (text) => {
      currentPhase = 'assistant'
      const trimmed = text.trim()
      if (!trimmed) return
      const displayText = stripAudioTags(trimmed)
      const messageId = addAssistantMessage(displayText, undefined, {
        kind: 'voice',
        ttsText: trimmed,
      })
      useTtsStore.getState().prefetch(messageId, trimmed, { skipTagging: true, source: 'voice' })
      markReadIfNeeded()
    },
    onToolCall: (tc) => {
      pulseTypingFromActivity()
      console.log('[NemuChat] Tool call:', {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
        status: getToolStatusText(tc),
      })
      markReadIfNeeded()
    },
    onToolsAwaiting: (toolCalls, partialContent) => {
      setShowTypingIndicator(true)
      currentPhase = 'client_tools'
      startClientToolTyping()
      markReadIfNeeded()
      const shouldHide = !partialContent?.trim()
      addAssistantMessage(partialContent ?? '', toolCalls, { hidden: shouldHide })
    },
    onToolResults: (toolResults) => {
      addToolResults(toolResults)
      // Tool execution completed; don't show dots while we wait for the next backend chunk.
      stopTyping()
      toolResults.forEach((result) => {
        console.log('[NemuChat] Tool result:', {
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          isError: result.isError,
          result: result.result,
        })
      })
    },
    onFollowups: (suggestions) => {
      currentPhase = 'followups'
      stopTyping()
      setFollowUps(suggestions)
    },
    onActivity: (activity, toolName) => {
      if (!activity) return
      if (activity === 'llm') {
        // Don't show dots for followups generation.
        if (toolName === 'suggest_followups') return
        pulseTypingFromActivity()
        markReadIfNeeded()
      }
      if (activity === 'client_tools') {
        startClientToolTyping()
        markReadIfNeeded()
      }
    },
    onContextSnapshot: (key, content) => {
      upsertContextSnapshot(key, content)
    },
    onDone: () => {
      const trimmed = bufferedText.trim()
      if (trimmed) {
        enqueueSpeak(trimmed)
      }
      bufferedText = ''
      streamCompleted = true
      maybeFinishStream()
    },
    onError: (error) => {
      console.error('[NemuChat] Stream error:', error)
      addAssistantMessage('Network error. Please try again.')
      bufferedText = ''
      streamCompleted = true
      speakQueue.length = 0
      processingSpeak = false
      clearSpeakTimers()
      stopTyping()
      setStreaming(false)
    },
    onCancelled: () => {
      // Stream was cancelled by a new request - only clean up local callback state
      // Don't touch global isStreaming/showTypingIndicator - new stream is already in progress
      console.log('[NemuChat] Stream cancelled')
      bufferedText = ''
      streamCompleted = true
      speakQueue.length = 0
      processingSpeak = false
      clearSpeakTimers()
      clearTypingPulse()
      clearOptimisticTypingTimer()
    },
  }
}

export async function sendChatMessage(options: {
  text: string
  displayContent?: string
  hiddenContext: HiddenContext
  appLanguage: string
  toolContext?: ChatToolContext | null
  callbacks: ChatStreamCallbacks
}) {
  const { text, displayContent, hiddenContext, appLanguage, toolContext, callbacks } = options
  const {
    addUserMessage,
    clearFollowUps,
    setStreaming,
    setShowTypingIndicator,
    getMessagesForRequest,
    truncateOldestHalf,
  } = useNemuChatStore.getState()

  const existingMessages = getMessagesForRequest()
  addUserMessage(text, displayContent)
  clearFollowUps()
  setStreaming(true)
  // No dots during initial wait; show only on backend activity/tool phases.
  setShowTypingIndicator(false)
  callbacks.onStreamStart()
  const messages = [...existingMessages, { role: 'user' as const, content: text }]
  try {
    await streamChat(messages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
  } catch (err) {
    if (!(err instanceof ContextTooLongError)) throw err
    // Client-side truncation: drop oldest 50% and retry once.
    truncateOldestHalf()
    const afterTruncate = getMessagesForRequest()
    const last = afterTruncate[afterTruncate.length - 1]
    const withoutLastUser = last?.role === 'user' ? afterTruncate.slice(0, -1) : afterTruncate
    const retryMessages = [...withoutLastUser, { role: 'user' as const, content: text }]
    await streamChat(retryMessages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
  }
}

export async function sendChatGreeting(options: {
  hiddenContext: HiddenContext
  appLanguage: string
  toolContext?: ChatToolContext | null
  callbacks: ChatStreamCallbacks
}) {
  const { hiddenContext, appLanguage, toolContext, callbacks } = options
  const { getMessagesForRequest, clearFollowUps, setStreaming, setShowTypingIndicator, truncateOldestHalf } =
    useNemuChatStore.getState()

  clearFollowUps()
  setStreaming(true)
  // No dots during initial wait; show only on backend activity/tool phases.
  setShowTypingIndicator(false)
  const existingMessages = getMessagesForRequest()
  const greetingPrompt = getGreetingPrompt(appLanguage, hiddenContext.responseMode)
  const messages = [...existingMessages, { role: 'user' as const, content: greetingPrompt }]

  callbacks.onStreamStart()
  try {
    await streamChat(messages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
  } catch (err) {
    if (!(err instanceof ContextTooLongError)) throw err
    truncateOldestHalf()
    const retryExisting = getMessagesForRequest()
    const retryMessages = [...retryExisting, { role: 'user' as const, content: greetingPrompt }]
    await streamChat(retryMessages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
  }
}
