import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  AccessibilityInfo,
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
import portraitBlur from "../../assets/portrait-blur.png";
import portraitGlow from "../../assets/portrait-glow.png";
import {
  getNemuPortraitHaloRenderMode,
  shouldAnimateNemuPortraitHalo,
} from "@/lib/nemuPortraitHalo";

const PORTRAIT_ASSET_WIDTH = 390;
const PORTRAIT_ASSET_HEIGHT = 456;
const PORTRAIT_MAX_WIDTH = 390;
const PORTRAIT_STAGE_ASPECT_RATIO = PORTRAIT_ASSET_HEIGHT / PORTRAIT_ASSET_WIDTH;
const useNativeAnimationDriver = Platform.OS !== "web";

function getDelayedLoopValue(duration: number, negativeDelay: number) {
  if (!negativeDelay) return 0;

  const phase = ((Math.abs(negativeDelay) % duration) / duration);
  return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}

function createWebKeyframeLoop(
  value: Animated.Value,
  duration: number,
  negativeDelay = 0,
) {
  value.setValue(getDelayedLoopValue(duration, negativeDelay));

  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: duration / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: useNativeAnimationDriver,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: duration / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: useNativeAnimationDriver,
      }),
    ]),
  );
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
  const { width: windowWidth } = useWindowDimensions();
  const stageWidth = Math.max(
    1,
    Math.min(PORTRAIT_MAX_WIDTH, maxWidth, windowWidth - 56),
  );
  const stageHeight = Math.round(stageWidth * PORTRAIT_STAGE_ASPECT_RATIO);

  const [float] = useState(() => new Animated.Value(0));
  const [sway] = useState(() => new Animated.Value(0));
  const [breathe] = useState(() => new Animated.Value(0));
  const [rotate] = useState(() => new Animated.Value(0));
  const [glowPulse] = useState(() => new Animated.Value(0));
  const [glowDrift] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
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
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
    const reduceMotionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => {
      reduceMotionSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  const animate = shouldAnimateNemuPortraitHalo({
    appActive,
    focused,
    platform: Platform.OS,
    reduceMotion,
  });

  useEffect(() => {
    if (!animate) {
      [float, sway, breathe, rotate, glowPulse, glowDrift].forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }
    const animations = [
      createWebKeyframeLoop(float, 5000),
      createWebKeyframeLoop(sway, 7000, -2500),
      createWebKeyframeLoop(breathe, 4000, -1200),
      createWebKeyframeLoop(rotate, 9000, -4000),
      createWebKeyframeLoop(glowPulse, 4000),
      createWebKeyframeLoop(glowDrift, 6000, -3000),
    ];

    animations.forEach((animation) => animation.start());
    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [animate, breathe, float, glowDrift, glowPulse, rotate, sway]);

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
    outputRange: [0.38, 0.55],
  });
  const glowPulseTranslateY = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 14],
  });
  const glowPulseScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const glowDriftOpacity = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, 0.36],
  });
  const glowDriftTranslateX = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 4],
  });
  const glowDriftTranslateY = glowDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 18],
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.root, style, { height: stageHeight, width: stageWidth }]}
      testID={testID}
    >
      {haloRenderMode === "raster-glow" ? (
        <Image
          fadeDuration={0}
          resizeMode="stretch"
          source={portraitGlow}
          style={[styles.rasterGlow, { height: stageHeight, width: stageWidth }]}
        />
      ) : (
        <Animated.View
          style={[
            styles.glowPortraitWrap,
            {
              opacity: glowPulseOpacity,
              transform: [
                { translateY: glowPulseTranslateY },
                { scale: glowPulseScale },
              ],
            },
          ]}
        >
          <Animated.Image
            blurRadius={28}
            fadeDuration={0}
            resizeMode="contain"
            source={portraitBlur}
            style={[
              styles.glowPortrait,
              styles.primaryGlowPortrait,
              { height: stageHeight, width: stageWidth },
            ]}
          />
        </Animated.View>
      )}

      {haloRenderMode === "blurred-images" && animate ? (
        <Animated.View
          style={[
            styles.glowPortraitWrap,
            {
              opacity: glowDriftOpacity,
              transform: [
                { translateY: glowDriftTranslateY },
                { translateX: glowDriftTranslateX },
              ],
            },
          ]}
        >
          <Animated.Image
            blurRadius={18}
            fadeDuration={0}
            resizeMode="contain"
            source={portraitBlur}
            style={[
              styles.glowPortrait,
              styles.secondaryGlowPortrait,
              { height: stageHeight, width: stageWidth },
            ]}
          />
        </Animated.View>
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
              <View style={[styles.portraitShadow, { height: stageHeight, width: stageWidth }]}>
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
  glowPortraitWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  glowPortrait: {
    opacity: 1,
  },
  rasterGlow: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  primaryGlowPortrait: {
    tintColor: "#7b9ad0",
  },
  secondaryGlowPortrait: {
    tintColor: "#c4a6d6",
  },
  motionLayer: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  portraitShadow: {
    shadowColor: "#7b9ad0",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
  },
  portrait: {
    height: "100%",
    width: "100%",
  },
});
