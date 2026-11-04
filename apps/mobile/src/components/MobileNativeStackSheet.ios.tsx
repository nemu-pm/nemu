import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Group as SwiftGroup,
  Host as SwiftHost,
  NavigationDestination as SwiftNavigationDestination,
  NavigationStack as SwiftNavigationStack,
  RNHostView,
  ScrollView as SwiftScrollView,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  defaultScrollAnchor,
  disabled as swiftDisabled,
  font,
  interactiveDismissDisabled,
  lineLimit,
  presentationBackground,
  presentationBackgroundInteraction,
  presentationDragIndicator,
  scrollEdgeEffectStyle,
} from "@expo/ui/swift-ui/modifiers";
import { NemuGlassSheetThemeScope, useMobileSheetPlacement, useNemuTheme } from "@/design-system";
import { fittedSheetDetentWithin } from "@/lib/mobileFittedSheet";
import { mobileNativeStackSheetDetent, mobileNativeStackSheetMeasureKey } from "@/lib/mobileNativeStackSheet";
import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";
import { pushedPageWidthKey, READER_SETTINGS_FORM_INSET } from "@/lib/readerSettingsNativePopoverLayout";
import {
  fitSheetDetentToContent,
  inlineToolbarTitle,
  presentationColorScheme,
  presentationPlacement,
  reportPageWidth,
} from "../../modules/nemu-window-layout/src/presentationColorScheme";
import type {
  MobileNativeStackSheetLayout,
  MobileNativeStackSheetPage,
  MobileNativeStackSheetProps,
} from "./MobileNativeStackSheet.types";

export const mobileNativeStackSheetAvailable = true;

/** iOS 26+: the sheet is the system's Liquid Glass. */
const LIQUID_GLASS = supportsNemuLiquidGlass(Platform.OS, Platform.Version);

/** The pages' cards on the sheet: the translucent fills on glass (as the Form's groups), else the theme's. */
const PAGE_LOOK = LIQUID_GLASS ? "clear" : "opaque";

/** The page's React Native host: its width is the page's (reported to Yoga), its height its content's. */
const PAGE_MATCH_CONTENTS = { vertical: true } as const;

/** Until the page on top is measured, the sheet waits this long at most before presenting at the estimate. */
const MEASURE_WAIT_MS = 250;

/** Page widths the presented sheets reported, per group and window size (they outlive a presentation). */
const learnedPageWidths = new Map<string, number>();

/**
 * A system sheet with a navigation bar, as Apple's own settings sheets: each
 * page's title centred in the bar with ✕ at its trailing end, pages pushed
 * with the system back chevron (and its edge swipe), and React Native content
 * on the Form's inset in each page's native scroll view. The sheet is as tall
 * as the page on top (measured off screen before it presents when the page
 * gives an inert copy) and resizes with a push or pop. iOS only.
 */
