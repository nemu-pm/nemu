import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, View, type ViewInstance } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { Atlas, Canvas, Skia, makeImageFromView, useRSXformBuffer, type SkImage } from "@shopify/react-native-skia";
import { Easing, runOnJS, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { hapticPress } from "@/lib/haptics";
import {
  createMobileDustParticles,
  getMobileDustGrid,
  MOBILE_DUST,
  MOBILE_DUST_DURATION_S,
  MOBILE_DUST_STRIDE,
} from "@/lib/mobileExploreDust";
import { getExploreDissolveTargets, setExploreDissolveHidden, setExploreDissolver } from "./mobileExploreDissolve";

type DustRun = {
  key: number;
  id: string;
  image: SkImage;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * When the caller should remove the title, from the start of the dust: once
 * the front has crossed and most of the dust has lifted off the slot, so the
 * neighbours slide into a clear space rather than under the cloud.
 */
const HIDE_AFTER_MS = 64;
const REMOVE_AFTER_MS = (MOBILE_DUST.sweep + MOBILE_DUST.jitter) * 1000 + 420;

function measure(view: ViewInstance): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) => {
      const window = Dimensions.get("window");
      const onScreen = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < window.width && y < window.height;
      resolve(onScreen ? { x, y, width, height } : null);
    });
  });
}

/**
 * Hosts the dust: a window-level overlay (above the tab bar and the Now
 * Reading accessory, so drifting dust is never cut by them) that exists only
 * while dust is in the air, never takes touches and is not a VoiceOver
 * container.
 */
export function MobileExploreDustHost() {
  const reducedMotion = useReducedMotion();
  const [runs, setRuns] = useState<DustRun[]>([]);
  const nextKey = useRef(1);

  const dissolve = useCallback(
    async (id: string, notBeforeMs: number) => {
      if (reducedMotion) return false;
      // Snapshot straight away (the view can be captured behind a sheet that
      // is still leaving), play once `notBeforeMs` has passed.
      const ready = new Promise((resolve) => setTimeout(resolve, notBeforeMs));
      for (const target of getExploreDissolveTargets(id)) {
        if (!target.current) continue;
        // Only a target on screen is snapshotted: an off-screen one (the
        // title's shelf cell far down the Library) has no native view under
        // Fabric's culling, and Skia's snapshot of a missing view is a fatal
        // native error, not a rejection this catch could take.
        if (!(await measure(target.current))) continue;
        if (!target.current) continue;
        let image: SkImage | null = null;
        try {
          image = await makeImageFromView(target as Parameters<typeof makeImageFromView>[0]);
        } catch {
          image = null;
        }
        if (!image) continue;
        await ready;
        const view = target.current;
        const rect = view ? await measure(view) : null;
        if (!rect) continue;
        const key = nextKey.current++;
        setRuns((current) => [...current, { key, id, image: image!, ...rect }]);
        // The view stands aside once the dust (identical to it at first) is
        // on screen, so there is never a frame with neither.
        setTimeout(() => setExploreDissolveHidden(id, true), HIDE_AFTER_MS);
        void hapticPress();
        return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), REMOVE_AFTER_MS));
      }
      await ready;
      return false;
    },
    [reducedMotion],
  );

  const finish = useCallback((key: number, id: string) => {
    setRuns((current) => current.filter((run) => run.key !== key));
    setExploreDissolveHidden(id, false);
  }, []);

  useEffect(() => {
    setExploreDissolver(dissolve);
    return () => setExploreDissolver(null, dissolve);
  }, [dissolve]);
  if (!runs.length) return null;
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {runs.map((run) => (
          <DustCloud key={run.key} run={run} onDone={finish} />
        ))}
      </View>
    </FullWindowOverlay>
  );
}

function DustCloud({ run, onDone }: { run: DustRun; onDone: (key: number, id: string) => void }) {
  const { columns, rows, cell } = useMemo(() => getMobileDustGrid(run.width, run.height), [run.height, run.width]);
  const count = columns * rows;
  const particles = useMemo(
    () => createMobileDustParticles(columns, rows, cell, run.key * 7919 + 13),
    [cell, columns, rows, run.key],
  );
  // Snapshot pixels per point (the screen scale).
  const ratio = run.image.width() / Math.max(1, run.width);
  const sprites = useMemo(() => {
    const imageWidth = run.image.width();
    const imageHeight = run.image.height();
    const list = [];
    for (let index = 0; index < count; index += 1) {
      const x = particles[index * MOBILE_DUST_STRIDE]! * ratio;
      const y = particles[index * MOBILE_DUST_STRIDE + 1]! * ratio;
      // Squares on the far edges overhang the snapshot; clip them to it.
      list.push(Skia.XYWHRect(x, y, Math.max(0, Math.min(cell * ratio, imageWidth - x)), Math.max(0, Math.min(cell * ratio, imageHeight - y))));
    }
    return list;
  }, [cell, count, particles, ratio, run.image]);

  const time = useSharedValue(0);
  useEffect(() => {
    time.value = withTiming(MOBILE_DUST_DURATION_S, { duration: MOBILE_DUST_DURATION_S * 1000, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onDone)(run.key, run.id);
    });
  }, [onDone, run.id, run.key, time]);

  const originX = run.x;
  const originY = run.y;
  const half = (cell * ratio) / 2;
  const ramp = MOBILE_DUST.ramp;
  const liftX = MOBILE_DUST.lift.x;
  const liftY = MOBILE_DUST.lift.y;
  const shrinkFrom = MOBILE_DUST.shrinkFrom;
  const transforms = useRSXformBuffer(count, (transform, index) => {
    "worklet";
    const t = time.value;
    const at = index * MOBILE_DUST_STRIDE;
    const baseX = particles[at]!;
    const baseY = particles[at + 1]!;
    const tau = t - particles[at + 4]!;
    let dx = 0;
    let dy = 0;
    let scale = 1;
    let rotation = 0;
    if (tau > 0) {
      const life = particles[at + 5]!;
      if (tau >= life) {
        scale = 0;
      } else {
        const travel = tau - ramp + ramp * Math.exp(-tau / ramp);
        dx = particles[at + 2]! * travel + 0.5 * liftX * tau * tau;
        dy = particles[at + 3]! * travel + 0.5 * liftY * tau * tau;
        const age = tau / life;
        const fade = age <= shrinkFrom ? 1 : 1 - (age - shrinkFrom) / (1 - shrinkFrom);
        scale = fade * fade;
        rotation = particles[at + 6]! * tau;
      }
    }
    // Sprite pixels → points, scaled and turned about the square's centre.
    const k = scale / ratio;
    const scos = k * Math.cos(rotation);
    const ssin = k * Math.sin(rotation);
    const cx = originX + baseX + half / ratio + dx;
    const cy = originY + baseY + half / ratio + dy;
    transform.set(scos, ssin, cx - (scos * half - ssin * half), cy - (ssin * half + scos * half));
  });

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Atlas image={run.image} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
}
