import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  BackHandler,
  I18nManager,
  Keyboard,
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
import { LinearGradient } from "expo-linear-gradient";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { nemuColorWithAlpha } from "@/design/colorAlpha";
import type { NemuTheme } from "@/design/themeContext";
import {
  canDismissMobileNativeSheetFromPan,
  canDismissMobileNativeSheetFromHardwareBack,
  MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT,
  MOBILE_NATIVE_ANDROID_SNAP_POINTS,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  resolveMobileSheetHeaderMetrics,
  resolveMobileNativeSheetAndroidFrame,
  resolveMobileNativeSheetAndroidPlacement,
  resolveMobileNativeSheetBodyTopPadding,
  resolveMobileNativeSheetBottomPadding,
  resolveMobileNativeSheetDismissLabel,
  resolveMobileNativeSheetIosFramedDetentHeight,
  resolveMobileNativeSheetIosLayout,
  resolveMobileNativeSheetIosPresentation,
  resolveMobileNativeSheetSoftBottomEdge,
  shouldBoundMobileNativeSheetForPlatform,
} from "@/lib/mobileNativeSheet";
import { mobileSheetGlassLook } from "@/lib/mobileSheetGlass";
import { NemuGlassSheetThemeScope, useNemuGlassSheetTheme } from "./NemuGlassSheetThemeScope";
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
  /**
   * Android: draw the drag handle inside the sheet's own content instead of
   * Material's, so the content starts at the sheet's top edge. For sheets with
   * artwork that bleeds upward (the app-icon halo): Material's handle sits
   * outside the React host, whose top edge would otherwise clip the glow in a
   * hard line mid-sheet. Ignored on iOS.
   */
  androidContentHandle?: boolean;
  /**
   * iOS: safe-area edges the content extends into, so it reaches the sheet's
   * own edges where the safe area is not over it: the iPhone Duo outer
   * display's system vertical bar column (reserved at a spanning sheet's
   * trailing edge) and, for a sheet floating clear of the screen's bottom
   * edge, the home indicator's inset below its content.
   */
  contentIgnoresSafeAreaEdges?: MobileSheetSafeAreaEdge | MobileSheetSafeAreaEdge[];
  /**
   * For a `fillContent` body that is the caller's own scrolling list (no
   * `scroll`): the list runs to the sheet's bottom edge (on iOS through the
   * home indicator's inset) and fades out there instead of stopping in a hard
   * line above it. The list ends with `MobileNativeSheetEndSpacer` so its
   * last row still rests clear of the fade.
   */
  softBottomEdge?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/** The room the iOS sheet host leaves above the content for the system grabber. */
const MOBILE_NATIVE_SHEET_GRABBER_ROOM = 16;

const MobileNativeSheetEndInsetContext = createContext(0);

/**
 * The end of a `softBottomEdge` sheet's own list (its last footer item): the
 * room below the last row that keeps it clear of the bottom fade once
 * scrolled to the end. Nothing outside such a sheet.
 */
export function MobileNativeSheetEndSpacer() {
  const height = useContext(MobileNativeSheetEndInsetContext);
  return height > 0 ? <View pointerEvents="none" style={{ height }} /> : null;
}

/** A safe-area edge sheet content may extend into (`contentIgnoresSafeAreaEdges`). */
export type MobileSheetSafeAreaEdge = "leading" | "trailing" | "horizontal" | "bottom";

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

/** The look this platform draws a scaffold sheet with (see `mobileSheetGlassLook`). */
function resolveScaffoldGlassLook(backgroundColor: string | undefined) {
  return mobileSheetGlassLook({
    platformOS: Platform.OS,
    platformVersion: Platform.Version,
    customBackground: backgroundColor !== undefined,
  });
}

