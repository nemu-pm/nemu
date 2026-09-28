import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import {
  mobilePoseVeilRevealAt,
  MOBILE_MOTION,
  type MobilePoseVeilPlan,
} from "@/lib/mobileMotion";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const REVEAL_EASING = Easing.out(Easing.cubic);

/**
 * The root pose veil: a frosted layer (iOS: blur + page-background tint;
 * Android: a denser background wash, no blur) that appears with the new
 * layout and reveals it once the app has re-measured. It never takes touches
 * and is hidden from accessibility. Opacity/intensity animate on the UI
 * thread; JS only schedules the reveal (two frames + the plan's hold) and
 * unmounts the veil when it is done.
 *
 * `token` increments when another change arrives during a session: the veil
 * returns to its peak and waits for that change to settle too, within the
 * session's hard cap (`MOBILE_MOTION.veilMaxHoldMs`).
 */
export function MobilePoseVeil({
  session,
  token,
  plan,
  tintColor,
  blurTint,
  onDone,
}: {
  session: number;
  token: number;
  plan: MobilePoseVeilPlan;
  /** Wash colour override (default: the theme's page background). */
  tintColor?: string;
  /** Blur material override (default: the app appearance). */
  blurTint?: "light" | "dark";
  onDone: (session: number) => void;
}) {
  const { tokens, scheme } = useNemuTheme();
  const rampIn = plan.fadeInMs > 0;
  const tint = useSharedValue(rampIn ? 0 : plan.tintOpacity);
  const blur = useSharedValue(rampIn ? 0 : plan.blurIntensity);
  // Session start, fixed at mount (the veil remounts per session).
  const [sessionStart] = useState(() => Date.now());
  const planRef = useRef(plan);
  useLayoutEffect(() => {
    planRef.current = plan;
  });

  useEffect(() => {
    const current = planRef.current;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rampMs = token === 0 ? current.fadeInMs : MOBILE_MOTION.blurInMs;
    cancelAnimation(tint);
    cancelAnimation(blur);
    if (rampMs > 0) {
      tint.value = withTiming(current.tintOpacity, { duration: rampMs });
      blur.value = withTiming(current.blurIntensity, { duration: rampMs });
    } else {
      tint.value = current.tintOpacity;
      blur.value = current.blurIntensity;
    }
    const reveal = () => {
      const { fadeOutMs } = planRef.current;
      blur.value = withTiming(0, { duration: fadeOutMs, easing: REVEAL_EASING });
      tint.value = withTiming(0, { duration: fadeOutMs, easing: REVEAL_EASING }, (finished) => {
        if (finished) runOnJS(onDone)(session);
      });
    };
    // "Committed" = the new layout has been mounted and drawn once: wait two
    // frames (layout pass + one presented frame), then the plan's hold for
    // the follow-up measurements (measureInWindow, list remounts, scroll
    // anchor restores) — capped per session.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = null;
        const now = Date.now();
        const at = mobilePoseVeilRevealAt({
          sessionStart,
          settledAt: now,
          holdMs: Math.max(current.holdMs, rampMs),
        });
        timer = setTimeout(reveal, Math.max(0, at - now));
      });
    });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [blur, onDone, session, sessionStart, tint, token]);

  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.value }));
  const blurProps = useAnimatedProps(() => ({ intensity: blur.value }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {plan.blurIntensity > 0 ? (
        <AnimatedBlurView
          animatedProps={blurProps}
          intensity={rampIn ? 0 : plan.blurIntensity}
          tint={blurTint ?? (scheme === "dark" ? "dark" : "light")}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: tintColor ?? tokens.background }, tintStyle]}
      />
    </Animated.View>
  );
}
