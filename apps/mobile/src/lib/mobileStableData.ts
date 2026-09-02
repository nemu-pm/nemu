/**
 * Reference-stability helper for reload-style hooks: a reload that produces
 * content-identical data keeps the previous reference so `useMemo`/effect
 * dependency chains downstream do not churn. Serialized comparison is
 * appropriate for small metadata records (installed sources, registries) that
 * deserialize with stable key order; do not use it for large blobs.
 */
export function keepReferenceIfUnchanged<T>(current: T, next: T): T {
  if (current === next) return current;
  try {
    return JSON.stringify(current) === JSON.stringify(next) ? current : next;
  } catch {
    return next;
  }
}
