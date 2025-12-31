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

import { useNemuChatStore } from '../store'
import { createChatStreamCallbacks, sendChatMessage } from '../actions'
import type { ChatMessage, HiddenContext } from '../types'
import { languageStore } from '@/stores/language'

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

  return (
    <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && close()}>
      <DrawerContent className="!h-[70vh] !max-h-[70vh] max-w-2xl mx-auto flex flex-col z-[70]" aria-describedby={undefined}>
        <DrawerTitle className="sr-only">Nemu Chat</DrawerTitle>

        {/* Simple header - just name */}
        <div className="flex items-center justify-center px-4 py-3 border-b border-white/10 flex-shrink-0">
          <h3 className="font-medium text-sm">Nemu</h3>
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
                  />
                ))}
              </div>
            ))}

            {isStreaming && showTypingIndicator && <TypingIndicator showAvatar={showTypingAvatar} />}

            {!isStreaming && followUpSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ml-11">
                <Suggestions className="!gap-2 flex-wrap">
                  {followUpSuggestions.map((s) => (
                    <Suggestion
                      key={s.id}
                      suggestion={s.text}
                      onClick={handleSuggestion}
                      className="text-xs bg-white/5 border-white/20 hover:bg-white/10"
                    />
                  ))}
                </Suggestions>
              </motion.div>
            )}

            {showDebugContext && hiddenContext && (
              <div className="mx-4 mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-muted-foreground">
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
      if (SpeechRecognitionAPI) {
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
      }

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
      <div className="flex-shrink-0 px-3 py-2.5 bg-black/40 backdrop-blur-xl border-t border-white/[0.08]">
        <div className="flex items-center gap-2">
          {/* Input container - LINE pill style with glassmorphism */}
          <div
            className={cn(
              'flex-1 flex items-center rounded-full transition-all duration-200',
              'bg-white/[0.08] backdrop-blur-md border border-white/[0.12]',
              'hover:bg-white/[0.10] hover:border-white/[0.15]',
              'focus-within:bg-white/[0.12] focus-within:border-white/[0.20]',
              isListening && 'border-blue-400/50 bg-blue-500/10'
            )}
          >
            <input
              ref={inputRefToUse}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                'flex-1 bg-transparent px-4 py-2.5 text-base',
                'placeholder:text-white/40 text-white/90',
                'focus:outline-none'
              )}
            />
          </div>

          {/* Action button - mic when empty, send when has text (LINE style: no background) */}
          <motion.button
            type="button"
            onClick={handleActionClick}
            className="flex items-center justify-center size-9 transition-colors duration-150"
            whileTap={{ scale: 0.9 }}
          >
            {hasText ? (
              <Send className="size-6 text-blue-500 hover:text-blue-400" strokeWidth={2.5} />
            ) : (
              <Mic className={cn(
                'size-6 transition-colors',
                isListening ? 'text-red-500 animate-pulse' : 'text-zinc-400 hover:text-zinc-300'
              )} strokeWidth={2} />
            )}
          </motion.button>
        </div>
      </div>
    )
  }
)

/**
 * Open the chat and send a message - for external use (from "Ask about sentence" button)
 */
export function openChatAndSend(text: string, displayContent: string, contextOverride?: Partial<HiddenContext>) {
  const store = useNemuChatStore.getState()
  const initialContext = store.getContextForRequest(contextOverride)
  if (initialContext) {
    store.open(initialContext)
  }

  // Send message directly - no setTimeout, no useEffect
  // Need to wait for store to open before sending
  setTimeout(async () => {
    const state = useNemuChatStore.getState()
    const context = state.getContextForRequest(contextOverride)
    if (!context) return
    const lang = languageStore?.getState().language || 'en'
    console.log('lang', lang)

    try {
      await sendChatMessage({
        text,
        displayContent,
        hiddenContext: context,
        appLanguage: lang,
        toolContext: state.getToolContextForRequest(),
        callbacks: createChatStreamCallbacks(),
      })
    } catch (err) {
      console.error('[NemuChat]', err)
      const state = useNemuChatStore.getState()
      state.setShowTypingIndicator(false)
      state.setStreaming(false)
    }
  }, 50) // Small delay to ensure drawer is open
}
