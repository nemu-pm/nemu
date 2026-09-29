import { useCallback, useState } from "react";
import type { ComponentProps } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  nemuText,
  spacing,
  useNemuTheme,
  usesNemuNativeHeader,
  NEMU_PROMINENT_CTA_SIZE,
  NemuButton,
  NemuPressable,
} from "@/design-system";
import { getMobileFloatingTabBarOverlayExtent } from "@/lib/mobileFloatingTabBarClearance";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  getMobileEmptyLibraryAdaptiveLayout,
  NEMU_WEB_EMPTY_LIBRARY_VISUAL,
} from "@/lib/mobileEmptyLibraryLayout";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import { useMobilePoseSizeSpring } from "@/lib/useMobilePoseSizeSpring";
import { MobilePoseLayoutView } from "./MobilePoseLayoutView";
import type { ViewInstance } from "react-native";
import { NemuPortraitHalo } from "./NemuPortraitHalo";

type EmptyLibraryActionIcon = ComponentProps<typeof NemuButton>["icon"];

type EmptyLibraryProps = {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: EmptyLibraryActionIcon;
  onActionPress: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  /** Raw diagnostic string (e.g. describeMobileErrorDetail output). */
  diagnostic?: string;
  /** Optional override; the localized "Technical details" label is default. */
  diagnosticDetailsLabel?: string;
  /** Height to center in instead of the window-derived one (a folded pane). */
  minHeight?: number;
};

