/**
 * Pre-warming the iOS Aidoku sandbox: booting its WKWebView and runtime page
 * (~0.6–1.2 s on the main thread on a cold app) before the first source call,
 * so that call does not land under the reader's opening fade.
 *
 * The boot still blocks main; it is only moved. So it is off by default and,
 * when on, runs once per process only while the app sits idle on the Library:
 * no touch and no list scroll (or momentum) for `idleMs`, the app active, the
 * Library focused, at least `firstPaintDelayMs` after the Library's first
 * paint, and never once a reader has opened (the reader boots it itself).
 *
 * Pure (no React Native) apart from the module-level activity notes.
 */

/** Off by default: the pre-warm is a main-thread stall moved onto the Library. */
export const NEMU_AIDOKU_PREWARM_ENABLED = false;

export const MOBILE_AIDOKU_PREWARM_IDLE_MS = 1500;
export const MOBILE_AIDOKU_PREWARM_FIRST_PAINT_DELAY_MS = 1000;

export type MobileAidokuPrewarmInput = {
  enabled: boolean;
  platform: string;
  /** The native module can pre-warm (an older build cannot). */
  nativeAvailable: boolean;
  /** Already started (or done) in this process. */
  started: boolean;
  readerOpened: boolean;
  appActive: boolean;
  libraryFocused: boolean;
  /** When the Library first painted (null: not yet). */
  firstPaintAt: number | null;
  /** The last touch or list scroll event (null: none yet). */
  lastActivityAt: number | null;
  /** A finger is down right now (touch began, not yet ended). */
  touching: boolean;
  now: number;
  idleMs?: number;
  firstPaintDelayMs?: number;
};

export type MobileAidokuPrewarmStep =
  /** Never in this process (flag off, not iOS, no native support, done, a reader opened). */
  | { kind: "never" }
  /** Not now (backgrounded, another screen, finger down): ask again on a change. */
  | { kind: "blocked" }
  /** Ask again in `ms`. */
  | { kind: "wait"; ms: number }
  | { kind: "start" };

export function resolveMobileAidokuPrewarmStep(
  input: MobileAidokuPrewarmInput,
): MobileAidokuPrewarmStep {
  if (
    !input.enabled ||
    input.platform !== "ios" ||
    !input.nativeAvailable ||
    input.started ||
    input.readerOpened
  ) {
    return { kind: "never" };
  }
  if (!input.appActive || !input.libraryFocused || input.firstPaintAt == null || input.touching) {
    return { kind: "blocked" };
  }
  const idleMs = input.idleMs ?? MOBILE_AIDOKU_PREWARM_IDLE_MS;
  const firstPaintDelayMs =
    input.firstPaintDelayMs ?? MOBILE_AIDOKU_PREWARM_FIRST_PAINT_DELAY_MS;
  const paintReadyAt = input.firstPaintAt + firstPaintDelayMs;
  const idleReadyAt = input.lastActivityAt == null ? 0 : input.lastActivityAt + idleMs;
  const readyAt = Math.max(paintReadyAt, idleReadyAt);
  if (input.now < readyAt) return { kind: "wait", ms: Math.ceil(readyAt - input.now) };
  return { kind: "start" };
}

// ── Process-wide notes (fed by the root touch handlers, the Library's list
// and the reader route) ──

let lastActivityAt: number | null = null;
let touchesDown = 0;
let readerOpened = false;
let libraryFocused = false;
let prewarmStarted = false;
const activityListeners = new Set<() => void>();

function notifyActivity() {
  for (const listener of [...activityListeners]) listener();
}

export function noteMobileUserActivity(now = Date.now()) {
  lastActivityAt = now;
  notifyActivity();
}

/**
 * A root touch event (start, move, end or cancel): `activeTouches` is the
 * event's `touches.length`, the fingers still down after it.
 */
export function noteMobileTouches(activeTouches: number, now = Date.now()) {
  touchesDown = Math.max(0, activeTouches);
  noteMobileUserActivity(now);
}

export function noteMobileLibraryFocused(focused: boolean) {
  if (libraryFocused === focused) return;
  libraryFocused = focused;
  notifyActivity();
}

export function noteMobileReaderOpened() {
  readerOpened = true;
  notifyActivity();
}

export function markMobileAidokuPrewarmStarted() {
  prewarmStarted = true;
}

export function readMobileAidokuPrewarmNotes() {
  return {
    lastActivityAt,
    touching: touchesDown > 0,
    readerOpened,
    libraryFocused,
    started: prewarmStarted,
  };
}

export function subscribeMobileUserActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

/** Tests only. */
export function resetMobileAidokuPrewarmNotesForTests() {
  lastActivityAt = null;
  touchesDown = 0;
  readerOpened = false;
  libraryFocused = false;
  prewarmStarted = false;
  activityListeners.clear();
}