/**
 * The theme a `MobileNativeSheetScaffold`'s content draws with: on the iOS
 * 26 glass sheet, the glass look's tokens (translucent cards and fills,
 * lifted secondary text); elsewhere the theme itself. The scaffold provides
 * it to every component rendered inside it, but a component that returns
 * the scaffold builds its inline content outside that scope: it reads its
 * colours here instead of `useNemuTheme()`, or an opaque card slab and
 * unlifted secondary text land on the glass. Pass the scaffold's
 * `backgroundColor` when it has one (such a sheet stays opaque).
 */
export function useMobileNativeSheetTheme({
  backgroundColor,
}: { backgroundColor?: string } = {}): NemuTheme {
  return useNemuGlassSheetTheme(resolveScaffoldGlassLook(backgroundColor));
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
  androidContentHandle = false,
  contentIgnoresSafeAreaEdges,
  softBottomEdge = false,
  contentStyle,
  testID,
  children,
}: MobileNativeSheetScaffoldProps) {
  // iOS 26+ (`MOBILE_SHEET_GLASS_TRIAL`, tinted by default): the system
  // Liquid Glass sheet background, with the content's cards made translucent
  // (and, `tinted`, a veil under them). A caller that paints its own sheet
  // colour keeps it. The scaffold's own body text (the subtitle) draws with
  // the glass tokens too.
  const glassLook = resolveScaffoldGlassLook(backgroundColor);
  const { tokens } = useMobileNativeSheetTheme({ backgroundColor });
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
  // Android: the native sheet always wraps its content (no detents; see
  // `resolveMobileNativeSheetAndroidFrame`) and the scaffold sizes that content
  // to the height the same sheet has on iOS.
  const isAndroid = Platform.OS === "android";
  // Android: width-capped and centred when flat; inside the trailing pane in
  // book posture so the sheet never straddles the fold. (iOS presents system
  // sheets, which the system already moves off the fold.)
  const adaptive = useMobileAdaptiveLayout();
  const androidPlacementWidth = isAndroid ? adaptive.width : 0;
  const androidPlacementPosture = isAndroid ? adaptive.posture : "flat";
  const androidPlacementPanels = isAndroid ? adaptive.panels : null;
  const androidPlacement = useMemo(() => {
    if (!isAndroid) return null;
    const placement = resolveMobileNativeSheetAndroidPlacement({
      windowWidth: androidPlacementWidth || windowWidth,
      posture: androidPlacementPosture,
      panels: androidPlacementPanels ?? [],
      layoutDirection: I18nManager.isRTL ? "rtl" : "ltr",
    });
    return placement;
  }, [androidPlacementPanels, androidPlacementPosture, androidPlacementWidth, isAndroid, windowWidth]);
  const androidSheetPlacement = useMemo(
    () =>
      androidPlacement?.paneAligned
        ? { width: androidPlacement.width, offsetX: androidPlacement.offsetX }
        : undefined,
    [androidPlacement],
  );
  const androidKeyboardHeight = useSheetKeyboardHeight(isAndroid && visible);
  const androidFrameKind = isAndroid
    ? resolveMobileNativeSheetAndroidFrame({
        snapPoints,
        windowHeight,
        safeAreaTop: insets.top,
        safeAreaBottom: insets.bottom,
        keyboardHeight: androidKeyboardHeight,
      })
    : null;
  const androidFixedHeight =
    androidFrameKind?.kind === "fixed" ? androidFrameKind.height : undefined;
  const androidContentMaxHeight =
    androidFrameKind?.kind === "content" ? androidFrameKind.maxHeight : undefined;
  const normalizedSnapPoints = isAndroid
    ? undefined
    : boundDynamicAndroidLandscapeSheet
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
  // iOS: a presented sheet keeps the native sizing (content or detents) it
  // started with, because switching it mid-presentation leaves the sheet
  // without touches (see `resolveMobileNativeSheetIosPresentation`). The
  // caller's snap points still lay the content out below; only what the
  // native sheet is given is held.
  const [heldIosPresentation, setHeldIosPresentation] = useState(() =>
    resolveMobileNativeSheetIosPresentation({
      held: { sizing: "content", snapPoints: undefined },
      presented: false,
      snapPoints: effectiveSnapPoints,
    }),
  );
  const iosPresentation = resolveMobileNativeSheetIosPresentation({
    held: heldIosPresentation,
    presented: sheetPresented,
    snapPoints: effectiveSnapPoints,
  });
  if (iosPresentation !== heldIosPresentation) {
    setHeldIosPresentation(iosPresentation);
  }
  const iosLayout =
    Platform.OS === "ios"
      ? resolveMobileNativeSheetIosLayout({
          held: iosPresentation,
          snapPoints: effectiveSnapPoints,
        })
      : null;
  const nativeSnapPoints = iosLayout
    ? iosLayout.nativeSnapPoints
    : effectiveSnapPoints;
  const resolvedSnapPointHeight = resolveSnapPointHeight(
    effectiveSnapPoints?.[0],
    availableSheetHeight,
  );
  const boundedSnapPointHeight = resolvedSnapPointHeight
    ? Math.min(Math.max(resolvedSnapPointHeight, 240), availableSheetHeight)
    : undefined;
  // A content-sized presentation asked for a detent: the scaffold frames its
  // content at the height that detent shows and the native sheet wraps that.
  const framesIosDetent = Boolean(iosLayout?.framesDetent && boundedSnapPointHeight);
  const iosKeyboardHeight = useSheetKeyboardHeight(framesIosDetent && visible);
  const framedDetentHeight =
    framesIosDetent && boundedSnapPointHeight
      ? resolveMobileNativeSheetIosFramedDetentHeight({
          detentHeight: boundedSnapPointHeight,
          grabberRoom: MOBILE_NATIVE_SHEET_GRABBER_ROOM,
          windowHeight,
          safeAreaTop: insets.top,
          keyboardHeight: iosKeyboardHeight,
        })
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
  const androidScrolls = isAndroid && (scroll || androidFixedHeight === undefined);
  // A soft bottom edge needs a filled body the caller scrolls itself (not the
  // scaffold's own scroll view).
  const softEdge =
    softBottomEdge &&
    fillContent &&
    (isAndroid ? androidFixedHeight !== undefined && !scroll : !shouldUseScrollView)
      ? resolveMobileNativeSheetSoftBottomEdge({
          platform: Platform.OS,
          // The window's own (home indicator) inset: the sheet sits above
          // the tab bar a tab screen's insets also count.
          safeAreaBottom: initialWindowMetrics?.insets.bottom ?? insets.bottom,
        })
      : null;
  const paddingBottom = softEdge
    ? 0
    : contentBottomInset ??
    (shouldUseScrollView || androidScrolls ? scrollContentBottomInset : undefined) ??
    resolveMobileNativeSheetBottomPadding({
      platform: Platform.OS,
      scroll: shouldUseScrollView,
      safeAreaBottom: insets.bottom,
    });
  const drawContentHandle = isAndroid && androidContentHandle;
  const content = [
    styles.content,
    {
      paddingHorizontal: headerMetrics.bodyHorizontalPadding,
      paddingTop: resolveMobileNativeSheetBodyTopPadding({
        platform: Platform.OS,
        hasChrome: shouldRenderChrome,
      }),
    },
    StyleSheet.flatten(contentStyle),
    { paddingBottom },
    drawContentHandle
      ? { paddingTop: MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT }
      : null,
  ];
  const contentHandle = drawContentHandle ? (
    <View pointerEvents="none" style={styles.contentHandle}>
      <View
        style={[
          styles.contentHandleBar,
          { backgroundColor: nemuColorWithAlpha(tokens.foreground, 0.4) },
        ]}
      />
    </View>
  ) : null;
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
  const callerIgnoredEdges =
    contentIgnoresSafeAreaEdges === undefined
      ? []
      : Array.isArray(contentIgnoresSafeAreaEdges)
        ? contentIgnoresSafeAreaEdges
        : [contentIgnoresSafeAreaEdges];
  // iOS soft edge: the body reaches through the sheet's bottom safe area to
  // its own edge (the keyboard's region still applies).
  const ignoredEdgesSignature = JSON.stringify(
    softEdge && !isAndroid && !callerIgnoredEdges.includes("bottom")
      ? [...callerIgnoredEdges, "bottom"]
      : callerIgnoredEdges,
  );
  // Stable identity: the native sheet rebuilds its modifiers on a new array.
  const ignoredEdges = useMemo(() => {
    const edges = JSON.parse(ignoredEdgesSignature) as MobileSheetSafeAreaEdge[];
    return edges.length ? edges : undefined;
  }, [ignoredEdgesSignature]);
  // Content extended into the sheet's bottom safe area (a floating iOS sheet)
  // fills the host, which is then taller than the detent: a detent-sized
  // height would leave that inset empty under the body again.
  const contentReachesSheetBottom = !isAndroid && Boolean(ignoredEdges?.includes("bottom"));
  const filledContentStyle =
    fillContent && (hasMultipleSnapPoints || contentReachesSheetBottom)
      ? styles.filledContent
      : fillContent && boundedContentHeight
      ? { height: boundedContentHeight }
      : fillContent
        ? styles.filledContent
        : null;
  const interactionLocked = closeInteractionLocked || !visible;
  const body = (
    <MobileNativeSheetEndInsetContext.Provider value={softEdge?.endInset ?? 0}>
      {children}
    </MobileNativeSheetEndInsetContext.Provider>
  );
  // In the sheet's own colour: on the trial's Liquid Glass there is no
  // colour to fade into, so the list simply runs to the sheet's edge.
  const softEdgeColor = backgroundColor ?? tokens.card;
  const softEdgeFade =
    softEdge && glassLook === "opaque" ? (
      <LinearGradient
        pointerEvents="none"
        colors={[
          nemuColorWithAlpha(softEdgeColor, 0),
          nemuColorWithAlpha(softEdgeColor, 0.82),
          softEdgeColor,
        ]}
        locations={[0, 0.55, 1]}
        style={[styles.softEdgeFade, { height: softEdge.fadeHeight }]}
      />
    ) : null;
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

  const sheetContent = (
    <>
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
      {isAndroid ? (
        androidFixedHeight !== undefined && !scroll ? (
          // A detent sheet whose caller lays out its own body (pinned rows,
          // an internal list): the body fills the fixed height.
          <View
            accessibilityElementsHidden={interactionLocked}
            importantForAccessibility={
              interactionLocked ? "no-hide-descendants" : "auto"
            }
            pointerEvents={interactionLocked ? "none" : "auto"}
            style={[styles.filledContent, content]}
            testID={testID}
          >
            {contentHandle}
            {bodyDescription}
            {body}
            {softEdgeFade}
          </View>
        ) : (
          // Everything else scrolls: a detent sheet within its fixed height,
          // a content-sized one only once it outgrows the room it has.
          // `nestedScrollEnabled` hands the drag to the sheet at the top:
          // the ScrollView's unconsumed pull drags Material's sheet, and its
          // fling velocity settles it (a downward fling from the top
          // dismisses). Verify this with real, timed touch streams: a very
          // short `adb shell input swipe` (<= ~30ms) injects only one
          // post-slop MOVE, which the ScrollView spends on intercepting the
          // gesture, so the sheet never moves and Material's settle keeps it
          // open — an injection artifact, not a handoff bug. Kernel-level
          // 60/120/240Hz flicks dismiss reliably.
          <View
            accessibilityElementsHidden={interactionLocked}
            importantForAccessibility={
              interactionLocked ? "no-hide-descendants" : "auto"
            }
            pointerEvents={interactionLocked ? "none" : "auto"}
            style={androidFixedHeight !== undefined ? styles.scrollFrame : null}
          >
            <BottomSheetScrollView
              alwaysBounceVertical={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={
                androidFixedHeight !== undefined
                  ? styles.scroll
                  : [
                      styles.contentSizedScroll,
                      {
                        maxHeight: Math.max(
                          (androidContentMaxHeight ?? 0) - chromeHeight,
                          188,
                        ),
                      },
                    ]
              }
              contentContainerStyle={[
                content,
                fillContent && androidFixedHeight !== undefined
                  ? { flexGrow: 1 }
                  : null,
              ] as ComponentProps<typeof BottomSheetScrollView>["contentContainerStyle"]}
              testID={testID}
            >
              {contentHandle}
              {bodyDescription}
              {body}
            </BottomSheetScrollView>
          </View>
        )
      ) : shouldUseScrollView ? (
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
            // A chrome-less sheet's body starts under the system grabber: let
            // its artwork (the app-icon halo) and scrolled content draw up to
            // the sheet's own top edge instead of being cut in a hard line
            // where the scroll frame begins. The sheet still clips its shape.
            style={[styles.scroll, shouldRenderChrome ? null : styles.unclipped]}
            contentContainerStyle={[
              content,
              // The SwiftUI-hosted scroll view sizes its content intrinsically,
              // so flexGrow cannot resolve against the detent. An explicit
              // pixel floor lets in-content auto margins (pinned action rows)
              // absorb the leftover height.
              fillContent && boundedContentHeight
                ? { minHeight: boundedContentHeight }
                : null,
            ] as ComponentProps<typeof BottomSheetScrollView>["contentContainerStyle"]}
            testID={testID}
          >
            {bodyDescription}
            {body}
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
          {body}
          {softEdgeFade}
        </View>
      )}
    </>
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={sheetPresented ? 0 : -1}
      snapPoints={nativeSnapPoints}
      enableDynamicSizing={!nativeSnapPoints?.length}
      enablePanDownToClose={effectiveEnablePanDownToClose}
      // No background on glass: the system sheet's own Liquid Glass shows.
      backgroundStyle={
        glassLook === "opaque" ? { backgroundColor: backgroundColor ?? tokens.card } : undefined
      }
      onClose={handleClose}
      androidPlacement={androidSheetPlacement}
      contentIgnoresSafeAreaEdges={ignoredEdges}
      {...(drawContentHandle ? { handleComponent: null } : null)}
    >
      {isAndroid ? (
        <View style={{
          width: androidPlacement?.width ?? windowWidth,
          ...(androidFixedHeight !== undefined ? { height: androidFixedHeight } : {}),
        }}>
          {sheetContent}
        </View>
      ) : (
        <NemuGlassSheetThemeScope look={glassLook}>
          {framedDetentHeight !== undefined ? (
            <View style={{ height: framedDetentHeight }}>{sheetContent}</View>
          ) : (
            sheetContent
          )}
        </NemuGlassSheetThemeScope>
      )}
    </BottomSheet>
  );
}

/**
 * The open soft keyboard's height (0 when closed) while `active`, for a sheet
 * whose content the scaffold sizes itself. Android: Material's sheet pads its
 * content by the IME inset, so the scaffold has to shrink its own content by
 * the same amount (see `resolveMobileNativeSheetAndroidFrame`). iOS: a framed
 * detent (see `resolveMobileNativeSheetIosFramedDetentHeight`), resized as
 * the keyboard starts to move so the two travel together.
 */
function useSheetKeyboardHeight(active: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!active) {
      setHeight(0);
      return;
    }
    // A keyboard already open when the sheet presents.
    setHeight(Math.max(Keyboard.metrics()?.height ?? 0, 0));
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        setHeight(Math.max(event.endCoordinates?.height ?? 0, 0));
      },
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);
  return height;
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
  unclipped: {
    overflow: "visible",
  },
  filledContent: {
    flex: 1,
  },
  contentSizedScroll: {
    flexGrow: 0,
  },
  // Material 3's `BottomSheetDefaults.DragHandle`: a 32x4dp bar in a 48dp band.
  contentHandle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  softEdgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentHandleBar: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
