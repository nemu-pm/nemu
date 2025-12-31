/**
 * Nemu Chat Actions - shared chat send/greeting logic
 */

import type { ChatStreamCallbacks } from './service'
import { sendMessageAndStream, streamChat } from './service'
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
  } = useNemuChatStore.getState()

  let hasMarkedRead = false
  let bufferedText = ''
  let streamCompleted = false
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
      setShowTypingIndicator(false)
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
    setShowTypingIndicator(true)
    const delay = hasShownFirstSpeak ? getSpeakDelay(next) : 0
    const deliverSpeak = () => {
      setShowTypingIndicator(false)
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
          setShowTypingIndicator(true)
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
    onText: (text) => {
      bufferedText += text
      if (!hasMarkedRead) {
        markLastUserMessageRead()
        hasMarkedRead = true
      }
    },
    onSpeak: (text) => {
      enqueueSpeak(text)
      if (!hasMarkedRead) {
        markLastUserMessageRead()
        hasMarkedRead = true
      }
    },
    onVoice: (text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const displayText = stripAudioTags(trimmed)
      const messageId = addAssistantMessage(displayText, undefined, {
        kind: 'voice',
        ttsText: trimmed,
      })
      useTtsStore.getState().prefetch(messageId, trimmed, { skipTagging: true, source: 'voice' })
      if (!hasMarkedRead) {
        markLastUserMessageRead()
        hasMarkedRead = true
      }
    },
    onToolCall: (tc) => {
      console.log('[NemuChat] Tool call:', {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
        status: getToolStatusText(tc),
      })
      if (!hasMarkedRead) {
        markLastUserMessageRead()
        hasMarkedRead = true
      }
    },
    onToolsAwaiting: (toolCalls, partialContent) => {
      setShowTypingIndicator(true)
      const shouldHide = !partialContent?.trim()
      addAssistantMessage(partialContent ?? '', toolCalls, { hidden: shouldHide })
    },
    onToolResults: (toolResults) => {
      addToolResults(toolResults)
      setShowTypingIndicator(true)
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
      setFollowUps(suggestions)
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
      setShowTypingIndicator(false)
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
  } = useNemuChatStore.getState()

  const existingMessages = getMessagesForRequest()
  addUserMessage(text, displayContent)
  clearFollowUps()
  setStreaming(true)
  setShowTypingIndicator(true)
  await sendMessageAndStream(text, existingMessages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
}

export async function sendChatGreeting(options: {
  hiddenContext: HiddenContext
  appLanguage: string
  toolContext?: ChatToolContext | null
  callbacks: ChatStreamCallbacks
}) {
  const { hiddenContext, appLanguage, toolContext, callbacks } = options
  const { getMessagesForRequest, clearFollowUps, setStreaming, setShowTypingIndicator } = useNemuChatStore.getState()

  clearFollowUps()
  setStreaming(true)
  setShowTypingIndicator(true)
  const existingMessages = getMessagesForRequest()
  const greetingPrompt = getGreetingPrompt(appLanguage, hiddenContext.responseMode)
  const messages = [...existingMessages, { role: 'user' as const, content: greetingPrompt }]

  await streamChat(messages, hiddenContext, appLanguage, callbacks, toolContext ?? undefined)
}
