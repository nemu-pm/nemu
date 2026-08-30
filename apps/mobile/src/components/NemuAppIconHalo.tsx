import {
  Image,
  Platform,
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
  getNemuAppIconHaloMetrics,
  getNemuAppIconHaloRenderMode,
} from "@/lib/nemuAppIconHalo";
import appIconGlow from "../../assets/app-icon-glow.png";

const WEB_GLOW_SCALE = 1.25;

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

  return (
    <View style={[styles.root, defaultRootSize, style]} testID={testID}>
      {renderMode === "raster-glow" ? (
        <Image
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
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
        style={[
          styles.iconShadow,
          {
            borderRadius: iconRadius,
            height: iconSize,
            width: iconSize,
          },
        ]}
      >
        <View style={[styles.iconClip, { borderRadius: iconRadius }]}>
          <Image fadeDuration={0} resizeMode="cover" source={source} style={styles.iconImage} />
        </View>
      </View>
    </View>
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
