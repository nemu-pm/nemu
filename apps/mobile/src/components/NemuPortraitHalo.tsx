import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import portrait from "../../assets/portrait.png";
import {
  getNemuWebLoopStart,
  getNemuPortraitGlowRasterLayout,
  getNemuPortraitGlowStageWidth,
  getNemuPortraitHaloRenderMode,
  getNemuPortraitStageHeight,
  NEMU_WEB_PORTRAIT_GLOW,
  shouldAnimateNemuPortraitGlow,
  shouldAnimateNemuPortraitHalo,
} from "@/lib/nemuPortraitHalo";
import { getNemuPortraitGlowAssets } from "@/lib/nemuPortraitGlowAssets";
import { useNemuTheme } from "@/design-system";

const PORTRAIT_MAX_WIDTH = 639;
const useNativeAnimationDriver = Platform.OS !== "web";
const webEaseInOut = Easing.bezier(0.42, 0, 0.58, 1);
const PORTRAIT_SWAY_DELAY = -2_500;
const PORTRAIT_BREATHE_DELAY = -1_200;
const PORTRAIT_ROTATE_DELAY = -4_000;

function getInitialWebKeyframeValue(duration: number, negativeDelay = 0) {
  const start = getNemuWebLoopStart(duration, negativeDelay);
  const easedProgress = webEaseInOut(start.progress);
  return start.direction === "ascending" ? easedProgress : 1 - easedProgress;
}

function remainingWebEase(startProgress: number) {
  if (startProgress <= 0) return webEaseInOut;
  const startValue = webEaseInOut(startProgress);
  const remainingValue = 1 - startValue;
  return (progress: number) =>
    remainingValue <= 0
      ? 1
      : (webEaseInOut(startProgress + (1 - startProgress) * progress) -
          startValue) /
        remainingValue;
}

function createWebKeyframeLoop(
  value: Animated.Value,
  duration: number,
  negativeDelay = 0,
) {
  const start = getNemuWebLoopStart(duration, negativeDelay);
  const ascending = start.direction === "ascending";
  value.setValue(getInitialWebKeyframeValue(duration, negativeDelay));

  const rise = () =>
    Animated.timing(value, {
      toValue: 1,
      duration: duration / 2,
      easing: webEaseInOut,
      useNativeDriver: useNativeAnimationDriver,
    });
  const fall = () =>
    Animated.timing(value, {
      toValue: 0,
      duration: duration / 2,
      easing: webEaseInOut,
      useNativeDriver: useNativeAnimationDriver,
    });
  const finishCurrentLeg = Animated.timing(value, {
    toValue: ascending ? 1 : 0,
    duration: start.remainingDuration,
    easing: remainingWebEase(start.progress),
    useNativeDriver: useNativeAnimationDriver,
  });
  const continuingLoop = Animated.loop(
    Animated.sequence(ascending ? [fall(), rise()] : [rise(), fall()]),
  );

  return Animated.sequence([finishCurrentLeg, continuingLoop]);
}

