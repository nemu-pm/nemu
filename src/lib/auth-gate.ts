import { create } from 'zustand'
import { getSyncStore } from '@/stores/sync'

interface AuthGateState {
  open: boolean
  promptSignIn: () => void
  dismiss: () => void
}

export const useAuthGate = create<AuthGateState>((set) => ({
  open: false,
  promptSignIn: () => set({ open: true }),
  dismiss: () => set({ open: false }),
}))

export type AuthGateStatus = 'authenticated' | 'loading' | 'unauthenticated'

interface RequireAuthOptions {
  onResolvedAuthenticated?: () => void
  retryScope?: string
}

interface PendingAuthRetry {
  callback: () => void
  retryScope?: string
}

const pendingAuthRetries = new Map<number, PendingAuthRetry>()
let pendingAuthRetryUnsubscribe: (() => void) | null = null
let pendingAuthRetryId = 0

function clearPendingAuthRetries() {
  pendingAuthRetries.clear()
  pendingAuthRetryUnsubscribe?.()
  pendingAuthRetryUnsubscribe = null
}

function cleanupPendingAuthRetrySubscriptionIfIdle() {
  if (pendingAuthRetries.size > 0) return
  pendingAuthRetryUnsubscribe?.()
  pendingAuthRetryUnsubscribe = null
}

function scheduleAuthRetry(callback: () => void, retryScope?: string) {
  pendingAuthRetries.set(++pendingAuthRetryId, { callback, retryScope })
  if (pendingAuthRetryUnsubscribe) return

  pendingAuthRetryUnsubscribe = getSyncStore().subscribe((state) => {
    if (state.isLoading) return

    const callbacks = Array.from(pendingAuthRetries.values())
    clearPendingAuthRetries()

    if (state.isAuthenticated) {
      callbacks.forEach(({ callback: retry }) => retry())
      return
    }

    if (callbacks.length > 0) {
      useAuthGate.getState().promptSignIn()
    }
  })
}

export function cancelAuthRetries(retryScope?: string) {
  if (retryScope == null) {
    clearPendingAuthRetries()
    return
  }

  for (const [id, retry] of pendingAuthRetries) {
    if (retry.retryScope === retryScope) {
      pendingAuthRetries.delete(id)
    }
  }

  cleanupPendingAuthRetrySubscriptionIfIdle()
}

export function getAuthGateStatus(): AuthGateStatus {
  const { isAuthenticated, isLoading } = getSyncStore().getState()
  if (isAuthenticated) return 'authenticated'
  if (isLoading) return 'loading'
  return 'unauthenticated'
}

/** Check if user is authenticated. If not, show sign-in dialog and return false. */
export function requireAuthOrPrompt(options?: RequireAuthOptions): boolean {
  const status = getAuthGateStatus()
  if (status === 'authenticated') return true
  if (status === 'loading') {
    if (options?.onResolvedAuthenticated) {
      scheduleAuthRetry(options.onResolvedAuthenticated, options.retryScope)
    }
    return false
  }
  useAuthGate.getState().promptSignIn()
  return false
}
