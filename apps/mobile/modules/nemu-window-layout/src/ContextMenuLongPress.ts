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
 *
 * Movement is never judged here: whether a drifting finger still becomes the
 * menu's long press is UIKit's call (the interaction's own recognizer, and an
 * enclosing scroll view whose pan, once it begins, cancels the lift — so a
 * scroll that starts on a book is never a long press). The gate only takes
 * the outcome: a lift UIKit cancelled while the finger was still down
 * (`willEnd` without a display, stamped before the release on the touch
 * clock) makes the release neither a menu nor a tap.
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

/**
 * The menu's events carry `uptime`: the main thread's clock in ms when UIKit
 * called the delegate (`systemUptime`, the clock of `nativeEvent.timestamp`).
 */
export type NativeContextMenuEventTime = number | undefined;

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
  menuConfigure(at?: NativeContextMenuEventTime): void;
  /** The system menu is presenting (`willDisplayMenuFor`). */
  menuWillDisplay(at?: NativeContextMenuEventTime): void;
  /**
   * The interaction ended (`willEndFor`): after a display, or a lift without
   * one — ended by the release (a tap) or cancelled while the finger was down
   * (it moved, or a scroll view's pan claimed it). `active` (TEST-ONLY trace)
   * names the gesture recognizers that were running at that moment.
   */
  menuWillEnd(at?: NativeContextMenuEventTime, active?: string): void;
  /**
   * At release: `press` runs now ("fire"), never ("suppress"), or once the
   * menu's verdict says no menu came ("defer").
   */
  resolvePress(time: NativeContextMenuPressTime, press: () => void): NativeContextMenuPressDecision;
  /** TEST-ONLY trace: the lifted preview was tapped (the menu just dismisses). */
  menuPreviewTap(): void;
};

let nextGateId = 1;

/** A lift that ended this long or more before the release (touch clock) ended under a resting finger. */
export const NATIVE_MENU_LIFT_CANCELLED_BEFORE_RELEASE_MS = 0;

/** True only when both clocks are known and the lift ended before the finger left. */
export function nativeMenuLiftCancelledWhileHeld(
  endedAt: NativeContextMenuEventTime,
  release: NativeContextMenuPressTime | undefined,
): boolean {
  if (typeof endedAt !== "number" || typeof release?.native !== "number") return false;
  return release.native - endedAt > NATIVE_MENU_LIFT_CANCELLED_BEFORE_RELEASE_MS;
}

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
  // Touch-clock time of that end, when the native view stamped it.
  let endedWithoutMenuAt: NativeContextMenuEventTime;
  let pending: { press: () => void; timer: unknown; release: NativeContextMenuPressTime } | null = null;

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
      endedWithoutMenuAt = undefined;
      traceNativeMenuPressIn(id, time.native);
    },
    longPress() {
      suppressed = true;
      traceNativeMenuEvent(id, "RN long-press timer");
    },
    menuConfigure(at) {
      configured = true;
      traceNativeMenuEvent(id, "menu configure", at);
      // A short wait for a late configure now waits for the real verdict.
      if (pending) {
        scheduler.clear(pending.timer);
        pending.timer = scheduler.set(() => settleUnlessMenu("verdict cap"), NATIVE_MENU_PRESS_VERDICT_CAP_MS);
      }
    },
    menuWillDisplay(at) {
      menuVisible = true;
      suppressed = true;
      traceNativeMenuEvent(id, "menu willDisplay", at);
      settle("suppress", "menu shown");
    },
    menuWillEnd(at, active) {
      const shown = menuVisible;
      menuVisible = false;
      if (!shown && !suppressed) {
        endedWithoutMenu = true;
        endedWithoutMenuAt = at;
      }
      traceNativeMenuEvent(id, active ? `menu willEnd (active: ${active})` : "menu willEnd", at);
      if (!shown && pending && nativeMenuLiftCancelledWhileHeld(at, pending.release)) {
        // The release reached JS first, but UIKit had cancelled the lift
        // under the finger before it left: a moved or claimed hold, not a tap.
        suppressed = true;
        settle("suppress", "lift cancelled while held");
        return;
      }
      settleUnlessMenu(shown ? "menu ended" : "lift ended by the release");
    },
    resolvePress(time, press) {
      const decision = decide(time);
      traceNativeMenuEvent(id, `onPress -> ${decision}`, time.native);
      if (decision === "fire") press();
      else if (decision === "defer") {
        settleUnlessMenu("superseded");
        const wait = configured ? NATIVE_MENU_PRESS_VERDICT_CAP_MS : NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS;
        pending = {
          press,
          release: time,
          timer: scheduler.set(() => settleUnlessMenu(configured ? "verdict cap" : "no configure"), wait),
        };
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
    // UIKit cancelled the lift while the finger was still down (it drifted
    // past the interaction's allowance, or a scroll view's pan began): the
    // touch was neither the menu's long press nor a tap — as a native list
    // never selects a cell its scroll or a cancelled lift took over.
    if (endedWithoutMenu && nativeMenuLiftCancelledWhileHeld(endedWithoutMenuAt, time)) {
      suppressed = true;
      return "suppress";
    }
    if (held < NATIVE_MENU_PRESS_DEFER_FROM_MS) return "fire";
    // The lift already ended (willEnd reached JS first, not stamped before
    // the release — the release itself ended it): no menu is coming.
    return endedWithoutMenu ? "fire" : "defer";
  }
}

/** `uptime` (ms, touch clock) of a native menu event; undefined from an older binary. */
export function nativeContextMenuEventTime(event: unknown): NativeContextMenuEventTime {
  const uptime = (event as { nativeEvent?: { uptime?: unknown } } | null | undefined)?.nativeEvent?.uptime;
  return typeof uptime === "number" && Number.isFinite(uptime) ? uptime : undefined;
}

/** TEST-ONLY trace: the recognizers running when the menu ended (empty from an older binary). */
export function nativeContextMenuEventActive(event: unknown): string | undefined {
  const active = (event as { nativeEvent?: { active?: unknown } } | null | undefined)?.nativeEvent?.active;
  return typeof active === "string" && active.length > 0 ? active : undefined;
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