type NemuPortraitHaloProps = {
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function NemuPortraitHalo({
  maxWidth = PORTRAIT_MAX_WIDTH,
  style,
  testID,
}: NemuPortraitHaloProps) {
  const { reduceMotion } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const stageWidth = Math.max(
    1,
    Math.round(Math.min(PORTRAIT_MAX_WIDTH, maxWidth, windowWidth)),
  );
  const stageHeight = getNemuPortraitStageHeight(stageWidth);
  const glowStageWidth = getNemuPortraitGlowStageWidth(stageWidth);
  const glowStageHeight = getNemuPortraitStageHeight(glowStageWidth);
  const glowAssets = getNemuPortraitGlowAssets(glowStageWidth);
  const glowRasterLayout = getNemuPortraitGlowRasterLayout({
    containerStageHeight: stageHeight,
    containerStageWidth: stageWidth,
    stageHeight: glowStageHeight,
    stageWidth: glowStageWidth,
  });

  const initiallyAnimating =
    reduceMotion === false && AppState.currentState === "active";
  const [float] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating ? getInitialWebKeyframeValue(5_000) : 0,
      ),
  );
  const [sway] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating
          ? getInitialWebKeyframeValue(7_000, PORTRAIT_SWAY_DELAY)
          : 0,
      ),
  );
  const [breathe] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating
          ? getInitialWebKeyframeValue(4_000, PORTRAIT_BREATHE_DELAY)
          : 0,
      ),
  );
  const [rotate] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating
          ? getInitialWebKeyframeValue(9_000, PORTRAIT_ROTATE_DELAY)
          : 0,
      ),
  );
  const [glowPulse] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating
          ? getInitialWebKeyframeValue(
              NEMU_WEB_PORTRAIT_GLOW.primary.duration,
              NEMU_WEB_PORTRAIT_GLOW.primary.delay,
            )
          : 0,
      ),
  );
  const [glowDrift] = useState(
    () =>
      new Animated.Value(
        initiallyAnimating
          ? getInitialWebKeyframeValue(
              NEMU_WEB_PORTRAIT_GLOW.secondary.duration,
              NEMU_WEB_PORTRAIT_GLOW.secondary.delay,
            )
          : 0,
      ),
  );
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const haloRenderMode = getNemuPortraitHaloRenderMode(Platform.OS);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const animate = shouldAnimateNemuPortraitHalo({
    appActive,
    focused,
    platform: Platform.OS,
    reduceMotion,
  });
  const animateGlow = animate && shouldAnimateNemuPortraitGlow(Platform.OS);

  useLayoutEffect(() => {
    if (!animate) {
      [float, sway, breathe, rotate, glowPulse, glowDrift].forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }
    const portraitAnimations = [
      createWebKeyframeLoop(float, 5000),
      createWebKeyframeLoop(sway, 7000, PORTRAIT_SWAY_DELAY),
      createWebKeyframeLoop(breathe, 4000, PORTRAIT_BREATHE_DELAY),
      createWebKeyframeLoop(rotate, 9000, PORTRAIT_ROTATE_DELAY),
    ];
    const glowAnimations = animateGlow
      ? [
          createWebKeyframeLoop(
            glowPulse,
            NEMU_WEB_PORTRAIT_GLOW.primary.duration,
            NEMU_WEB_PORTRAIT_GLOW.primary.delay,
          ),
          createWebKeyframeLoop(
            glowDrift,
            NEMU_WEB_PORTRAIT_GLOW.secondary.duration,
            NEMU_WEB_PORTRAIT_GLOW.secondary.delay,
          ),
        ]
      : [];
    const animations = [...portraitAnimations, ...glowAnimations];

    animations.forEach((animation) => animation.start());
    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [animate, animateGlow, breathe, float, glowDrift, glowPulse, rotate, sway]);

  const floatTranslateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });
  const swayTranslateX = sway.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });
  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.012],
  });
  const rotateDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["-0.5deg", "0.5deg"],
  });
  const glowPulseOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.primary.opacity],
  });
  const glowPulseTranslateY = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.primary.translateY],
  });
  const glowPulseScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.primary.scale],
  });
  const glowDriftOpacity = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.secondary.opacity],
  });
  const glowDriftTranslateX = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.secondary.translateX],
  });
  const glowDriftTranslateY = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [...NEMU_WEB_PORTRAIT_GLOW.secondary.translateY],
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.root, style, { height: stageHeight, width: stageWidth }]}
      testID={testID}
    >
      {haloRenderMode === "static-composite-raster" ? (
        <Image
          fadeDuration={0}
          resizeMode="stretch"
          source={glowAssets.composite}
          style={[styles.rasterGlow, glowRasterLayout]}
        />
      ) : (
        <Animated.Image
          fadeDuration={0}
          resizeMode="stretch"
          source={glowAssets.primary}
          style={[
            styles.rasterGlow,
            {
              opacity: glowPulseOpacity,
              transform: [
                { translateY: glowPulseTranslateY },
                { scale: glowPulseScale },
              ],
            },
            glowRasterLayout,
          ]}
        />
      )}

      {haloRenderMode === "animated-raster-layers" ? (
        <Animated.Image
          fadeDuration={0}
          resizeMode="stretch"
          source={glowAssets.secondary}
          style={[
            styles.rasterGlow,
            {
              opacity: glowDriftOpacity,
              transform: [
                { translateY: glowDriftTranslateY },
                { translateX: glowDriftTranslateX },
              ],
            },
            glowRasterLayout,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.motionLayer,
          {
            transform: [{ translateY: floatTranslateY }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ translateX: swayTranslateX }] }}>
          <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
            <Animated.View style={{ transform: [{ scale: breatheScale }] }}>
              <View
                style={[
                  styles.portraitStack,
                  { height: stageHeight, width: stageWidth },
                ]}
              >
                <Image
                  fadeDuration={0}
                  resizeMode="stretch"
                  source={glowAssets.shadow}
                  style={[
                    styles.rasterGlow,
                    { opacity: NEMU_WEB_PORTRAIT_GLOW.shadow.opacity },
                    glowRasterLayout,
                  ]}
                />
                <Image
                  fadeDuration={0}
                  resizeMode="contain"
                  source={portrait}
                  style={styles.portrait}
                />
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  rasterGlow: {
    position: "absolute",
  },
  motionLayer: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  portraitStack: {
    overflow: "visible",
  },
  portrait: {
    height: "100%",
    width: "100%",
  },
});
