export interface TtsAuthState {
  isAuthenticated: boolean
  isLoading: boolean
}

export class TtsAuthPendingError extends Error {
  constructor(message = 'Authentication is still loading') {
    super(message)
    this.name = 'TtsAuthPendingError'
  }
}

export class TtsAuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'TtsAuthRequiredError'
  }
}

interface EnsureTtsAuthReadyOptions {
  promptOnUnauthenticated?: boolean
}

export function ensureTtsAuthReady(
  authState: TtsAuthState,
  promptSignIn: () => void,
  options?: EnsureTtsAuthReadyOptions
): void {
  if (authState.isAuthenticated) return
  if (authState.isLoading) {
    throw new TtsAuthPendingError()
  }

  if (options?.promptOnUnauthenticated ?? true) {
    promptSignIn()
  }
  throw new TtsAuthRequiredError()
}

export function isTtsAuthStateError(
  error: unknown
): error is TtsAuthPendingError | TtsAuthRequiredError {
  return error instanceof TtsAuthPendingError || error instanceof TtsAuthRequiredError
}
