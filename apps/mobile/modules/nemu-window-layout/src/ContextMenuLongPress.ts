import { createContext, useContext } from "react";
// TEST-ONLY trace (remove before release): no-ops unless switched on in Settings.
import { traceNativeMenuEvent, traceNativeMenuPressIn } from "./ContextMenuPressTrace";

/**
 * Inside a native context menu (`ContextMenuView` on iOS with items) the
 * system's `UIContextMenuInteraction` owns the long press. React Native's
 * touch handler is never cancelled by it (a recognizer inside the RN root
 * cannot prevent `RCTSurfaceTouchHandler`), so the release after the hold
 * reaches Pressability as an ordinary release. Pressability only drops that
 * release when its own JS long-press timer (500 ms, cancelled by any 10 pt
 * drift) won the race against the release — not a given on a device: the
 * menu can be up before the timer, a drifting finger cancels the timer, and
 * a busy JS thread runs the timer after the release. The gate decides from
 * the menu's own signals and the touch's own timestamps instead.
 */

/** A hold this long in a menu-owned pressable is never a tap (UIKit's own menu threshold). */
export const NATIVE_MENU_LONG_PRESS_MS = 500;
/** Shorter holds press at once: the system menu cannot be up yet. */
export const NATIVE_MENU_PRESS_DEFER_FROM_MS = 250;
/**
 * A longer hold whose interaction had begun (`configure`) waits for the
 * menu's verdict — `willDisplay` (drop) or `willEnd` without a display (the
 * lift was cancelled: press) — at most this long after the release.
 */
export const NATIVE_MENU_PRESS_VERDICT_CAP_MS = 1000;
/**
 * A longer hold with no `configure` seen yet: UIKit asks for the menu
 * ~150 ms into a hold, before it can present one, so none is coming — this
 * short wait only covers that event reaching JS after the release.
 */
export const NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS = 80;

export type NativeContextMenuPressDecision = "fire" | "suppress" | "defer";

/** The touch clock (`nativeEvent.timestamp`) when present, else the JS clock. */
export type NativeContextMenuPressTime = { native?: number; wall: number };

