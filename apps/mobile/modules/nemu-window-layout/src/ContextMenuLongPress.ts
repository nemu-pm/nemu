import { createContext, useContext } from "react";

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
 *
 * And a long hold is never a tap, whatever order the events reach JS in:
 * UIKit presents the menu at the release once the hold passed its own commit
 * point (~420-430 ms on the Duo, build 9 r3: willDisplay lands with the
 * release), and a release just short of it ends the lift without a display —
 * the same willEnd a tap gets (r3 bgfgB3 #29: 425 ms, configure at 166,
 * willEnd with the release, the book opened). So a hold whose interaction
 * began (`configure`) and that lasted past `NATIVE_MENU_CONFIGURED_TAP_MAX_MS`
 * is dropped at the release, and one past `NATIVE_MENU_LONG_PRESS_MS` always.
 */

/** A hold this long in a menu-owned pressable is never a tap (UIKit's own menu threshold). */
export const NATIVE_MENU_LONG_PRESS_MS = 500;
/** Shorter holds press at once: the system menu cannot be up yet. */
export const NATIVE_MENU_PRESS_DEFER_FROM_MS = 250;
/**
 * A hold this long whose interaction had begun (`configure`) is never a tap:
 * past it UIKit's lift is well under way and a release lands at or near its
 * menu commit point, whether or not the menu then displays.
 */
export const NATIVE_MENU_CONFIGURED_TAP_MAX_MS = 350;
/**
 * Product rule (build 9 r4): a press held this long (touch clock, else the
 * JS clock) never opens at its release — with or without `configure` or any
 * menu event, in any order. A drag of 12-14 pt in the first ~150 ms keeps
 * UIKit from configuring the menu at all, and the "no configure: a tap after
 * a short wait" path then opened 370-404 ms holds (r4: 15/24).
 */
export const NATIVE_MENU_TAP_MAX_MS = 350;
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
 * A touch whose finger moved farther than this from where it landed, at any
 * point before the release, is a swipe, not a tap (UIKit's own tap
 * tolerance): its release never opens. Pressability only cancels a press
 * that leaves the pressable's rect plus its retention offset (20 pt), and
 * UIKit's menu lift needs ~150 ms to begin, so a quick 12-14 pt swipe
 * (~120 ms) slipped through both and opened the title (build 9 r4 driftQ).
 */
export const NATIVE_MENU_TAP_SLOP_PT = 10;

/**
 * The menu's events carry `uptime`: the main thread's clock in ms when UIKit
 * called the delegate (`systemUptime`, the clock of `nativeEvent.timestamp`).
 */
export type NativeContextMenuEventTime = number | undefined;

export type NativeContextMenuPressDecision = "fire" | "suppress" | "defer";

/**
 * The touch clock (`nativeEvent.timestamp`) when present, else the JS clock;
 * `x`/`y`: the touch's window position (`pageX`/`pageY`) when reported.
 */
export type NativeContextMenuPressTime = { native?: number; wall: number; x?: number; y?: number };

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
  /** The finger moved (`onTouchMove`): tracks the farthest it got from where it landed. */
  pressMove(point: NativeContextMenuPressTime): void;
  /** Pressability's long-press timer fired for this sequence. */
  longPress(): void;
  /** The interaction asked for its menu (`configurationForMenuAtLocation`): a lift may follow. */
  menuConfigure(at?: NativeContextMenuEventTime): void;
  /** The system menu is presenting (`willDisplayMenuFor`). */
  menuWillDisplay(at?: NativeContextMenuEventTime): void;
  /**
   * The interaction ended (`willEndFor`): after a display, or a lift without
   * one — ended by the release (a tap) or cancelled while the finger was down
   * (it moved, or a scroll view's pan claimed it).
   */
  menuWillEnd(at?: NativeContextMenuEventTime): void;
  /**
   * At release: `press` runs now ("fire"), never ("suppress"), or once the
   * menu's verdict says no menu came ("defer").
   */
  resolvePress(time: NativeContextMenuPressTime, press: () => void): NativeContextMenuPressDecision;
};

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

/**
 * Without the touch-clock stamp (a binary whose menu events carry none, as
 * build 9 r3's did): a willEnd that reached JS this long before the release
 * ended under a resting finger. A lift the release ended reaches JS with the
 * release (0-1 ms apart, r3 quick taps); a cancelled one, 300+ ms earlier.
 */
export const NATIVE_MENU_UNSTAMPED_CANCEL_BEFORE_RELEASE_MS = 50;

function heldFor(from: NativeContextMenuPressTime, to: NativeContextMenuPressTime): number {
  if (typeof from.native === "number" && typeof to.native === "number") return to.native - from.native;
  return to.wall - from.wall;
}

