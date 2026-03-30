import { describe, expect, it } from 'bun:test'
import {
  ensureTtsAuthReady,
  isTtsAuthStateError,
  TtsAuthPendingError,
  TtsAuthRequiredError,
} from './tts-auth'

describe('ensureTtsAuthReady', () => {
  it('allows authenticated playback requests through', () => {
    expect(() => {
      ensureTtsAuthReady({ isAuthenticated: true, isLoading: false }, () => {})
    }).not.toThrow()
  })

  it('throws a pending error without prompting while auth is loading', () => {
    let prompted = false

    expect(() => {
      ensureTtsAuthReady({ isAuthenticated: false, isLoading: true }, () => {
        prompted = true
      })
    }).toThrow(TtsAuthPendingError)
    expect(prompted).toBe(false)
  })

  it('prompts and throws a required error once auth is resolved unauthenticated', () => {
    let prompted = false

    expect(() => {
      ensureTtsAuthReady({ isAuthenticated: false, isLoading: false }, () => {
        prompted = true
      })
    }).toThrow(TtsAuthRequiredError)
    expect(prompted).toBe(true)
  })

  it('can suppress sign-in prompts for background auth failures', () => {
    let prompted = false

    expect(() => {
      ensureTtsAuthReady(
        { isAuthenticated: false, isLoading: false },
        () => {
          prompted = true
        },
        { promptOnUnauthenticated: false }
      )
    }).toThrow(TtsAuthRequiredError)
    expect(prompted).toBe(false)
  })

  it('recognizes auth state errors', () => {
    expect(isTtsAuthStateError(new TtsAuthPendingError())).toBe(true)
    expect(isTtsAuthStateError(new TtsAuthRequiredError())).toBe(true)
    expect(isTtsAuthStateError(new Error('other'))).toBe(false)
  })
})
