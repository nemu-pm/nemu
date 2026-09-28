/**
 * Mobile dual-reader FAB — draggable toggle/peek button. Native counterpart to
 * web's `DualReadFab` (`src/lib/plugins/builtin/dual-reader/components.tsx:2667`).
 *
 * Gesture semantics (parity with web's single-pointer model):
 * - **Tap** (down → up, no hold, no drag): toggle `activeSide` + haptic.
 * - **Hold** (still for `HOLD_DELAY_MS=220ms`): `peekActive=true` (preview the
 *   other side) + haptic; release without drag → revert (no toggle), mirroring
 *   web's `holdActive` branch that only commits when `commitSwitch`.
 * - **Hold + drag** (move > `DRAG_THRESHOLD_PX=6` while hold is active): on
 *   release, commit the side toggle (permanent) + end peek.
 * - **Drag** (move > threshold, no hold): reposition the FAB; snap to nearest
 *   edge on release + persist `fabPosition`.
 *
 * Implementation: a single `Gesture.Pan()` (minDistance = threshold) drives
 * everything. `onBegin` records the drag-start position (shared values) and
 * starts the hold timer (JS); `onUpdate` either commits a hold+drag or jumps
 * `x`/`y`; `onFinalize` (fires for taps too, since Pan finalizes even if it never
 * activated) branches on the recorded intent. All `x`/`y`/`scale` animations
 * run on the UI thread via shared values + `withSpring` (springs match web: x/y
 * stiffness 300 damping 30, scale stiffness 500 damping 15). Store mutations,
 * haptics, and the hold timer cross to JS via `runOnJS`.
 *
 * Loading spinner: shown when the session is enabled with chapters loaded but
 * the current primary chapter has no render plan yet (plans still being built by
 * the AutoAligner). Web keys this off visible-page metas; mobile has no page-meta
 * in the shared context, so this is a per-current-primary-chapter proxy — refined
 * in T5 when ReaderScreen wires page meta.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNemuTheme } from "@/design-system";
import { hapticConfirm, hapticPress } from "@/lib/haptics";
import {
  DRAG_THRESHOLD_PX,
  FAB_MARGIN,
  FAB_SIZE,
  HOLD_DELAY_MS,
} from "@/lib/mobileDualReaderRuntime";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";
import {
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";
import {
  mobileDualReaderFabClamp,
  mobileDualReaderFabDefault,
  mobileDualReaderFabSnap,
} from "@/lib/mobileDualReaderFabLayout";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

// Spring configs mirror web's motion springs.
const POSITION_SPRING = { stiffness: 300, damping: 30 };
const SCALE_SPRING = { stiffness: 500, damping: 15 };

const PRESS_SCALE = 0.88;
const HOLD_SCALE = 0.82;
const DRAG_SCALE = 1.12;

/**
 * Legacy area (no pose information): the window inside the horizontal safe
 * area. A landscape iPhone reports ~60pt per side for the Dynamic Island; the
 * FAB docks past it instead of under it. Portrait insets are zero, so the
 * plain FAB_MARGIN applies there.
 */
function windowFabArea(
  width: number,
  height: number,
  insets: { left: number; right: number },
): WindowLayoutRect {
  const x = Math.max(0, insets.left - FAB_MARGIN);
  const right = Math.max(0, insets.right - FAB_MARGIN);
  return { x, y: 0, width: Math.max(0, width - x - right), height };
}

export type MobileDualReaderFabProps = {
  /**
   * Reader-local rectangle the FAB may rest in (`mobileDualReaderFabArea`):
   * beside the vertical rail, inside the chrome pane in book posture, over
   * the page pane in notebook. Defaults to the window's safe area.
   */
  area?: WindowLayoutRect | null;
};

