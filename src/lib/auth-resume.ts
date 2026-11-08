/**
 * Puts a user back where they were after the OAuth redirect.
 *
 * The app's URL is remembered here rather than sent as better-auth's
 * callbackURL: its relative-path check rejects `%` and `:` in a path, which
 * reader and library URLs can contain, and would fail the sign-in. OAuth comes
 * back to the site root with `?ott=`, and this module moves that onto the
 * remembered path before the router reads the location, so it must stay the
 * first import in main.tsx.
 */

const STORAGE_KEY = 'nemu:auth-return'

/** A dialog or drawer the library page reopens once signed in. */
export type AuthResumeAction = 'edit-metadata' | 'metadata-match' | 'source-add'

interface AuthReturn {
  path: string
  resume?: AuthResumeAction
}

let pendingResume: AuthResumeAction | undefined

/** Call right before leaving for the OAuth provider. */
export function rememberAuthReturn(resume?: AuthResumeAction) {
  const { pathname, search, hash } = window.location
  const value: AuthReturn = { path: `${pathname}${search}${hash}`, resume }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage unavailable: OAuth just lands on the site root.
  }
}

export function clearAuthReturn() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** The URL to continue at after a sign-in return, or null when there is none to apply. */
export function resolveAuthReturnUrl(currentHref: string, stored: string | null): { url: string; resume?: AuthResumeAction } | null {
  if (!stored) return null
  const current = new URL(currentHref)
  const ott = current.searchParams.get('ott')
  if (!ott) return null
  try {
    const { path, resume } = JSON.parse(stored) as AuthReturn
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null
    const target = new URL(path, current.origin)
    if (target.origin !== current.origin) return null
    target.searchParams.set('ott', ott)
    return { url: `${target.pathname}${target.search}${target.hash}`, resume }
  } catch {
    return null
  }
}

function restoreAuthReturn() {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  // One attempt only: a load without `ott` means that sign-in was abandoned.
  clearAuthReturn()
  const resolved = resolveAuthReturnUrl(window.location.href, stored)
  if (!resolved) return
  window.history.replaceState(null, '', resolved.url)
  pendingResume = resolved.resume
}

/** Returns the action to continue after a sign-in return, once. */
export function takeAuthResume(): AuthResumeAction | undefined {
  const resume = pendingResume
  pendingResume = undefined
  return resume
}

if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
  restoreAuthReturn()
}
