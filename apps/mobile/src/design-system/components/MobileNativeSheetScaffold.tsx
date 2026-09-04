import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  canDismissMobileNativeSheetFromPan,
  canDismissMobileNativeSheetFromHardwareBack,
  MOBILE_NATIVE_ANDROID_SNAP_POINTS,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  resolveMobileSheetHeaderMetrics,
  resolveMobileNativeSheetDismissLabel,
  shouldBoundMobileNativeSheetForPlatform,
} from "@/lib/mobileNativeSheet";
import { NemuNativeSheetHeaderAction } from "./NemuNativeSheetHeaderAction";
import { MobileSheetHeader } from "./MobileSheetHeader";

type MobileNativeSheetScaffoldProps = {
  visible: boolean;
  /** Called when the native host has fully finished dismissing. */
  onDismiss?: () => void;
  onClose: () => void;
  /** Handles Android Back inside an in-sheet subflow without dismissing it. */
  onHardwareBackPress?: () => boolean;
  title?: string;
  subtitle?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  dismissLabel?: string;
  dismissDisabled?: boolean;
  /**
   * @deprecated The dismiss control is always the platform icon action now.
   * Retained so existing callers keep compiling.
   */
  dismissAsIcon?: boolean;
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
  onDismiss,
  onClose,
  onHardwareBackPress,
  title,
  subtitle,
  headerLeading,
  headerTrailing,
  dismissLabel,
  dismissDisabled = false,
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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetMethods | null>(null);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);
  const [sheetPresented, setSheetPresented] = useState(visible);
  const [closeInteractionLocked, setCloseInteractionLocked] = useState(
    !visible,
  );
  const sheetClosedRef = useRef(!visible);
  const closeRequestedRef = useRef(false);
  const previousVisibleRef = useRef(visible);
  const visibleRef = useRef(visible);
  const reopenAfterCloseRef = useRef(false);
  const reopenReadyRef = useRef(false);
  const availableSheetHeight = windowHeight - insets.top - insets.bottom;
  const headerMetrics = resolveMobileSheetHeaderMetrics(Platform.OS);
  const effectiveEnablePanDownToClose = canDismissMobileNativeSheetFromPan({
    dismissDisabled,
    enablePanDownToClose,
  });
  const boundDynamicAndroidLandscapeSheet =
    shouldBoundMobileNativeSheetForPlatform({
      platform: Platform.OS,
      width: windowWidth,
      height: windowHeight,
      snapPoints,
    });
  const normalizedSnapPoints = boundDynamicAndroidLandscapeSheet
    ? MOBILE_NATIVE_ANDROID_SNAP_POINTS
    : normalizeMobileNativeSheetSnapPointsForPlatform(snapPoints, Platform.OS);
  const effectiveSnapPointsSignature = normalizedSnapPoints
    ? JSON.stringify(normalizedSnapPoints)
    : null;
  // Native BottomSheet memoizes presentation detents and imperative methods by
  // array identity. Canonicalize equal values here so inline caller arrays and
  // unrelated form/loading renders cannot rebuild native presentation inputs.
  const effectiveSnapPoints = useMemo(
    () =>
      effectiveSnapPointsSignature === null
        ? undefined
        : (JSON.parse(effectiveSnapPointsSignature) as (string | number)[]),
    [effectiveSnapPointsSignature],
  );
  const resolvedSnapPointHeight = resolveSnapPointHeight(
    effectiveSnapPoints?.[0],
    availableSheetHeight,
  );
  const boundedSnapPointHeight = resolvedSnapPointHeight
    ? Math.min(Math.max(resolvedSnapPointHeight, 240), availableSheetHeight)
    : undefined;
  const shouldUseScrollView =
    (scroll || boundDynamicAndroidLandscapeSheet) &&
    Boolean(effectiveSnapPoints?.length);
  const resolvedDismissLabel = resolveMobileNativeSheetDismissLabel({
    dismissLabel,
    dismissDisabled,
    enablePanDownToClose: effectiveEnablePanDownToClose,
    showDismissButton,
  });
  const canDismissFromHardwareBack =
    canDismissMobileNativeSheetFromHardwareBack({
      dismissLabel,
      dismissDisabled,
      enablePanDownToClose: effectiveEnablePanDownToClose,
      showDismissButton,
    });
  const shouldRenderDismissButton = resolvedDismissLabel !== null;
  const shouldRenderChrome =
    Boolean(title) ||
    Boolean(headerLeading) ||
    Boolean(headerTrailing) ||
    shouldRenderDismissButton;
  const defaultHeaderHeight = headerMetrics.minimumHeight;
  const chromeHeight = shouldRenderChrome
    ? measuredHeaderHeight || defaultHeaderHeight
    : 0;
  const boundedContentHeight = boundedSnapPointHeight
    ? Math.max(boundedSnapPointHeight - chromeHeight, 188)
    : undefined;
  const paddingBottom =
    contentBottomInset ??
    (shouldUseScrollView
      ? (scrollContentBottomInset ?? Math.max(insets.bottom + 28, 40))
      : 18);
  const content = [
    styles.content,
    {
      paddingHorizontal: headerMetrics.bodyHorizontalPadding,
      paddingTop: headerMetrics.bodyTopPadding,
    },
    contentStyle,
    { paddingBottom },
  ];
  const bodyDescription = subtitle ? (
    <Text
      maxFontSizeMultiplier={headerMetrics.bodyDescriptionMaxFontSizeMultiplier}
      numberOfLines={headerMetrics.bodyDescriptionNumberOfLines ?? undefined}
      style={[
        styles.bodyDescription,
        {
          color: tokens.mutedForeground,
          fontSize: headerMetrics.bodyDescriptionFontSize,
          lineHeight: headerMetrics.bodyDescriptionLineHeight,
        },
      ]}
    >
      {subtitle}
    </Text>
  ) : null;
  const hasMultipleSnapPoints = (effectiveSnapPoints?.length ?? 0) > 1;
  const filledContentStyle =
    fillContent && hasMultipleSnapPoints
      ? styles.filledContent
      : fillContent && boundedContentHeight
      ? { height: boundedContentHeight }
      : fillContent
        ? styles.filledContent
        : null;
  const interactionLocked = closeInteractionLocked || !visible;
  const finishClose = useCallback(() => {
    if (sheetClosedRef.current) return;
    sheetClosedRef.current = true;
    closeRequestedRef.current = false;
    setCloseInteractionLocked(true);
    setSheetPresented(false);
    onClose();
    onDismiss?.();
  }, [onClose, onDismiss]);
  const handleClose = useCallback(() => {
    if (sheetClosedRef.current) return;
    if (reopenAfterCloseRef.current && visibleRef.current) {
      // A false -> true transition arrived after native dismissal had already
      // started. Let the completed native close commit an index=-1 frame, then
      // present the new visibility cycle without reporting a stale close.
      sheetClosedRef.current = true;
      closeRequestedRef.current = false;
      reopenAfterCloseRef.current = false;
      reopenReadyRef.current = true;
      setSheetPresented(false);
      return;
    }
    finishClose();
  }, [finishClose]);
  const requestSheetClose = useCallback(() => {
    if (sheetClosedRef.current || closeRequestedRef.current) return;
    // Native dismissal animations leave the React subtree mounted. Own the
    // first close intent immediately so a second tap cannot mutate data or
    // queue a different handoff while that animation is still running.
    setCloseInteractionLocked(true);
    const sheet = sheetRef.current;
    if (!sheet) {
      finishClose();
      return;
    }

    closeRequestedRef.current = true;
    sheet.close();
  }, [finishClose]);

  useLayoutEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const wasVisible = previousVisibleRef.current;
    previousVisibleRef.current = visible;
    if (visible) {
      if (!wasVisible) {
        if (closeRequestedRef.current) {
          reopenAfterCloseRef.current = true;
          return;
        }
        sheetClosedRef.current = false;
        reopenReadyRef.current = false;
        // Controlled visibility starts a new native presentation session.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCloseInteractionLocked(false);
        // A new controlled visibility cycle must re-present the native host.
        // The transition guard prevents an effect/render feedback loop.
        setSheetPresented(true);
      } else if (reopenReadyRef.current) {
        reopenReadyRef.current = false;
        sheetClosedRef.current = false;
        setCloseInteractionLocked(false);
        // Native dismissal has completed, so the canceled close can now start
        // a fresh presentation without racing the prior platform animation.
        setSheetPresented(true);
      }
      return;
    }

    reopenAfterCloseRef.current = false;
    reopenReadyRef.current = false;
    setCloseInteractionLocked(true);
    if (sheetPresented) requestSheetClose();
  }, [requestSheetClose, sheetPresented, visible]);

  // Keep Android hardware-back handling centralized so it follows the same
  // caller-approved close policy as the visible controls. Guarded sheets consume
  // back without closing rather than exposing an unintended escape route.
  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (onHardwareBackPress?.()) return true;
        if (canDismissFromHardwareBack) requestSheetClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [
    canDismissFromHardwareBack,
    onHardwareBackPress,
    requestSheetClose,
    visible,
  ]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={sheetPresented ? 0 : -1}
      snapPoints={effectiveSnapPoints}
      enableDynamicSizing={!effectiveSnapPoints?.length}
      enablePanDownToClose={effectiveEnablePanDownToClose}
      backgroundStyle={{ backgroundColor: backgroundColor ?? tokens.card }}
      onClose={handleClose}
    >
      {shouldRenderChrome ? (
        <View
          accessibilityElementsHidden={interactionLocked}
          importantForAccessibility={
            interactionLocked ? "no-hide-descendants" : "auto"
          }
          pointerEvents={interactionLocked ? "none" : "auto"}
        >
          <MobileSheetHeader
            leading={headerLeading}
            onLayout={(event) => {
              const nextHeight = Math.ceil(event.nativeEvent.layout.height);
              setMeasuredHeaderHeight((currentHeight) =>
                currentHeight === nextHeight ? currentHeight : nextHeight,
              );
            }}
            title={title ?? ""}
            trailing={
              headerTrailing ??
              // One dismiss control on every platform: the SwiftUI `xmark`
              // button on iOS, a bare `close-outline` glyph on a 48dp target
              // on Android. An Android text label would silently render as an
              // empty pressable, because this chrome never shows action labels.
              (shouldRenderDismissButton ? (
                <NemuNativeSheetHeaderAction
                  accessibilityLabel={resolvedDismissLabel}
                  androidIcon="close-outline"
                  iosSystemImage="xmark"
                  disabled={dismissDisabled}
                  onPress={requestSheetClose}
                />
              ) : null)
            }
          />
        </View>
      ) : null}
      {shouldUseScrollView ? (
        <View
          accessibilityElementsHidden={interactionLocked}
          importantForAccessibility={
            interactionLocked ? "no-hide-descendants" : "auto"
          }
          pointerEvents={interactionLocked ? "none" : "auto"}
          style={styles.scrollFrame}
        >
          <BottomSheetScrollView
            alwaysBounceVertical={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={[
              content,
              // The SwiftUI-hosted scroll view sizes its content intrinsically,
              // so flexGrow cannot resolve against the detent. An explicit
              // pixel floor lets in-content auto margins (pinned action rows)
              // absorb the leftover height.
              fillContent && boundedContentHeight
                ? { minHeight: boundedContentHeight }
                : null,
            ]}
            testID={testID}
          >
            {bodyDescription}
            {children}
          </BottomSheetScrollView>
        </View>
      ) : (
        <View
          accessibilityElementsHidden={interactionLocked}
          importantForAccessibility={
            interactionLocked ? "no-hide-descendants" : "auto"
          }
          pointerEvents={interactionLocked ? "none" : "auto"}
          style={[filledContentStyle, content]}
          testID={testID}
        >
          {bodyDescription}
          {children}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bodyDescription: {
    width: "100%",
    letterSpacing: 0,
  },
  scrollFrame: {
    flex: 1,
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
    paddingTop: 8,
  },
});
