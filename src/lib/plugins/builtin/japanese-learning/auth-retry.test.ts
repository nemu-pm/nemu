import { describe, expect, it } from 'bun:test'
import {
  createAuthResolutionRetryController,
  getVisiblePageLoadPlan,
  type AuthRetryState,
  type AuthRetryStore,
} from './auth-retry'

function createTestStore(initialState: AuthRetryState): AuthRetryStore & { setState: (state: AuthRetryState) => void } {
  let state = initialState
  const listeners = new Set<(state: AuthRetryState, prevState: AuthRetryState) => void>()

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setState: (nextState) => {
      const prevState = state
      state = nextState
      listeners.forEach((listener) => listener(state, prevState))
    },
  }
}

describe('getVisiblePageLoadPlan', () => {
  it('defers auto-detect while auth is loading', () => {
    expect(getVisiblePageLoadPlan('loading', true)).toEqual({
      runAutoDetect: false,
      retryWhenAuthSettles: true,
    })
  })

  it('runs auto-detect immediately once auth is authenticated', () => {
    expect(getVisiblePageLoadPlan('authenticated', true)).toEqual({
      runAutoDetect: true,
      retryWhenAuthSettles: false,
    })
  })

  it('skips auto-detect when unauthenticated', () => {
    expect(getVisiblePageLoadPlan('unauthenticated', true)).toEqual({
      runAutoDetect: false,
      retryWhenAuthSettles: false,
    })
  })
})

describe('createAuthResolutionRetryController', () => {
  it('retries once auth resolves using the latest scheduled value', () => {
    const store = createTestStore({ isAuthenticated: false, isLoading: true })
    const seen: string[] = []
    const controller = createAuthResolutionRetryController<string>(store, (value) => {
      seen.push(value)
    })

    controller.schedule('first')
    controller.schedule('latest')
    store.setState({ isAuthenticated: true, isLoading: false })
    store.setState({ isAuthenticated: true, isLoading: false })

    expect(seen).toEqual(['latest'])
  })

  it('clears the pending retry when requested', () => {
    const store = createTestStore({ isAuthenticated: false, isLoading: true })
    const seen: string[] = []
    const controller = createAuthResolutionRetryController<string>(store, (value) => {
      seen.push(value)
    })

    controller.schedule('pending')
    controller.clear()
    store.setState({ isAuthenticated: true, isLoading: false })

    expect(seen).toEqual([])
  })
})
