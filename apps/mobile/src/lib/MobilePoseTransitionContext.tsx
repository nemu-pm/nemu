import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { MobilePoseVeil } from "@/components/MobilePoseVeil";
import {
  classifyMobilePoseChange,
  mergeMobilePoseVeilPlans,
  mobilePoseSignature,
  mobilePoseVeilPlan,
  MOBILE_MOTION,
  type MobilePoseChangeKind,
  type MobilePoseSignature,
  type MobilePoseVeilPlan,
  type MobilePoseVeilReason,
} from "@/lib/mobileMotion";
import {
  mobilePoseEntering,
  mobilePoseExiting,
  mobilePoseLayoutTransition,
  openMobilePoseMotionWindow,
  setMobilePoseReduceMotion,
} from "@/lib/mobilePoseLayoutAnimations";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { getMobileSystemTransitionMs } from "@/lib/mobileTransitionTiming";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { mobilePoseVeilPlanWithCaps } from "@/lib/mobileReaderStageMotion";

export type MobilePoseTransition = {
  /** Increments on every visible pose change; stable otherwise. */
  changeId: number;
  /** Kind of the latest pose change (`none` until the first one). */
  kind: MobilePoseChangeKind;
  reduceMotion: boolean;
  /** Layout transition for frames that move at a constant window size. */
  layout: typeof mobilePoseLayoutTransition;
  entering: typeof mobilePoseEntering;
  exiting: typeof mobilePoseExiting;
  spring: typeof MOBILE_MOTION.settleSpring;
  /**
   * Cover a surface's own discontinuity with the root veil — e.g. a grid that
   * must remount for a new column count while the window keeps its size. Call
   * it from a layout effect so the veil lands in the same frame.
   */
  requestVeil: (reason?: Exclude<MobilePoseVeilReason, "layout">) => void;
  /**
   * Let a full-screen surface restyle the veil while it is on screen (the
   * reader asks for a dark wash so a display switch never flashes the light
   * page background over black manga pages). The latest registration wins;
   * pass null to unregister. Prefer `useMobilePoseVeilAppearance`.
   */
  setVeilAppearance: (owner: object, appearance: MobilePoseVeilAppearance | null) => void;
};

/** Veil colours for the surface on screen. */
export type MobilePoseVeilAppearance = {
  /** Wash colour (default: the theme's page background). */
  tintColor: string;
  /** Blur material (default: the app appearance). */
  blurTint?: "light" | "dark";
  /**
   * Cap on the wash's peak opacity. A dark immersive surface (the reader)
   * keeps its content visible under a light frost instead of washing to
   * near-black — a black wash over black pages reads as a blank frame.
   */
  maxTintOpacity?: number;
  /** Cap on the blur's peak intensity. */
  maxBlurIntensity?: number;
};

const noop = () => undefined;

const DEFAULT_TRANSITION: MobilePoseTransition = {
  changeId: 0,
  kind: "none",
  reduceMotion: false,
  layout: mobilePoseLayoutTransition,
  entering: mobilePoseEntering,
  exiting: mobilePoseExiting,
  spring: MOBILE_MOTION.settleSpring,
  requestVeil: noop,
  setVeilAppearance: noop,
};

const MobilePoseTransitionContext = createContext<MobilePoseTransition>(DEFAULT_TRANSITION);

type VeilSession = { session: number; token: number; plan: MobilePoseVeilPlan };

type TrackedPose = {
  signature: MobilePoseSignature;
  changeId: number;
  kind: MobilePoseChangeKind;
  veil: VeilSession | null;
  nextSession: number;
};

const BLUR_AVAILABLE = Platform.OS === "ios";

function withVeil(tracked: TrackedPose, plan: MobilePoseVeilPlan | null): TrackedPose {
  if (!plan) return tracked;
  if (tracked.veil) {
    return {
      ...tracked,
      veil: {
        ...tracked.veil,
        token: tracked.veil.token + 1,
        plan: mergeMobilePoseVeilPlans(tracked.veil.plan, plan),
      },
    };
  }
  return {
    ...tracked,
    veil: { session: tracked.nextSession, token: 0, plan },
    nextSession: tracked.nextSession + 1,
  };
}

/**
 * App-wide pose-change tracker and the root **pose veil**. Mount directly
 * inside `MobileWindowLayoutProvider`.
 *
 * The change is derived during render (React's "adjust state while
 * rendering" pattern) so the veil is part of the very commit that re-lays
 * the app out at its new size — no frame of raw reflow first. The veil
 * never takes touches and reveals on its own clock (UI thread).
 */
