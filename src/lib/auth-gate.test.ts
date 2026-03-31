import { beforeEach, describe, expect, it } from 'bun:test'
import { getSyncStore } from '@/stores/sync'
import { getAuthGateStatus, requireAuthOrPrompt, useAuthGate } from './auth-gate'

describe('auth gate', () => {
  beforeEach(() => {
    getSyncStore().getState().setAuthState(false, false)
    useAuthGate.setState({ open: false })
  })

  it('passes through when already authenticated', () => {
    getSyncStore().getState().setAuthState(true, false)

    expect(getAuthGateStatus()).toBe('authenticated')
    expect(requireAuthOrPrompt()).toBe(true)
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('does not prompt while auth is still loading', () => {
    getSyncStore().getState().setAuthState(false, true)

    expect(getAuthGateStatus()).toBe('loading')
    expect(requireAuthOrPrompt()).toBe(false)
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('prompts when unauthenticated', () => {
    getSyncStore().getState().setAuthState(false, false)

    expect(getAuthGateStatus()).toBe('unauthenticated')
    expect(requireAuthOrPrompt()).toBe(false)
    expect(useAuthGate.getState().open).toBe(true)
  })
})
