import { useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from '@/components/ui/drawer'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, MessageMultiple02Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { useTextDetectorStore } from '../store'
import { copyToClipboard } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { openChatAndSend } from '../chat/open-chat-and-send'
import { getExplainDisplayPrompt, getExplainPrompt } from '../chat/prompts'
import { serializeGrammarTokens } from './utils'
import { SentenceDisplay } from './sentence-display'
import { createTtsId, useTtsStore } from '@/stores/tts'
import { Spinner } from '@/components/ui/spinner'

export function OcrResultSheet() {
  const { t, i18n } = useTranslation()
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const ocrResult = useTextDetectorStore((s) => s.ocrResult)
  const grammarAnalysis = useTextDetectorStore((s) => s.grammarAnalysis)
  const closeOcrSheet = useTextDetectorStore((s) => s.closeOcrSheet)
  const responseMode = useTextDetectorStore((s) => s.settings.nemuResponseMode)
  const playTts = useTtsStore((s) => s.play)
  const fadeOut = useTtsStore((s) => s.fadeOut)
  const stopTts = useTtsStore((s) => s.stop)
  const currentAudioId = useTtsStore((s) => s.currentAudioId)
  const isPlaying = useTtsStore((s) => s.isPlaying)
  const isLoading = useTtsStore((s) => s.isLoading)
  
  // Serialize grammar analysis for AI context
  const ephemeralContext = useMemo(() => {
    if (grammarAnalysis.tokens.length === 0) return undefined
    return serializeGrammarTokens(grammarAnalysis.tokens)
  }, [grammarAnalysis.tokens])

  const sentenceText = (ocrResult.text ?? '').trim()
  const canActOnSentence = !ocrResult.loading && !ocrResult.error && sentenceText.length > 0
  const ttsText = sentenceText
  const ttsId = useMemo(() => (ttsText ? createTtsId('sentence', ttsText) : null), [ttsText])
  const isCurrent = currentAudioId === ttsId
  const isBusy = isCurrent && (isPlaying || isLoading)

  const handleCopySentence = useCallback(async () => {
    if (!sentenceText) return
    const success = await copyToClipboard(sentenceText)
    if (success) toast.success(t('plugin.japaneseLearning.copySuccess'))
  }, [sentenceText, t])

  const handleAskAboutSentence = useCallback(() => {
    if (!sentenceText) return
    const message = getExplainPrompt(i18n.language, responseMode, 'sentence', sentenceText)
    const displayContent = getExplainDisplayPrompt(i18n.language, 'sentence', sentenceText)
    openChatAndSend(message, displayContent, { ephemeralContext })
  }, [ephemeralContext, sentenceText, i18n.language, responseMode])

  const handlePlaySentence = useCallback(() => {
    if (!ttsText || !ttsId) return
    if (isBusy) {
      stopTts()
      return
    }
    playTts(ttsId, ttsText, { source: 'sentence' })
  }, [isBusy, playTts, stopTts, ttsId, ttsText])

  return (
    <Drawer
      open={ocrSheetOpen}
      onOpenChange={(open: boolean) => {
        if (!open) {
          fadeOut()
          closeOcrSheet()
        }
      }}
    >
      <DrawerContent
        className="!h-[70vh] !max-h-[70vh] max-w-2xl mx-auto !border-0"
        // Mobile fix: close on overlay pointer-down so a single outside tap always dismisses,
        // even after token interactions inside the sheet.
        overlayProps={{
          onPointerDown: (e) => {
            e.preventDefault()
            e.stopPropagation()
            fadeOut()
            closeOcrSheet()
          },
        }}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {ocrResult.loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <motion.div
                  className="rounded-full h-12 w-12 border-2 border-primary/30 border-t-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <motion.p
                  className="mt-4 text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {t('plugin.japaneseLearning.extractingText')}
                </motion.p>
              </motion.div>
            ) : ocrResult.error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="text-destructive font-medium">{ocrResult.error}</div>
                <p className="text-muted-foreground text-sm mt-2">{t('plugin.japaneseLearning.tryAnotherRegion')}</p>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-0"
              >
                <SentenceDisplay
                  tokens={grammarAnalysis.tokens}
                  sentenceText={ocrResult.text}
                  ephemeralContext={ephemeralContext}
                  grammar={grammarAnalysis}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DrawerFooter className="border-t border-border/50 bg-background/80 supports-backdrop-filter:backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handlePlaySentence}
                disabled={!canActOnSentence}
                className="flex-1 gap-1.5"
              >
                {isCurrent && isLoading ? (
                  <Spinner className="size-4" />
                ) : (
                  <HugeiconsIcon icon={isBusy ? PauseIcon : PlayIcon} className="size-3.5" />
                )}
                {isBusy
                  ? t('plugin.japaneseLearning.tts.stop', { defaultValue: 'Stop' })
                  : t('plugin.japaneseLearning.tts.listen', { defaultValue: 'Listen' })}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleAskAboutSentence}
                disabled={!canActOnSentence}
                className="flex-1 gap-1.5"
              >
                <HugeiconsIcon icon={MessageMultiple02Icon} className="size-3.5" />
                {t('plugin.japaneseLearning.chat.askAboutSentence', { defaultValue: 'Ask about this sentence' })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopySentence}
                disabled={!canActOnSentence}
                className="flex-1 gap-1.5"
              >
                <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                {t('common.copy', { defaultValue: 'Copy' })}
              </Button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