export function MobilePoseTransitionProvider({ children }: { children: ReactNode }) {
  const adaptive = useMobileAdaptiveLayout();
  const reduceMotion = useReducedMotion();
  const signature = useMemo(() => mobilePoseSignature(adaptive), [adaptive]);
  const [tracked, setTracked] = useState<TrackedPose>(() => ({
    signature,
    changeId: 0,
    kind: "none",
    veil: null,
    nextSession: 1,
  }));

  let current = tracked;
  if (tracked.signature !== signature) {
    const change = classifyMobilePoseChange(tracked.signature, signature);
    current = { ...tracked, signature };
    if (change.kind !== "none") {
      // Raised while rendering the change — before its frames are mounted —
      // so the UI-thread layout transitions see it for this very commit.
      openMobilePoseMotionWindow();
      current = withVeil(
        { ...current, changeId: tracked.changeId + 1, kind: change.kind },
        mobilePoseVeilPlan({
          reason: change.kind,
          anticipated: change.anticipated,
          reduceMotion,
          blurAvailable: BLUR_AVAILABLE,
          systemTransitionMs: mobileDesignExploreFlag ? getMobileSystemTransitionMs() : null,
        }),
      );
    }
    setTracked(current);
  }

  const reduceMotionRef = useRef(reduceMotion);
  useLayoutEffect(() => {
    reduceMotionRef.current = reduceMotion;
    setMobilePoseReduceMotion(reduceMotion);
  });
  const requestVeil = useCallback((reason: Exclude<MobilePoseVeilReason, "layout"> = "remount") => {
    const plan = mobilePoseVeilPlan({
      reason,
      reduceMotion: reduceMotionRef.current,
      blurAvailable: BLUR_AVAILABLE,
    });
    setTracked((previous) => withVeil(previous, plan));
  }, []);
  const [appearances, setAppearances] = useState<ReadonlyArray<{ owner: object; appearance: MobilePoseVeilAppearance }>>([]);
  const setVeilAppearance = useCallback((owner: object, appearance: MobilePoseVeilAppearance | null) => {
    setAppearances((previous) => {
      const rest = previous.filter((entry) => entry.owner !== owner);
      if (!appearance) return rest.length === previous.length ? previous : rest;
      return [...rest, { owner, appearance }];
    });
  }, []);
  const veilAppearance = appearances[appearances.length - 1]?.appearance ?? null;
  const handleVeilDone = useCallback((session: number) => {
    setTracked((previous) =>
      previous.veil?.session === session ? { ...previous, veil: null } : previous,
    );
  }, []);

  const value = useMemo<MobilePoseTransition>(
    () => ({
      ...DEFAULT_TRANSITION,
      changeId: current.changeId,
      kind: current.kind,
      reduceMotion,
      requestVeil,
      setVeilAppearance,
    }),
    [current.changeId, current.kind, reduceMotion, requestVeil, setVeilAppearance],
  );

  return (
    <MobilePoseTransitionContext.Provider value={value}>
      {children}
      {current.veil ? (
        <MobilePoseVeil
          key={current.veil.session}
          session={current.veil.session}
          token={current.veil.token}
          plan={mobilePoseVeilPlanWithCaps(current.veil.plan, veilAppearance)}
          tintColor={veilAppearance?.tintColor}
          blurTint={veilAppearance?.blurTint}
          onDone={handleVeilDone}
        />
      ) : null}
    </MobilePoseTransitionContext.Provider>
  );
}

/**
 * The shared pose-change motion language: the latest change (kind + id), the
 * Reduce Motion flag, the shared layout/entering/exiting builders and the
 * settle spring. Re-renders only when a pose change happens.
 */
export function useMobilePoseTransition(): MobilePoseTransition {
  return useContext(MobilePoseTransitionContext);
}

/**
 * Restyle the root pose veil while this component is mounted and
 * `appearance` is non-null (e.g. the reader while focused). Keep the object
 * stable (module constant or memo) — a new identity re-registers it.
 */
export function useMobilePoseVeilAppearance(appearance: MobilePoseVeilAppearance | null) {
  const { setVeilAppearance } = useMobilePoseTransition();
  const [owner] = useState(() => ({}));
  useLayoutEffect(() => {
    setVeilAppearance(owner, appearance);
    return () => setVeilAppearance(owner, null);
  }, [appearance, owner, setVeilAppearance]);
}

/**
 * Dev-only render-storm probe: counts a component's commits in the second
 * after each pose change and logs `[pose-probe] <label>: N commits`. Enable
 * with `globalThis.__NEMU_POSE_RENDER_PROBE__ = true` (e.g. from the JS
 * debugger) before folding; a healthy screen re-renders a handful of times.
 */
export function useMobilePoseRenderProbe(label: string) {
  const { changeId } = useMobilePoseTransition();
  const countRef = useRef(0);
  const armedRef = useRef<number | null>(null);
  // Counts commits (what reaches the screen), not discarded renders.
  useEffect(() => {
    countRef.current += 1;
  });
  useEffect(() => {
    if (!__DEV__ || changeId === 0) return;
    if (!(globalThis as { __NEMU_POSE_RENDER_PROBE__?: boolean }).__NEMU_POSE_RENDER_PROBE__) return;
    armedRef.current = changeId;
    const start = countRef.current;
    const timer = setTimeout(() => {
      if (armedRef.current !== changeId) return;
      console.log(`[pose-probe] ${label}: ${countRef.current - start + 1} commits after pose change #${changeId}`);
    }, 1000);
    return () => clearTimeout(timer);
  }, [changeId, label]);
}

/** A remount this soon after a layout-only pose change belongs to it (container re-measure is async). */
const REMOUNT_AFTER_POSE_MS = 600;

/**
 * Veils a surface's forced remount (e.g. a FlatList whose `numColumns`
 * changed) when it follows a layout-only pose change — the one case the
 * layout transitions cannot animate. Resizes are already veiled.
 */
export function useMobilePoseRemountVeil(remountKey: string | number) {
  const { changeId, kind, requestVeil } = useMobilePoseTransition();
  const seenChangeRef = useRef(changeId);
  const layoutChangeAtRef = useRef<number | null>(null);
  const seenKeyRef = useRef(remountKey);
  useLayoutEffect(() => {
    if (seenChangeRef.current !== changeId) {
      seenChangeRef.current = changeId;
      layoutChangeAtRef.current = kind === "layout" ? Date.now() : null;
    }
    if (seenKeyRef.current === remountKey) return;
    seenKeyRef.current = remountKey;
    const at = layoutChangeAtRef.current;
    if (at !== null && Date.now() - at <= REMOUNT_AFTER_POSE_MS) requestVeil("remount");
  }, [changeId, kind, remountKey, requestVeil]);
}
