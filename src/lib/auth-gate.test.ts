import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getSyncStore } from '@/stores/sync'
import {
  createSignInGate,
  getAuthGateStatus,
  isAuthFailure,
  requireAuthOrPrompt,
  useAuthGate,
  waitForAuthStatus,
} from './auth-gate'

const redacted = new Error('[Request ID: abc] Server Error')

describe('auth gate', () => {
  beforeEach(() => {
    getSyncStore().getState().setAuthState(false, false)
    useAuthGate.setState({ open: false, reason: undefined, resume: undefined })
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

  it('carries the reason and resume action to the dialog', () => {
    expect(requireAuthOrPrompt({ reason: 'coverUpload', resume: 'edit-metadata' })).toBe(false)
    expect(useAuthGate.getState().reason).toBe('coverUpload')
    expect(useAuthGate.getState().resume).toBe('edit-metadata')
  })

  it('a plain prompt does not inherit an earlier reason', () => {
    useAuthGate.getState().promptSignIn({ reason: 'aiMetadata', resume: 'metadata-match' })
    useAuthGate.getState().dismiss()
    useAuthGate.getState().promptSignIn()
    expect(useAuthGate.getState().reason).toBeUndefined()
    expect(useAuthGate.getState().resume).toBeUndefined()
  })
})

describe('waitForAuthStatus', () => {
  afterEach(() => getSyncStore().getState().setAuthState(false, false))

  it('resolves as soon as loading settles', async () => {
    getSyncStore().getState().setAuthState(false, true)
    const status = waitForAuthStatus()
    getSyncStore().getState().setAuthState(true, false)
    expect(await status).toBe('authenticated')
  })

  it('gives up on a load that never settles', async () => {
    getSyncStore().getState().setAuthState(false, true)
    expect(await waitForAuthStatus(1)).toBe('loading')
  })
})

describe('isAuthFailure', () => {
  const never = mock(async () => {
    throw new Error('the session check should not run')
  })

  it('recognises the backend message without checking the session', async () => {
    const devError = new Error('[CONVEX A(ai_metadata:findJapaneseTitle)] Uncaught Error: Not authenticated')
    expect(await isAuthFailure(devError, never)).toBe(true)
    expect(never).not.toHaveBeenCalled()
  })

  it("treats production's redacted error as auth only if the session is gone", async () => {
    expect(await isAuthFailure(redacted, async () => true)).toBe(true)
    expect(await isAuthFailure(redacted, async () => false)).toBe(false)
  })

  it('ignores unrelated failures', async () => {
    expect(await isAuthFailure(new Error('Failed to load image'), never)).toBe(false)
    expect(never).not.toHaveBeenCalled()
  })
})

describe('createSignInGate', () => {
  const prompt = { reason: 'aiMetadata', resume: 'metadata-match' } as const

  beforeEach(() => {
    getSyncStore().getState().setAuthState(false, false)
    useAuthGate.setState({ open: false, reason: undefined, resume: undefined })
  })

  it('makes no call and prompts when signed out', async () => {
    const call = mock(async () => 'title')
    expect(await createSignInGate(prompt).run(call)).toBeNull()
    expect(call).not.toHaveBeenCalled()
    expect(useAuthGate.getState().open).toBe(true)
    expect(useAuthGate.getState().reason).toBe('aiMetadata')
  })

  it('makes the call without prompting when signed in', async () => {
    getSyncStore().getState().setAuthState(true, false)
    expect(await createSignInGate(prompt).run(async () => 'title')).toBe('title')
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('waits out the loading status instead of dropping a signed-in call', async () => {
    getSyncStore().getState().setAuthState(false, true)
    const result = createSignInGate(prompt).run(async () => 'title')
    getSyncStore().getState().setAuthState(true, false)
    expect(await result).toBe('title')
    expect(useAuthGate.getState().open).toBe(false)
  })

  it('does not prompt again after a dismissal until reset', async () => {
    const gate = createSignInGate(prompt)
    await gate.run(async () => 'title')
    useAuthGate.getState().dismiss()

    await gate.run(async () => 'title')
    expect(useAuthGate.getState().open).toBe(false)

    gate.reset()
    await gate.run(async () => 'title')
    expect(useAuthGate.getState().open).toBe(true)
  })

  it('prompts when the session expired mid-flight', async () => {
    getSyncStore().getState().setAuthState(true, false)
    const result = await createSignInGate(prompt).run(async () => {
      throw new Error('Uncaught Error: Not authenticated')
    })
    expect(result).toBeNull()
    expect(useAuthGate.getState().open).toBe(true)
  })

  it('leaves other errors to the caller', async () => {
    getSyncStore().getState().setAuthState(true, false)
    const failing = createSignInGate(prompt).run(async () => {
      throw new Error('Gemini unavailable')
    })
    await expect(failing).rejects.toThrow('Gemini unavailable')
    expect(useAuthGate.getState().open).toBe(false)
  })
})
