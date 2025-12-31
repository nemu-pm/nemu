export function isJapaneseLearningDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const key = window.localStorage.getItem('nemu:japanese-learning:debug')
    if (key === '1' || key === 'true') return true
    const qs = new URLSearchParams(window.location.search)
    const q = qs.get('jlDebug')
    return q === '1' || q === 'true'
  } catch {
    return false
  }
}

export function jlDebugLog(...args: unknown[]) {
  if (!isJapaneseLearningDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.log('[JL]', ...args)
}


