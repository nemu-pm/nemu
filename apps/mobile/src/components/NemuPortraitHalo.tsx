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
  makeMutable,
  useAnimatedStyle,
  useFrameCallback,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import portrait from "../../assets/portrait.png";
import {
  getNemuPortraitGlowFade,
  getNemuPortraitGlowRasterLayout,
  getNemuPortraitGlowStageWidth,
  getNemuPortraitHaloRenderMode,
  getNemuPortraitStageHeight,
  getNemuWebLoopValue,
  NEMU_WEB_PORTRAIT_GLOW,
  NEMU_WEB_PORTRAIT_MOTION,
  shouldAnimateNemuPortraitHalo,
} from "@/lib/nemuPortraitHalo";
import { getNemuPortraitGlowAssets } from "@/lib/nemuPortraitGlowAssets";
import { nemuColorWithAlpha, useNemuTheme } from "@/design-system";

const PORTRAIT_MAX_WIDTH = 639;

/**
 * Every portrait runs on one motion clock (ms), like the web's CSS timeline:
 * its six loops are pure functions of it (durations, delays and easing from
 * `library-empty.tsx`), so a remount, a pause or a resume never restarts a
 * loop from rest or lets the loops drift out of phase. It advances by the
 * frame interval while any halo animates; a longer gap (paused, backgrounded,
 * a dropped frame) moves it by at most one step, so the motion resumes where
 * it stopped instead of skipping ahead.
 */
const motionClock = makeMutable(0);
const motionClockFrame = makeMutable(-1);
const MOTION_CLOCK_MAX_STEP = 50;

function mix(range: readonly [number, number], amount: number) {
  "worklet";
  return range[0] + (range[1] - range[0]) * amount;
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

  const animate = shouldAnimateNemuPortraitHalo({ appActive, reduceMotion });
  const clock = useFrameCallback((frame) => {
    "worklet";
    const last = motionClockFrame.value;
    // Halos share the clock: the first one to run in a frame advances it.
    if (frame.timestamp === last) return;
    if (last >= 0) {
      motionClock.value += Math.min(Math.max(frame.timestamp - last, 0), MOTION_CLOCK_MAX_STEP);
    }
    motionClockFrame.value = frame.timestamp;
  }, false);

  useEffect(() => {
    clock.setActive(animate);
    return () => clock.setActive(false);
  }, [animate, clock]);

  const portraitMotionStyle = useAnimatedStyle(() => {
    const t = motionClock.value;
    const { breathe, float, rotate, sway } = NEMU_WEB_PORTRAIT_MOTION;
    return {
      transform: [
        { translateY: mix(float.translateY, getNemuWebLoopValue(t, float.duration, float.delay)) },
        { translateX: mix(sway.translateX, getNemuWebLoopValue(t, sway.duration, sway.delay)) },
        { rotate: `${mix(rotate.degrees, getNemuWebLoopValue(t, rotate.duration, rotate.delay))}deg` },
        { scale: mix(breathe.scale, getNemuWebLoopValue(t, breathe.duration, breathe.delay)) },
      ],
    };
  });
  const glowPulseStyle = useAnimatedStyle(() => {
    const { primary } = NEMU_WEB_PORTRAIT_GLOW;
    const pulse = getNemuWebLoopValue(motionClock.value, primary.duration, primary.delay);
    // CSS multiplies 0.25–0.4 onto a live gradient. The PNG already contains
    // those stops; another 0.25 against white washes the aura out. Pulse the
    // full baked layer instead.
    return {
      opacity: 0.62 + 0.38 * pulse,
      transform: [
        { translateY: mix(primary.translateY, pulse) },
        { scale: mix(primary.scale, pulse) },
      ],
    };
  });
  const glowDriftStyle = useAnimatedStyle(() => {
    const { secondary } = NEMU_WEB_PORTRAIT_GLOW;
    const drift = getNemuWebLoopValue(motionClock.value, secondary.duration, secondary.delay);
    return {
      opacity: 0.45 + 0.4 * drift,
      transform: [
        { translateY: mix(secondary.translateY, drift) },
        { translateX: mix(secondary.translateX, drift) },
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
