import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  BottomSheet as SwiftBottomSheet,
  Group as SwiftGroup,
  Host as SwiftHost,
  RNHostView,
} from "@expo/ui/swift-ui";
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileReaderPluginSettingsCard,
  MobileReaderPluginSettingsDescription,
  MobileReaderPluginSettingsTitle,
} from "@/components/MobileReaderPluginSettingsContent";
import { useMobileReaderPluginSignedInState } from "@/components/useMobileReaderPluginSignedInState";
import {
  MobileSheetHeader,
  NemuGlassSheetThemeScope,
  NemuInlineEmptyState,
  NemuNativeSheetHeaderAction,
  useNemuTheme,
} from "@/design-system";
import {
  createFittedSheetHostMetricsCache,
  fittedSheetGuessHostMetrics,
  fittedSheetPresentation,
  READER_PLUGIN_SHEET_GROUP,
  READER_PLUGIN_SHEET_LIST_PAGE,
  readerPluginSheetActivePage,
  readerPluginSheetPage,
} from "@/lib/mobileFittedSheet";
import type { MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_NATIVE_SHEET_BOTTOM_GUTTER } from "@/lib/mobileNativeSheet";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import type { MobileSheetGlassLook } from "@/lib/mobileSheetGlass";
import { MOBILE_SHEET_PAGE_TRANSITION_MS, mobileSheetSmoothEasing } from "@/lib/mobileSheetMotion";
import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";
import {
  fitSheetDetentToContent,
  presentationColorScheme,
} from "../../../modules/nemu-window-layout/src/presentationColorScheme";
import { ReaderPluginEnableRow, ReaderPluginListItem } from "./ReaderPluginSettingsRows";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

/** iOS 26+: the sheet floats on the system's Liquid Glass. */
const LIQUID_GLASS = supportsNemuLiquidGlass(Platform.OS, Platform.Version);

/**
 * On glass, the veiled look: the sheet sits over white and black manga pages
 * alike, and the veil keeps its (dark) text legible over both.
 */
const GLASS_LOOK: MobileSheetGlassLook = LIQUID_GLASS ? "tinted" : "opaque";

/** Where each window size's presented sheet laid its content out (survives the reader). */
const hostMetricsCache = createFittedSheetHostMetricsCache();

/** Until a presented sheet reports its own: a floating (inset, scaled) sheet in portrait on glass. */
function guessHostMetrics(width: number, height: number) {
  return fittedSheetGuessHostMetrics({
    window: { width, height },
    floating: LIQUID_GLASS && width < height,
  });
}

/** Room for the system grabber above a page's header (as `BottomSheet` hosts its content). */
const GRABBER_CLEARANCE = 16;

type MeasuredPages = Record<string, { width: number; height: number } | undefined>;

/**
 * The reader's Plugins sheet on iOS: a system sheet (dark, on iOS 26 Liquid
 * Glass) whose pages are the same React Native components as Settings →
 * Reader → Plugins: the plugin list (`ReaderPluginListItem`), and each
 * plugin's page — its mark and name, description, an on / off row, and the
 * shared settings card (`MobileReaderPluginSettingsCard`: engine picker, the
 * on-device dictionary line, the sign-in-gated assist switch, Reset).
 *
 * Sizing: every page is laid out off screen at the width the sheet shows it
 * at and measured before the sheet presents, so UIKit runs one presentation
 * at the final detent (`fitSheetDetentToContent({ height })`); pushing or
 * popping a page changes the detent, which the sheet animates with its own
 * spring while the pages slide on the same curve (`mobileSheetSmoothEasing`).
 * Taller than the screen, the system caps the detent at large and the page
 * scrolls.
 */
