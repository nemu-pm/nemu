import { useCallback, useEffect, useRef } from "react";
import {
  AppState,
  Platform,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import {
  markMobileAidokuPrewarmStarted,
  NEMU_AIDOKU_PREWARM_ENABLED,
  noteMobileTouches,
  noteMobileUserActivity,
  readMobileAidokuPrewarmNotes,
  resolveMobileAidokuPrewarmStep,
  subscribeMobileUserActivity,
} from "@/lib/mobileAidokuPrewarm";

const prewarmActive = NEMU_AIDOKU_PREWARM_ENABLED && Platform.OS === "ios";

function noteRootTouches(event: GestureResponderEvent) {
  noteMobileTouches(event.nativeEvent.touches?.length ?? 0);
}

/**
 * Spread on the app's root view: every touch start / end / cancel is user
 * activity for the pre-warm's idle check. Empty while the pre-warm is off.
 */
export const mobileAidokuPrewarmRootTouchProps = prewarmActive
  ? {
      onTouchStart: noteRootTouches,
      onTouchEnd: noteRootTouches,
      onTouchCancel: noteRootTouches,
    }
  : {};

/**
 * The Library's list scroll handler, also noting each scroll (and momentum)
 * event as user activity while the pre-warm is on. `onScroll` itself when off.
 */
export function useMobileAidokuPrewarmScrollFeed(
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
): (event: NativeSyntheticEvent<NativeScrollEvent>) => void {
  const fed = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      noteMobileUserActivity();
      onScroll(event);
    },
    [onScroll],
  );
  return prewarmActive ? fed : onScroll;
}

/**
 * Mounted by the Library: once per process, when the app has been idle on the
 * Library (see `resolveMobileAidokuPrewarmStep`), asks native to boot the
 * Aidoku sandbox. Never blocks JS; a failure (main stayed busy, the boot
 * failed, an older native build) does nothing. Off unless
 * NEMU_AIDOKU_PREWARM_ENABLED.
 */
export function useMobileAidokuSandboxPrewarm() {
  const firstPaintAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!prewarmActive) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };
    const start = () => {
      const prewarm = NemuAidokuModule.prewarmAidokuSandbox;
      if (typeof prewarm !== "function") return;
      markMobileAidokuPrewarmStarted();
      const requestedAt = Date.now();
      console.info("[aidoku-warm] prewarm requested", {
        sinceFirstPaintMs:
          firstPaintAtRef.current == null ? null : requestedAt - firstPaintAtRef.current,
      });
      try {
        void prewarm.call(NemuAidokuModule).then(
          (status: string) => {
            console.info("[aidoku-warm] prewarm resolved", {
              status,
              ms: Date.now() - requestedAt,
            });
          },
          (error: unknown) => {
            console.info("[aidoku-warm] prewarm skipped", {
              detail: error instanceof Error ? error.message : String(error),
              ms: Date.now() - requestedAt,
            });
          },
        );
      } catch {
        // An older native build: nothing to warm.
      }
    };
    const evaluate = () => {
      if (stopped) return;
      clearTimer();
      const notes = readMobileAidokuPrewarmNotes();
      const step = resolveMobileAidokuPrewarmStep({
        enabled: NEMU_AIDOKU_PREWARM_ENABLED,
        platform: Platform.OS,
        nativeAvailable: typeof NemuAidokuModule.prewarmAidokuSandbox === "function",
        started: notes.started,
        readerOpened: notes.readerOpened,
        appActive: AppState.currentState === "active",
        libraryFocused: notes.libraryFocused,
        firstPaintAt: firstPaintAtRef.current,
        lastActivityAt: notes.lastActivityAt,
        touching: notes.touching,
        now: Date.now(),
      });
      if (step.kind === "wait") timer = setTimeout(evaluate, step.ms);
      else if (step.kind === "start") start();
      else if (step.kind === "never") stop();
      // "blocked": the next touch, focus or app-state change asks again.
    };
    const unsubscribeActivity = subscribeMobileUserActivity(evaluate);
    const appState = AppState.addEventListener("change", evaluate);
    // The Library's first painted frame.
    const frame = requestAnimationFrame(() => {
      if (firstPaintAtRef.current == null) firstPaintAtRef.current = Date.now();
      evaluate();
    });
    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
      unsubscribeActivity();
      appState.remove();
    }
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, []);
}
