import type { AuthGateStatus } from '@/lib/auth-gate'

export interface AuthRetryState {
  isAuthenticated: boolean
  isLoading: boolean
}

export interface AuthRetryStore {
  getState: () => AuthRetryState
  subscribe: (listener: (state: AuthRetryState, prevState: AuthRetryState) => void) => () => void
}

export interface VisiblePageLoadPlan {
  runAutoDetect: boolean
  retryWhenAuthSettles: boolean
}

export function getVisiblePageLoadPlan(
  authStatus: AuthGateStatus,
  autoDetectRequested: boolean
): VisiblePageLoadPlan {
  return {
    runAutoDetect: authStatus === 'authenticated' && autoDetectRequested,
    retryWhenAuthSettles: authStatus === 'loading' && autoDetectRequested,
  }
}

export function createAuthResolutionRetryController<T>(
  store: AuthRetryStore,
  onAuthenticated: (value: T) => void
) {
  let pendingValue: T | null = null
  let unsubscribe: (() => void) | null = null

  const clear = () => {
    pendingValue = null
    unsubscribe?.()
    unsubscribe = null
  }

  return {
    schedule(value: T) {
      pendingValue = value
      if (unsubscribe) return

      unsubscribe = store.subscribe((state) => {
        if (state.isLoading) return

        const nextValue = pendingValue
        const shouldRetry = state.isAuthenticated && nextValue !== null
        clear()

        if (shouldRetry) {
          onAuthenticated(nextValue)
        }
      })
    },
    clear,
  }
}
