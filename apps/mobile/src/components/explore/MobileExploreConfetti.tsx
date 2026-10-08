import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, View, type ViewInstance } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  createMobileConfetti,
  MOBILE_CONFETTI,
  MOBILE_CONFETTI_DURATION_S,
  MOBILE_CONFETTI_TERMINAL,
} from "@/lib/mobileExploreConfetti";

type Burst = { key: number; x: number; y: number; width: number };

/** Far pieces are a little fainter, so the cloud has depth. */
const DEPTH_ALPHA = [0.72, 0.92, 1] as const;
/** The back of a piece of paper, turned toward the viewer: this much of its colour. */
const BACK_SHADE = 0.66;

function rgbaOf(color: string): [number, number, number, number] {
  const value = Skia.Color(color);
  return [value[0] ?? 1, value[1] ?? 1, value[2] ?? 1, value[3] ?? 1];
}

/**
 * Paper confetti in the cover's colours, thrown up from the view it sits in
 * (the In Library pill) when `burstKey` changes. Drawn in a window-level
 * layer, so it flies over the facts, the synopsis and the bars rather than
 * behind the next block on the page; it takes no touches and is not a
 * VoiceOver element. Never on the first render; nothing under Reduce Motion
 * (the pill's pop alone marks the moment).
 */
export function MobileExploreConfetti({
  burstKey,
  colors,
}: {
  burstKey: number;
  colors: readonly string[];
  /** Kept for callers: the pieces spread along the measured view instead. */
  width?: number;
}) {
  const reducedMotion = useReducedMotion();
  const anchor = useRef<ViewInstance>(null);
  const first = useRef(burstKey);
  const [burst, setBurst] = useState<Burst | null>(null);
  useEffect(() => {
    if (burstKey === first.current || reducedMotion) return;
    anchor.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0)) return;
      setBurst({ key: burstKey, x: x + width / 2, y: y + height / 2, width });
    });
  }, [burstKey, reducedMotion]);
  return (
    <>
      <View ref={anchor} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
      {burst ? (
        <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
          <ConfettiCanvas
            key={burst.key}
            burst={burst}
            colors={colors}
            onDone={() => setBurst((current) => (current?.key === burst.key ? null : current))}
          />
        </FullWindowOverlay>
      ) : null}
    </>
  );
}

function ConfettiCanvas({
  burst,
  colors,
  onDone,
}: {
  burst: Burst;
  colors: readonly string[];
  onDone: () => void;
}) {
  const pieces = useMemo(() => createMobileConfetti(burst.key * 104729 + 7, colors.length), [burst.key, colors.length]);
  // Per piece: front colour, back colour (RGBA, 0…1), depth alpha.
  const paint = useMemo(() => {
    const front: number[] = [];
    const back: number[] = [];
    for (const piece of pieces) {
      const [r, g, b, a] = rgbaOf(colors[piece.color] ?? "#ffffff");
      front.push(r, g, b, a * DEPTH_ALPHA[piece.depth]);
      back.push(r * BACK_SHADE, g * BACK_SHADE, b * BACK_SHADE, a * DEPTH_ALPHA[piece.depth]);
    }
    return { front, back };
  }, [colors, pieces]);
  const screen = Dimensions.get("window");
  const time = useSharedValue(0);
  useEffect(() => {
    time.value = withTiming(
      MOBILE_CONFETTI_DURATION_S,
      { duration: MOBILE_CONFETTI_DURATION_S * 1000, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [onDone, time]);

  const k = MOBILE_CONFETTI.drag;
  const terminal = MOBILE_CONFETTI_TERMINAL;
  const spread = burst.width * 0.7;
  const picture = useDerivedValue(() => {
    const t = time.value;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, screen.width, screen.height));
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const decay = Math.exp(-k * t);
    const travel = (1 - decay) / k;
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]!;
      if (t >= piece.life) continue;
      // Same motion as getMobileConfettiFrame (tested there).
      const x =
        burst.x +
        piece.origin * spread +
        piece.vx * travel +
        piece.sway * Math.sin(piece.swayPhase + Math.PI * 2 * piece.swayRate * t) * (1 - decay);
      const y = burst.y + terminal * t + (piece.vy - terminal) * travel;
      const age = t / piece.life;
      const opacity = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.2;
      const turn = Math.cos(piece.phase + Math.PI * 2 * piece.flip * t);
      // Lit face-on, darker as it turns edge-on; the back is a shade darker still.
      const light = 0.78 + 0.22 * Math.abs(turn);
      const tone = turn >= 0 ? paint.front : paint.back;
      const at = index * 4;
      fill.setColor(
        Float32Array.of(tone[at]! * light, tone[at + 1]! * light, tone[at + 2]! * light, tone[at + 3]! * opacity),
      );
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(((piece.angle + piece.spin * t) * 180) / Math.PI, 0, 0);
      canvas.scale(1, Math.max(0.06, Math.abs(turn)));
      if (piece.shape === "disc") {
        canvas.drawCircle(0, 0, piece.width / 2, fill);
      } else {
        canvas.drawRRect(
          Skia.RRectXY(Skia.XYWHRect(-piece.width / 2, -piece.length / 2, piece.width, piece.length), 1.2, 1.2),
          fill,
        );
      }
      canvas.restore();
    }
    return recorder.finishRecordingAsPicture();
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
