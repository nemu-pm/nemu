import { useEffect, useState } from "react";
import {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  isLaunchRevealPending,
  prepareLaunchReveal,
  startLaunchReveal,
} from "../../modules/nemu-window-layout";
import { MOBILE_PERFORMANCE_MARKS, markMobilePerformance } from "@/lib/mobilePerformance";
import {
  getMobileLaunchRevealGroupDelay,
  MOBILE_LAUNCH_REVEAL,
  resolveMobileLaunchRevealMode,
  type MobileLaunchRevealGroup,
} from "@/lib/mobileLaunchRevealPlan";

/** "pending" under the launch screen; "running" once the reveal starts; "done" otherwise. */
type MobileLaunchRevealPhase = "pending" | "running" | "done";

let phase: MobileLaunchRevealPhase = isLaunchRevealPending() ? "pending" : "done";
const listeners = new Set<() => void>();

function setPhase(next: MobileLaunchRevealPhase) {
  if (phase === next) return;
  phase = next;
  for (const listener of [...listeners]) listener();
}

/**
 * The longest a fade reveal holds the launch screen for the veils to come
 * off (`afterUiFrames`): a stuck UI thread must never hold the launch.
 */
const FADE_VEIL_SETTLE_CAP_MS = 600;

/**
 * Resolves once the UI thread has drawn `frames` frames after everything
 * already scheduled on it (a shared-value write from JS included), or after
 * `capMs`.
 */
function afterUiFrames(frames: number, capMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(cap);
      resolve();
    };
    const cap = setTimeout(done, capMs);
    runOnUI((left: number) => {
      "worklet";
      const tick = (remaining: number) => {
        if (remaining <= 0) {
          runOnJS(done)();
          return;
        }
        requestAnimationFrame(() => tick(remaining - 1));
      };
      tick(left);
    })(frames);
  });
}

/**
 * Hides the launch screen with the reveal (see `mobileLaunchRevealPlan.ts`):
 * the window takes its start state natively while the launch screen still
 * covers it, the launch screen goes, then the native scale / bar fade and
 * the content groups' stagger start together.
 */
export async function hideMobileLaunchScreenWithReveal({
  libraryRoute,
  reduceMotion,
  background,
  hideSplash,
}: {
  libraryRoute: boolean;
  reduceMotion: boolean;
  background: string;
  hideSplash: () => Promise<void>;
}): Promise<void> {
  const mode = resolveMobileLaunchRevealMode({ pending: phase === "pending", libraryRoute, reduceMotion });
  if (!mode) {
    setPhase("done");
    await hideSplash();
    return;
  }
  const prepared = await prepareLaunchReveal(mode, background);
  markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootReveal, { mode, prepared });
  // Only the full reveal staggers the content; otherwise it is in place
  // before the launch screen goes.
  if (!prepared || mode === "fade") setPhase("done");
  // Fade: the groups' veils come off on the UI thread, which is busiest
  // right at launch; hiding the launch screen at once let the window fade in
  // (natively, off that thread) with the content still veiled, which then
  // popped in a few hundred ms later. Hold until the veils are off.
  if (prepared && mode === "fade") await afterUiFrames(2, FADE_VEIL_SETTLE_CAP_MS);
  try {
    await hideSplash();
  } finally {
    if (prepared) {
      if (mode === "full") setPhase("running");
      startLaunchReveal();
    }
    if (phase === "pending") setPhase("done");
  }
}

/**
 * One content group of the Library's launch reveal: hidden and 12pt low
 * under the launch screen, fading and rising into place in its turn once the
 * reveal runs. Anything mounted later, or on a warm start, is in place.
 * The fade is a page-coloured veil over the group fading out, not the
 * group's own opacity: native Liquid Glass inside (the folders' fronts) never
 * renders under an ancestor's opacity animation.
 */
export function useMobileLaunchRevealGroup(group: MobileLaunchRevealGroup) {
  const [initial] = useState(() => phase);
  const progress = useSharedValue(initial === "pending" ? 0 : 1);
  useEffect(() => {
    if (initial !== "pending") return;
    const run = () => {
      if (phase === "running") {
        progress.value = withDelay(
          getMobileLaunchRevealGroupDelay(group),
          withTiming(1, {
            duration: MOBILE_LAUNCH_REVEAL.groupDurationMs,
            easing: Easing.bezier(...MOBILE_LAUNCH_REVEAL.groupEasing),
          }),
        );
      } else if (phase === "done") {
        progress.value = 1;
      }
    };
    run();
    listeners.add(run);
    return () => {
      listeners.delete(run);
    };
  }, [group, initial, progress]);
  const rise = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * MOBILE_LAUNCH_REVEAL.groupRise }],
  }));
  const veil = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  return { rise, veil, initiallyHidden: initial === "pending" };
}