export function MobileNativeStackSheet({
  visible,
  onClose,
  onDismiss,
  pages,
  onPop,
  closeAccessibilityLabel,
  closeDisabled = false,
  interactiveDismissDisabled: dismissDisabled = false,
  group,
  estimatedHeight,
  maxHeight = null,
  backgroundInteraction = false,
  background = "glass",
  testID,
}: MobileNativeStackSheetProps) {
  const { scheme } = useNemuTheme();
  const sheetPlacement = useMobileSheetPlacement();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const widthKey = `${group}:${Math.round(window.width)}x${Math.round(window.height)}`;
  const [, setWidthRevision] = useState(0);
  const pageWidth =
    learnedPageWidths.get(widthKey) ?? Math.max(0, Math.round(window.width - insets.left - insets.right));
  const learnPageWidth = useCallback(
    (width: number) => {
      if (!Number.isFinite(width) || width < 100) return;
      const known = learnedPageWidths.get(widthKey);
      if (known !== undefined && Math.abs(known - width) < 0.75) return;
      learnedPageWidths.set(widthKey, width);
      setWidthRevision((revision) => revision + 1);
    },
    [widthKey],
  );
  const layout: MobileNativeStackSheetLayout = { width: pageWidth, inset: READER_SETTINGS_FORM_INSET };

  // Heights per page at a width: the off-screen copies' before the sheet
  // presents, then the presented page's own (a row shown, an error).
  const [heights, setHeights] = useState<Record<string, number>>({});
  const recordHeight = useCallback((page: string, width: number, height: number) => {
    if (!(height > 0)) return;
    const key = mobileNativeStackSheetMeasureKey(page, width);
    setHeights((current) => (Math.abs((current[key] ?? -1) - height) < 0.5 ? current : { ...current, [key]: height }));
  }, []);

  const top = pages[pages.length - 1];
  const topHeight = top ? heights[mobileNativeStackSheetMeasureKey(top.id, pageWidth)] : undefined;

  // Present once the page on top has a height (or it has no copy to measure,
  // or the copy took too long): one presentation at the final detent.
  const [presented, setPresented] = useState(false);
  const waitingForHeight = Boolean(top?.measure) && topHeight === undefined;
  useEffect(() => {
    if (!visible) {
      setPresented(false);
      return;
    }
    if (presented) return;
    if (!waitingForHeight) {
      setPresented(true);
      return;
    }
    const timer = setTimeout(() => setPresented(true), MEASURE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [presented, visible, waitingForHeight]);

  // A close (✕ or a swipe) dismisses natively first and reports `onClose`
  // once the sheet is down, as the sheet scaffold does: a caller that unmounts
  // the sheet on close never cuts its dismissal short.
  const [closing, setClosing] = useState(false);
  if (closing && !visible) setClosing(false);
  // For a swipe SwiftUI can call `onDismiss` before the presented-state
  // change: the dismissal itself then reports the close, once.
  const visibleRef = useRef(visible);
  const dismissedRef = useRef(false);
  useLayoutEffect(() => {
    visibleRef.current = visible;
    if (visible) dismissedRef.current = false;
  }, [visible]);
  const requestClose = () => {
    if (!closeDisabled) setClosing(true);
  };

  const detent = fittedSheetDetentWithin(
    mobileNativeStackSheetDetent({ contentHeight: topHeight, estimatedHeight, windowHeight: window.height }),
    maxHeight,
  );

  // The path follows the pages one commit late, so a pushed page's content
  // is mounted (and laid out) before the stack slides it in.
  const targetPath = pages.slice(1).map((page) => page.id);
  const targetPathKey = targetPath.join("\u0000");
  const [path, setPath] = useState<string[]>(targetPath);
  useEffect(() => {
    setPath((current) => (current.join("\u0000") === targetPathKey ? current : targetPathKey ? targetPathKey.split("\u0000") : []));
  }, [targetPathKey]);
  // Pages stay mounted while they pop (their destination must outlive the
  // caller dropping them), and are forgotten once the sheet is down.
  // Read during render on purpose: the latest page objects, so a page
  // sliding out keeps the props it last had.
  const retained = useRef(new Map<string, MobileNativeStackSheetPage>());
  for (const page of pages.slice(1)) retained.current.set(page.id, page);
  if (!visible && !presented) retained.current.clear();
  const destinations = [...retained.current.values()];

  const renderPage = (page: MobileNativeStackSheetPage) => (
    <SwiftToolbar>
      <SwiftScrollView
        modifiers={[
          inlineToolbarTitle(),
          defaultScrollAnchor("top"),
          scrollEdgeEffectStyle("soft", "vertical"),
          reportPageWidth(learnPageWidth),
        ]}
      >
        <RNHostView matchContents={PAGE_MATCH_CONTENTS}>
          <View
            collapsable={false}
            style={[styles.page, { width: pageWidth }]}
            onLayout={(event: LayoutChangeEvent) => {
              recordHeight(page.id, pageWidth, event.nativeEvent.layout.height);
            }}
          >
            {/* A new width remounts the rows (never the host): laid out from scratch at it. */}
            <NemuGlassSheetThemeScope key={pushedPageWidthKey(pageWidth)} look={PAGE_LOOK}>
              {page.render(layout)}
            </NemuGlassSheetThemeScope>
          </View>
        </RNHostView>
      </SwiftScrollView>
      <SwiftToolbar.Content>
        <SwiftToolbarItem placement="principal">
          <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{page.title}</SwiftText>
        </SwiftToolbarItem>
        <SwiftToolbarItem placement="topBarTrailing">
          <SwiftButton
            role="close"
            onPress={requestClose}
            modifiers={[
              swiftAccessibilityLabel(closeAccessibilityLabel),
              ...(closeDisabled ? [swiftDisabled(true)] : []),
            ]}
          />
        </SwiftToolbarItem>
      </SwiftToolbar.Content>
    </SwiftToolbar>
  );

  const root = pages[0];
  const copies = pages.filter((page) => page.measure);

  return (
    <>
      {copies.length > 0 && visible ? (
        <MobileNativeStackSheetCopies pages={copies} layout={layout} onMeasure={recordHeight} />
      ) : null}
      <View pointerEvents="none" style={styles.host} testID={testID}>
        <SwiftHost colorScheme={scheme} style={StyleSheet.absoluteFill}>
          <SwiftBottomSheet
            isPresented={visible && presented && !closing}
            onIsPresentedChange={(isPresented) => {
              if (!isPresented && visible && !dismissedRef.current) setClosing(true);
            }}
            onDismiss={() => {
              if ((closing || visibleRef.current) && !dismissedRef.current) {
                dismissedRef.current = true;
                setClosing(false);
                onClose();
              }
              onDismiss?.();
            }}
          >
            <SwiftGroup
              modifiers={[
                fitSheetDetentToContent({
                  group: `stack-sheet:${group}`,
                  page: top?.id ?? "root",
                  initialHeight: estimatedHeight,
                  height: detent,
                }),
                presentationDragIndicator("visible"),
                presentationPlacement(sheetPlacement),
                ...(backgroundInteraction ? [presentationBackgroundInteraction("enabled")] : []),
                interactiveDismissDisabled(dismissDisabled),
                presentationColorScheme(scheme),
                ...(LIQUID_GLASS && background === "glass"
                  ? []
                  : [presentationBackground({ type: "material", material: "regular" })]),
              ]}
            >
              {root ? (
                <SwiftNavigationStack
                  path={path}
                  onPathChange={(next) => {
                    setPath(next);
                    if (next.length < targetPath.length) onPop?.(next.length + 1);
                  }}
                >
                  {renderPage(root)}
                  {destinations.map((page) => (
                    <SwiftNavigationDestination key={page.id} value={page.id}>
                      {renderPage(page)}
                    </SwiftNavigationDestination>
                  ))}
                </SwiftNavigationStack>
              ) : null}
            </SwiftGroup>
          </SwiftBottomSheet>
        </SwiftHost>
      </View>
    </>
  );
}

/** Each page's inert copy, laid out off screen at the page's width and measured. */
function MobileNativeStackSheetCopies({
  pages,
  layout,
  onMeasure,
}: {
  pages: MobileNativeStackSheetPage[];
  layout: MobileNativeStackSheetLayout;
  onMeasure: (page: string, width: number, height: number) => void;
}): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.measureRoot, { width: layout.width }]}
    >
      {pages.map((page) => (
        <View
          key={page.id}
          style={{ width: layout.width }}
          onLayout={(event) => onMeasure(page.id, layout.width, event.nativeEvent.layout.height)}
        >
          <NemuGlassSheetThemeScope look={PAGE_LOOK}>{page.measure?.(layout)}</NemuGlassSheetThemeScope>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
  page: {
    alignSelf: "stretch",
  },
  measureRoot: {
    position: "absolute",
    top: 0,
    left: -10000,
    opacity: 0,
  },
});