export type NativeContextMenuPressScheduler = {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

const defaultScheduler: NativeContextMenuPressScheduler = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type NativeContextMenuPressGate = {
  /** A new touch sequence: clears the previous sequence's suppression. */
  pressIn(time: NativeContextMenuPressTime): void;
  /** Pressability's long-press timer fired for this sequence. */
  longPress(): void;
  /** The interaction asked for its menu (`configurationForMenuAtLocation`): a lift may follow. */
  menuConfigure(): void;
  /** The system menu is presenting (`willDisplayMenuFor`). */
  menuWillDisplay(): void;
  /** The interaction ended (`willEndFor`): after a display, or a cancelled lift without one. */
  menuWillEnd(): void;
  /**
   * At release: `press` runs now ("fire"), never ("suppress"), or once the
   * menu's verdict says no menu came ("defer").
   */
  resolvePress(time: NativeContextMenuPressTime, press: () => void): NativeContextMenuPressDecision;
  /** TEST-ONLY trace: the lifted preview was tapped (the menu just dismisses). */
  menuPreviewTap(): void;
};

let nextGateId = 1;

function heldFor(from: NativeContextMenuPressTime, to: NativeContextMenuPressTime): number {
  if (typeof from.native === "number" && typeof to.native === "number") return to.native - from.native;
  return to.wall - from.wall;
}

export function createNativeContextMenuPressGate(
  scheduler: NativeContextMenuPressScheduler = defaultScheduler,
): NativeContextMenuPressGate {
  const id = nextGateId++;
  let pressInAt: NativeContextMenuPressTime | null = null;
  // Once a sequence turned into a long press it stays one until the next pressIn.
  let suppressed = false;
  let menuVisible = false;
  // This sequence's interaction: asked for a menu / ended without showing one.
  let configured = false;
  let endedWithoutMenu = false;
  let pending: { press: () => void; timer: unknown } | null = null;

  const settle = (verdict: "fire" | "suppress", why: string) => {
    const waiting = pending;
    if (!waiting) return;
    pending = null;
    scheduler.clear(waiting.timer);
    traceNativeMenuEvent(id, `deferred onPress -> ${verdict} (${why})`);
    if (verdict === "fire") waiting.press();
  };
  const settleUnlessMenu = (why: string) => settle(suppressed || menuVisible ? "suppress" : "fire", why);

  return {
    pressIn(time) {
      // The previous touch's interaction is over once a new touch lands.
      settleUnlessMenu("next pressIn");
      pressInAt = time;
      suppressed = menuVisible;
      configured = false;
      endedWithoutMenu = false;
      traceNativeMenuPressIn(id, time.native);
    },
    longPress() {
      suppressed = true;
      traceNativeMenuEvent(id, "RN long-press timer");
    },
    menuConfigure() {
      configured = true;
      traceNativeMenuEvent(id, "menu configure");
      // A short wait for a late configure now waits for the real verdict.
      if (pending) {
        scheduler.clear(pending.timer);
        pending.timer = scheduler.set(() => settleUnlessMenu("verdict cap"), NATIVE_MENU_PRESS_VERDICT_CAP_MS);
      }
    },
    menuWillDisplay() {
      menuVisible = true;
      suppressed = true;
      traceNativeMenuEvent(id, "menu willDisplay");
      settle("suppress", "menu shown");
    },
    menuWillEnd() {
      const shown = menuVisible;
      menuVisible = false;
      if (!shown && !suppressed) endedWithoutMenu = true;
      traceNativeMenuEvent(id, "menu willEnd");
      settleUnlessMenu(shown ? "menu ended" : "lift cancelled");
    },
    resolvePress(time, press) {
      const decision = decide(time);
      traceNativeMenuEvent(id, `onPress -> ${decision}`, time.native);
      if (decision === "fire") press();
      else if (decision === "defer") {
        settleUnlessMenu("superseded");
        const wait = configured ? NATIVE_MENU_PRESS_VERDICT_CAP_MS : NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS;
        pending = { press, timer: scheduler.set(() => settleUnlessMenu(configured ? "verdict cap" : "no configure"), wait) };
      }
      return decision;
    },
    menuPreviewTap() {
      traceNativeMenuEvent(id, "menu preview tapped");
    },
  };

  function decide(time: NativeContextMenuPressTime): NativeContextMenuPressDecision {
    const startedAt = pressInAt;
    pressInAt = null;
    if (suppressed || menuVisible) return "suppress";
    // No touch sequence (accessibility activation): a plain press.
    if (!startedAt) return "fire";
    const held = heldFor(startedAt, time);
    if (held >= NATIVE_MENU_LONG_PRESS_MS) {
      suppressed = true;
      return "suppress";
    }
    if (held < NATIVE_MENU_PRESS_DEFER_FROM_MS) return "fire";
    // The lift was already cancelled (willEnd reached JS first): no menu is coming.
    return endedWithoutMenu ? "fire" : "defer";
  }
}

export function nativeContextMenuPressTime(event: unknown): NativeContextMenuPressTime {
  const timestamp = (event as { nativeEvent?: { timestamp?: unknown } } | null | undefined)?.nativeEvent?.timestamp;
  return {
    native: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : undefined,
    wall: Date.now(),
  };
}

/** The gate of the enclosing native context menu; null outside one. */
export const NativeContextMenuLongPressContext = createContext<NativeContextMenuPressGate | null>(null);

export function useNativeContextMenuPressGate(): NativeContextMenuPressGate | null {
  return useContext(NativeContextMenuLongPressContext);
}

export function useNativeContextMenuOwnsLongPress(): boolean {
  return useContext(NativeContextMenuLongPressContext) !== null;
}
