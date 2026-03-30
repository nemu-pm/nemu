import { beforeEach, describe, expect, it } from 'bun:test'
import { getSyncStore } from '@/stores/sync'
import { cancelAuthRetries, getAuthGateStatus, requireAuthOrPrompt, useAuthGate } from './auth-gate'

describe('auth gate', () => {
  beforeEach(() => {
    getSyncStore().getState().setAuthState(false, false)
    useAuthGate.setState({ open: false })
    cancelAuthRetries()
  })

  it('does not prompt while auth is still resolving', () => {
    getSyncStore().getState().setAuthState(false, true)

    expect(getAuthGateStatus()).toBe('loading')
    expect(requireAuthOrPrompt()).toBe(false)
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('retries gated work once auth resolves authenticated', () => {
    let retried = 0
    getSyncStore().getState().setAuthState(false, true)

    expect(
      requireAuthOrPrompt({
        onResolvedAuthenticated: () => {
          retried += 1
        },
      })
    ).toBe(false)

    getSyncStore().getState().setAuthState(true, false)
    expect(retried).toBe(1)
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('prompts once a pending gated action resolves unauthenticated', () => {
    getSyncStore().getState().setAuthState(false, true)

    expect(
      requireAuthOrPrompt({
        onResolvedAuthenticated: () => {
          throw new Error('should not retry')
        },
      })
    ).toBe(false)

    getSyncStore().getState().setAuthState(false, false)
    expect(useAuthGate.getState().open).toBe(true)
  })

  it('cancels queued retries for a matching scope', () => {
    let retried = 0
    getSyncStore().getState().setAuthState(false, true)

    expect(
      requireAuthOrPrompt({
        retryScope: 'reader-a',
        onResolvedAuthenticated: () => {
          retried += 1
        },
      })
    ).toBe(false)

    cancelAuthRetries('reader-a')
    getSyncStore().getState().setAuthState(true, false)

    expect(retried).toBe(0)
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('only cancels retries in the requested scope', () => {
    const seen: string[] = []
    getSyncStore().getState().setAuthState(false, true)

    requireAuthOrPrompt({
      retryScope: 'reader-a',
      onResolvedAuthenticated: () => {
        seen.push('a')
      },
    })
    requireAuthOrPrompt({
      retryScope: 'reader-b',
      onResolvedAuthenticated: () => {
        seen.push('b')
      },
    })

    cancelAuthRetries('reader-a')
    getSyncStore().getState().setAuthState(true, false)

    expect(seen).toEqual(['b'])
  })

  it('prompts once auth is resolved and unauthenticated', () => {
    getSyncStore().getState().setAuthState(false, false)

    expect(getAuthGateStatus()).toBe('unauthenticated')
    expect(requireAuthOrPrompt()).toBe(false)
    expect(useAuthGate.getState().open).toBe(true)
  })

  it('passes through when already authenticated', () => {
    getSyncStore().getState().setAuthState(true, false)

    expect(getAuthGateStatus()).toBe('authenticated')
    expect(requireAuthOrPrompt()).toBe(true)
    expect(useAuthGate.getState().open).toBe(false)
  })
})
