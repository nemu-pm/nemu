import { useSyncExternalStore, type RefObject } from "react";
import type { ViewInstance } from "react-native";

/**
 * Which views can turn to dust for a library title, and which titles are
 * mid-dissolve (their views hide while the dust stands in for them). Shared by
 * the shelf, the continue-reading cards and the dust host (design-explore).
 */

type Target = RefObject<ViewInstance | null>;

const targets = new Map<string, Set<Target>>();
/** The view the user last acted on for a title (long press, •••): it is the one that dissolves. */
const preferred = new Map<string, Target>();
let hidden = new Set<string>();
const listeners = new Set<() => void>();

export function registerExploreDissolveTarget(id: string, target: Target): () => void {
  let set = targets.get(id);
  if (!set) {
    set = new Set();
    targets.set(id, set);
  }
  set.add(target);
  return () => {
    const current = targets.get(id);
    current?.delete(target);
    if (current && current.size === 0) targets.delete(id);
    if (preferred.get(id) === target) preferred.delete(id);
  };
}

export function preferExploreDissolveTarget(id: string, target: Target): void {
  preferred.set(id, target);
}

/** Candidates for a title, the preferred one first. */
export function getExploreDissolveTargets(id: string): Target[] {
  const first = preferred.get(id);
  const rest = [...(targets.get(id) ?? [])].filter((target) => target !== first);
  return first ? [first, ...rest] : rest;
}

export function setExploreDissolveHidden(id: string, value: boolean): void {
  if (hidden.has(id) === value) return;
  hidden = new Set(hidden);
  if (value) hidden.add(id);
  else hidden.delete(id);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while this title's views are standing aside for its dust. */
export function useExploreDissolveHidden(id: string): boolean {
  return useSyncExternalStore(subscribe, () => hidden.has(id));
}

type Dissolver = (id: string, notBeforeMs: number) => Promise<boolean>;
let activeDissolver: Dissolver | null = null;

/** The mounted dust host registers here (one at a time). */
export function setExploreDissolver(next: Dissolver | null, current?: Dissolver): void {
  if (next) activeDissolver = next;
  else if (activeDissolver === current) activeDissolver = null;
}

/**
 * Turns the title's on-screen view to dust. Resolves `true` once it is time
 * to remove the title (the front has crossed and most of the dust has lifted
 * off the slot, so the neighbours slide into a clear space), or `false` when
 * there is nothing to dissolve (no host, no view on screen, Reduce Motion, a
 * snapshot failure): remove it as usual. Plays no earlier than `notBeforeMs`
 * from now (a sheet still leaving), but captures the view straight away.
 */
export function dissolveExploreTitle(id: string, notBeforeMs = 0): Promise<boolean> {
  return activeDissolver ? activeDissolver(id, notBeforeMs) : Promise.resolve(false);
}
