const DEBUG_KEY = 'nemu:dual-read:debug';

export function isDualReadDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(DEBUG_KEY);
    if (stored === '1' || stored === 'true') return true;
  } catch {
    // ignore storage errors
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('dualReadDebug') === '1';
  } catch {
    return false;
  }
}

