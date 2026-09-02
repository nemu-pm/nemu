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

/**
 * Per-item variant for keyed record lists: items that are content-identical
 * to the current item with the same key keep their current reference, so a
 * change to one record does not invalidate memos keyed on its siblings. When
 * nothing changed at all, the current array itself is returned.
 */
export function stabilizeListReferences<T>(
  current: readonly T[],
  next: readonly T[],
  keyOf: (item: T) => string,
): readonly T[] {
  if (current === next) return current;
  const currentByKey = new Map<string, T>();
  for (const item of current) currentByKey.set(keyOf(item), item);

  let reusedAll = current.length === next.length;
  const stabilized = next.map((item, index) => {
    const existing = currentByKey.get(keyOf(item));
    const stable =
      existing !== undefined
        ? keepReferenceIfUnchanged(existing, item)
        : item;
    if (!reusedAll) return stable;
    if (stable !== current[index]) reusedAll = false;
    return stable;
  });
  return reusedAll ? current : stabilized;
}
