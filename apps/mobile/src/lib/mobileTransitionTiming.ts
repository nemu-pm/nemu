import { AccessibilityInfo, Dimensions, LayoutAnimation, Platform, type ScaledSize } from "react-native";
import type { WindowTransitionTiming } from "../../modules/nemu-window-layout";

/**
 * The system's own timing for a window size change (a rotation, a fold or
 * unfold, a Split View resize), reported by the native module from
 * `viewWillTransition(to:with:)`: the coordinator's duration and curve. The
 * new design's layouts follow it instead of snapping or inventing a timer:
 * views that persist glide to their new frame (the cover, the rows, the
 * cards), views that appear or leave cross-fade, and the pose veil is a plain
 * cross-fade of the same length (no frosted flash). Reduce Motion: cross-fade
 * only.
 */
export const MOBILE_SYSTEM_TRANSITION_FALLBACK_MS = 400;

let timing: { durationMs: number; curve: WindowTransitionTiming["curve"]; at: number } | null = null;
let reduceMotion = false;
let installed = false;
let armedFor = "";
let lastWindow = Dimensions.get("window");

/** Duration of the latest system transition (ms), if one was reported in the last few seconds. */
export function getMobileSystemTransitionMs(): number | null {
  if (!timing || Date.now() - timing.at > 3000) return null;
  return timing.durationMs > 0 ? timing.durationMs : null;
}

function arm(width: number, height: number) {
  const key = `${Math.round(width)}x${Math.round(height)}`;
  if (key === armedFor) return;
  armedFor = key;
  const fresh = timing && Date.now() - timing.at < 3000 ? timing : null;
  const duration = fresh && fresh.durationMs > 0 ? fresh.durationMs : MOBILE_SYSTEM_TRANSITION_FALLBACK_MS;
  const type = fresh?.curve === "linear" ? "linear" : fresh?.curve === "easeIn" ? "easeIn" : fresh?.curve === "easeOut" ? "easeOut" : "easeInEaseOut";
  LayoutAnimation.configureNext({
    duration,
    create: { type, property: "opacity" },
    delete: { type, property: "opacity" },
    ...(reduceMotion ? {} : { update: { type } }),
  });
}

/** Called by the window layout provider with the native report. */
export function reportMobileSystemTransition(report: WindowTransitionTiming) {
  if (!installed) return;
  timing = { durationMs: report.durationMs, curve: report.curve, at: Date.now() };
  if (report.width !== lastWindow.width || report.height !== lastWindow.height) arm(report.width, report.height);
}

/** Installed once at start, before components subscribe to `Dimensions`, so it arms the animation ahead of the new size. */
export function installMobileSystemTransition(enabled: boolean) {
  if (installed || !enabled || Platform.OS !== "ios") return;
  installed = true;
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    reduceMotion = value;
  });
  AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
    reduceMotion = value;
  });
  Dimensions.addEventListener("change", ({ window }: { window: ScaledSize }) => {
    const changed = window.width !== lastWindow.width || window.height !== lastWindow.height;
    lastWindow = window;
    if (changed) arm(window.width, window.height);
  });
}
