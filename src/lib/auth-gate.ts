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

export function getAuthGateStatus(): AuthGateStatus {
  const { isAuthenticated, isLoading } = getSyncStore().getState()
  if (isAuthenticated) return 'authenticated'
  if (isLoading) return 'loading'
  return 'unauthenticated'
}

/** Check if user is authenticated. If not, show sign-in dialog and return false. */
export function requireAuthOrPrompt(): boolean {
  const status = getAuthGateStatus()
  if (status === 'authenticated') return true
  if (status === 'unauthenticated') {
    useAuthGate.getState().promptSignIn()
  }
  return false
}
