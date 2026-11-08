import { useState } from "react";
import { shallowEqualLists } from "./mobileStableData";

/**
 * Returns the previous array reference while the derived list still holds the
 * same item references in the same order. Use for `filter`/`map`-derived
 * lists that feed effect dependency arrays: the source hooks already keep
 * per-item references stable, so a sibling record changing must not restart
 * work (a live search, a scheduler) that only depends on the selected subset.
 */
export function useStableList<T extends readonly unknown[]>(list: T): T {
  // Derived-state-from-previous-render pattern (compiler-safe, unlike a ref
  // read during render): adopt the new list only when its items changed.
  const [stable, setStable] = useState(list);
  if (stable === list) return stable;
  if (shallowEqualLists(stable, list)) return stable;
  setStable(list);
  return list;
}

/**
 * The same pattern for a value with its own comparison: `stabilize(current,
 * next)` returns `current` while nothing it shows changed (or a value that
 * keeps the unchanged parts of `current`).
 */
export function useStableValue<T>(value: T, stabilize: (current: T, next: T) => T): T {
  const [stable, setStable] = useState(value);
  if (stable === value) return stable;
  const next = stabilize(stable, value);
  if (next !== stable) setStable(next);
  return next;
}
