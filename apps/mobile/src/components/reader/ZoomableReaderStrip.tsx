import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { hapticSelection } from "@/lib/haptics";
import {
  clampMobileReaderStripOffset,
  clampMobileReaderZoomScale,
  MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE,
  shouldResetMobileReaderZoom,
} from "@/lib/mobileReaderZoom";

const SPRING_CONFIG = {
  damping: 20,
  mass: 0.7,
  stiffness: 220,
};

type ZoomableReaderStripProps = {
  children: ReactNode;
  viewportWidth: number;
  viewportHeight: number;
  /** Live scroll content length so the Y pan can reach the whole strip. */
  contentLengthShared: SharedValue<number>;
  /** Changes whenever the mounted chapter/presentation invalidates a zoom. */
  resetKey: string;
  /** Drives the list's `scrollEnabled` while the strip is zoomed in. */
  onZoomActiveChange?: (active: boolean) => void;
};

/**
 * Whole-list zoom for the long-strip reader: pinch scales the entire
 * continuous gallery as one surface (owner: 双指放大应该是整个 list 都放大),
 * pan moves around it while the list's own scrolling is suspended, and a
 * double-tap toggles between fit and the shared reader zoom scale. At scale 1
 * every gesture fails immediately so the FlatList keeps native scrolling and
 * the stage's single-tap chrome toggle.
 */
export function ZoomableReaderStrip({
  children,
  viewportWidth,
  viewportHeight,
  contentLengthShared,
  resetKey,
  onZoomActiveChange,
}: ZoomableReaderStripProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const onZoomActiveChangeRef = useRef(onZoomActiveChange);

  useLayoutEffect(() => {
    onZoomActiveChangeRef.current = onZoomActiveChange;
  }, [onZoomActiveChange]);

  const publishZoomActive = useCallback((active: boolean) => {
    onZoomActiveChangeRef.current?.(active);
  }, []);

  useEffect(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
    savedScale.value = 1;
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onZoomActiveChange?.(false);
  }, [
    resetKey,
    onZoomActiveChange,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // RNGH re-serializes a gesture's whole config to the native side whenever
  // the Gesture objects change identity, so the composition is built once per
  // viewport rather than on every render of the strip.
  const composedGesture = useMemo(() => {
    const publishZoomActiveFromWorklet = (active: boolean) => {
      "worklet";
      runOnJS(publishZoomActive)(active);
    };

    const resetZoom = () => {
      "worklet";
      scale.value = withSpring(1, SPRING_CONFIG);
      savedScale.value = 1;
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      publishZoomActiveFromWorklet(false);
    };

    const pinchGesture = Gesture.Pinch()
      .onUpdate((event) => {
        const nextScale = clampMobileReaderZoomScale(
          savedScale.value * event.scale,
        );
        scale.value = nextScale;
        translateX.value = clampMobileReaderStripOffset(
          translateX.value,
          viewportWidth,
          contentLengthShared.value,
          nextScale,
        );
        translateY.value = clampMobileReaderStripOffset(
          translateY.value,
          viewportHeight,
          contentLengthShared.value,
          nextScale,
        );
      })
      .onEnd(() => {
        if (shouldResetMobileReaderZoom(scale.value)) {
          resetZoom();
          return;
        }
        const nextScale = clampMobileReaderZoomScale(scale.value);
        scale.value = nextScale;
        savedScale.value = nextScale;
        translateX.value = clampMobileReaderStripOffset(
          translateX.value,
          viewportWidth,
          contentLengthShared.value,
          nextScale,
        );
        translateY.value = clampMobileReaderStripOffset(
          translateY.value,
          viewportHeight,
          contentLengthShared.value,
          nextScale,
        );
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        publishZoomActiveFromWorklet(true);
      });

    const panGesture = Gesture.Pan()
      .minPointers(1)
      .averageTouches(true)
      // While zoomed the strip's own scrolling is suspended, so one finger
      // belongs to the pan; at scale 1 it must fail instantly so the FlatList
      // keeps its native scroll.
      .manualActivation(true)
      .onTouchesMove((event, stateManager) => {
        "worklet";
        if (event.numberOfTouches >= 2 || scale.value > 1) {
          stateManager.activate();
          return;
        }
        stateManager.fail();
      })
      .onUpdate((event) => {
        if (scale.value <= 1) return;
        translateX.value = clampMobileReaderStripOffset(
          savedTranslateX.value + event.translationX,
          viewportWidth,
          contentLengthShared.value,
          scale.value,
        );
        translateY.value = clampMobileReaderStripOffset(
          savedTranslateY.value + event.translationY,
          viewportHeight,
          contentLengthShared.value,
          scale.value,
        );
      })
      .onEnd(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      });

    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onStart((event) => {
        if (shouldResetMobileReaderZoom(scale.value)) {
          const nextScale = MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE;
          const nextTranslateX = clampMobileReaderStripOffset(
            (viewportWidth / 2 - event.x) * (nextScale - 1),
            viewportWidth,
            contentLengthShared.value,
            nextScale,
          );
          const nextTranslateY = clampMobileReaderStripOffset(
            (viewportHeight / 2 - event.y) * (nextScale - 1),
            viewportHeight,
            contentLengthShared.value,
            nextScale,
          );
          scale.value = withSpring(nextScale, SPRING_CONFIG);
          savedScale.value = nextScale;
          translateX.value = withSpring(nextTranslateX, SPRING_CONFIG);
          translateY.value = withSpring(nextTranslateY, SPRING_CONFIG);
          savedTranslateX.value = nextTranslateX;
          savedTranslateY.value = nextTranslateY;
          publishZoomActiveFromWorklet(true);
        } else {
          resetZoom();
        }
        runOnJS(hapticSelection)();
      });

    return Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  }, [
    contentLengthShared,
    publishZoomActive,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
    viewportHeight,
    viewportWidth,
  ]);

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.clip}>
        <Animated.View style={animatedStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: "hidden",
  },
});
