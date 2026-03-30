import { useEffect, useRef } from 'react'
import { useTextDetectorStore } from '../store'
import { useNemuChatStore, buildHiddenContextFromReader, createChatToolContext } from '../chat'
import { NemuChatDrawer } from '../chat/ui'
import { usePluginCtx } from '../../../context'
import { isJapaneseSource } from './utils'
import { OcrResultSheet } from './ocr-result-sheet'
import { TextPopout } from './text-popout'
import { useTtsStore } from '@/stores/tts'

const PLUGIN_ID = 'japanese-learning'

export function JapaneseLearningGlobalUI() {
  const ctx = usePluginCtx()
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const setContextProvider = useNemuChatStore((s) => s.setContextProvider)
  const setToolContextProvider = useNemuChatStore((s) => s.setToolContextProvider)
  const fadeOut = useTtsStore((s) => s.fadeOut)
  const lastPageRef = useRef<number | null>(null)
  const unlockInteractionRef = useRef(ctx.unlockInteraction)

  // Check if plugin should be enabled for this source
  const isEnabled = isJapaneseSource(ctx)

  // Lock/unlock reader interactions when sheet is open
  useEffect(() => {
    if (ocrSheetOpen) {
      ctx.lockInteraction(PLUGIN_ID)
    } else {
      // Delay unlocking until drawer close animation completes (~500ms)
      // This prevents click-through from overlay tap propagating to detection boxes
      const timer = setTimeout(() => {
        ctx.unlockInteraction(PLUGIN_ID)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [ocrSheetOpen, ctx])

  useEffect(() => {
    unlockInteractionRef.current = ctx.unlockInteraction
  }, [ctx.unlockInteraction])

  useEffect(() => {
    return () => {
      unlockInteractionRef.current(PLUGIN_ID)
    }
  }, [])

  useEffect(() => {
    setContextProvider(() => buildHiddenContextFromReader(ctx))
    setToolContextProvider(() => createChatToolContext(ctx))
    return () => {
      setContextProvider(null)
      setToolContextProvider(null)
    }
  }, [ctx, setContextProvider, setToolContextProvider])

  useEffect(() => {
    if (lastPageRef.current !== null && lastPageRef.current !== ctx.currentPageIndex) {
      fadeOut()
    }
    lastPageRef.current = ctx.currentPageIndex
  }, [ctx.currentPageIndex, fadeOut])

  // Don't render if not enabled for this source
  if (!isEnabled) return null

  return (
    <>
      <OcrResultSheet />
      <TextPopout />
      <NemuChatDrawer />
    </>
  )
}