export function MobileDualReaderFab({ area: poseArea = null }: MobileDualReaderFabProps = {}) {
  const ctx = useMobileDualReaderContext();
  const { tokens } = useNemuTheme();
  const { width, height } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const insetLeft = safeAreaInsets.left;
  const insetRight = safeAreaInsets.right;
  const poseAreaX = poseArea?.x;
  const poseAreaY = poseArea?.y;
  const poseAreaWidth = poseArea?.width;
  const poseAreaHeight = poseArea?.height;
  const area = useMemo<WindowLayoutRect>(
    () =>
      poseAreaX != null && poseAreaY != null && poseAreaWidth != null && poseAreaHeight != null
        ? { x: poseAreaX, y: poseAreaY, width: poseAreaWidth, height: poseAreaHeight }
        : windowFabArea(width, height, { left: insetLeft, right: insetRight }),
    [height, insetLeft, insetRight, poseAreaHeight, poseAreaWidth, poseAreaX, poseAreaY, width],
  );

  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const activeSide = useMobileDualReaderStore((s) => s.activeSide);
  const fabPosition = useMobileDualReaderStore((s) => s.fabPosition);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const secondaryRenderPlansByChapter = useMobileDualReaderStore(
    (s) => s.secondaryRenderPlansByChapter,
  );
  const setFabPosition = useMobileDualReaderStore((s) => s.setFabPosition);
  const setPeekActive = useMobileDualReaderStore((s) => s.setPeekActive);
  const setActiveSide = useMobileDualReaderStore((s) => s.setActiveSide);

  // Loading: enabled + chapters loaded but no plan for the current primary chapter yet.
  const isLoading = useMemo(() => {
    if (!enabled || !seedPair || primaryChapters.length === 0 || secondaryChapters.length === 0) {
      return false;
    }
    const primaryId = ctx.primaryChapter?.id;
    if (!primaryId) return false;
    const plans = secondaryRenderPlansByChapter[primaryId];
    if (!plans) return true;
    return Object.keys(plans).length === 0;
  }, [
    enabled,
    seedPair,
    primaryChapters,
    secondaryChapters,
    secondaryRenderPlansByChapter,
    ctx.primaryChapter,
  ]);

  // Shared animation values.
  const initial = fabPosition ?? mobileDualReaderFabDefault(area, FAB_SIZE, FAB_MARGIN);
  const x = useSharedValue(initial.x);
  const y = useSharedValue(initial.y);
  const scale = useSharedValue(1);
  const dragStartX = useSharedValue(initial.x);
  const dragStartY = useSharedValue(initial.y);

  // Intent flags (UI-thread readable from worklets).
  const holdActive = useSharedValue(false);
  const isDragging = useSharedValue(false);
  const holdDragCommit = useSharedValue(false);

  const holdTimerJsRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerJsRef.current) {
      clearTimeout(holdTimerJsRef.current);
      holdTimerJsRef.current = null;
    }
  }, []);

  const startHoldTimer = useCallback(() => {
    clearHoldTimer();
    holdTimerJsRef.current = setTimeout(() => {
      holdActive.value = true;
      runOnJS(setPeekActive)(true);
      hapticConfirm();
    }, HOLD_DELAY_MS);
  }, [clearHoldTimer, setPeekActive, holdActive]);

  // Scale reacts to hold/drag intent (UI thread).
  useAnimatedReaction(
    () => holdActive.value,
    (active, prev) => {
      if (active && !prev) {
        scale.value = withSpring(HOLD_SCALE, SCALE_SPRING);
      }
    },
  );
  useAnimatedReaction(
    () => isDragging.value,
    (dragging, prev) => {
      if (dragging && !prev) {
        scale.value = withSpring(DRAG_SCALE, SCALE_SPRING);
      }
    },
  );

  // Sync springs when the persisted fabPosition changes (not during a drag).
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!fabPosition || isDragging.value) return;
    const last = lastPosRef.current;
    const shouldJump =
      !last || Math.abs(last.x - fabPosition.x) > 100 || Math.abs(last.y - fabPosition.y) > 100;
    if (shouldJump) {
      x.value = fabPosition.x;
      y.value = fabPosition.y;
    } else {
      x.value = withSpring(fabPosition.x, POSITION_SPRING);
      y.value = withSpring(fabPosition.y, POSITION_SPRING);
    }
    lastPosRef.current = { x: fabPosition.x, y: fabPosition.y };
  }, [fabPosition, isDragging, x, y]);

  // Seed a default position when none is persisted (mirrors web's
  // ensureValidPosition). The render guard below returns null while
  // fabPosition is null, and dragging is the only other writer — without this
  // seed the FAB would never appear after enabling dual read.
  useEffect(() => {
    if (!enabled || fabPosition) return;
    if (area.width <= 0 || area.height <= 0) return;
    setFabPosition(mobileDualReaderFabDefault(area, FAB_SIZE, FAB_MARGIN));
  }, [area, enabled, fabPosition, setFabPosition]);

  // Re-clamp on rotation / viewport resize / pose change (rail, fold, console).
  useEffect(() => {
    if (!fabPosition || area.width <= 0 || area.height <= 0) return;
    const clamped = mobileDualReaderFabClamp(fabPosition, area, FAB_SIZE, FAB_MARGIN);
    if (
      clamped.x !== fabPosition.x ||
      clamped.y !== fabPosition.y ||
      clamped.side !== fabPosition.side
    ) {
      setFabPosition(clamped);
    }
  }, [area, fabPosition, setFabPosition]);

  // Cleanup the hold timer on unmount.
  useEffect(() => clearHoldTimer, [clearHoldTimer]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_THRESHOLD_PX)
        .onBegin(() => {
          "worklet";
          scale.value = withSpring(PRESS_SCALE, SCALE_SPRING);
          dragStartX.value = x.value;
          dragStartY.value = y.value;
          runOnJS(startHoldTimer)();
        })
        .onUpdate((event) => {
          "worklet";
          if (holdActive.value) {
            // Moving during hold → commit the side switch on release (don't reposition).
            if (
              Math.hypot(event.translationX, event.translationY) > DRAG_THRESHOLD_PX &&
              !holdDragCommit.value
            ) {
              holdDragCommit.value = true;
            }
            return;
          }
          if (!isDragging.value) {
            isDragging.value = true;
            runOnJS(clearHoldTimer)();
          }
          x.value = dragStartX.value + event.translationX;
          y.value = dragStartY.value + event.translationY;
        })
        .onFinalize(() => {
          "worklet";
          runOnJS(clearHoldTimer)();
          scale.value = withSpring(1, SCALE_SPRING);

          if (isDragging.value) {
            const snapped = mobileDualReaderFabSnap(
              { x: x.value, y: y.value },
              area,
              FAB_SIZE,
              FAB_MARGIN,
            );
            x.value = withSpring(snapped.x, POSITION_SPRING);
            y.value = withSpring(snapped.y, POSITION_SPRING);
            lastPosRef.current = { x: snapped.x, y: snapped.y };
            runOnJS(setFabPosition)(snapped);
          } else if (holdActive.value) {
            const commit = holdDragCommit.value;
            holdActive.value = false;
            holdDragCommit.value = false;
            runOnJS(setPeekActive)(false);
            if (enabled && commit) {
              const next = activeSide === "primary" ? "secondary" : "primary";
              runOnJS(setActiveSide)(next);
              runOnJS(hapticPress)();
            }
          } else if (enabled) {
            // Tap → toggle side.
            const next = activeSide === "primary" ? "secondary" : "primary";
            runOnJS(setActiveSide)(next);
            runOnJS(hapticPress)();
          }

          isDragging.value = false;
        }),
    [
      enabled,
      activeSide,
      area,
      startHoldTimer,
      clearHoldTimer,
      setFabPosition,
      setPeekActive,
      setActiveSide,
      x,
      y,
      scale,
      dragStartX,
      dragStartY,
      holdActive,
      holdDragCommit,
      isDragging,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      left: x.value,
      top: y.value,
      width: FAB_SIZE,
      height: FAB_SIZE,
      transform: [{ scale: scale.value }],
    };
  });

  if (!enabled || !fabPosition) return null;

  const isSecondary = activeSide === "secondary";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.fab,
            {
              backgroundColor: isSecondary ? tokens.primary : tokens.card,
              borderColor: tokens.border,
            },
            animatedStyle,
          ]}
          accessibilityRole="button"
          accessibilityLabel={ctx.strings.reader.dualReadFabLabel}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={tokens.primaryForeground} />
          ) : (
            <Ionicons
              name="copy-outline"
              size={22}
              color={isSecondary ? tokens.primaryForeground : tokens.foreground}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
