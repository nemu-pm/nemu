import { useEffect, useState } from "react";
import {
  AppState,
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import portrait from "../../assets/portrait.png";
import {
  getNemuPortraitGlowFade,
  getNemuPortraitGlowRasterLayout,
  getNemuPortraitGlowStageWidth,
  getNemuPortraitHaloRenderMode,
  getNemuPortraitStageHeight,
  NEMU_WEB_PORTRAIT_GLOW,
  shouldAnimateNemuPortraitGlow,
  shouldAnimateNemuPortraitHalo,
} from "@/lib/nemuPortraitHalo";
import { getNemuPortraitGlowAssets } from "@/lib/nemuPortraitGlowAssets";
import { nemuColorWithAlpha, useNemuTheme } from "@/design-system";

const PORTRAIT_MAX_WIDTH = 639;
const webEaseInOut = Easing.bezier(0.42, 0, 0.58, 1);

function startPingPong(value: SharedValue<number>, duration: number) {
  value.value = withRepeat(
    withSequence(
      withTiming(1, { duration: duration / 2, easing: webEaseInOut }),
      withTiming(0, { duration: duration / 2, easing: webEaseInOut }),
    ),
    -1,
    false,
  );
}

type NemuPortraitHaloProps = {
  maxWidth?: number;
  /**
   * Distance (pt) from the portrait's top edge up to the nearest edge that
   * clips the glow (the page's top, under an opaque navigation bar). When the
   * glow would reach past it, the glow — never the art — fades to zero there
   * instead of ending in a hard line. Omit for an unbounded backdrop.
   */
  glowRoomTop?: number | null;
  /** Colour behind the halo; the fade band is drawn in it. Defaults to the page background. */
  backdropColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function NemuPortraitHalo({
  maxWidth = PORTRAIT_MAX_WIDTH,
  glowRoomTop,
  backdropColor,
  style,
  testID,
}: NemuPortraitHaloProps) {
  const { reduceMotion, tokens } = useNemuTheme();
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

  const float = useSharedValue(0);
  const sway = useSharedValue(0);
  const breathe = useSharedValue(0);
  const rotate = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const glowDrift = useSharedValue(0);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const haloRenderMode = getNemuPortraitHaloRenderMode(Platform.OS);
  const glowFade = getNemuPortraitGlowFade({
    containerStageHeight: stageHeight,
    containerStageWidth: stageWidth,
    renderMode: haloRenderMode,
    roomTop: glowRoomTop,
    stageWidth: glowStageWidth,
  });
  // Bounded glow: the layers live in a clip box whose top is the clipping
  // edge, and a backdrop-coloured band under that edge (below the art in
  // z-order) brings them to zero exactly there. Horizontally and downward the
  // box is the raster itself, so nothing else is cut.
  const glowClip = glowFade
    ? {
        height: glowRasterLayout.top + glowRasterLayout.height - glowFade.clipTop,
        left: glowRasterLayout.left,
        top: glowFade.clipTop,
        width: glowRasterLayout.width,
      }
    : null;
  const glowLayout = glowClip
    ? {
        height: glowRasterLayout.height,
        left: 0,
        top: glowRasterLayout.top - glowClip.top,
        width: glowRasterLayout.width,
      }
    : glowRasterLayout;
  const fadeColor = backdropColor ?? tokens.background;

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
    focused: true,
    platform: Platform.OS,
    reduceMotion,
  });
  const animateGlow = animate && shouldAnimateNemuPortraitGlow(Platform.OS);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(float);
      cancelAnimation(sway);
      cancelAnimation(breathe);
      cancelAnimation(rotate);
      cancelAnimation(glowPulse);
      cancelAnimation(glowDrift);
      return;
    }

    startPingPong(float, 5_000);
    startPingPong(sway, 7_000);
    startPingPong(breathe, 4_000);
    startPingPong(rotate, 9_000);
    if (animateGlow) {
      startPingPong(glowPulse, NEMU_WEB_PORTRAIT_GLOW.primary.duration);
      startPingPong(glowDrift, NEMU_WEB_PORTRAIT_GLOW.secondary.duration);
    }

    return () => {
      cancelAnimation(float);
      cancelAnimation(sway);
      cancelAnimation(breathe);
      cancelAnimation(rotate);
      cancelAnimation(glowPulse);
      cancelAnimation(glowDrift);
    };
  }, [
    animate,
    animateGlow,
    breathe,
    float,
    glowDrift,
    glowPulse,
    rotate,
    sway,
  ]);

  const portraitMotionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: float.value * -12 },
      { translateX: sway.value * 4 },
      { rotate: `${-0.5 + rotate.value}deg` },
      { scale: 1 + breathe.value * 0.012 },
    ],
  }));
  const glowPulseStyle = useAnimatedStyle(() => {
    const [y0, y1] = NEMU_WEB_PORTRAIT_GLOW.primary.translateY;
    const [scale0, scale1] = NEMU_WEB_PORTRAIT_GLOW.primary.scale;
    // CSS multiplies 0.25–0.4 onto a live gradient. The PNG already contains
    // those stops; another 0.25 against white washes the aura out. Pulse the
    // full baked layer instead.
    return {
      opacity: 0.62 + 0.38 * glowPulse.value,
      transform: [
        { translateY: y0 + (y1 - y0) * glowPulse.value },
        { scale: scale0 + (scale1 - scale0) * glowPulse.value },
      ],
    };
  });
  const glowDriftStyle = useAnimatedStyle(() => {
    const [x0, x1] = NEMU_WEB_PORTRAIT_GLOW.secondary.translateX;
    const [y0, y1] = NEMU_WEB_PORTRAIT_GLOW.secondary.translateY;
    return {
      opacity: 0.45 + 0.4 * glowDrift.value,
      transform: [
        { translateY: y0 + (y1 - y0) * glowDrift.value },
        { translateX: x0 + (x1 - x0) * glowDrift.value },
      ],
    };
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.root, style, { height: stageHeight, width: stageWidth }]}
      testID={testID}
    >
      {/* One glow box either way, so bounding the glow never remounts the
          animated layers: unbounded it is the stage (overflow visible). */}
      <View pointerEvents="none" style={glowClip ? [styles.glowClip, glowClip] : styles.glowBox}>
        {haloRenderMode === "static-composite-raster" ? (
          <Image
            fadeDuration={0}
            resizeMode="stretch"
            source={glowAssets.composite}
            style={[styles.rasterGlow, glowLayout]}
          />
        ) : (
          <Reanimated.Image
            fadeDuration={0}
            resizeMode="stretch"
            source={glowAssets.primary}
            style={[styles.rasterGlow, glowLayout, glowPulseStyle]}
          />
        )}

        {haloRenderMode === "animated-raster-layers" ? (
          <Reanimated.Image
            fadeDuration={0}
            resizeMode="stretch"
            source={glowAssets.secondary}
            style={[styles.rasterGlow, glowLayout, glowDriftStyle]}
          />
        ) : null}

        {glowFade ? (
          <LinearGradient
            colors={[
              fadeColor,
              nemuColorWithAlpha(fadeColor, 0.82),
              nemuColorWithAlpha(fadeColor, 0.5),
              nemuColorWithAlpha(fadeColor, 0.2),
              nemuColorWithAlpha(fadeColor, 0.05),
              nemuColorWithAlpha(fadeColor, 0),
            ]}
            locations={[0, 0.18, 0.4, 0.64, 0.84, 1]}
            pointerEvents="none"
            style={[styles.glowFade, { height: glowFade.fadeHeight }]}
          />
        ) : null}
      </View>

      <Reanimated.View style={[styles.motionLayer, portraitMotionStyle]}>
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
      </Reanimated.View>
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
  glowBox: {
    ...StyleSheet.absoluteFill,
    overflow: "visible",
  },
  glowClip: {
    overflow: "hidden",
    position: "absolute",
  },
  glowFade: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
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
