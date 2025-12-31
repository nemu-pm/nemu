import { useMemo, useLayoutEffect, useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, MessageMultiple02Icon } from '@hugeicons/core-free-icons'
import { cn, copyToClipboard } from '@/lib/utils'
import { motion, AnimatePresence, useAnimationControls, useReducedMotion, type Variants } from 'motion/react'
import { useWordSelection, isWordInSelection } from '../useWordSelection'
import { openChatAndSend } from '../chat/ui'
import { getExplainDisplayPrompt, getExplainPrompt } from '../chat/prompts'
import { useTextDetectorStore } from '../store'
import { ScrollFadingOverlay } from './scroll-fading-overlay'
import { TokenDisplay } from './token-display'
import { TokenDetails } from './token-details'
import type { GrammarToken } from '../ichiran-types'

interface SentenceDisplayProps {
  tokens: GrammarToken[]
  sentenceText?: string
  ichiranAnalysis?: string
  grammar: {
    loading: boolean
    stage: 'idle' | 'normalizing' | 'tokenizing' | 'done' | 'error'
    normalizedText: string | null
    error: string | null
    requestId: number
  }
}

export function SentenceDisplay({ tokens, sentenceText, ichiranAnalysis, grammar }: SentenceDisplayProps) {
  const { t, i18n } = useTranslation()
  const responseMode = useTextDetectorStore((s) => s.settings.nemuResponseMode)
  const reduceMotion = useReducedMotion()
  const sentenceScrollRef = useRef<HTMLDivElement>(null)
  const detailsScrollRef = useRef<HTMLDivElement>(null)
  const tokenControls = useAnimationControls()
  const [rawLayerVisible, setRawLayerVisible] = useState(true)
  const lastAnimatedRequestIdRef = useRef<number | null>(null)
  const {
    selectedTokenIndex,
    setSelectedTokenIndex,
    selectionStart,
    selectionEnd,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    getSelectionType,
  } = useWordSelection()

  const selectionType = getSelectionType()

  const handleAskNemu = useCallback(
    (text: string, kind: 'word' | 'words') => {
      const message = getExplainPrompt(i18n.language, responseMode, kind, text)
      const displayContent = getExplainDisplayPrompt(i18n.language, kind, text)
      openChatAndSend(message, displayContent, { ichiranAnalysis })
    },
    [ichiranAnalysis, i18n.language, responseMode]
  )

  const rawText = (sentenceText ?? '').trim()
  const hasRawText = rawText.length > 0
  const hasTokens = tokens.length > 0

  useLayoutEffect(() => {
    if (!hasTokens) {
      lastAnimatedRequestIdRef.current = null
      setRawLayerVisible(true)
      tokenControls.set('hidden')
      return
    }

    // New analysis result landed → prepare hidden state synchronously, then reveal on next frame.
    if (lastAnimatedRequestIdRef.current === grammar.requestId) return
    lastAnimatedRequestIdRef.current = grammar.requestId

    if (reduceMotion) {
      tokenControls.set('show')
      setRawLayerVisible(false)
      return
    }

    tokenControls.set('hidden')
    setRawLayerVisible(true)
    const raf = requestAnimationFrame(() => {
      void tokenControls.start('show')
      // iOS: avoid animating opacity on text (can flicker). Hide raw layer shortly after token motion begins.
      window.setTimeout(() => setRawLayerVisible(false), 90)
    })
    return () => cancelAnimationFrame(raf)
  }, [grammar.requestId, hasTokens, reduceMotion, tokenControls])

  const tokenContainerVariants: Variants = useMemo(() => {
    return {
      hidden: {},
      show: {
        transition: {
          when: 'beforeChildren',
          delayChildren: 0.06,
          staggerChildren: 0.03,
        },
      },
    }
  }, [])

  const tokenVariants: Variants = useMemo(() => {
    return {
      hidden: {
        y: 12,
        scale: 0.985,
        visibility: 'hidden',
      },
      show: {
        y: 0,
        scale: 1,
        visibility: 'visible',
        transition: {
          y: { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 },
          scale: { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 },
        },
      },
    }
  }, [])

  const tokensKey = useMemo(() => {
    // Clear selection when token set changes (komi behavior).
    // Include partOfSpeech to avoid stale selection if only POS changes.
    return tokens.map((tok) => `${tok.word}\u0000${tok.partOfSpeech}`).join('\u0001')
  }, [tokens])

  useEffect(() => {
    clearSelection()
  }, [clearSelection, tokensKey])

  useEffect(() => {
    if (tokens.length === 1) {
      setSelectedTokenIndex(0)
    }
  }, [setSelectedTokenIndex, tokens.length])

  const getSelectedText = useCallback((): string => {
    if (selectionType === 'single' && selectedTokenIndex !== null) {
      return tokens[selectedTokenIndex]?.word ?? ''
    }
    if (selectionType === 'multi' && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd)
      const end = Math.max(selectionStart, selectionEnd)
      return tokens.slice(start, end + 1).map((tok) => tok.word).join('')
    }
    return ''
  }, [selectedTokenIndex, selectionEnd, selectionStart, selectionType, tokens])

  // When a selection is finalized (tap or end of drag), reset details scroll to top.
  const selectionSignature = useMemo(() => {
    if (selectionType === 'single' && selectedTokenIndex !== null) return `single:${selectedTokenIndex}`
    if (selectionType === 'multi' && selectionStart !== null && selectionEnd !== null)
      return `multi:${Math.min(selectionStart, selectionEnd)}-${Math.max(selectionStart, selectionEnd)}`
    return 'none'
  }, [selectedTokenIndex, selectionEnd, selectionStart, selectionType])

  const lastSelectionSignatureRef = useRef<string>('none')
  useEffect(() => {
    if (!hasTokens) return
    if (isDragging) return
    if (selectionSignature === 'none') return
    if (lastSelectionSignatureRef.current === selectionSignature) return
    lastSelectionSignatureRef.current = selectionSignature
    const el = detailsScrollRef.current
    if (el) el.scrollTop = 0
  }, [hasTokens, isDragging, selectionSignature])

  // Render: show raw OCR text immediately, then async grammar parsing, then token UI.
  // NOTE: must be *after* all hooks to preserve hook call order across renders.
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Sentence pane (content-sized, capped to ~3 token rows; scrollable) */}
      <div className="relative shrink-0 overflow-hidden max-h-[14rem] sm:max-h-[16rem]" lang="ja">
        <ScrollFadingOverlay scrollRef={sentenceScrollRef} />
        <div ref={sentenceScrollRef} className="overflow-auto px-4 pt-3 pb-3">
          {/* iOS flicker guard: keep a single persistent render tree and only animate opacity/transform. */}
          <div className="grid" style={{ gridTemplateAreas: '"stack"' }}>
            {/* Raw text layer */}
            <div
              style={{ gridArea: 'stack' }}
              className={cn('space-y-2', hasTokens && 'pointer-events-none')}
            >
              <div
                className={cn(
                  'ja-textbook selectable',
                  'text-[1.4rem] sm:text-[1.6rem] leading-relaxed',
                  'whitespace-pre-wrap break-words'
                )}
                style={{ visibility: rawLayerVisible ? 'visible' : 'hidden' }}
              >
                {hasRawText ? rawText : ''}
              </div>

              {!hasTokens &&
                (grammar.error ? (
                  <div className="text-xs text-destructive/90">
                    {t('plugin.japaneseLearning.grammarFailed', { defaultValue: 'Grammar parsing failed' })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-3 gap-2">
                    <div className="text-xs text-muted-foreground/80">
                      {t('plugin.japaneseLearning.analyzingSentence', { defaultValue: 'Analyzing sentence...' })}
                    </div>
                    <Spinner className="size-6 text-primary" />
                  </div>
                ))}
            </div>

            {/* Token layer */}
            <div
              style={{ gridArea: 'stack' }}
              className={cn(!hasTokens && 'pointer-events-none')}
            >
              <motion.div
                variants={tokenContainerVariants}
                initial="hidden"
                animate={tokenControls}
                style={{
                  visibility: hasTokens ? 'visible' : 'hidden',
                  transform: 'translateZ(0)',
                  WebkitTransform: 'translateZ(0)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
              >
                {tokens.map((token, i) => (
                  <TokenDisplay
                    key={`${i}-${token.word}`}
                    token={token}
                    index={i}
                    variants={tokenVariants}
                    isSelected={selectedTokenIndex === i}
                    isMultiSelected={isWordInSelection(i, selectionStart, selectionEnd)}
                    onPointerDown={() => handlePointerDown(i)}
                    onPointerMove={(wordIndex) => handlePointerMove(wordIndex)}
                    onPointerUp={() => handlePointerUp(i)}
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/50" />

      {/* Details pane (fills remaining space; scrollable) */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <ScrollFadingOverlay scrollRef={detailsScrollRef} />
        <div ref={detailsScrollRef} className="h-full overflow-auto px-4 pt-1 pb-4">
          {hasTokens && (
            <AnimatePresence mode="wait">
              {selectionType === 'multi' ? (
                <motion.div
                  key="multi-selection"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl p-4 token-details-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-sm font-medium">{t('plugin.japaneseLearning.selectedText', { defaultValue: 'Selected text' })}</p>
                      <p className="text-lg ja-textbook selectable truncate" lang="ja">{getSelectedText()}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const text = getSelectedText()
                          if (text) {
                            const success = await copyToClipboard(text)
                            if (success) toast.success(t('plugin.japaneseLearning.copySuccess'))
                          }
                        }}
                        className="gap-1.5"
                      >
                        <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                        {t('common.copy', { defaultValue: 'Copy' })}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          const text = getSelectedText()
                          if (text) {
                            handleAskNemu(text, 'words')
                          }
                        }}
                        className="gap-1.5"
                      >
                        <HugeiconsIcon icon={MessageMultiple02Icon} className="size-3.5" />
                        {t('plugin.japaneseLearning.chat.askAboutWords', { defaultValue: 'Ask about these words' })}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : selectionType === 'single' && selectedTokenIndex !== null && tokens[selectedTokenIndex] ? (
                <TokenDetails
                  key={`details-${selectedTokenIndex}`}
                  token={tokens[selectedTokenIndex]}
                  onAskNemu={() => {
                    const text = getSelectedText()
                    if (text) {
                      handleAskNemu(text, 'word')
                    }
                  }}
                />
              ) : (
                <motion.div
                  key="empty-selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center justify-center py-6 text-center gap-4"
                >
                  <div>
                    <p className="text-xs text-muted-foreground/70">
                      {t('plugin.japaneseLearning.tapWordHint')}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {t('plugin.japaneseLearning.dragWordsHint')}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}
