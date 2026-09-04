import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Defs,
  FeGaussianBlur,
  Filter,
  Rect,
} from "react-native-svg";
import {
  NEMU_APP_ICON_PRESS_MOTION,
  getNemuAppIconHaloMetrics,
  getNemuAppIconHaloRenderMode,
  shouldAnimateNemuAppIconPress,
} from "@/lib/nemuAppIconHalo";
import { useNemuTheme } from "@/design-system";
import appIconGlow from "../../assets/app-icon-glow.png";

const WEB_GLOW_SCALE = 1.25;
const useNativeAnimationDriver = Platform.OS !== "web";
const webIconPressEase = Easing.bezier(0.34, 1.56, 0.64, 1);

function scaleAroundCenter(canvasSize: number, scale: number) {
  const center = canvasSize / 2;
  return `translate(${center} ${center}) scale(${scale}) translate(${-center} ${-center})`;
}

type NemuAppIconHaloProps = {
  accessibilityLabel: string;
  iconSize?: number;
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function NemuAppIconHalo({
  accessibilityLabel,
  iconSize = 80,
  source,
  style,
  testID,
}: NemuAppIconHaloProps) {
  const { reduceMotion } = useNemuTheme();
  const {
    canvasSize,
    glowBlurRadius,
    iconRadius,
    rectOffset,
  } = getNemuAppIconHaloMetrics(iconSize);
  const renderMode = getNemuAppIconHaloRenderMode(Platform.OS);
  const filterId = `nemu-app-icon-glow-${iconSize}`;
  const defaultRootSize = {
    width: iconSize + 32,
    height: iconSize + 16,
  };
  const [pressProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shouldAnimateNemuAppIconPress(reduceMotion)) return;
    pressProgress.stopAnimation();
    pressProgress.setValue(0);
  }, [pressProgress, reduceMotion]);

  const animatePress = (toValue: 0 | 1) => {
    if (!shouldAnimateNemuAppIconPress(reduceMotion)) {
      pressProgress.setValue(0);
      return;
    }
    pressProgress.stopAnimation();
    Animated.timing(pressProgress, {
      toValue,
      duration: NEMU_APP_ICON_PRESS_MOTION.duration,
      easing: webIconPressEase,
      useNativeDriver: useNativeAnimationDriver,
    }).start();
  };
  const iconScale = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, NEMU_APP_ICON_PRESS_MOTION.scale],
  });
  const iconRotation = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${NEMU_APP_ICON_PRESS_MOTION.rotateDegrees}deg`],
  });

  return (
    <Pressable
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      hitSlop={6}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      style={[styles.root, defaultRootSize, style]}
      testID={testID}
    >
      {renderMode === "raster-glow" ? (
        <Image
          accessible={false}
          fadeDuration={0}
          resizeMode="stretch"
          source={appIconGlow}
          style={[
            styles.ambientGlow,
            {
              height: canvasSize,
              width: canvasSize,
              transform: [
                { translateX: -canvasSize / 2 },
                { translateY: -canvasSize / 2 },
              ],
            },
          ]}
        />
      ) : (
        <Svg
          accessible={false}
          height={canvasSize}
          pointerEvents="none"
          style={[
            styles.ambientGlow,
            {
              height: canvasSize,
              width: canvasSize,
              transform: [
                { translateX: -canvasSize / 2 },
                { translateY: -canvasSize / 2 },
              ],
            },
          ]}
          viewBox={`0 0 ${canvasSize} ${canvasSize}`}
          width={canvasSize}
        >
          <Defs>
            <Filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
              <FeGaussianBlur stdDeviation={glowBlurRadius} />
            </Filter>
          </Defs>
          <Rect
            x={rectOffset}
            y={rectOffset}
            width={iconSize}
            height={iconSize}
            rx={iconRadius}
            fill="#6b8cce"
            fillOpacity={0.3}
            filter={`url(#${filterId})`}
            transform={scaleAroundCenter(canvasSize, WEB_GLOW_SCALE)}
          />
        </Svg>
      )}
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.iconShadow,
          {
            borderRadius: iconRadius,
            height: iconSize,
            transform: [{ scale: iconScale }, { rotate: iconRotation }],
            width: iconSize,
          },
        ]}
      >
        <View style={[styles.iconClip, { borderRadius: iconRadius }]}>
          <Image
            accessible={false}
            fadeDuration={0}
            resizeMode="cover"
            source={source}
            style={styles.iconImage}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Matches web: bg-[#6b8cce]/30 blur-2xl scale-125 behind the app icon.
  // The canvas is centered on the icon and only prevents the blur tail from clipping.
  ambientGlow: {
    position: "absolute",
    top: "50%",
    left: "50%",
  },
  iconShadow: {
    position: "relative",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    boxShadow:
      "0px 10px 15px -3px rgba(0,0,0,0.10), 0px 4px 6px -4px rgba(0,0,0,0.10)",
  },
  iconClip: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
});
