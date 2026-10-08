import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useIsFocused } from "expo-router";
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  buildMobileCoverMeshColors,
  isMobileCoverMeshFlat,
  MOBILE_COVER_MESH_LOOP,
  MOBILE_COVER_MESH_REACH,
  mobileCoverMeshUniformColor,
} from "@/lib/mobileCoverMesh";
import type { MobileCoverRgb } from "@/lib/mobileCoverTint";

/** One step of the loop (the pools glide one place on). A full orbit is eight. */
const STEP_S = 2.2;
/** The extra step the pools take as the page lands after the zoom. */
const LANDING_KICK_MS = 1100;
/** The region colours blend in once sampled. */
const BLEND_IN_MS = 700;

// Four pools of colour weighted by (reach − distance)³, the loop positions
// interpolated with a smoothstep per step. The top and bottom bands blend to
// the plain page colour so the canvas meets the solid page above and the
// fade below without a seam. A one-bit dither keeps the soft gradients from
// banding.
const SKSL = `
uniform float2 size;
uniform float top;
uniform float bottom;
uniform float amount;
uniform float phase;
uniform half4 base;
uniform half4 c0;
uniform half4 c1;
uniform half4 c2;
uniform half4 c3;
uniform float2 l0; uniform float2 l1; uniform float2 l2; uniform float2 l3;
uniform float2 l4; uniform float2 l5; uniform float2 l6; uniform float2 l7;

float2 place(float slot) {
  float i = mod(slot, 8.0);
  if (i < 0.5) return l0;
  if (i < 1.5) return l1;
  if (i < 2.5) return l2;
  if (i < 3.5) return l3;
  if (i < 4.5) return l4;
  if (i < 5.5) return l5;
  if (i < 6.5) return l6;
  return l7;
}

float2 pool(float slot) {
  float whole = floor(phase);
  float f = phase - whole;
  f = f * f * (3.0 - 2.0 * f);
  return mix(place(slot + whole), place(slot + whole + 1.0), f);
}

float weight(float2 q, float2 p) {
  float r = max(0.0, ${MOBILE_COVER_MESH_REACH.toFixed(3)} - distance(q, p));
  return r * r * r;
}

half4 main(float2 xy) {
  float2 uv = xy / size;
  float2 q = float2(uv.x, (uv.y - top) / max(0.001, 1.0 - top - bottom));
  float w0 = weight(q, pool(0.0));
  float w1 = weight(q, pool(2.0));
  float w2 = weight(q, pool(4.0));
  float w3 = weight(q, pool(6.0));
  float sum = max(0.00001, w0 + w1 + w2 + w3);
  half3 mesh = (c0.rgb * w0 + c1.rgb * w1 + c2.rgb * w2 + c3.rgb * w3) / sum;
  float edge = smoothstep(0.0, max(0.001, top), uv.y) * (1.0 - smoothstep(1.0 - bottom, 1.0, uv.y));
  half3 color = mix(base.rgb, mesh, amount * edge);
  float n = fract(sin(dot(xy, float2(12.9898, 78.233))) * 43758.5453);
  color += half3((n - 0.5) / 255.0);
  return half4(color, 1.0);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

/**
 * The detail page's colour, alive: four pools in the colours of the cover's
 * quarters drift slowly around the page, one step every couple of seconds,
 * and take an extra step as the page lands after the cover zoom. It starts as
 * the plain page colour and blends into the cover's regions once they are
 * sampled, so it never flashes. Text stays readable over every blend (the
 * pools are held to the page's own lightness; tested).
 *
 * Still under Reduce Motion (the pools keep their colours and stay where they
 * are), and paused while the screen is not focused or the cover has one
 * colour only.
 */
export function MobileCoverMeshBackground({
  main,
  regions,
  scheme,
  topBlend,
  bottomBlend,
  landingKey,
  style,
}: {
  main: MobileCoverRgb | null;
  regions: MobileCoverRgb[] | null;
  scheme: "light" | "dark";
  /** Points at the top and bottom that blend into the plain page colour. */
  topBlend: number;
  bottomBlend: number;
  /** A new value makes the pools take their landing step. */
  landingKey: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  };
  const colors = useMemo(() => buildMobileCoverMeshColors(main, regions, scheme), [main, regions, scheme]);
  const base = useMemo(() => buildMobileCoverMeshColors(main, null, scheme)[0]!, [main, scheme]);
  const flat = isMobileCoverMeshFlat(colors);

  const phase = useSharedValue(0);
  const kick = useSharedValue(0);
  const amount = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(64, info.timeSincePreviousFrame ?? 16);
    phase.value = (phase.value + dt / 1000 / STEP_S) % 8;
  }, false);
  const drifting = focused && !reducedMotion && !flat && size.width > 0;
  useEffect(() => {
    frame.setActive(drifting);
  }, [drifting, frame]);

  useEffect(() => {
    amount.value = withTiming(flat ? 0 : 1, { duration: BLEND_IN_MS, easing: Easing.out(Easing.cubic) });
  }, [amount, flat]);

  useEffect(() => {
    if (!landingKey || reducedMotion) return;
    kick.value = withTiming(kick.value + 1, { duration: LANDING_KICK_MS, easing: Easing.out(Easing.cubic) });
  }, [kick, landingKey, reducedMotion]);

  // Everything but the moving values is worked out here, on the JS side.
  const fixed = useMemo(() => {
    const height = Math.max(1, size.height);
    const loop: Record<string, number[]> = {};
    MOBILE_COVER_MESH_LOOP.forEach((point, index) => {
      loop[`l${index}`] = [point.x, point.y];
    });
    return {
      size: [Math.max(1, size.width), height],
      top: Math.min(0.45, topBlend / height),
      bottom: Math.min(0.45, bottomBlend / height),
      base: mobileCoverMeshUniformColor(base),
      c0: mobileCoverMeshUniformColor(colors[0]!),
      c1: mobileCoverMeshUniformColor(colors[1]!),
      c2: mobileCoverMeshUniformColor(colors[2]!),
      c3: mobileCoverMeshUniformColor(colors[3]!),
      ...loop,
    };
  }, [base, bottomBlend, colors, size.height, size.width, topBlend]);
  const uniforms = useDerivedValue(() => ({
    ...fixed,
    amount: amount.value,
    phase: phase.value + kick.value,
  }));

  return (
    <View pointerEvents="none" onLayout={onLayout} style={style}>
      {effect && size.width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}
