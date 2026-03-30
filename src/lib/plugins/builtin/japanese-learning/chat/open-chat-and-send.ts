import { languageStore } from '@/stores/language'
import { requireAuthOrPrompt } from '@/lib/auth-gate'

import { sendChatMessage, createChatStreamCallbacks } from './actions'
import { useNemuChatStore } from './store'
import type { HiddenContext } from './types'
import type { ChatToolContext } from './tools'
import { getJapaneseLearningReaderRetryScope } from '../reader-session'

function sendChatWithSnapshot(
  text: string,
  displayContent: string,
  initialContext: HiddenContext,
  requestContext: HiddenContext,
  toolContext: ChatToolContext | null,
  retryScope?: string
) {
  const store = useNemuChatStore.getState()

  if (!requireAuthOrPrompt({
    retryScope,
    onResolvedAuthenticated: () => {
      sendChatWithSnapshot(text, displayContent, initialContext, requestContext, toolContext, retryScope)
    },
  })) {
    return
  }

  store.open(initialContext)

  setTimeout(async () => {
    if (retryScope && getJapaneseLearningReaderRetryScope() !== retryScope) return

    try {
      await sendChatMessage({
        text,
        displayContent,
        hiddenContext: requestContext,
        appLanguage: languageStore?.getState().language || 'en',
        toolContext,
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

/**
 * Open the chat and send a message - for external use (from "Ask about sentence" button)
 *
 * IMPORTANT: Keep this in a non-React module so Vite Fast Refresh doesn't
 * invalidate component modules when this helper changes.
 */
export function openChatAndSend(
  text: string,
  displayContent: string,
  contextOverride?: Partial<HiddenContext>,
) {
  const store = useNemuChatStore.getState()
  const retryScope = getJapaneseLearningReaderRetryScope() ?? undefined
  // IMPORTANT: contextOverride (e.g. ephemeralContext) should be one-turn only.
  // Do NOT persist it into the store hiddenContext by passing it into getContextForRequest().
  const baseContext = store.getContextForRequest()
  if (!baseContext) return

  const initialContext: HiddenContext = { ...baseContext }
  const requestContext: HiddenContext = contextOverride
    ? { ...baseContext, ...contextOverride }
    : { ...baseContext }
  const toolContext = store.getToolContextForRequest()

  sendChatWithSnapshot(text, displayContent, initialContext, requestContext, toolContext, retryScope)
}