export function EmptyLibrary({
  title,
  description,
  actionLabel,
  actionIcon,
  onActionPress,
  actionDisabled,
  actionLoading,
  diagnostic,
  diagnosticDetailsLabel,
  minHeight,
}: EmptyLibraryProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const detailsLabel =
    diagnosticDetailsLabel ?? strings.feedback.technicalDetails;
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const {
    ref: containerRef,
    onLayout: onContainerLayout,
    width: containerWidth,
    split: containerSplit,
    adaptive,
  } = useMobileContainerFold<ViewInstance>();
  const barsOnSide = adaptive.verticalBarEdge !== null;
  // The box the hero really gets: header and bottom tab bar only when the
  // system draws them horizontally (Duo's outer display and inner landscape
  // move them to the trailing edge — subtracting a bottom bar there made the
  // art needlessly small), minus the asymmetric side safe areas.
  const topChrome = (usesNemuNativeHeader ? insets.top + 44 : insets.top) + spacing.pageTop;
  const bottomChrome = barsOnSide ? insets.bottom : getMobileFloatingTabBarOverlayExtent(insets.bottom);
  const boxHeight = minHeight ?? Math.max(1, height - topChrome - bottomChrome);
  const bleedWidth = Math.max(1, width - insets.left - insets.right);
  const layout = getMobileEmptyLibraryAdaptiveLayout({
    width: containerWidth ?? bleedWidth,
    bleedWidth,
    height: boxHeight,
    fold: containerSplit ? { axis: containerSplit.axis, gutter: containerSplit.gutter } : null,
  });
  const disabled = Boolean(actionDisabled || actionLoading);
  const pose = useMobilePoseTransition();
  const artScaleStyle = useMobilePoseSizeSpring(layout.portraitMaxWidth);
  // Where the portrait sits inside this box: the page above it is clipped
  // under the opaque navigation bar, so the glow must fade out before the
  // box's top edge instead of ending in a hard line there.
  const [artSlotY, setArtSlotY] = useState<number | null>(null);
  const [artY, setArtY] = useState<number | null>(null);
  const onArtSlotLayout = useCallback((event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    setArtSlotY((previous) => (previous !== null && Math.abs(previous - y) < 0.5 ? previous : y));
  }, []);
  const onArtLayout = useCallback((event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    setArtY((previous) => (previous !== null && Math.abs(previous - y) < 0.5 ? previous : y));
  }, []);
  const glowRoomTop = artSlotY !== null && artY !== null ? artSlotY + artY : null;

  const art = (
    <NemuPortraitHalo
      maxWidth={layout.portraitMaxWidth}
      glowRoomTop={glowRoomTop}
      style={[
        styles.portraitWrap,
        {
          marginBottom:
            (layout.arrangement === "stack" ? NEMU_WEB_EMPTY_LIBRARY_VISUAL.portraitMarginBottom : 0) +
            layout.glowBleed,
        },
      ]}
    />
  );
  const details = (
    <View style={styles.details}>
      <View style={styles.copy}>
        <Text
          style={[nemuText.pageEmptyTitle, styles.title, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        <Text
          style={[
            nemuText.pageEmptyDescription,
            styles.description,
            { color: tokens.mutedForeground },
          ]}
        >
          {description}
        </Text>
        {diagnostic ? (
          <View style={styles.diagnostic}>
            <NemuPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: diagnosticOpen }}
              accessibilityLabel={detailsLabel}
              hapticFeedback="selection"
              pressProfile="row"
              onPress={() => setDiagnosticOpen((open) => !open)}
              style={styles.diagnosticToggle}
            >
              <Ionicons
                name={
                  diagnosticOpen
                    ? "chevron-down-outline"
                    : "chevron-forward-outline"
                }
                size={12}
                color={tokens.mutedForeground}
              />
              <Text style={[nemuText.caption, { color: tokens.mutedForeground }]}>
                {detailsLabel}
              </Text>
            </NemuPressable>
            {diagnosticOpen ? (
              <Text
                selectable
                style={[
                  styles.diagnosticBody,
                  styles.diagnosticMono,
                  {
                    backgroundColor: tokens.secondary,
                    color: tokens.mutedForeground,
                  },
                ]}
              >
                {diagnostic}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <NemuButton
        accessibilityLabel={actionLabel}
        disabled={disabled}
        icon={actionIcon}
        label={actionLabel}
        loading={actionLoading}
        size={NEMU_PROMINENT_CTA_SIZE}
        containerStyle={styles.action}
        onPress={onActionPress}
        variant="default"
      />
    </View>
  );

  // The art and the copy keep their identity across stack ⇄ row ⇄ column
  // (folding, display switches): the art's slot glides and its size springs
  // from the old size; the copy block, which re-wraps, cross-fades.
  const artSlotStyle =
    layout.arrangement === "row"
      ? [styles.pane, { width: layout.artPane.width }]
      : layout.arrangement === "column"
        ? [styles.pane, { height: layout.artPane.height }]
        : null;
  const detailsSlotStyle =
    layout.arrangement === "row"
      ? [
          styles.pane,
          { width: layout.copyPane.width, marginLeft: layout.copyPane.x - layout.artPane.width },
        ]
      : layout.arrangement === "column"
        ? [
            styles.pane,
            {
              height: layout.copyPane.height,
              marginTop: layout.copyPane.y - layout.artPane.height,
            },
          ]
        : styles.stackDetails;

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <View
        ref={containerRef}
        onLayout={onContainerLayout}
        collapsable={false}
        style={[
          layout.arrangement === "stack" ? styles.root : styles.splitRoot,
          layout.arrangement === "row" && styles.row,
          { minHeight: boxHeight },
        ]}
      >
        <MobilePoseLayoutView key="art" style={artSlotStyle} onLayout={onArtSlotLayout}>
          <Animated.View style={artScaleStyle} onLayout={onArtLayout}>{art}</Animated.View>
        </MobilePoseLayoutView>
        <Animated.View
          key={`details-${layout.arrangement}`}
          entering={pose.entering}
          exiting={pose.exiting}
          style={detailsSlotStyle}
        >
          {layout.arrangement === "row" ? (
            <View style={{ width: layout.copyWidth, alignItems: "center" }}>{details}</View>
          ) : (
            details
          )}
        </Animated.View>
      </View>
    </LayoutAnimationConfig>
  );
}

const MONOSPACE_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding,
  },
  splitRoot: {
    alignSelf: "stretch",
  },
  stackDetails: {
    // Same box the details had as a direct child of the centered root.
    flexShrink: 1,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
  },
  pane: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding,
  },
  portraitWrap: {
    marginBottom: NEMU_WEB_EMPTY_LIBRARY_VISUAL.portraitMarginBottom,
  },
  details: {
    flexShrink: 1,
    alignItems: "center",
  },
  copy: {
    maxWidth: 320,
    alignItems: "center",
    gap: NEMU_WEB_EMPTY_LIBRARY_VISUAL.copyGap,
  },
  title: {
    letterSpacing: NEMU_WEB_EMPTY_LIBRARY_VISUAL.titleLetterSpacing,
    lineHeight: NEMU_WEB_EMPTY_LIBRARY_VISUAL.titleLineHeight,
    textAlign: "center",
  },
  description: {
    lineHeight: NEMU_WEB_EMPTY_LIBRARY_VISUAL.descriptionLineHeight,
    textAlign: "center",
  },
  action: {
    marginTop: NEMU_WEB_EMPTY_LIBRARY_VISUAL.actionMarginTop,
  },
  diagnostic: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 4,
  },
  diagnosticToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagnosticBody: {
    alignSelf: "stretch",
    maxWidth: 320,
    padding: 10,
    borderRadius: 8,
  },
  diagnosticMono: {
    fontFamily: MONOSPACE_FONT_FAMILY,
    fontSize: 11,
    lineHeight: 15,
  },
});
