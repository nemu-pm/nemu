/**
 * Shares one successful async resource, but never turns a transient creation
 * failure into a process-lifetime failure. The identity check prevents an old
 * rejection from clearing a newer attempt.
 */
export function createRetryablePromiseCache<T>(
  factory: () => T | Promise<T>,
): () => Promise<T> {
  let cached: Promise<T> | null = null;

  return () => {
    if (!cached) {
      const pending = Promise.resolve().then(factory);
      cached = pending;
      void pending.catch(() => {
        if (cached === pending) cached = null;
      });
    }
    return cached;
  };
}
