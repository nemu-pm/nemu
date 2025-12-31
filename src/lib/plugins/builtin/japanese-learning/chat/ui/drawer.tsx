/**
 * Nemu Chat Drawer - LINE-style AI chat using AI Elements
 * No useEffect for LLM triggers. Click → function → done.
 */

import { useCallback, useMemo, useState, useRef, useEffect, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Mic, Send } from 'lucide-react'
import { Conversation, ConversationContent, ConversationEmptyState } from '@/components/ai-elements/conversation'
import { useStickToBottomContext } from 'use-stick-to-bottom'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'

import { useNemuChatStore } from '../store'
import { createChatStreamCallbacks, sendChatMessage } from '../actions'
import type { ChatMessage } from '../types'
import { useTtsStore } from '@/stores/tts'

import { NemuAvatar } from './avatar'
import { TypingIndicator } from './typing-indicator'
import { MessageBubble, DatePill } from './message-bubble'

// Auto-scroll to bottom when messages change (must be inside Conversation)
function ScrollToBottomOnChange({ messagesCount }: { messagesCount: number }) {
  const { scrollToBottom } = useStickToBottomContext()
  
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timer = setTimeout(() => {
      scrollToBottom()
    }, 50)
    return () => clearTimeout(timer)
  }, [messagesCount, scrollToBottom])
  
  return null
}

