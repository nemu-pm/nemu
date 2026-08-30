import type { ReactNode } from "react";
import {
  I18nManager,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
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
  const sideStyle = {
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
          paddingVertical: metrics.verticalPadding,
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
  androidTitle: {
    width: "100%",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
});
