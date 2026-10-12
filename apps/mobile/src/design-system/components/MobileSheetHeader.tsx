import type { ReactNode } from "react";
import {
  I18nManager,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { nemuSheetMetrics } from "@/design/nemuSheetMetrics";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  MOBILE_SHEET_HEADER_ITEM_GAP,
  resolveMobileSheetHeaderMetrics,
} from "@/lib/mobileNativeSheet";

export type MobileSheetHeaderProps = {
  leading?: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  title: string;
  trailing?: ReactNode;
};

/** Shared native-sheet chrome: compact on iOS and Material-aligned on Android. */
export function MobileSheetHeader({
  leading,
  onLayout,
  title,
  trailing,
}: MobileSheetHeaderProps) {
  const { tokens } = useNemuTheme();
  const metrics = resolveMobileSheetHeaderMetrics(
    Platform.OS,
    I18nManager.isRTL,
  );
  const isAndroid = Platform.OS === "android";
  // iOS reserves equal side columns so the title centres. Android's title is
  // start-aligned, so a side hugs its content: header actions already bring
  // their own 48dp target, and a decorative leading icon (the sign-out
  // glyph) sits one item gap from the title instead of at the far edge of an
  // empty 48dp column.
  const sideStyle = isAndroid
    ? { minHeight: metrics.controlSize }
    : {
        minHeight: metrics.controlSize,
        minWidth: metrics.sideWidth ?? metrics.controlSize,
        width: metrics.sideWidth ?? undefined,
      };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.root,
        {
          minHeight: metrics.minimumHeight,
          paddingHorizontal: metrics.horizontalPadding,
          paddingTop: metrics.paddingTop,
          paddingBottom: metrics.paddingBottom,
        },
      ]}
    >
      {isAndroid ? (
        leading ? <View style={[styles.side, sideStyle]}>{leading}</View> : null
      ) : (
        <View style={[styles.side, sideStyle]}>{leading}</View>
      )}
      <View
        style={[
          styles.titleBlock,
          metrics.titleAlignment === "center" ? styles.centeredTitleBlock : null,
        ]}
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.5}
          numberOfLines={metrics.titleNumberOfLines}
          style={[
            isAndroid ? styles.androidTitle : styles.iosTitle,
            { color: tokens.foreground, textAlign: metrics.titleAlignment },
          ]}
        >
          {title}
        </Text>
      </View>
      {isAndroid ? (
        trailing ? <View style={[styles.side, sideStyle]}>{trailing}</View> : null
      ) : (
        <View style={[styles.side, styles.trailingSide, sideStyle]}>{trailing}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: MOBILE_SHEET_HEADER_ITEM_GAP,
  },
  side: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  trailingSide: {
    alignItems: "flex-end",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  centeredTitleBlock: {
    alignItems: "center",
  },
  iosTitle: {
    width: "100%",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
  // Material 3 titleLarge (22/28) from the shared sheet metrics table.
  androidTitle: {
    width: "100%",
    ...nemuSheetMetrics.title,
    letterSpacing: 0,
  },
});
