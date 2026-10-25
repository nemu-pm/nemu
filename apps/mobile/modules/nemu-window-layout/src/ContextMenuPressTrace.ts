/**
 * TEST-ONLY diagnostic — remove before release.
 *
 * Records the last few touch sequences inside native context menus (pressIn,
 * Pressability's long press, the menu's configure / willDisplay / willEnd /
 * preview tap, and what the press gate decided) so a tester can copy them
 * from Settings → Experimental Design on a real device. Off unless the
 * "Long-Press Trace (Test)" switch is on; nothing is ever logged (no
 * console output in any build). Pure: no `react-native` import.
 */

export const NATIVE_MENU_PRESS_TRACE_LABEL = "Long-Press Trace (Test)";
const MAX_SEQUENCES = 8;
const MAX_EVENTS_PER_SEQUENCE = 24;

type TraceEvent = { at: number; native?: number; what: string };
type TraceSequence = { id: number; menu: number; startedAt: number; startedNative?: number; events: TraceEvent[] };

let enabled = false;
let nextSequence = 1;
let sequences: TraceSequence[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function isNativeMenuPressTraceEnabled(): boolean {
  return enabled;
}

export function setNativeMenuPressTraceEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  if (!value) sequences = [];
  notify();
}

export function clearNativeMenuPressTrace(): void {
  sequences = [];
  notify();
}

export function subscribeNativeMenuPressTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A new touch sequence on `menu` (its pressIn). */
export function traceNativeMenuPressIn(menu: number, native: number | undefined, now = Date.now()): void {
  if (!enabled) return;
  sequences = [
    ...sequences.slice(-(MAX_SEQUENCES - 1)),
    { id: nextSequence++, menu, startedAt: now, startedNative: native, events: [{ at: now, native, what: "pressIn" }] },
  ];
  notify();
}

/** Any later step of `menu`'s current sequence (one is opened when no pressIn was seen). */
export function traceNativeMenuEvent(menu: number, what: string, native?: number, now = Date.now()): void {
  if (!enabled) return;
  let sequence: TraceSequence | undefined;
  for (let index = sequences.length - 1; index >= 0 && !sequence; index -= 1) {
    if (sequences[index].menu === menu) sequence = sequences[index];
  }
  if (!sequence) {
    sequence = { id: nextSequence++, menu, startedAt: now, events: [{ at: now, what: "(no pressIn)" }] };
    sequences = [...sequences.slice(-(MAX_SEQUENCES - 1)), sequence];
  }
  if (sequence.events.length < MAX_EVENTS_PER_SEQUENCE) sequence.events.push({ at: now, native, what });
  notify();
}

/** Copyable text, newest sequence last. JS clock offsets; touch-clock offsets in brackets when known. */
export function formatNativeMenuPressTrace(): string {
  if (!sequences.length) return "";
  return sequences
    .map((sequence) => {
      const lines = sequence.events.map((event) => {
        const touch =
          typeof event.native === "number" && typeof sequence.startedNative === "number"
            ? ` [touch +${Math.round(event.native - sequence.startedNative)}ms]`
            : "";
        return `  +${event.at - sequence.startedAt}ms${touch} ${event.what}`;
      });
      return [`#${sequence.id} menu ${sequence.menu} @${new Date(sequence.startedAt).toISOString()}`, ...lines].join("\n");
    })
    .join("\n");
}
