import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  BottomSheet,
  BottomSheetScrollView,
  type BottomSheetMethods,
} from "@expo/ui/community/bottom-sheet";
import { nemuFontWeight } from "@/design/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  canDismissMobileNativeSheetFromHardwareBack,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  resolveMobileNativeSheetDismissLabel,
} from "@/lib/mobileNativeSheet";
import { NemuPressable } from "./NemuPressable";

type MobileNativeSheetScaffoldProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  dismissLabel?: string;
  showDismissButton?: boolean;
  snapPoints?: (string | number)[];
  scroll?: boolean;
  scrollContentBottomInset?: number;
  contentBottomInset?: number;
  fillContent?: boolean;
  enablePanDownToClose?: boolean;
  backgroundColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

function resolveSnapPointHeight(
  snapPoint: string | number | undefined,
  availableHeight: number,
) {
  if (typeof snapPoint === "number") return snapPoint;
  if (!snapPoint) return undefined;

  if (snapPoint.endsWith("%")) {
    const percentage = Number.parseFloat(snapPoint);
    return Number.isFinite(percentage)
      ? Math.round(availableHeight * (percentage / 100))
      : undefined;
  }

  const height = Number.parseFloat(snapPoint);
  return Number.isFinite(height) ? height : undefined;
}

