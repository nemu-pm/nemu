import { BlurView } from "expo-blur";
import { Group, Host as SwiftHost, RNHostView } from "@expo/ui/swift-ui";
import { glassEffect, shadow } from "@expo/ui/swift-ui/modifiers";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { createNemuShadowStyle } from "@/design/shadows";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  getGlassSurfaceRenderMode,
  glassSurfaceLiquidTint,
  resolveGlassSurfaceShape,
} from "@/lib/glassSurface";
import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";

type GlassSurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  /**
   * Opt in to the system Liquid Glass material on iOS 26+. The surface is then
   * a SwiftUI `glassEffect` host that refracts what scrolls under it instead of
   * a flat frosted bar. Android, web and iOS 25 or older ignore the flag and
   * keep the BlurView / native-view surface untouched.
   */
  liquidGlass?: boolean;
  testID?: string;
};

function numericStyleValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function GlassSurface({
  children,
  style,
  contentStyle,
  intensity = 24,
  liquidGlass = false,
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

  if (liquidGlass && supportsNemuLiquidGlass(Platform.OS, Platform.Version)) {
    const flatStyle = StyleSheet.flatten(style) ?? {};
    const flatContentStyle = StyleSheet.flatten(contentStyle) ?? {};
    const cornerRadius = numericStyleValue(flatStyle.borderRadius) ?? 0;
    const height =
      numericStyleValue(flatStyle.height) ??
      numericStyleValue(flatStyle.minHeight) ??
      numericStyleValue(flatContentStyle.height) ??
      numericStyleValue(flatContentStyle.minHeight);

    // The SwiftUI material paints the surface, so the shell keeps only the
    // hairline border and the corner clip; a token fill would hide the glass
    // and `shadow(...)` below replaces the React Native drop shadow.
    return (
      <View
        style={[
          styles.shell,
          { borderColor: tokens.border },
          style,
          styles.liquidShell,
        ]}
        testID={testID}
      >
        <SwiftHost colorScheme={scheme} matchContents style={styles.glassHost}>
          <Group
            modifiers={[
              glassEffect({
                glass: {
                  variant: "regular",
                  // Non-interactive: the pill is not a control, and the
                  // interactive material would react to touches meant for the
                  // action / dismiss buttons hosted inside it.
                  interactive: false,
                  tint: glassSurfaceLiquidTint(tokens.background),
                },
                shape: resolveGlassSurfaceShape({ cornerRadius, height }),
                cornerRadius,
              }),
              shadow({
                radius: scheme === "dark" ? 18 : 12,
                y: 4,
                color: tokens.shadow,
              }),
            ]}
          >
            <RNHostView matchContents>
              <View style={[styles.liquidContent, contentStyle]}>
                {children}
              </View>
            </RNHostView>
          </Group>
        </SwiftHost>
      </View>
    );
  }

  // Expo BlurView's Android RenderNode surface can alternate between valid and
  // opaque-black buffers on Samsung's Vulkan HWUI path. A normal native View
  // preserves the same card color/border/depth without an offscreen blur layer.
  if (getGlassSurfaceRenderMode(Platform.OS) === "native-view") {
    return (
      <View style={shellStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
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
  liquidShell: {
    backgroundColor: "transparent",
    // `overflow: hidden` would clip the SwiftUI `shadow(...)` back to the
    // pill's own bounds. The glass material clips itself to its shape, and the
    // hosted children stay inside the padding, so nothing needs the corner clip.
    overflow: "visible",
  },
  glassHost: {
    width: "100%",
  },
  liquidContent: {
    width: "100%",
    backgroundColor: "transparent",
  },
  content: {
    flex: 1,
  },
});
