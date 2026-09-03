import {
  Group,
  Host as SwiftHost,
  RNHostView,
} from "@expo/ui/swift-ui";
import { glassEffect, shadow } from "@expo/ui/swift-ui/modifiers";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useNemuTheme } from "@/design-system";
import { READER_CHROME_PANEL_CORNER_RADIUS } from "@/lib/mobileReaderHeader";
import {
  readerChromeGlassBorderColor,
  readerChromeGlassShadowColor,
  readerChromeGlassTint,
  shouldUseIosReaderLiquidGlass,
} from "./readerChromeGlass";

export type ReaderChromePanelProps = {
  children: React.ReactNode;
  panelStyle: {
    backgroundColor: string;
    borderColor: string;
  };
  style?: StyleProp<ViewStyle>;
};

export function ReaderChromePanel({
  children,
  panelStyle,
  style,
}: ReaderChromePanelProps) {
  const { scheme } = useNemuTheme();
  const { width, height } = useWindowDimensions();
  const useLiquidGlass = shouldUseIosReaderLiquidGlass({
    platformOS: Platform.OS,
    platformVersion: Platform.Version,
    width,
    height,
  });

  if (!useLiquidGlass) {
    return (
      <View style={[styles.shell, style, panelStyle]}>{children}</View>
    );
  }

  const glassBorderColor = readerChromeGlassBorderColor(
    scheme,
    panelStyle.borderColor,
  );

  return (
    <View
      style={[
        styles.shell,
        style,
        {
          backgroundColor: "transparent",
          borderColor: glassBorderColor,
        },
      ]}
    >
      <SwiftHost colorScheme={scheme} matchContents style={styles.glassHost}>
        <Group
          modifiers={[
            glassEffect({
              glass: {
                variant: "regular",
                interactive: true,
                tint: readerChromeGlassTint(scheme),
              },
              shape: "roundedRectangle",
              cornerRadius: READER_CHROME_PANEL_CORNER_RADIUS,
            }),
            shadow({
              radius: scheme === "dark" ? 18 : 12,
              y: 4,
              color: readerChromeGlassShadowColor(scheme),
            }),
          ]}
        >
          <RNHostView matchContents>
            <View style={styles.content}>{children}</View>
          </RNHostView>
        </Group>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
  glassHost: {
    width: "100%",
  },
  content: {
    width: "100%",
    backgroundColor: "transparent",
  },
});