export function MobileNativeSheetScaffold({
  visible,
  onClose,
  title,
  dismissLabel,
  showDismissButton,
  snapPoints,
  scroll = false,
  scrollContentBottomInset,
  contentBottomInset,
  fillContent = false,
  enablePanDownToClose = true,
  backgroundColor,
  contentStyle,
  testID,
  children,
}: MobileNativeSheetScaffoldProps) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetMethods | null>(null);
  const sheetClosedRef = useRef(!visible);
  const programmaticCloseRef = useRef(false);
  const programmaticCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const availableSheetHeight = windowHeight - insets.top - insets.bottom;
  const effectiveSnapPoints = normalizeMobileNativeSheetSnapPointsForPlatform(
    snapPoints,
    Platform.OS,
  );
  const resolvedSnapPointHeight = resolveSnapPointHeight(
    effectiveSnapPoints?.[0],
    availableSheetHeight,
  );
  const boundedSnapPointHeight = resolvedSnapPointHeight
    ? Math.min(Math.max(resolvedSnapPointHeight, 240), availableSheetHeight)
    : undefined;
  const shouldUseScrollView = scroll && Boolean(effectiveSnapPoints?.length);
  const resolvedDismissLabel = resolveMobileNativeSheetDismissLabel({
    dismissLabel,
    enablePanDownToClose,
    showDismissButton,
  });
  const canDismissFromHardwareBack =
    canDismissMobileNativeSheetFromHardwareBack({
      dismissLabel,
      enablePanDownToClose,
      showDismissButton,
    });
  const shouldRenderDismissButton = resolvedDismissLabel !== null;
  const shouldRenderChrome = Boolean(title) || shouldRenderDismissButton;
  const chromeHeight = shouldRenderChrome ? SHEET_CHROME_HEIGHT : 0;
  const boundedContentHeight = boundedSnapPointHeight
    ? Math.max(boundedSnapPointHeight - chromeHeight, 188)
    : undefined;
  const boundedScrollFrameHeight = shouldUseScrollView
    ? boundedContentHeight
    : undefined;
  const paddingBottom =
    contentBottomInset ??
    (shouldUseScrollView
      ? (scrollContentBottomInset ?? Math.max(insets.bottom + 28, 40))
      : 18);
  const content = [
    styles.content,
    contentStyle,
    { paddingBottom },
  ];
  const filledContentStyle =
    fillContent && boundedContentHeight
      ? { height: boundedContentHeight }
      : fillContent
        ? styles.filledContent
        : null;
  const clearProgrammaticCloseTimer = useCallback(() => {
    if (!programmaticCloseTimerRef.current) return;
    clearTimeout(programmaticCloseTimerRef.current);
    programmaticCloseTimerRef.current = null;
  }, []);
  const finishClose = useCallback(() => {
    if (sheetClosedRef.current) return;
    sheetClosedRef.current = true;
    clearProgrammaticCloseTimer();
    programmaticCloseRef.current = false;
    onClose();
  }, [clearProgrammaticCloseTimer, onClose]);
  const handleClose = useCallback(() => {
    if (programmaticCloseRef.current) {
      if (programmaticCloseTimerRef.current) return;
      programmaticCloseTimerRef.current = setTimeout(() => {
        finishClose();
      }, PROGRAMMATIC_SHEET_CLOSE_DELAY_MS);
      return;
    }

    finishClose();
  }, [finishClose]);
  const requestSheetClose = useCallback(() => {
    if (sheetClosedRef.current) return;
    const sheet = sheetRef.current;
    if (!sheet) {
      finishClose();
      return;
    }

    programmaticCloseRef.current = true;
    sheet.close();
  }, [finishClose]);

  useEffect(() => {
    if (visible) {
      clearProgrammaticCloseTimer();
      programmaticCloseRef.current = false;
      sheetClosedRef.current = false;
      return;
    }

    requestSheetClose();
  }, [clearProgrammaticCloseTimer, requestSheetClose, visible]);

  useEffect(() => {
    return () => {
      clearProgrammaticCloseTimer();
    };
  }, [clearProgrammaticCloseTimer]);

  // Keep Android hardware-back handling centralized so it follows the same
  // caller-approved close policy as the visible controls. Guarded sheets consume
  // back without closing rather than exposing an unintended escape route.
  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canDismissFromHardwareBack) requestSheetClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canDismissFromHardwareBack, requestSheetClose, visible]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={visible ? 0 : -1}
      snapPoints={effectiveSnapPoints}
      enableDynamicSizing={!effectiveSnapPoints?.length}
      enablePanDownToClose={enablePanDownToClose}
      backgroundStyle={{ backgroundColor: backgroundColor ?? tokens.card }}
      onClose={handleClose}
    >
      {shouldRenderChrome ? (
        <View style={styles.chrome}>
          <View style={styles.chromeSide} />
          <Text
            maxFontSizeMultiplier={SHEET_CHROME_MAX_FONT_SIZE_MULTIPLIER}
            numberOfLines={1}
            style={[styles.chromeTitle, { color: tokens.foreground }]}
          >
            {title}
          </Text>
          <View style={styles.chromeSide}>
            {shouldRenderDismissButton ? (
              <NemuPressable
                accessibilityLabel={resolvedDismissLabel}
                accessibilityRole="button"
                hapticFeedback="selection"
                onPress={requestSheetClose}
                pressedScale={0.97}
                containerStyle={styles.dismissButtonHitArea}
                style={styles.dismissButton}
              >
                <Text
                  maxFontSizeMultiplier={SHEET_CHROME_MAX_FONT_SIZE_MULTIPLIER}
                  numberOfLines={1}
                  style={[styles.dismissText, { color: tokens.primary }]}
                >
                  {resolvedDismissLabel}
                </Text>
              </NemuPressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {shouldUseScrollView ? (
        <View
          style={[
            styles.scrollFrame,
            boundedScrollFrameHeight ? { height: boundedScrollFrameHeight } : null,
          ]}
        >
          <BottomSheetScrollView
            alwaysBounceVertical={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={content}
            testID={testID}
          >
            {children}
          </BottomSheetScrollView>
        </View>
      ) : (
        <View style={[filledContentStyle, content]} testID={testID}>
          {children}
        </View>
      )}
    </BottomSheet>
  );
}

const SHEET_CHROME_HEIGHT = 52;
// Sheet chrome competes for one fixed row: an unbounded Dynamic Type title and
// text dismiss action can overlap even though the sheet body itself remains
// scrollable. Keep both labels accessible and scaled, but cap only this compact
// navigation chrome so neither control is truncated at accessibility sizes.
const SHEET_CHROME_MAX_FONT_SIZE_MULTIPLIER = 1.5;
// Let the native sheet receive the close state before React unmounts the wrapper.
const PROGRAMMATIC_SHEET_CLOSE_DELAY_MS = 320;

const styles = StyleSheet.create({
  chrome: {
    height: SHEET_CHROME_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  chromeSide: {
    width: 76,
    minWidth: 76,
    minHeight: 44,
    justifyContent: "center",
  },
  chromeTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
    textAlign: "center",
  },
  dismissButtonHitArea: {
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  dismissButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  dismissText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  scrollFrame: {
    width: "100%",
  },
  scroll: {
    flex: 1,
  },
  filledContent: {
    flex: 1,
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
});