export function NemuChatDrawer() {
  const { t, i18n } = useTranslation()
  const [input, setInput] = useState('')

  const store = useNemuChatStore()
  const {
    isOpen,
    hiddenContext,
    messages,
    followUpSuggestions,
    isStreaming,
    showTypingIndicator,
    close,
    setStreaming,
    getContextForRequest,
    getToolContextForRequest,
  } = store
  const playTts = useTtsStore((s) => s.play)
  const lastEndedId = useTtsStore((s) => s.lastEndedId)
  const lastEndedAt = useTtsStore((s) => s.lastEndedAt)
  const [autoPlayState, setAutoPlayState] = useState<{
    enabled: boolean
    currentId: string | null
    armedAt: number
  }>({
    enabled: false,
    currentId: null,
    armedAt: 0,
  })

  // Create callbacks for the stream - these update the store
  const createCallbacks = useCallback(
    () => createChatStreamCallbacks(),
    []
  )

  const showDebugContext = useMemo(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('nemu:chat:debug-context') === 'true'
  }, [])

  // Ref for refocusing input after send
  const inputRef = useRef<HTMLInputElement>(null)

  // Send a message - called directly on button click
  // No isStreaming guard - can always send (backend will cancel previous request)
  const sendMessage = useCallback(
    async (
      text: string,
      displayContent?: string,
      opts?: {
        focusInput?: boolean
      }
    ) => {
      const context = getContextForRequest()
      if (!context) return

      // Haptic feedback on send
      hapticPress()

      setInput('')
      // Refocus input immediately after clearing (unless caller opts out, e.g. suggestion click)
      if (opts?.focusInput !== false) {
        inputRef.current?.focus()
      }

      // Stream response
      try {
        await sendChatMessage({
          text,
          displayContent,
          hiddenContext: context,
          appLanguage: i18n.language,
          toolContext: getToolContextForRequest(),
          callbacks: createCallbacks(),
        })
      } catch (err) {
        console.error('[NemuChat] Send error:', err)
        const { setShowTypingIndicator } = useNemuChatStore.getState()
        setShowTypingIndicator(false)
        setStreaming(false)
      }
    },
    [getContextForRequest, getToolContextForRequest, i18n.language, createCallbacks, setStreaming]
  )

  // Handle form submit - use our controlled input state directly
  const handleSubmit = useCallback(
    () => {
      const trimmed = input.trim()
      if (trimmed) sendMessage(trimmed)
    },
    [input, sendMessage]
  )

  // Handle suggestion click
  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion, undefined, { focusInput: false })
    },
    [sendMessage]
  )

  // Group consecutive messages by role
  const visibleMessages = messages.filter((m) => !m.hidden)
  const groups: ChatMessage[][] = []
  let currentGroup: ChatMessage[] = []
  let currentRole: string | null = null
  for (const msg of visibleMessages) {
    if (msg.role !== currentRole) {
      if (currentGroup.length) groups.push(currentGroup)
      currentGroup = [msg]
      currentRole = msg.role
    } else {
      currentGroup.push(msg)
    }
  }
  if (currentGroup.length) groups.push(currentGroup)
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1]
  const showTypingAvatar = !lastVisibleMessage || lastVisibleMessage.role !== 'assistant'

  const hasContent = visibleMessages.length > 0 || isStreaming
  const shouldShowTypingIndicator = isStreaming && showTypingIndicator

  useEffect(() => {
    if (!isOpen && autoPlayState.enabled) {
      setAutoPlayState({ enabled: false, currentId: null, armedAt: 0 })
    }
  }, [autoPlayState.enabled, isOpen])

  const handleVoiceAction = useCallback(
    (messageId: string, action: 'play' | 'pause' | 'stop') => {
      if (action === 'play') {
        setAutoPlayState({ enabled: true, currentId: messageId, armedAt: Date.now() })
        return
      }
      if (action === 'pause' || action === 'stop') {
        setAutoPlayState({ enabled: false, currentId: null, armedAt: 0 })
      }
    },
    []
  )

  useEffect(() => {
    if (!autoPlayState.enabled || !lastEndedId || lastEndedId !== autoPlayState.currentId) return
    if (lastEndedAt <= autoPlayState.armedAt) return
    const currentIndex = visibleMessages.findIndex((msg) => msg.id === lastEndedId)
    if (currentIndex === -1) {
      setAutoPlayState({ enabled: false, currentId: null, armedAt: 0 })
      return
    }
    const nextMessage = visibleMessages
      .slice(currentIndex + 1)
      .find((msg) => msg.kind === 'voice' && msg.role === 'assistant')
    if (!nextMessage) {
      setAutoPlayState({ enabled: false, currentId: null, armedAt: 0 })
      return
    }
    playTts(nextMessage.id, nextMessage.ttsText ?? nextMessage.content, { skipTagging: true, source: 'voice' })
    setAutoPlayState({ enabled: true, currentId: nextMessage.id, armedAt: Date.now() })
  }, [autoPlayState, lastEndedAt, lastEndedId, playTts, visibleMessages])

  return (
    <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && close()}>
      <DrawerContent className="!h-[70vh] !max-h-[70vh] max-w-2xl mx-auto flex flex-col z-[70]" aria-describedby={undefined}>
        <DrawerTitle className="sr-only">Nemu Chat</DrawerTitle>

        {/* Simple header - just name */}
        <div className="flex items-center justify-center px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-medium text-sm text-foreground">Nemu</h3>
        </div>

        {/* Messages */}
        <Conversation className="flex-1 min-h-0">
          <ScrollToBottomOnChange messagesCount={messages.length} />
          <ConversationContent className="!gap-2 !py-3 !px-0">
            {/* Always show Today pill when there's content */}
            {hasContent && <DatePill text={t('plugin.japaneseLearning.chat.today', 'Today')} />}

            {visibleMessages.length === 0 && !isStreaming && !showTypingIndicator && (
              <ConversationEmptyState
                title={t('plugin.japaneseLearning.chat.emptyTitle', "Hi! I'm Nemu")}
                description={t('plugin.japaneseLearning.chat.emptyDescription', "Ask me anything about the Japanese text you're reading!")}
                icon={<NemuAvatar size="md" />}
              />
            )}


            {groups.map((group) => (
              <div key={group[0].id} className="space-y-1.5">
                {group.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    showAvatar={msg.role === 'assistant' && i === 0}
                    showTimestamp={i === group.length - 1}
                    showTail={i === 0}
                    onVoiceAction={handleVoiceAction}
                  />
                ))}
              </div>
            ))}

            {shouldShowTypingIndicator && <TypingIndicator showAvatar={showTypingAvatar} />}

            {!isStreaming && followUpSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ml-11">
                <Suggestions className="!gap-2 flex-wrap ml-4">
                  {followUpSuggestions.map((s) => (
                    <Suggestion
                      key={s.id}
                      suggestion={s.text}
                      onClick={handleSuggestion}
                      className="text-xs bg-secondary/80 border-border hover:bg-secondary"
                    />
                  ))}
                </Suggestions>
              </motion.div>
            )}

            {showDebugContext && hiddenContext && (
              <div className="mx-4 mt-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                <div className="font-medium text-xs text-foreground/80 mb-1">Debug context</div>
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(hiddenContext, null, 2)}
                </pre>
              </div>
            )}
          </ConversationContent>
        </Conversation>

        {/* LINE-style Input Bar */}
        <LineInputBar
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={t('plugin.japaneseLearning.chat.inputPlaceholder', 'Ask nemu anything...')}
          lang={i18n.language}
        />
      </DrawerContent>
    </Drawer>
  )
}

