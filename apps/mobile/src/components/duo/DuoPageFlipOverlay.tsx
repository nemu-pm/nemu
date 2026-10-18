/**
 * DuoPageFlipOverlay + useDuoPageFlip — optional half-page flip around the
 * fold for two-page spreads (real-book spine, part 2).
 *
 * How the gallery uses it (see duo-signature-integration.md):
 * 1. On a single-step page turn in a spread, gate with
 *    `shouldAnimateMobileDuoPageFlip({ reduceMotion, spread, zoomed, step })`.
 * 2. Call `start({ plan, panes, outgoing, incoming, under })` BEFORE jumping
 *    the pager to the new spread without its own scroll animation. `outgoing`
 *    is the old page on the lifting side, `under` the old page on the landing
 *    side, `incoming` the new page on the landing side (e.g.
 *    `renderImage(page)` — images are already cached). `start` returns false
 *    when Reduce Motion is on; then just page normally.
 * 3. Render `<DuoPageFlipOverlay flip={flip} onFinished={finish} />` as an
 *    absolute-fill sibling above the spread.
 *
 * Only `transform` (rotateY with perspective, pivoting on the spine edge) and
 * `opacity` animate, driven by one shared value on the UI thread
 * (`withTiming` + the `mobileDuoPageFlipFrame` worklet) — no per-frame JS, no
 * layout. The overlay is non-interactive and hidden from accessibility (the
 * page change itself is what VoiceOver reports).
 *
 * Props (`DuoPageFlipOverlay`):
 * - `flip`: the active request from `useDuoPageFlip`, or null.
 * - `onFinished(id)`: called on the JS thread when the flip completes.
 * - `durationMs`: default `MOBILE_DUO_PAGE_FLIP_DURATION_MS` (460 ms).
 * - `paused`: hold the leaves invisible at frame 0 (e.g. until the static
 *   page copies have decoded, so no leaf is ever drawn blank over the real
 *   spread). The animation starts when it turns false.
 * - `onStart(id)`: called once the leaves are visible and moving — the moment
 *   the reader should jump the pager to the new spread.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  MOBILE_DUO_PAGE_FLIP_DURATION_MS,
  mobileDuoPageFlipFrame,
} from "@/lib/mobileDuoSpine";
import type { DuoPageFlipRequest } from "./useDuoPageFlip";

function rectStyle(rect: WindowLayoutRect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

export function DuoPageFlipOverlay({
  flip,
  onFinished,
  durationMs = MOBILE_DUO_PAGE_FLIP_DURATION_MS,
  paused = false,
  onStart,
}: {
  flip: DuoPageFlipRequest | null;
  onFinished: (id: number) => void;
  durationMs?: number;
  paused?: boolean;
  onStart?: (id: number) => void;
}) {
  if (!flip) return null;
  return (
    <DuoPageFlipLayers
      key={flip.id}
      flip={flip}
      onFinished={onFinished}
      durationMs={durationMs}
      paused={paused}
      onStart={onStart}
    />
  );
}

function DuoPageFlipLayers({
  flip,
  onFinished,
  durationMs,
  paused,
  onStart,
}: {
  flip: DuoPageFlipRequest;
  onFinished: (id: number) => void;
  durationMs: number;
  paused: boolean;
  onStart?: (id: number) => void;
}) {
  const progress = useSharedValue(0);
  const { plan, id } = flip;

  useEffect(() => {
    if (paused) return;
    onStart?.(id);
    progress.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onFinished)(id);
      },
    );
    // `onStart` is a notification; a new identity must not restart the leaf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, id, onFinished, paused, progress]);

  const outgoingStyle = useAnimatedStyle(() => {
    const frame = mobileDuoPageFlipFrame(progress.value, plan);
    return {
      opacity: frame.outgoingOpacity,
      transform: [{ perspective: 1400 }, { rotateY: `${frame.outgoingDeg}deg` }],
    };
  });
  const incomingStyle = useAnimatedStyle(() => {
    const frame = mobileDuoPageFlipFrame(progress.value, plan);
    return {
      opacity: frame.incomingOpacity,
      transform: [{ perspective: 1400 }, { rotateY: `${frame.incomingDeg}deg` }],
    };
  });
  const underStyle = useAnimatedStyle(() => ({
    opacity: mobileDuoPageFlipFrame(progress.value, plan).underOpacity,
  }));
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: mobileDuoPageFlipFrame(progress.value, plan).leafShade,
  }));

  const outgoingRect = flip.panes[plan.outgoingSide];
  const incomingRect = flip.panes[plan.incomingSide];
  const backgroundColor = flip.backgroundColor ?? "#000000";

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, paused ? styles.hidden : null]}
    >
      {flip.under ? (
        <Animated.View style={[styles.layer, rectStyle(incomingRect), { backgroundColor }, underStyle]}>
          {flip.under}
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          styles.layer,
          rectStyle(incomingRect),
          { backgroundColor, transformOrigin: plan.incomingOrigin === "left" ? "left center" : "right center" },
          incomingStyle,
        ]}
      >
        {flip.incoming}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]} />
      </Animated.View>
      <Animated.View
        style={[
          styles.layer,
          rectStyle(outgoingRect),
          { backgroundColor, transformOrigin: plan.outgoingOrigin === "left" ? "left center" : "right center" },
          outgoingStyle,
        ]}
      >
        {flip.outgoing}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
  },
  shade: {
    backgroundColor: "#000000",
  },
  hidden: {
    opacity: 0,
  },
});
