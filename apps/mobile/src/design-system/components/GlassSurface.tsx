import { BlurView } from "expo-blur";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { createNemuShadowStyle } from "@/design/shadows";
import { useNemuTheme } from "@/design/useNemuTheme";
import { getGlassSurfaceRenderMode } from "@/lib/glassSurface";

type GlassSurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  onLayout?: ViewProps["onLayout"];
  testID?: string;
};

export function GlassSurface({
  children,
  style,
  contentStyle,
  intensity = 24,
  onLayout,
  testID,
}: GlassSurfaceProps) {
  const { scheme, tokens } = useNemuTheme();
  const shellStyle = [
    styles.shell,
    {
      backgroundColor: tokens.card,
      borderColor: tokens.border,
      ...createNemuShadowStyle({
        color: tokens.shadow,
        offsetY: 8,
        radius: 22,
        elevation: 8,
      }),
    },
    style,
  ];
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;

  // Expo BlurView's Android RenderNode surface can alternate between valid and
  // opaque-black buffers on Samsung's Vulkan HWUI path. A normal native View
  // preserves the same card color/border/depth without an offscreen blur layer.
  if (getGlassSurfaceRenderMode(Platform.OS) === "native-view") {
    return (
      <View onLayout={onLayout} style={shellStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      onLayout={onLayout}
      tint={scheme}
      style={shellStyle}
      testID={testID}
    >
      {content}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
  },
});