// ============================================================================
// LINE-style Input Bar Component
// ============================================================================

interface LineInputBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  lang?: string
}

const LineInputBar = forwardRef<HTMLInputElement, LineInputBarProps>(
  function LineInputBar({ value, onChange, onSubmit, placeholder, lang = 'en' }, ref) {
    const internalRef = useRef<HTMLInputElement>(null)
    const inputRefToUse = (ref as React.RefObject<HTMLInputElement>) || internalRef
    const [isListening, setIsListening] = useState(false)
    const [speechSupported, setSpeechSupported] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null)

    const hasText = value.trim().length > 0

    // Map app language to speech recognition locale
    const getSpeechLang = (appLang: string) => {
      const map: Record<string, string> = { en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR' }
      return map[appLang] || appLang
    }

    // Initialize speech recognition
    useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognitionAPI) {
        setSpeechSupported(false)
        return
      }
      setSpeechSupported(true)
      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = getSpeechLang(lang)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((result: any) => result[0].transcript)
          .join('')
        onChange(transcript)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition

      return () => {
        recognitionRef.current?.abort()
      }
    }, [onChange, lang])

    const toggleListening = useCallback(() => {
      if (!recognitionRef.current) return

      if (isListening) {
        recognitionRef.current.stop()
        setIsListening(false)
      } else {
        recognitionRef.current.start()
        setIsListening(true)
      }
    }, [isListening])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && hasText) {
          e.preventDefault()
          onSubmit()
        }
      },
      [hasText, onSubmit]
    )

    const handleActionClick = useCallback(() => {
      if (hasText) {
        onSubmit()
      } else {
        toggleListening()
      }
    }, [hasText, onSubmit, toggleListening])

    return (
      <div className="flex-shrink-0 px-3 py-2.5 bg-background/80 dark:bg-black/40 backdrop-blur-xl border-t border-border">
        <div className="flex items-center gap-2">
          {/* Input container - pill style using input-nemu glassmorphism */}
          <input
            ref={inputRefToUse}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              'input-nemu flex-1 rounded-full px-4 py-2.5 text-base',
              isListening && '!border-primary/50 !ring-2 !ring-primary/20'
            )}
          />

          {/* Action button - send when has text, mic when empty (if supported) */}
          {(hasText || speechSupported) && (
            <motion.button
              type="button"
              onClick={handleActionClick}
              className="flex items-center justify-center size-9 transition-colors duration-150"
              whileTap={{ scale: 0.9 }}
            >
              {hasText ? (
                <Send className="size-6 text-primary hover:text-primary/80" strokeWidth={2.5} />
              ) : (
                <Mic className={cn(
                  'size-6 transition-colors',
                  isListening ? 'text-red-500 animate-pulse' : 'text-muted-foreground hover:text-foreground/70'
                )} strokeWidth={2} />
              )}
            </motion.button>
          )}
        </div>
      </div>
    )
  }
)

// (moved) openChatAndSend lives in ../open-chat-and-send.ts to keep this file
// Fast Refresh-compatible (component exports only).
