import { languageStore } from '@/stores/language'
import { requireAuthOrPrompt } from '@/lib/auth-gate'

import { sendChatMessage, createChatStreamCallbacks } from './actions'
import { useNemuChatStore } from './store'
import type { HiddenContext } from './types'

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
  if (!requireAuthOrPrompt()) return

  const store = useNemuChatStore.getState()
  // IMPORTANT: contextOverride (e.g. ephemeralContext) should be one-turn only.
  // Do NOT persist it into the store hiddenContext by passing it into getContextForRequest().
  const initialContext = store.getContextForRequest()
  if (initialContext) {
    store.open(initialContext)
  }

  // Send message directly - no setTimeout, no useEffect
  // Need to wait for store to open before sending
  setTimeout(async () => {
    const state = useNemuChatStore.getState()
    const baseContext = state.getContextForRequest()
    if (!baseContext) return
    const context = contextOverride ? { ...baseContext, ...contextOverride } : baseContext
    const lang = languageStore?.getState().language || 'en'

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
      const chatState = useNemuChatStore.getState()
      chatState.setShowTypingIndicator(false)
      chatState.setStreaming(false)
    }
  }, 50) // Small delay to ensure drawer is open
}