export function ReaderPluginSettingsSheet({
  visible,
  plugins,
  selectedPluginId,
  loading,
  error,
  loadError,
  busy,
  retryingLoad,
  canRetryLoadError,
  strings,
  onClose,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
  onSelectPlugin,
  onClearSelectedPlugin,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: ReaderPluginSettingsSheetProps) {
  const { scheme, tokens } = useNemuTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const guess = guessHostMetrics(windowWidth, windowHeight);
  const [, setLearnedRevision] = useState(0);
  const learned = hostMetricsCache.get({ width: windowWidth, height: windowHeight });
  const pageWidth = learned?.width ?? guess.width;
  const scale = learned?.scale ?? guess.scale;
  const learn = useCallback(
    (next: { width?: number; scale?: number }) => {
      const window = { width: windowWidth, height: windowHeight };
      if (hostMetricsCache.learn(window, next, guessHostMetrics(windowWidth, windowHeight))) {
        setLearnedRevision((revision) => revision + 1);
      }
    },
    [windowHeight, windowWidth],
  );

  const selectedPlugin = selectedPluginId
    ? (plugins.find((plugin) => plugin.id === selectedPluginId) ?? null)
    : null;
  const activePage = readerPluginSheetActivePage(selectedPlugin?.id ?? null);

  // The off-screen copies mount the first time the sheet is asked for and
  // stay (they are what lets every later open present at once).
  const [measuring, setMeasuring] = useState(visible);
  if (visible && !measuring) setMeasuring(true);
  const [measured, setMeasured] = useState<MeasuredPages>({});
  const recordPage = useCallback((page: string, width: number, height: number) => {
    setMeasured((current) => {
      const entry = current[page];
      if (entry && Math.abs(entry.width - width) < 0.5 && Math.abs(entry.height - height) < 0.5) return current;
      return { ...current, [page]: { width, height } };
    });
  }, []);

  const [sheet, setSheet] = useState({ presented: false, detent: 0 });
  const next = fittedSheetPresentation({
    visible,
    page: activePage,
    pageWidth,
    measured,
    scale,
    current: sheet,
  });
  if (next.presented !== sheet.presented || next.detent !== sheet.detent) setSheet(next);

  // The presented content's own size: the page frame while it is known, and
  // what teaches the copies the real width (iPad, landscape, a resized window).
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const handleHostLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setHostSize((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
      // Laid out by the presentation (not its 1×0 placeholder frame).
      if (height > 0) learn({ width });
    },
    [learn],
  );
  const contentWidth = hostSize.width > 0 ? hostSize.width : pageWidth;

  const renderList = (copy: boolean) => (
    <ReaderPluginListPage
      plugins={plugins}
      loading={loading}
      error={error}
      loadError={loadError}
      busy={copy ? false : busy}
      retryingLoad={retryingLoad}
      canRetryLoadError={canRetryLoadError}
      strings={strings}
      measuring={copy}
      onClose={onClose}
      onDismissError={onDismissError}
      onDismissLoadError={onDismissLoadError}
      onRetryLoad={onRetryLoad}
      onSelectPlugin={onSelectPlugin}
      onTogglePlugin={onTogglePlugin}
    />
  );

  return (
    <>
      {measuring ? (
        <ReaderPluginSheetMeasuringCopies
          plugins={plugins}
          loading={loading}
          error={error}
          loadError={loadError}
          retryingLoad={retryingLoad}
          canRetryLoadError={canRetryLoadError}
          strings={strings}
          width={pageWidth}
          onMeasure={recordPage}
        />
      ) : null}
      <View pointerEvents="none" style={styles.host} testID="ReaderPluginSettingsSheet">
        <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
          <SwiftBottomSheet
            isPresented={sheet.presented}
            onIsPresentedChange={(presented) => {
              if (!presented && visible) onClose();
            }}
          >
            <SwiftGroup
              modifiers={[
                // As tall as the page on top (measured before presenting);
                // capped at the large detent, where the page scrolls.
                fitSheetDetentToContent({
                  group: READER_PLUGIN_SHEET_GROUP,
                  page: activePage,
                  height: sheet.detent,
                }),
                presentationDragIndicator("visible"),
                // A toggle or reset in flight keeps the sheet up, so its
                // outcome (and any error) lands here, not behind the reader.
                interactiveDismissDisabled(busy),
                presentationColorScheme(scheme),
                // iOS 26: no background of our own, the system's Liquid Glass
                // sheet shows (dark, so it reads over white and black pages).
                ...(LIQUID_GLASS ? [] : [presentationBackground({ type: "material", material: "regular" })]),
              ]}
            >
              <RNHostView compensatesPresentationScale onPresentationScaleChange={(event) => learn({ scale: event.nativeEvent.scale })}>
                <View style={styles.hostContent} onLayout={handleHostLayout}>
                  <NemuGlassSheetThemeScope look={GLASS_LOOK}>
                    <ReaderPluginSheetPager
                      width={contentWidth}
                      maxHeight={hostSize.height}
                      selectedPluginId={selectedPlugin?.id ?? null}
                      listHeight={measured[READER_PLUGIN_SHEET_LIST_PAGE]?.height}
                      list={renderList(false)}
                      detailHeight={(pluginId) => measured[readerPluginSheetPage(pluginId)]?.height}
                      renderDetail={(pluginId) => {
                        const plugin = plugins.find((item) => item.id === pluginId);
                        return plugin ? (
                          <ReaderPluginDetailPage
                            plugin={plugin}
                            busy={busy}
                            loading={loading}
                            error={error}
                            strings={strings}
                            onBack={onClearSelectedPlugin}
                            onTogglePlugin={onTogglePlugin}
                            onResetPlugin={onResetPlugin}
                            onChangePluginValue={onChangePluginValue}
                          />
                        ) : null;
                      }}
                    />
                  </NemuGlassSheetThemeScope>
                </View>
              </RNHostView>
            </SwiftGroup>
          </SwiftBottomSheet>
        </SwiftHost>
      </View>
    </>
  );
}

/**
 * The list and the pushed plugin page, stacked: a push slides the plugin in
 * from the trailing edge while the list drifts back and fades (the pages are
 * transparent on glass, so they never overlap at full strength); a pop runs
 * it backwards. One curve with the sheet's own resize.
 */
function ReaderPluginSheetPager({
  width,
  maxHeight,
  selectedPluginId,
  list,
  listHeight,
  renderDetail,
  detailHeight,
}: {
  width: number;
  /** The presented content's height (0 until known). */
  maxHeight: number;
  selectedPluginId: string | null;
  list: ReactNode;
  listHeight: number | undefined;
  renderDetail: (pluginId: string) => ReactNode;
  detailHeight: (pluginId: string) => number | undefined;
}) {
  const { reduceMotion } = useNemuTheme();
  // The page being shown or leaving: kept through the pop's slide out.
  const [detailId, setDetailId] = useState(selectedPluginId);
  if (selectedPluginId !== null && selectedPluginId !== detailId) setDetailId(selectedPluginId);
  const target = selectedPluginId ? 1 : 0;
  const progress = useSharedValue(target);
  useEffect(() => {
    progress.value = withTiming(
      target,
      { duration: reduceMotion ? 0 : MOBILE_SHEET_PAGE_TRANSITION_MS, easing: mobileSheetSmoothEasing },
      (finished) => {
        if (finished && target === 0) runOnJS(setDetailId)(null);
      },
    );
  }, [progress, reduceMotion, target]);

  const listStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], "clamp"),
    transform: [{ translateX: -progress.value * width * 0.3 }],
  }));
  const detailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], "clamp"),
    transform: [{ translateX: (1 - progress.value) * width }],
  }));

  const frame = (height: number | undefined) => ({
    width,
    // Natural height (measured) while it fits; the presented height once the
    // page is taller than the sheet can grow, where its body scrolls.
    height: height === undefined ? maxHeight || undefined : maxHeight > 0 ? Math.min(height, maxHeight) : height,
  });
  const showingDetail = selectedPluginId !== null;

  return (
    <View style={styles.pager}>
      <Animated.View
        accessibilityElementsHidden={showingDetail}
        importantForAccessibility={showingDetail ? "no-hide-descendants" : "auto"}
        pointerEvents={showingDetail ? "none" : "box-none"}
        style={[styles.pagerPage, frame(listHeight), listStyle]}
      >
        {list}
      </Animated.View>
      {detailId ? (
        <Animated.View
          accessibilityElementsHidden={!showingDetail}
          importantForAccessibility={showingDetail ? "auto" : "no-hide-descendants"}
          pointerEvents={showingDetail ? "box-none" : "none"}
          style={[styles.pagerPage, frame(detailHeight(detailId)), detailStyle]}
        >
          {renderDetail(detailId)}
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A page of the sheet: its header row and a body that scrolls once the page
 * is taller than the sheet. The measuring copy lays the same body out flat
 * (a plain view: its natural height is the page's).
 */
function ReaderPluginSheetPage({
  measuring,
  header,
  children,
}: {
  measuring: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={[styles.page, measuring ? null : styles.pageFill]}>
      {header}
      {measuring ? (
        <View style={styles.pageBody}>{children}</View>
      ) : (
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.pageBody}
          keyboardShouldPersistTaps="handled"
          style={styles.pageScroll}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

const noop = () => {};

function ReaderPluginListPage({
  plugins,
  loading,
  error,
  loadError,
  busy,
  retryingLoad,
  canRetryLoadError,
  strings,
  measuring,
  onClose,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
  onSelectPlugin,
  onTogglePlugin,
}: {
  plugins: MobileReaderPluginState[];
  loading: boolean;
  error: string | null;
  loadError: string | null;
  busy: boolean;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  strings: MobileStrings;
  measuring: boolean;
  onClose: () => void;
  onDismissError: () => void;
  onDismissLoadError: () => void;
  onRetryLoad: () => void;
  onSelectPlugin: (pluginId: string) => void;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
}) {
  return (
    <ReaderPluginSheetPage
      measuring={measuring}
      header={
        <MobileSheetHeader
          title={strings.settings.plugins}
          trailing={
            <NemuNativeSheetHeaderAction
              accessibilityLabel={strings.common.done}
              androidIcon="close-outline"
              iosSystemImage="xmark"
              disabled={busy}
              onPress={measuring ? noop : onClose}
            />
          }
        />
      }
    >
      {error ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={error}
          dismissLabel={strings.common.clear}
          onDismiss={measuring ? noop : onDismissError}
          variant="embedded"
        />
      ) : null}
      {loadError ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={loadError}
          actionLabel={strings.common.retry}
          actionDisabled={!canRetryLoadError}
          actionLoading={retryingLoad}
          dismissLabel={strings.common.clear}
          onActionPress={measuring ? noop : onRetryLoad}
          onDismiss={measuring ? noop : onDismissLoadError}
          variant="embedded"
        />
      ) : null}
      {loading && plugins.length === 0 ? (
        <NemuInlineEmptyState icon="hourglass-outline" title={strings.settings.loadingReaderPlugins} />
      ) : (
        plugins.map((plugin) => (
          <ReaderPluginListItem
            key={plugin.id}
            plugin={plugin}
            busy={busy}
            strings={strings}
            onOpen={measuring ? noop : () => onSelectPlugin(plugin.id)}
            onToggle={measuring ? noop : (enabled) => onTogglePlugin(plugin, enabled)}
          />
        ))
      )}
    </ReaderPluginSheetPage>
  );
}

/**
 * A plugin's page: Settings' plugin page (description and the shared
 * settings card) under a header with the back action and the plugin's mark
 * and name, plus the plugin's on / off row. Off, the settings stay visible
 * (dimmed) so the page keeps its shape when the switch flips.
 */
function ReaderPluginDetailPage({
  plugin: storedPlugin,
  busy,
  loading,
  error,
  strings,
  measuring = false,
  onBack,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: {
  plugin: MobileReaderPluginState;
  busy: boolean;
  loading: boolean;
  error: string | null;
  strings: MobileStrings;
  /** The off-screen measuring copy: inert, never starts a dictionary download. */
  measuring?: boolean;
  onBack: () => void;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
  onResetPlugin: ReaderPluginSettingsSheetProps["onResetPlugin"];
  onChangePluginValue: ReaderPluginSettingsSheetProps["onChangePluginValue"];
}) {
  const plugin = useMobileReaderPluginSignedInState(storedPlugin, strings);
  return (
    <ReaderPluginSheetPage
      measuring={measuring}
      header={
        <View style={styles.detailHeader}>
          <View style={styles.detailHeaderSide}>
            <NemuNativeSheetHeaderAction
              accessibilityLabel={strings.common.back}
              androidIcon="arrow-back"
              iosSystemImage="chevron.backward"
              onPress={measuring ? noop : onBack}
            />
          </View>
          <View style={styles.detailHeaderTitle}>
            <MobileReaderPluginSettingsTitle plugin={plugin} numberOfLines={1} />
          </View>
          <View style={styles.detailHeaderSide} />
        </View>
      }
    >
      <MobileReaderPluginSettingsDescription plugin={plugin} />
      <ReaderPluginEnableRow
        plugin={plugin}
        busy={busy}
        strings={strings}
        onToggle={measuring ? noop : (enabled) => onTogglePlugin(plugin, enabled)}
      />
      <MobileReaderPluginSettingsCard
        plugin={plugin}
        strings={strings}
        disabled={busy || !plugin.enabled}
        loading={loading}
        error={error}
        inert={measuring}
        onReset={measuring ? noop : () => onResetPlugin(plugin)}
        onChange={measuring ? noop : (key, value) => onChangePluginValue(plugin, key, value)}
      />
    </ReaderPluginSheetPage>
  );
}

/**
 * Every page — the list and each plugin's — laid out off screen at the
 * sheet's width and measured, so the sheet presents once, natively, at the
 * height of its page and resizes along with a push or pop instead of after
 * it. Memoised on what changes a page's height only: opening the sheet (or a
 * busy flag) must not re-render them while the sheet animates.
 */
const ReaderPluginSheetMeasuringCopies = memo(function ReaderPluginSheetMeasuringCopies({
  plugins,
  loading,
  error,
  loadError,
  retryingLoad,
  canRetryLoadError,
  strings,
  width,
  onMeasure,
}: {
  plugins: MobileReaderPluginState[];
  loading: boolean;
  error: string | null;
  loadError: string | null;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  strings: MobileStrings;
  width: number;
  onMeasure: (page: string, width: number, height: number) => void;
}) {
  const measure = (page: string) => (event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    onMeasure(page, layout.width, layout.height);
  };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.measureRoot, { width }]}
    >
      <View onLayout={measure(READER_PLUGIN_SHEET_LIST_PAGE)} style={{ width }}>
        <ReaderPluginListPage
          plugins={plugins}
          loading={loading}
          error={error}
          loadError={loadError}
          busy={false}
          retryingLoad={retryingLoad}
          canRetryLoadError={canRetryLoadError}
          strings={strings}
          measuring
          onClose={noop}
          onDismissError={noop}
          onDismissLoadError={noop}
          onRetryLoad={noop}
          onSelectPlugin={noop}
          onTogglePlugin={noop}
        />
      </View>
      {plugins.map((plugin) => (
        <View key={plugin.id} onLayout={measure(readerPluginSheetPage(plugin.id))} style={{ width }}>
          <ReaderPluginDetailPage
            plugin={plugin}
            busy={false}
            loading={loading}
            error={error}
            strings={strings}
            measuring
            onBack={noop}
            onTogglePlugin={noop}
            onResetPlugin={noop}
            onChangePluginValue={noop}
          />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
  hostContent: {
    flex: 1,
  },
  pager: {
    flex: 1,
    overflow: "hidden",
  },
  pagerPage: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  page: {
    paddingTop: GRABBER_CLEARANCE,
  },
  pageFill: {
    flex: 1,
  },
  pageScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  pageBody: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: MOBILE_NATIVE_SHEET_BOTTOM_GUTTER,
  },
  detailHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  detailHeaderSide: {
    width: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  detailHeaderTitle: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  measureRoot: {
    position: "absolute",
    top: 0,
    left: -10000,
    opacity: 0,
  },
});
