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
 * Map-of-sets variant (collection membership). `JSON.stringify` serializes
 * every Map/Set as an empty object, so the generic helper must not be used
 * for these — it would report all memberships as equal.
 */
export function keepMapOfSetsIfUnchanged<K, V>(
  current: Map<K, Set<V>>,
  next: Map<K, Set<V>>,
): Map<K, Set<V>> {
  if (current === next) return current;
  if (current.size !== next.size) return next;
  for (const [key, nextValues] of next) {
    const currentValues = current.get(key);
    if (!currentValues || currentValues.size !== nextValues.size) return next;
    for (const value of nextValues) {
      if (!currentValues.has(value)) return next;
    }
  }
  return current;
}

/** Same length and reference-equal items in order. */
export function shallowEqualLists<T>(
  current: readonly T[],
  next: readonly T[],
): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== next[index]) return false;
  }
  return true;
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
