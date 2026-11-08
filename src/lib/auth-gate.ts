import { create } from 'zustand'
import { isSessionExpired } from '@/lib/auth-client'
import type { AuthResumeAction } from '@/lib/auth-resume'
import { getSyncStore } from '@/stores/sync'

/** Keys of `signIn.reasons` in the locale files. */
export type AuthGateReason = 'aiMetadata' | 'coverUpload' | 'grammarAnalysis'

export interface AuthGatePrompt {
  /** Why sign-in is needed; the dialog's general description when omitted. */
  reason?: AuthGateReason
  /** What to reopen after the OAuth redirect comes back. */
  resume?: AuthResumeAction
}

interface AuthGateState extends AuthGatePrompt {
  open: boolean
  promptSignIn: (prompt?: AuthGatePrompt) => void
  dismiss: () => void
}

export const useAuthGate = create<AuthGateState>((set) => ({
  open: false,
  promptSignIn: (prompt) => set({ open: true, reason: prompt?.reason, resume: prompt?.resume }),
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
export function requireAuthOrPrompt(prompt?: AuthGatePrompt): boolean {
  const status = getAuthGateStatus()
  if (status === 'authenticated') return true
  if (status === 'unauthenticated') {
    useAuthGate.getState().promptSignIn(prompt)
  }
  return false
}

/** Settles the 'loading' status, for calls that start on their own rather than on a tap. */
export function waitForAuthStatus(timeoutMs = 10_000): Promise<AuthGateStatus> {
  const status = getAuthGateStatus()
  if (status !== 'loading') return Promise.resolve(status)
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      unsubscribe()
      resolve(getAuthGateStatus())
    }
    const timer = setTimeout(finish, timeoutMs)
    const unsubscribe = getSyncStore().subscribe(() => {
      if (getAuthGateStatus() !== 'loading') finish()
    })
  })
}

/**
 * Whether a failed Convex call failed for want of a session. Production Convex
 * redacts thrown errors to "Server Error", so that message alone can't tell; it
 * is only an auth failure if the session has really gone.
 */
export async function isAuthFailure(
  err: unknown,
  sessionExpired: () => Promise<boolean> = isSessionExpired,
): Promise<boolean> {
  const message = err instanceof Error ? err.message : String(err)
  if (/\bnot authenticated\b/i.test(message)) return true
  return /\bserver error\b/i.test(message) && (await sessionExpired())
}

export interface SignInGate {
  /**
   * Makes a sign-in-only call. Resolves to null, without calling, when signed
   * out, and when the call fails because the session expired; prompts in both
   * cases. Other errors reject as they would without the gate.
   */
  run: <T>(call: () => Promise<T>) => Promise<T | null>
  /** Allows the next run to prompt again. */
  reset: () => void
}

/**
 * For calls made along the way of a larger flow that carries on without them.
 * Prompts once until reset, so a dismissed prompt doesn't return at each step.
 */
export function createSignInGate(prompt: AuthGatePrompt): SignInGate {
  let prompted = false
  const promptOnce = () => {
    if (prompted) return
    prompted = true
    useAuthGate.getState().promptSignIn(prompt)
  }
  return {
    run: async (call) => {
      const status = await waitForAuthStatus()
      if (status !== 'authenticated') {
        if (status === 'unauthenticated') promptOnce()
        return null
      }
      try {
        return await call()
      } catch (err) {
        if (await isAuthFailure(err)) {
          promptOnce()
          return null
        }
        throw err
      }
    },
    reset: () => {
      prompted = false
    },
  }
}
