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
/** Longer holds wait this long for a late `willDisplay` before pressing. */
export const NATIVE_MENU_PRESS_DEFER_MS = 150;

export type NativeContextMenuPressDecision = "fire" | "suppress" | "defer";

/** The touch clock (`nativeEvent.timestamp`) when present, else the JS clock. */
export type NativeContextMenuPressTime = { native?: number; wall: number };

export type NativeContextMenuPressGate = {
  /** A new touch sequence: clears the previous sequence's suppression. */
  pressIn(time: NativeContextMenuPressTime): void;
  /** Pressability's long-press timer fired for this sequence. */
  longPress(): void;
  /** The system menu is presenting (`willDisplayMenuFor`). */
  menuWillDisplay(): void;
  /** The system menu is going away (`willEndFor`). */
  menuWillEnd(): void;
  /** At release: press, drop, or wait for a late menu signal. */
  resolvePress(time: NativeContextMenuPressTime): NativeContextMenuPressDecision;
  /** After `NATIVE_MENU_PRESS_DEFER_MS` for a deferred press. */
  resolveDeferredPress(): "fire" | "suppress";
  /** TEST-ONLY trace: the interaction asked for its menu (the hold began lifting). */
  menuConfigure(): void;
  /** TEST-ONLY trace: the lifted preview was tapped (the menu just dismisses). */
  menuPreviewTap(): void;
};

let nextGateId = 1;

function heldFor(from: NativeContextMenuPressTime, to: NativeContextMenuPressTime): number {
  if (typeof from.native === "number" && typeof to.native === "number") return to.native - from.native;
  return to.wall - from.wall;
}

export function createNativeContextMenuPressGate(): NativeContextMenuPressGate {
  const id = nextGateId++;
  let pressInAt: NativeContextMenuPressTime | null = null;
  // Once a sequence turned into a long press it stays one until the next pressIn.
  let suppressed = false;
  let menuVisible = false;
  return {
    pressIn(time) {
      pressInAt = time;
      suppressed = menuVisible;
      traceNativeMenuPressIn(id, time.native);
    },
    longPress() {
      suppressed = true;
      traceNativeMenuEvent(id, "RN long-press timer");
    },
    menuWillDisplay() {
      menuVisible = true;
      suppressed = true;
      traceNativeMenuEvent(id, "menu willDisplay");
    },
    menuWillEnd() {
      menuVisible = false;
      traceNativeMenuEvent(id, "menu willEnd");
    },
    resolvePress(time) {
      const decision = decide(time);
      traceNativeMenuEvent(id, `onPress -> ${decision}`, time.native);
      return decision;
    },
    resolveDeferredPress() {
      const decision = suppressed || menuVisible ? "suppress" : "fire";
      traceNativeMenuEvent(id, `deferred onPress -> ${decision}`);
      return decision;
    },
    menuConfigure() {
      traceNativeMenuEvent(id, "menu configure");
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
    return held >= NATIVE_MENU_PRESS_DEFER_FROM_MS ? "defer" : "fire";
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