export function createNativeContextMenuPressGate(
  scheduler: NativeContextMenuPressScheduler = defaultScheduler,
  now: () => number = Date.now,
): NativeContextMenuPressGate {
  let pressInAt: NativeContextMenuPressTime | null = null;
  // Farthest the finger got from its landing point this sequence (pt).
  let maxMoved = 0;
  const movedFrom = (point: NativeContextMenuPressTime | undefined) => {
    const start = pressInAt;
    if (!start || !point) return;
    if (typeof start.x !== "number" || typeof start.y !== "number") return;
    if (typeof point.x !== "number" || typeof point.y !== "number") return;
    maxMoved = Math.max(maxMoved, Math.hypot(point.x - start.x, point.y - start.y));
  };
  // Once a sequence turned into a long press it stays one until the next pressIn.
  let suppressed = false;
  let menuVisible = false;
  // This sequence's interaction: asked for a menu / ended without showing one.
  let configured = false;
  let endedWithoutMenu = false;
  // Touch-clock time of that end, when the native view stamped it.
  let endedWithoutMenuAt: NativeContextMenuEventTime;
  // JS clock when that unstamped end reached JS.
  let endedWithoutMenuWall: number | undefined;
  // How long the hold being resolved lasted (touch clock when known).
  let releasedHeld = 0;
  let pending: { press: () => void; timer: unknown; release: NativeContextMenuPressTime; held: number } | null = null;

  const settle = (verdict: "fire" | "suppress") => {
    const waiting = pending;
    if (!waiting) return;
    pending = null;
    scheduler.clear(waiting.timer);
    if (verdict === "fire") waiting.press();
  };
  // A deferred release whose hold turned out long (its configure reached JS
  // after the release) is dropped whatever ends the wait.
  const pendingIsLongHold = () => !!pending && configured && pending.held > NATIVE_MENU_CONFIGURED_TAP_MAX_MS;
  const settleUnlessMenu = () => {
    if (!suppressed && !menuVisible && pendingIsLongHold()) {
      suppressed = true;
      settle("suppress");
      return;
    }
    settle(suppressed || menuVisible ? "suppress" : "fire");
  };

  return {
    pressIn(time) {
      // The previous touch's interaction is over once a new touch lands.
      settleUnlessMenu();
      pressInAt = time;
      maxMoved = 0;
      suppressed = menuVisible;
      configured = false;
      endedWithoutMenu = false;
      endedWithoutMenuAt = undefined;
      endedWithoutMenuWall = undefined;
    },
    pressMove(point) {
      movedFrom(point);
    },
    longPress() {
      suppressed = true;
    },
    menuConfigure(at) {
      configured = true;
      if (pendingIsLongHold()) {
        settleUnlessMenu();
        return;
      }
      // A short wait for a late configure now waits for the real verdict.
      if (pending) {
        scheduler.clear(pending.timer);
        pending.timer = scheduler.set(() => settleUnlessMenu(), NATIVE_MENU_PRESS_VERDICT_CAP_MS);
      }
    },
    menuWillDisplay(at) {
      menuVisible = true;
      suppressed = true;
      settle("suppress");
    },
    menuWillEnd(at) {
      const shown = menuVisible;
      menuVisible = false;
      if (!shown && !suppressed) {
        endedWithoutMenu = true;
        endedWithoutMenuAt = at;
        endedWithoutMenuWall = typeof at === "number" ? undefined : now();
      }
      if (!shown && pending && nativeMenuLiftCancelledWhileHeld(at, pending.release)) {
        // The release reached JS first, but UIKit had cancelled the lift
        // under the finger before it left: a moved or claimed hold, not a tap.
        suppressed = true;
        settle("suppress");
        return;
      }
      settleUnlessMenu();
    },
    resolvePress(time, press) {
      const decision = decide(time);
      if (decision === "fire") press();
      else if (decision === "defer") {
        settleUnlessMenu();
        const wait = configured ? NATIVE_MENU_PRESS_VERDICT_CAP_MS : NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS;
        pending = {
          press,
          release: time,
          held: releasedHeld,
          timer: scheduler.set(() => settleUnlessMenu(), wait),
        };
      }
      return decision;
    },
  };

  function decide(time: NativeContextMenuPressTime): NativeContextMenuPressDecision {
    movedFrom(time);
    const startedAt = pressInAt;
    pressInAt = null;
    releasedHeld = startedAt ? heldFor(startedAt, time) : 0;
    if (suppressed || menuVisible) return "suppress";
    // No touch sequence (accessibility activation): a plain press.
    if (!startedAt) return "fire";
    const held = releasedHeld;
    // Moved past the tap tolerance before the release: a swipe, never a tap.
    if (maxMoved > NATIVE_MENU_TAP_SLOP_PT) {
      suppressed = true;
      return "suppress";
    }
    if (held >= NATIVE_MENU_TAP_MAX_MS) {
      suppressed = true;
      return "suppress";
    }
    // UIKit cancelled the lift while the finger was still down (it drifted
    // past the interaction's allowance, or a scroll view's pan began): the
    // touch was neither the menu's long press nor a tap — as a native list
    // never selects a cell its scroll or a cancelled lift took over.
    if (
      endedWithoutMenu &&
      (nativeMenuLiftCancelledWhileHeld(endedWithoutMenuAt, time) ||
        (endedWithoutMenuWall !== undefined &&
          time.wall - endedWithoutMenuWall >= NATIVE_MENU_UNSTAMPED_CANCEL_BEFORE_RELEASE_MS))
    ) {
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

export function nativeContextMenuPressTime(event: unknown): NativeContextMenuPressTime {
  const nativeEvent = (event as { nativeEvent?: { timestamp?: unknown; pageX?: unknown; pageY?: unknown } } | null | undefined)
    ?.nativeEvent;
  const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  const time: NativeContextMenuPressTime = { native: finite(nativeEvent?.timestamp), wall: Date.now() };
  const x = finite(nativeEvent?.pageX);
  const y = finite(nativeEvent?.pageY);
  if (x !== undefined && y !== undefined) {
    time.x = x;
    time.y = y;
  }
  return time;
}

/** The gate of the enclosing native context menu; null outside one. */
export const NativeContextMenuLongPressContext = createContext<NativeContextMenuPressGate | null>(null);

export function useNativeContextMenuPressGate(): NativeContextMenuPressGate | null {
  return useContext(NativeContextMenuLongPressContext);
}

export function useNativeContextMenuOwnsLongPress(): boolean {
  return useContext(NativeContextMenuLongPressContext) !== null;
}
