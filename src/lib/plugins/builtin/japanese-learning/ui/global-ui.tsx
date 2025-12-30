import { useEffect } from 'react'
import { useTextDetectorStore } from '../store'
import { useNemuChatStore, buildHiddenContextFromReader, createChatToolContext } from '../chat'
import { NemuChatDrawer } from '../chat/ui'
import { usePluginCtx } from '../../../context'
import { isJapaneseSource } from './utils'
import { OcrResultSheet } from './ocr-result-sheet'
import { TextPopout } from './text-popout'

const PLUGIN_ID = 'japanese-learning'

export function JapaneseLearningGlobalUI() {
  const ctx = usePluginCtx()
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const setContextProvider = useNemuChatStore((s) => s.setContextProvider)
  const setToolContextProvider = useNemuChatStore((s) => s.setToolContextProvider)

  // Check if plugin should be enabled for this source
  const isEnabled = isJapaneseSource(ctx)

  // Lock/unlock reader interactions when sheet is open
  useEffect(() => {
    if (ocrSheetOpen) {
      ctx.lockInteraction(PLUGIN_ID)
    } else {
      ctx.unlockInteraction(PLUGIN_ID)
    }
  }, [ocrSheetOpen, ctx])

  useEffect(() => {
    setContextProvider(() => buildHiddenContextFromReader(ctx))
    setToolContextProvider(() => createChatToolContext(ctx))
    return () => {
      setContextProvider(null)
      setToolContextProvider(null)
    }
  }, [ctx, setContextProvider, setToolContextProvider])

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
