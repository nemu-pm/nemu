import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { MobileReaderScrubber } from "@/components/MobileReaderScrubber";
import { ReaderChromePanel } from "@/components/reader/ReaderChromePanel";
import { ReaderDisplaySettingsPopover } from "@/components/reader/ReaderDisplaySettingsPopover";
import {
  MobileReaderGallery,
  type MobileReaderScrollHandle,
} from "@/components/reader/MobileReaderGallery";
import { MobileReaderPageFrame } from "@/components/reader/MobileReaderPageFrame";
import { MobileReaderEndOfChapterOverlay } from "@/components/reader/MobileReaderEndOfChapterOverlay";
import { JapaneseLearningPluginLauncherSheet } from "@/components/reader/japaneseLearning/JapaneseLearningPluginLauncherSheet";
import { JapaneseLearningOcrResultSheet } from "@/components/reader/japaneseLearning/JapaneseLearningOcrResultSheet";
import { JapaneseLearningNemuChatDrawer } from "@/components/reader/japaneseLearning/JapaneseLearningNemuChatDrawer";
import { JapaneseLearningTranscriptSheet } from "@/components/reader/japaneseLearning/JapaneseLearningTranscriptSheet";
import {
  MobileSheetBackdrop,
  GlassSurface,
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { MobileSourceSettingsCard } from "@/components/MobileSourceSettingsCard";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
  makeChapterProgressId,
  makeMangaProgressId,
  type ChapterSummary,
  type InstalledSource,
  type LocalChapterProgress,
  type LocalMangaProgress,
} from "@/data/schema";
import { formatChapterTitle } from "@/lib/formatChapter";
import { getMobileReaderHardwareBackAction } from "@/lib/mobileReaderBackBehavior";
import {
  hapticConfirm,
  hapticError,
  hapticPress,
  hapticSelection,
} from "@/lib/haptics";
import {
  canRunMobileSwitchSelectionFeedback,
  getMobileSwitchAccessibilityState,
} from "@/lib/mobileAccessibility";
import {
  useInstalledSources,
  useMobileLanguageSettings,
  useMobileReaderPlugins,
  useReadingMode,
} from "@/data/mobileHooks";
import {
  formatMobileSettingsCount,
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { getMobileReaderChapterNavigation } from "@/lib/mobileReaderChapters";
import { findMobileReaderLibrarySource } from "@/lib/mobileReaderLibrary";
import {
  countRenderableSourceSettings,
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  getMobileSourceErrorPresentation,
  sanitizeMobileErrorDiagnostic,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import {
  canRetryMobileReaderPluginSettingsLoadError,
  canStartMobileReaderSettingsAction,
  clampReaderScrollWidthPct,
  isMobileReaderSettingsActionBusy,
  readerScrollWidthScale,
  shouldShowReaderPagePairingControls,
} from "@/lib/mobileReaderSettings";
import {
  buildMobileReaderDisplaySpreads,
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
} from "@/lib/mobileReaderSpreads";
import {
  clampReaderPageIndex,
  readerDisplayIndexForRoutePage,
  readerDisplayIndexForSourceIndex,
  readerDisplayIndexFromOffset,
  type ReaderScrollPageMetric,
  readerProgressDisplayIndexForVisiblePages,
  readerRoutePageForDisplayIndex,
  readerLogicalFrameIndexForVisualFrame,
  readerScrollOffsetForLogicalFrame,
  readerSourceIndexForDisplayIndex,
  readerSourceStepTargetForDisplayIndex,
  readerPageArrivalForStep,
  shouldAutoCompleteMobileReaderChapter,
  type MobileReaderPageArrival,
} from "@/lib/mobileReaderProgress";
import {
  mobileReaderProgressPersistenceKey,
  normalizeMobileReaderIntraPageState,
  persistMobileReaderCompletionBeforeNavigation,
} from "@/lib/mobileReaderProgressPersistence";
import { getMobileReaderPageRenderPolicy } from "@/lib/mobileReaderPageWindow";
import { isMobileReaderImageLoading } from "@/lib/mobileReaderImageStatus";
import {
  getMobileReaderImageFrameSize,
  isMobileReaderLongStripLogicalPage,
  shouldUseMobileReaderLongStripPresentation,
} from "@/lib/mobileReaderLongStripPresentation";
import {
  canUseMobileReaderWholeImageTools,
  getMobileReaderLogicalPageIdentity,
  getMobileReaderSegmentFrames,
  getMobileReaderSegmentedCacheDiscriminator,
  MOBILE_READER_SEGMENTED_CAPABILITIES,
  shouldCompleteSingleImageReaderPage,
  type MobileReaderSegmentFrame,
} from "@/lib/mobileReaderSegmentedImage";
import {
  invalidateCachedMobileImage,
  retainCachedMobileImageAsset,
  type MobileCachedSegmentedImageAsset,
} from "@/lib/mobileImageCache";
import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import {
  findMobileMangaProgressForSource,
  loadMobileChapterProgressForSourceChapter,
} from "@/lib/mobileMangaDetailProgress";
import {
  MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE,
  clampMobileReaderZoomOffset,
  clampMobileReaderZoomScale,
  shouldResetMobileReaderZoom,
} from "@/lib/mobileReaderZoom";
import { getMobileReaderTitle } from "@/lib/mobileReaderHeader";
import {
  readerBottomBarEntering,
  readerBottomBarExiting,
  readerTopBarEntering,
  readerTopBarExiting,
} from "@/lib/mobileReaderChromeAnimations";
import {
  chapterFromState,
  firstParam,
  formatChapterAccessibilityLabel,
  formatReaderLoadedPages,
  formatReaderStageAccessibilityLabel,
  mergeMobileReaderChapterFallback,
  mobileReaderSettingsActionStateFromAction,
  readerSourceLinkReference,
} from "@/lib/mobileReaderFormat";
import type {
  ReaderSettingsAction,
  ReaderState,
} from "@/lib/mobileReaderTypes";
import {
  mobileJapaneseLearningChatErrorDetail,
  mobileJapaneseLearningChatRequestMessages,
  mobileJapaneseLearningSentenceText,
  mobileOcrLabelColor,
  mobileOcrLineKey,
  sortedMobileOcrLines,
  type JapaneseLearningChatThreadMessage,
} from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  runMobileJapaneseLearningOcr,
  type MobileOcrDetection,
  type MobileJapaneseLearningOcrResult,
} from "@/lib/mobileJapaneseLearningOcr";
import {
  getMobileJapaneseLearningExplainPrompt,
  type MobileJapaneseLearningChatStreamCallbacks,
  parseMobileJapaneseLearningResponseMode,
  runMobileJapaneseLearningChat,
  stripMobileJapaneseLearningAudioTags,
  type MobileJapaneseLearningChatResult,
  type MobileJapaneseLearningChatToolCall,
  type MobileJapaneseLearningChatToolResult,
} from "@/lib/mobileJapaneseLearningChat";
import { getGreetingPrompt, nextSyncTimestamp } from "@nemu/core";
import { getMobileInstalledSourceRouteRef } from "@/lib/mobileSourceRouteRef";
import {
  getMobileSourceReaderBackAction,
  getMobileSourceReaderHref,
  normalizeMobileReaderRouteLabel,
  normalizeMobileSourceRouteParam,
  parseMobileReaderRouteNumber,
} from "@/lib/mobileSourceRoutes";
import {
  runMobileJapaneseLearningGrammar,
  serializeMobileGrammarTokens,
  type MobileGrammarResult,
} from "@/lib/mobileJapaneseLearningGrammar";
import { generateMobileJapaneseLearningTts } from "@/lib/mobileJapaneseLearningTts";
import { createMobileJapaneseLearningScreenLifecycle } from "@/lib/mobileJapaneseLearningScreenLifecycle";
import { clearMobileReaderImageMemoryCache } from "@/lib/mobileReaderImageMemory";
import { findMobileTranscriptPlaybackLineOrder } from "@/lib/mobileJapaneseLearningTranscriptTiming";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesRoute,
} from "@/lib/mobileInstalledSourceKeys";
import {
  computeMobileOcrDetectionRect,
  type MobileImageSize,
} from "@/lib/mobileJapaneseLearningOverlay";
import {
  refreshMobileReaderPages,
  type MobileReaderPage,
  type MobileReaderPageProcessor,
  type MobileReaderPageWindowResult,
} from "@/sources/mobileSourcePages";
import { refreshMobileSourceMetadata } from "@/sources/mobileSourceDetails";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  applyMobileSourcePackageHydration,
  type MobileSourcePackageHydration,
} from "@/sources/mobileSourcePackageLoader";
import type {
  MobileReaderPluginId,
  MobileReaderPluginState,
} from "@/lib/mobileReaderPlugins";
import {
  canOpenMobileReaderPluginSettingsAction,
  canSelectMobileReaderPluginOption,
  isMobileReaderPluginVisible,
} from "@/lib/mobileReaderPlugins";
import { MobileDualReaderOverlay } from "@/components/MobileDualReaderOverlay";
import { MobileDualReaderRoot } from "@/components/MobileDualReaderRoot";
import {
  getMobileDualReadStore,
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";
import { sortMobileSourceLinks } from "@/lib/mobileSourceLinks";
import { mobileAuthClient } from "@/sync/mobileAuthClient";

const ReaderStatusBar = memo(StatusBar);

type ReaderPagesState =
  | { status: "idle"; pages: MobileReaderPage[]; detail: string }
  | { status: "loading"; pages: MobileReaderPage[]; detail: string }
  | {
      status: "ready";
      pages: MobileReaderPage[];
      chapters: ChapterSummary[];
      detail: string;
      fetchedAt: number;
      chapter: ChapterSummary;
      pageProcessor?: MobileReaderPageProcessor;
    }
  | {
      status: "blocked";
      pages: MobileReaderPage[];
      detail: string;
      title?: string;
    }
  | {
      status: "error";
      pages: MobileReaderPage[];
      detail: string;
      title?: string;
    };

type MobileReaderPersistProgressOptions = {
  silent?: boolean;
  throwOnError?: boolean;
  updateState?: boolean;
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
};

type JapaneseLearningOcrState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: MobileJapaneseLearningOcrResult }
  | { status: "error"; detail: string };

type JapaneseLearningChatState =
  | { status: "idle" }
  | { status: "loading"; streamingMessageId?: string }
  | { status: "ready"; result: MobileJapaneseLearningChatResult }
  | { status: "error"; detail: string };

type JapaneseLearningChatTtsOptions = {
  autoPlayNext?: boolean;
  haptic?: boolean;
};

type JapaneseLearningGrammarState =
  | { status: "idle" }
  | { status: "loading"; text: string; stage: "normalizing" | "tokenizing" }
  | { status: "ready"; text: string; result: MobileGrammarResult }
  | { status: "error"; text: string; detail: string };

type JapaneseLearningTtsState =
  | { status: "idle" }
  | {
      status: "loading";
      text: string;
      source: "sentence" | "transcript" | "chat";
      messageId?: string;
      currentTime?: number;
      duration?: number;
    }
  | {
      status: "playing";
      text: string;
      id: string;
      source: "sentence" | "transcript" | "chat";
      messageId?: string;
      currentTime?: number;
      duration?: number;
    }
  | { status: "error"; detail: string };

const EMPTY_READER_SOURCE_LANGUAGES: string[] = [];
/** How long the chrome stays up after a chapter opens before it fades away. */
const READER_CHROME_AUTO_HIDE_MS = 3000;

/**
 * Localized copy first, raw exception text only as a parenthetical.
 *
 * Showing `error.message` as the primary message puts untranslated (often
 * English, often internal) runtime text in front of the reader; the localized
 * string is the one that explains what happened.
 */
function readerErrorDetail(
  error: unknown,
  localizedMessage: string,
  strings: MobileStrings,
): string {
  const reason = sanitizeMobileErrorDiagnostic(error) ?? "";
  if (!reason || reason === localizedMessage) return localizedMessage;
  return formatMobileString(strings.reader.errorDetailWithReason, {
    message: localizedMessage,
    reason,
  });
}
function JapaneseLearningDetectionOverlay({
  detections,
  imageSize,
  frameSize,
  activeOrder,
  selectedOrder,
  strings,
  onSelectDetection,
}: {
  detections: MobileOcrDetection[];
  imageSize: MobileImageSize | null;
  frameSize: MobileImageSize;
  activeOrder: number | null;
  selectedOrder: number | null;
  strings: MobileStrings;
  onSelectDetection: (detection: MobileOcrDetection) => void;
}) {
  const { tokens } = useNemuTheme();
  if (!imageSize || detections.length === 0) return null;

  return (
    <View style={styles.japaneseLearningOverlay}>
      {detections.map((detection) => {
        const rect = computeMobileOcrDetectionRect(
          detection,
          frameSize,
          imageSize,
        );
        if (!rect) return null;
        const selected = selectedOrder === detection.order;
        const active = activeOrder === detection.order;
        const color = mobileOcrLabelColor(detection.label, tokens);
        return (
          <NemuPressable
            key={mobileOcrLineKey(detection)}
            accessibilityRole="button"
            accessibilityLabel={formatMobileString(
              strings.reader.pluginJapaneseLearningLineAccessibility,
              { text: detection.text.trim() },
            )}
            accessibilityState={{ selected }}
            onPress={() => onSelectDetection(detection)}
            // Selecting a detection must not bubble to the reader stage's
            // touch handlers and toggle the chrome at the same time.
            onTouchEnd={(event) => event.stopPropagation()}
            pressedScale={0.98}
            style={[
              styles.japaneseLearningDetectionBox,
              {
                left: rect.left,
                top: rect.top,
                width: Math.max(10, rect.width),
                height: Math.max(10, rect.height),
                backgroundColor: `${color}${selected ? "55" : active ? "46" : "2E"}`,
                borderColor: color,
                opacity: selected || active ? 1 : 0.72,
              },
            ]}
          >
            <View />
          </NemuPressable>
        );
      })}
    </View>
  );
}

function ZoomableReaderImageFrame({
  children,
  frameSize,
  pageId,
}: {
  children: ReactNode;
  frameSize: MobileImageSize;
  pageId: string;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [
    pageId,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const frameWidth = frameSize.width;
  const frameHeight = frameSize.height;
  const springConfig = {
    damping: 20,
    mass: 0.7,
    stiffness: 220,
  };

  const resetZoom = () => {
    "worklet";
    scale.value = withSpring(1, springConfig);
    savedScale.value = 1;
    translateX.value = withSpring(0, springConfig);
    translateY.value = withSpring(0, springConfig);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = clampMobileReaderZoomScale(
        savedScale.value * event.scale,
      );
      scale.value = nextScale;
      translateX.value = clampMobileReaderZoomOffset(
        translateX.value,
        frameWidth,
        nextScale,
      );
      translateY.value = clampMobileReaderZoomOffset(
        translateY.value,
        frameHeight,
        nextScale,
      );
    })
    .onEnd(() => {
      if (shouldResetMobileReaderZoom(scale.value)) {
        resetZoom();
        return;
      }

      const nextScale = clampMobileReaderZoomScale(scale.value);
      scale.value = nextScale;
      savedScale.value = nextScale;
      translateX.value = clampMobileReaderZoomOffset(
        translateX.value,
        frameWidth,
        nextScale,
      );
      translateY.value = clampMobileReaderZoomOffset(
        translateY.value,
        frameHeight,
        nextScale,
      );
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .averageTouches(true)
    // Single-finger panning is what a zoomed page needs, but at scale 1 that
    // same finger belongs to the gallery's page swipe. Manual activation lets
    // the gesture claim the touch only while zoomed in, and fail immediately
    // otherwise so the FlatList keeps its swipe.
    .manualActivation(true)
    .onTouchesMove((event, stateManager) => {
      "worklet";
      // Two fingers always pan (this is the pinch companion that already
      // worked); one finger only pans once the page is actually zoomed.
      if (event.numberOfTouches >= 2 || scale.value > 1) {
        stateManager.activate();
        return;
      }
      stateManager.fail();
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = clampMobileReaderZoomOffset(
        savedTranslateX.value + event.translationX,
        frameWidth,
        scale.value,
      );
      translateY.value = clampMobileReaderZoomOffset(
        savedTranslateY.value + event.translationY,
        frameHeight,
        scale.value,
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onStart((event) => {
      if (shouldResetMobileReaderZoom(scale.value)) {
        const nextScale = MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE;
        const nextTranslateX = clampMobileReaderZoomOffset(
          (frameWidth / 2 - event.x) * (nextScale - 1),
          frameWidth,
          nextScale,
        );
        const nextTranslateY = clampMobileReaderZoomOffset(
          (frameHeight / 2 - event.y) * (nextScale - 1),
          frameHeight,
          nextScale,
        );
        scale.value = withSpring(nextScale, springConfig);
        savedScale.value = nextScale;
        translateX.value = withSpring(nextTranslateX, springConfig);
        translateY.value = withSpring(nextTranslateY, springConfig);
        savedTranslateX.value = nextTranslateX;
        savedTranslateY.value = nextTranslateY;
      } else {
        resetZoom();
      }
      runOnJS(hapticSelection)();
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture,
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

function ReaderPluginSettingsSheet({
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
}: {
  visible: boolean;
  plugins: MobileReaderPluginState[];
  selectedPluginId: string | null;
  loading: boolean;
  error: string | null;
  loadError: string | null;
  busy: boolean;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onDismissError: () => void;
  onDismissLoadError: () => void;
  onRetryLoad: () => void;
  onSelectPlugin: (pluginId: string) => void;
  onClearSelectedPlugin: () => void;
  onTogglePlugin: (plugin: MobileReaderPluginState, enabled: boolean) => void;
  onResetPlugin: (plugin: MobileReaderPluginState) => void;
  onChangePluginValue: (
    plugin: MobileReaderPluginState,
    key: string,
    value: unknown,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const selectedPlugin = useMemo(
    () =>
      selectedPluginId
        ? (plugins.find((plugin) => plugin.id === selectedPluginId) ?? null)
        : null,
    [plugins, selectedPluginId],
  );

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <MobileSheetBackdrop
        accessibilityLabel={strings.reader.closePlugin}
        backgroundColor={`${tokens.background}CC`}
        onPress={onClose}
      />
      <View
        style={[
          styles.pluginSettingsSheetFrame,
          { bottom: insets.bottom + 10 },
        ]}
      >
        <GlassSurface
          style={styles.pluginSheetShell}
          contentStyle={styles.pluginSettingsSheet}
        >
          <View style={styles.pluginHandle} />
          <View style={styles.pluginSheetHeader}>
            <View
              style={[
                styles.pluginSheetIcon,
                { backgroundColor: tokens.primary },
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                color={tokens.primaryForeground}
              />
            </View>
            <View style={styles.pluginSheetTitleBlock}>
              <Text
                numberOfLines={1}
                style={[styles.pluginSheetTitle, { color: tokens.foreground }]}
              >
                {strings.settings.plugins}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.pluginSheetSubtitle,
                  { color: tokens.mutedForeground },
                ]}
              >
                {strings.settings.pluginsDescription}
              </Text>
            </View>
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.reader.closePlugin}
              onPress={onClose}
              style={[
                styles.pluginCloseButton,
                { backgroundColor: tokens.muted },
              ]}
            >
              <Ionicons
                name="close-outline"
                size={20}
                color={tokens.mutedForeground}
              />
            </NemuPressable>
          </View>

          {error ? (
            <MobileInlineErrorBanner
              title={strings.settings.settingsActionFailed}
              detail={error}
              dismissLabel={strings.common.clear}
              onDismiss={onDismissError}
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
              onActionPress={onRetryLoad}
              onDismiss={onDismissLoadError}
              variant="embedded"
            />
          ) : null}

          {loading && plugins.length === 0 ? (
            <View
              style={[
                styles.pluginSettingsEmpty,
                { backgroundColor: tokens.muted },
              ]}
            >
              <ActivityIndicator size="small" color={tokens.primary} />
              <Text
                style={[
                  styles.pluginSettingsEmptyText,
                  { color: tokens.mutedForeground },
                ]}
              >
                {strings.settings.loadingReaderPlugins}
              </Text>
            </View>
          ) : selectedPlugin ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.pluginSettingsScroll}
              contentContainerStyle={styles.pluginSettingsContent}
            >
              <View
                style={[
                  styles.pluginSettingsDetailHeader,
                  { backgroundColor: tokens.muted, borderColor: tokens.border },
                ]}
              >
                <NemuPressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.settings.sourceSettingsBack}
                  onPress={onClearSelectedPlugin}
                  pressedScale={0.94}
                  style={[
                    styles.pluginSettingsBackButton,
                    { backgroundColor: tokens.card },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={tokens.mutedForeground}
                  />
                </NemuPressable>
                <View
                  style={[
                    styles.pluginSettingsIcon,
                    {
                      backgroundColor: selectedPlugin.enabled
                        ? tokens.sourceIconGlass
                        : tokens.muted,
                      borderColor: tokens.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={selectedPlugin.icon}
                    size={19}
                    color={
                      selectedPlugin.enabled
                        ? tokens.primary
                        : tokens.mutedForeground
                    }
                  />
                </View>
                <View style={styles.pluginSettingsCopy}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.pluginSettingsTitle,
                      { color: tokens.foreground },
                    ]}
                  >
                    {selectedPlugin.name}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.pluginSettingsDescription,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {selectedPlugin.description}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={formatMobileString(
                    strings.settings.readerPluginSwitch,
                    { name: selectedPlugin.name },
                  )}
                  accessibilityRole="switch"
                  accessibilityState={getMobileSwitchAccessibilityState(
                    selectedPlugin.enabled,
                    busy,
                  )}
                  disabled={busy}
                  value={selectedPlugin.enabled}
                  onValueChange={(nextValue) => {
                    if (
                      !canRunMobileSwitchSelectionFeedback({
                        checked: selectedPlugin.enabled,
                        disabled: busy,
                        nextChecked: nextValue,
                      })
                    ) {
                      return;
                    }
                    void hapticSelection();
                    onTogglePlugin(selectedPlugin, nextValue);
                  }}
                  trackColor={{
                    false: tokens.muted,
                    true: `${tokens.primary}66`,
                  }}
                  thumbColor={
                    selectedPlugin.enabled
                      ? tokens.primary
                      : tokens.mutedForeground
                  }
                  ios_backgroundColor={tokens.muted}
                />
              </View>

              {selectedPlugin.enabled ? (
                <MobileSourceSettingsCard
                  settings={selectedPlugin.settings}
                  values={selectedPlugin.values}
                  loading={loading}
                  error={error}
                  title={formatMobileString(
                    strings.settings.sourceSettingsTitle,
                    {
                      name: selectedPlugin.name,
                    },
                  )}
                  subtitle={selectedPlugin.description}
                  navigationResetKey={selectedPlugin.id}
                  emptyMessage={strings.settings.noPluginSettings}
                  showEmpty
                  disabled={busy}
                  onReset={() => onResetPlugin(selectedPlugin)}
                  onChange={(key, value) =>
                    onChangePluginValue(selectedPlugin, key, value)
                  }
                />
              ) : (
                <View
                  style={[
                    styles.pluginSettingsEmpty,
                    { backgroundColor: tokens.muted },
                  ]}
                >
                  <Ionicons
                    name="power-outline"
                    size={20}
                    color={tokens.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.pluginSettingsEmptyText,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {strings.reader.disabled}
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.pluginSettingsScroll}
              contentContainerStyle={styles.pluginSettingsContent}
            >
              <View style={styles.pluginSettingsList}>
                {plugins.map((plugin) => {
                  const settingsCount = countRenderableSourceSettings(
                    plugin.settings,
                  );
                  return (
                    <View
                      key={plugin.id}
                      style={[
                        styles.pluginSettingsRow,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <NemuPressable
                        accessibilityRole="button"
                        accessibilityLabel={formatMobileString(
                          strings.settings.editReaderPluginSettings,
                          { name: plugin.name },
                        )}
                        accessibilityState={{
                          disabled: busy || !plugin.enabled,
                        }}
                        disabled={busy || !plugin.enabled}
                        hapticFeedback={
                          busy || !plugin.enabled ? "none" : "press"
                        }
                        onPress={() => {
                          onSelectPlugin(plugin.id);
                        }}
                        pressedScale={0.985}
                        style={[
                          styles.pluginSettingsMain,
                          { opacity: plugin.enabled ? 1 : 0.62 },
                        ]}
                      >
                        <View
                          style={[
                            styles.pluginSettingsIcon,
                            {
                              backgroundColor: tokens.sourceIconGlass,
                              borderColor: tokens.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={plugin.icon}
                            size={19}
                            color={
                              plugin.enabled
                                ? tokens.primary
                                : tokens.mutedForeground
                            }
                          />
                        </View>
                        <View style={styles.pluginSettingsCopy}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.pluginSettingsTitle,
                              { color: tokens.foreground },
                            ]}
                          >
                            {plugin.name}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.pluginSettingsDescription,
                              { color: tokens.mutedForeground },
                            ]}
                          >
                            {plugin.description}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.pluginSettingsMeta,
                              { color: tokens.mutedForeground },
                            ]}
                          >
                            {formatMobileSettingsCount(settingsCount, strings)}
                          </Text>
                        </View>
                      </NemuPressable>
                      <NemuPressable
                        accessibilityRole="button"
                        accessibilityLabel={formatMobileString(
                          strings.settings.editReaderPluginSettings,
                          { name: plugin.name },
                        )}
                        accessibilityState={{
                          disabled:
                            busy || !plugin.enabled || settingsCount === 0,
                        }}
                        disabled={
                          busy || !plugin.enabled || settingsCount === 0
                        }
                        onPress={() => onSelectPlugin(plugin.id)}
                        pressedScale={0.94}
                        style={[
                          styles.pluginSettingsActionButton,
                          {
                            backgroundColor: tokens.card,
                            opacity:
                              busy || !plugin.enabled || settingsCount === 0
                                ? 0.54
                                : 1,
                          },
                        ]}
                      >
                        <Ionicons
                          name="settings-outline"
                          size={17}
                          color={tokens.mutedForeground}
                        />
                      </NemuPressable>
                      <Switch
                        accessibilityLabel={formatMobileString(
                          strings.settings.readerPluginSwitch,
                          { name: plugin.name },
                        )}
                        accessibilityRole="switch"
                        accessibilityState={getMobileSwitchAccessibilityState(
                          plugin.enabled,
                          busy,
                        )}
                        disabled={busy}
                        value={plugin.enabled}
                        onValueChange={(nextValue) => {
                          if (
                            !canRunMobileSwitchSelectionFeedback({
                              checked: plugin.enabled,
                              disabled: busy,
                              nextChecked: nextValue,
                            })
                          ) {
                            return;
                          }
                          void hapticSelection();
                          onTogglePlugin(plugin, nextValue);
                        }}
                        trackColor={{
                          false: tokens.muted,
                          true: `${tokens.primary}66`,
                        }}
                        thumbColor={
                          plugin.enabled
                            ? tokens.primary
                            : tokens.mutedForeground
                        }
                        ios_backgroundColor={tokens.muted}
                      />
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

export function ReaderScreen() {
  const params = useLocalSearchParams<{
    registryId: string;
    sourceId: string;
    mangaId: string;
    chapterId: string;
    page?: string;
    mangaTitle?: string;
    chapterTitle?: string;
    chapterNumber?: string;
    volumeNumber?: string;
  }>();
  const registryId = normalizeMobileSourceRouteParam(params.registryId);
  const sourceId = normalizeMobileSourceRouteParam(params.sourceId);
  const mangaId = normalizeMobileSourceRouteParam(params.mangaId);
  const chapterId = normalizeMobileSourceRouteParam(params.chapterId);
  const routePage = firstParam(params.page);
  const routeMangaTitle = normalizeMobileReaderRouteLabel(
    params.mangaTitle,
    mangaId,
  );
  const routeChapterFallback = useMemo<ChapterSummary>(
    () => ({
      id: chapterId,
      title:
        normalizeMobileReaderRouteLabel(params.chapterTitle, chapterId) ||
        undefined,
      chapterNumber: parseMobileReaderRouteNumber(params.chapterNumber),
      volumeNumber: parseMobileReaderRouteNumber(params.volumeNumber),
    }),
    [chapterId, params.chapterNumber, params.chapterTitle, params.volumeNumber],
  );
  const { scheme } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const {
    mode,
    setMode,
    scrollWidthPct,
    setScrollWidthPct,
    twoPageMode,
    setTwoPageMode,
    pagePairingMode,
    setPagePairingMode,
    processPageImages,
    setProcessPageImages,
  } = useReadingMode();
  const readerPlugins = useMobileReaderPlugins();
  const installedReaderSources = useInstalledSources();
  const readerScrollRef = useRef<MobileReaderScrollHandle | null>(null);
  const routeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intraPageProgressSaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const progressPersistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const progressPersistenceClockRef = useRef(0);
  const readerProgrammaticScrollRef = useRef<number | null>(null);
  const scrollingPageMetricsRef = useRef<ReaderScrollPageMetric[]>([]);
  const scrollingVisiblePageIndexRef = useRef(0);
  const readerSettingsActionRef = useRef<ReaderSettingsAction | null>(null);
  const japaneseLearningOcrRunRef = useRef(0);
  const japaneseLearningAutoOcrPageRef = useRef("");
  const japaneseLearningChatRunRef = useRef(0);
  const japaneseLearningChatMessageIdRef = useRef(0);
  const japaneseLearningChatMessagesRef = useRef<
    JapaneseLearningChatThreadMessage[]
  >([]);
  const japaneseLearningChatTtsAutoPlayRef = useRef<{
    enabled: boolean;
    currentId: string | null;
    armedAt: number;
  }>({ enabled: false, currentId: null, armedAt: 0 });
  const playJapaneseLearningChatTtsRef = useRef<
    | ((
        message: JapaneseLearningChatThreadMessage,
        options?: JapaneseLearningChatTtsOptions,
      ) => void)
    | null
  >(null);
  const japaneseLearningGrammarRunRef = useRef(0);
  const japaneseLearningTtsRunRef = useRef(0);
  const japaneseLearningTtsPlayerRef = useRef<AudioPlayer | null>(null);
  const japaneseLearningLifecycleRef = useRef<ReturnType<
    typeof createMobileJapaneseLearningScreenLifecycle
  > | null>(null);
  if (!japaneseLearningLifecycleRef.current) {
    japaneseLearningLifecycleRef.current =
      createMobileJapaneseLearningScreenLifecycle();
  }
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readerSettingsAction, setReaderSettingsAction] =
    useState<ReaderSettingsAction | null>(null);
  const [activeReaderPluginId, setActiveReaderPluginId] =
    useState<MobileReaderPluginId | null>(null);
  const [readerPluginSettingsOpen, setReaderPluginSettingsOpen] =
    useState(false);
  const [readerDisplaySettingsOpen, setReaderDisplaySettingsOpen] =
    useState(false);
  const [selectedReaderPluginSettingsId, setSelectedReaderPluginSettingsId] =
    useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // How the reader reached `currentPageIndex`. Only a genuine forward turn may
  // auto-complete a chapter — see shouldAutoCompleteMobileReaderChapter.
  const [pageArrival, setPageArrival] =
    useState<MobileReaderPageArrival>("initial");
  const [endOfChapterPromptVisible, setEndOfChapterPromptVisible] =
    useState(false);
  const [endOfChapterProgressSaving, setEndOfChapterProgressSaving] =
    useState(false);
  const [endOfChapterProgressSaved, setEndOfChapterProgressSaved] =
    useState(false);
  const [endOfChapterProgressError, setEndOfChapterProgressError] = useState<
    string | null
  >(null);
  const [readerImageRetryNonces, setReaderImageRetryNonces] = useState(
    () => new Map<string, number>(),
  );
  const [scrollWidthDraft, setScrollWidthDraft] = useState(scrollWidthPct);
  const [restoredReaderKey, setRestoredReaderKey] = useState("");
  const [pagesState, setPagesState] = useState<ReaderPagesState>({
    status: "idle",
    pages: [],
    detail: strings.reader.readerPagesIdle,
  });
  const [japaneseLearningOcrState, setJapaneseLearningOcrState] =
    useState<JapaneseLearningOcrState>({ status: "idle" });
  const [japaneseLearningChatState, setJapaneseLearningChatState] =
    useState<JapaneseLearningChatState>({ status: "idle" });
  const [japaneseLearningChatMessages, setJapaneseLearningChatMessages] =
    useState<JapaneseLearningChatThreadMessage[]>([]);
  const [japaneseLearningChatInput, setJapaneseLearningChatInput] =
    useState("");
  const [japaneseLearningGrammarState, setJapaneseLearningGrammarState] =
    useState<JapaneseLearningGrammarState>({ status: "idle" });
  const [japaneseLearningTtsState, setJapaneseLearningTtsState] =
    useState<JapaneseLearningTtsState>({ status: "idle" });
  const [
    japaneseLearningGrammarActionNotice,
    setJapaneseLearningGrammarActionNotice,
  ] = useState<string | null>(null);
  const [
    selectedJapaneseLearningGrammarTokenIndex,
    setSelectedJapaneseLearningGrammarTokenIndex,
  ] = useState<number | null>(null);
  const [
    japaneseLearningSelectedDetectionOrder,
    setJapaneseLearningSelectedDetectionOrder,
  ] = useState<number | null>(null);
  // Japanese Learning 3-surface visibility (mirrors web: launcher sheet,
  // OCR result drawer, chat drawer, transcript sheet).
  const [japaneseLearningLauncherVisible, setJapaneseLearningLauncherVisible] =
    useState(false);
  const [japaneseLearningOcrSheetVisible, setJapaneseLearningOcrSheetVisible] =
    useState(false);
  const [
    japaneseLearningChatDrawerVisible,
    setJapaneseLearningChatDrawerVisible,
  ] = useState(false);
  const [
    japaneseLearningTranscriptVisible,
    setJapaneseLearningTranscriptVisible,
  ] = useState(false);
  const [readerImageSizes, setReaderImageSizes] = useState(
    () => new Map<string, MobileImageSize>(),
  );
  const [readerSegmentedImages, setReaderSegmentedImages] = useState(
    () => new Map<string, MobileCachedSegmentedImageAsset>(),
  );
  const [
    segmentedLogicalEndReachedIdentity,
    setSegmentedLogicalEndReachedIdentity,
  ] = useState<string | null>(null);
  const [loadedReaderSegments, setLoadedReaderSegments] = useState(
    () => new Set<string>(),
  );
  const [readerImageErrors, setReaderImageErrors] = useState(
    () => new Map<string, string>(),
  );
  const [state, setState] = useState<ReaderState>({
    entry: null,
    sourceLink: null,
    chapterProgress: null,
    mangaProgress: null,
  });
  const [sourceMangaTitle, setSourceMangaTitle] = useState<string | null>(null);
  const [readerSettingsError, setReaderSettingsError] = useState<string | null>(
    null,
  );
  const [
    dismissedReaderPluginSettingsError,
    setDismissedReaderPluginSettingsError,
  ] = useState<string | null>(null);
  const [readerPluginSettingsBusyKey, setReaderPluginSettingsBusyKey] =
    useState<string | null>(null);
  const readerPluginSettingsBusyKeyRef = useRef<string | null>(null);
  const readerPagesRequestRunRef = useRef(0);
  const persistProgressRef = useRef<
    (
      complete: boolean,
      nextDisplayIndex?: number,
      options?: MobileReaderPersistProgressOptions,
    ) => Promise<void>
  >(async () => undefined);
  const pendingIntraPageProgressRef = useRef<{
    contentIdentity: string;
    displayIndex: number;
    persist: typeof persistProgressRef.current;
    progress: number;
  } | null>(null);
  const readerFirstPageRequestRef = useRef<{
    key: string;
    startedAt: number;
    measured: boolean;
  } | null>(null);
  const [pagesRefreshNonce, setPagesRefreshNonce] = useState(0);
  const cloudflareSheetRef = useRef<{
    reportError: (error: unknown) => boolean;
  } | null>(null);

  const reportReaderSettingsError = useCallback(
    async (error: unknown) => {
      await hapticError();
      setReaderSettingsError(
        readerErrorDetail(
          error,
          strings.settings.settingsActionFailedDetail,
          strings,
        ),
      );
    },
    [strings],
  );
  const readerSettingsActionState =
    mobileReaderSettingsActionStateFromAction(readerSettingsAction);
  const readerSettingsActionBusy = isMobileReaderSettingsActionBusy(
    readerSettingsActionState,
  );
  const readerPluginSettingsBusy = readerPluginSettingsBusyKey !== null;
  const retryingReaderPluginSettingsLoad =
    readerPluginSettingsBusyKey === "reader-plugins:reload";
  const showReaderPluginSettingsLoadError =
    readerSettingsError === null &&
    Boolean(readerPlugins.error) &&
    readerPlugins.error !== dismissedReaderPluginSettingsError;
  const canRetryReaderPluginSettingsLoadError =
    canRetryMobileReaderPluginSettingsLoadError({
      hasError: Boolean(readerPlugins.error),
      loading: readerPlugins.loading,
      busy: readerPluginSettingsBusy,
    });
  const getGuardedReaderSettingsActionState = useCallback(
    () =>
      mobileReaderSettingsActionStateFromAction(
        readerSettingsActionRef.current ?? readerSettingsAction,
      ),
    [readerSettingsAction],
  );
  const runReaderSettingsAction = useCallback(
    async (action: ReaderSettingsAction, task: () => Promise<void>) => {
      if (
        !canStartMobileReaderSettingsAction(
          getGuardedReaderSettingsActionState(),
        )
      ) {
        return;
      }

      readerSettingsActionRef.current = action;
      setReaderSettingsAction(action);
      setReaderSettingsError(null);
      try {
        await task();
      } catch (error) {
        await reportReaderSettingsError(error);
      } finally {
        if (readerSettingsActionRef.current === action) {
          readerSettingsActionRef.current = null;
          setReaderSettingsAction(null);
        }
      }
    },
    [getGuardedReaderSettingsActionState, reportReaderSettingsError],
  );

  const runReaderPluginSettingsMutation = useCallback(
    async (key: string, task: () => Promise<void>) => {
      if (readerPluginSettingsBusyKeyRef.current !== null) return;

      readerPluginSettingsBusyKeyRef.current = key;
      setReaderPluginSettingsBusyKey(key);
      setReaderSettingsError(null);
      try {
        await task();
      } catch (error) {
        await reportReaderSettingsError(error);
      } finally {
        if (readerPluginSettingsBusyKeyRef.current === key) {
          readerPluginSettingsBusyKeyRef.current = null;
          setReaderPluginSettingsBusyKey(null);
        }
      }
    },
    [reportReaderSettingsError],
  );

  const retryReaderPluginSettingsLoad = useCallback(() => {
    if (!canRetryReaderPluginSettingsLoadError) return;
    const key = "reader-plugins:reload";
    if (readerPluginSettingsBusyKeyRef.current !== null) return;

    readerPluginSettingsBusyKeyRef.current = key;
    setReaderPluginSettingsBusyKey(key);
    setReaderSettingsError(null);
    setDismissedReaderPluginSettingsError(null);
    void (async () => {
      try {
        await readerPlugins.reload();
        await hapticConfirm();
      } catch {
        await hapticError();
      } finally {
        if (readerPluginSettingsBusyKeyRef.current === key) {
          readerPluginSettingsBusyKeyRef.current = null;
          setReaderPluginSettingsBusyKey(null);
        }
      }
    })();
  }, [canRetryReaderPluginSettingsLoadError, readerPlugins]);

  const cloudflareSheet = useNemuAgentSheet({
    onSuccess: () => setPagesRefreshNonce((value) => value + 1),
  });
  cloudflareSheetRef.current = cloudflareSheet;

  const selectReaderPluginSettings = useCallback(
    (pluginId: string) => {
      if (
        !canSelectMobileReaderPluginOption({
          selected: selectedReaderPluginSettingsId === pluginId,
          disabled: false,
        })
      ) {
        return;
      }
      setSelectedReaderPluginSettingsId(pluginId);
      void hapticPress();
    },
    [selectedReaderPluginSettingsId],
  );

  const toggleReaderPluginSetting = useCallback(
    (plugin: MobileReaderPluginState, enabled: boolean) => {
      void runReaderPluginSettingsMutation(
        `reader-plugin:${plugin.id}`,
        async () => {
          await readerPlugins.setPluginEnabled(plugin.id, enabled);
          setSelectedReaderPluginSettingsId((current) =>
            enabled ? plugin.id : current === plugin.id ? null : current,
          );
          if (!enabled && activeReaderPluginId === plugin.id) {
            setActiveReaderPluginId(null);
          }
        },
      );
    },
    [activeReaderPluginId, readerPlugins, runReaderPluginSettingsMutation],
  );

  const selectedInstalledSource = useMemo(
    () =>
      installedReaderSources.data.find((item) =>
        mobileInstalledSourceMatchesRoute(item, registryId, sourceId),
      ) ?? null,
    [installedReaderSources.data, registryId, sourceId],
  );
  const routeRef = getMobileInstalledSourceRouteRef(selectedInstalledSource, {
    registryId,
    sourceId,
  });
  const routeSourceRef = useMemo(
    () =>
      readerSourceLinkReference(
        routeRef.registryId,
        routeRef.sourceId,
        mangaId,
      ),
    [mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const readerPageIdentityFor = useCallback(
    (page: MobileReaderPage) =>
      getMobileReaderLogicalPageIdentity({
        registryId: routeRef.registryId,
        sourceId: routeRef.sourceId,
        mangaId,
        chapterId,
        pageId: page.id,
        imageUri: page.imageUri,
        headers: page.headers,
      }),
    [chapterId, mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const readerSegmentedCacheKeyFor = useCallback(
    (page: MobileReaderPage) =>
      getMobileReaderSegmentedCacheDiscriminator({
        registryId: routeRef.registryId,
        sourceId: routeRef.sourceId,
        mangaId,
        chapterId,
        pageId: page.id,
      }),
    [chapterId, mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const navigateBack = useCallback(() => {
    const action = getMobileSourceReaderBackAction({
      canGoBack: router.canGoBack(),
      registryId: routeRef.registryId,
      sourceId: routeRef.sourceId,
      mangaId,
      mangaTitle: routeMangaTitle,
    });
    if (action.type === "back") {
      router.back();
      return;
    }
    router.replace(action.href);
  }, [mangaId, routeMangaTitle, routeRef.registryId, routeRef.sourceId]);

  const resetReaderPluginSettings = useCallback(
    (plugin: MobileReaderPluginState) => {
      void runReaderPluginSettingsMutation(
        `reader-plugin-reset:${plugin.id}`,
        async () => {
          await readerPlugins.resetPluginValues(plugin.id);
          await hapticConfirm();
        },
      );
    },
    [readerPlugins, runReaderPluginSettingsMutation],
  );

  const changeReaderPluginSetting = useCallback(
    (plugin: MobileReaderPluginState, key: string, value: unknown) => {
      void runReaderPluginSettingsMutation(
        `reader-plugin-value:${plugin.id}:${key}`,
        async () => {
          await readerPlugins.setPluginValue(plugin.id, key, value);
        },
      );
    },
    [readerPlugins, runReaderPluginSettingsMutation],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const installedSources = selectedInstalledSource
        ? [selectedInstalledSource]
        : [];
      const [entries, mangaProgressItems] = await Promise.all([
        store.getLibraryEntries(),
        store.getMangaProgress(),
      ]);
      const { entry, sourceLink } = findMobileReaderLibrarySource(
        entries,
        selectedInstalledSource,
        routeRef.registryId,
        routeRef.sourceId,
        mangaId,
      );
      const progressSourceRef = sourceLink ?? routeSourceRef;
      const chapterProgress = await loadMobileChapterProgressForSourceChapter(
        store,
        progressSourceRef,
        installedSources,
        chapterId,
      );
      const progressIndex = new Map(
        mangaProgressItems.map((item) => [item.id, item]),
      );
      const mangaProgress =
        findMobileMangaProgressForSource(
          progressSourceRef,
          installedSources,
          progressIndex,
        ) ?? null;
      setState({ entry, sourceLink, chapterProgress, mangaProgress });
    } finally {
      setLoading(false);
    }
  }, [
    chapterId,
    mangaId,
    routeRef.registryId,
    routeRef.sourceId,
    routeSourceRef,
    selectedInstalledSource,
    store,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestedChapter = useMemo(
    () => chapterFromState(chapterId, state, routeChapterFallback),
    [chapterId, routeChapterFallback, state],
  );
  const sourceChapterForRequest = useMemo<ChapterSummary>(
    () => ({
      id: requestedChapter.id,
      title: requestedChapter.title,
      chapterNumber: requestedChapter.chapterNumber,
      volumeNumber: requestedChapter.volumeNumber,
      dateUploaded: requestedChapter.dateUploaded,
      locked: requestedChapter.locked,
      lang: requestedChapter.lang,
    }),
    [
      requestedChapter.chapterNumber,
      requestedChapter.dateUploaded,
      requestedChapter.id,
      requestedChapter.lang,
      requestedChapter.locked,
      requestedChapter.title,
      requestedChapter.volumeNumber,
    ],
  );
  const chapter =
    pagesState.status === "ready"
      ? mergeMobileReaderChapterFallback(
          chapterId,
          pagesState.chapter,
          routeChapterFallback,
        )
      : requestedChapter;
  const chapterLanguage = chapter.lang ?? null;
  const completed = state.chapterProgress?.completed ?? false;
  const title = getMobileReaderTitle(
    state.entry,
    mangaId,
    sourceMangaTitle,
    routeMangaTitle || strings.mangaDetail.manga,
  );
  const pages = pagesState.pages;
  const pageCount = pages.length;

  useEffect(() => {
    scrollingPageMetricsRef.current = [];
  }, [chapterId, pageCount, pagesState.status]);
  const clampedPageIndex = clampReaderPageIndex(currentPageIndex, pageCount);
  useEffect(() => {
    if (readerProgrammaticScrollRef.current == null) {
      scrollingVisiblePageIndexRef.current = clampedPageIndex;
    }
  }, [clampedPageIndex]);
  const pageProcessor =
    pagesState.status === "ready" ? pagesState.pageProcessor : undefined;
  useEffect(() => {
    if (!pageProcessor || pageCount <= 0) return;
    const controller = new AbortController();
    let active = true;
    const applyWindowResult = (result: MobileReaderPageWindowResult) => {
      if (!active) return;
      setPagesState((current) => {
        if (
          current.status !== "ready" ||
          current.pageProcessor !== pageProcessor
        ) {
          return current;
        }
        return { ...current, pages: result.pages };
      });
    };
    void pageProcessor
      .processWindow(clampedPageIndex, {
        signal: controller.signal,
        onUpdate: applyWindowResult,
      })
      .then((result) => {
        if (result) applyWindowResult(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
      pageProcessor.cancel();
    };
  }, [clampedPageIndex, pageCount, pageProcessor]);
  useEffect(() => {
    return () => pageProcessor?.dispose();
  }, [pageProcessor]);
  const sourcePageNumber = pageCount
    ? readerRoutePageForDisplayIndex(clampedPageIndex, pageCount, mode)
    : 0;
  const chapterTitle = formatChapterTitle(chapter, strings);
  const sourcePageForDisplayIndex = useCallback(
    (displayIndex: number) =>
      readerRoutePageForDisplayIndex(displayIndex, pageCount, mode),
    [mode, pageCount],
  );
  const displayedPages = useMemo(() => {
    return pages;
  }, [pages]);
  const readerDisplayIndexByPageId = useMemo(() => {
    const map = new Map<string, number>();
    displayedPages.forEach((page, index) => map.set(page.id, index));
    return map;
  }, [displayedPages]);
  const currentDisplayedPage = displayedPages[clampedPageIndex] ?? null;
  const currentDisplayedPageKey = currentDisplayedPage?.id ?? "";
  const currentDisplayedPageIdentity = currentDisplayedPage
    ? readerPageIdentityFor(currentDisplayedPage)
    : "";
  const savedIntraPageState = normalizeMobileReaderIntraPageState({
    intraPageProgress: state.chapterProgress?.intraPageProgress,
    intraPageContentIdentity: state.chapterProgress?.intraPageContentIdentity,
  });
  const initialLongStripScrollProgress =
    savedIntraPageState?.intraPageContentIdentity ===
    currentDisplayedPageIdentity
      ? savedIntraPageState.intraPageProgress
      : undefined;
  const currentSegmentedImage = currentDisplayedPage
    ? (readerSegmentedImages.get(currentDisplayedPageIdentity) ?? null)
    : null;
  const currentLogicalEndIdentity = currentDisplayedPageIdentity
    ? `${currentDisplayedPageIdentity}:${currentSegmentedImage?.generation ?? "single"}`
    : "";
  const segmentedLogicalEndReached =
    Boolean(currentLogicalEndIdentity) &&
    segmentedLogicalEndReachedIdentity === currentLogicalEndIdentity;
  const currentImageMetadataReady =
    !currentDisplayedPage?.imageUri ||
    readerImageSizes.has(currentDisplayedPageIdentity);
  const currentWholeImageToolsAvailable = canUseMobileReaderWholeImageTools({
    hasImage: Boolean(currentDisplayedPage?.imageUri),
    naturalSizeKnown: currentImageMetadataReady,
    segmented: Boolean(currentSegmentedImage),
  });
  useEffect(() => {
    setLoadedReaderSegments(new Set());
  }, [chapterId, currentSegmentedImage?.generation]);
  useEffect(
    () => retainCachedMobileImageAsset(currentSegmentedImage),
    [currentSegmentedImage],
  );
  useEffect(() => {
    const pageIdentities = new Set(pages.map(readerPageIdentityFor));
    setReaderImageSizes((current) => {
      if (
        [...current.keys()].every((identity) => pageIdentities.has(identity))
      ) {
        return current;
      }
      const next = new Map<string, MobileImageSize>();
      current.forEach((size, identity) => {
        if (pageIdentities.has(identity)) next.set(identity, size);
      });
      return next;
    });
    setReaderImageErrors((current) => {
      if (
        [...current.keys()].every((identity) =>
          [...pageIdentities].some(
            (pageIdentity) =>
              identity === pageIdentity ||
              identity.startsWith(`${pageIdentity}:segment:`),
          ),
        )
      ) {
        return current;
      }
      const next = new Map<string, string>();
      current.forEach((error, identity) => {
        if (
          [...pageIdentities].some(
            (pageIdentity) =>
              identity === pageIdentity ||
              identity.startsWith(`${pageIdentity}:segment:`),
          )
        ) {
          next.set(identity, error);
        }
      });
      return next;
    });
    setReaderSegmentedImages((current) => {
      if (
        [...current.keys()].every((identity) => pageIdentities.has(identity))
      ) {
        return current;
      }
      const next = new Map<string, MobileCachedSegmentedImageAsset>();
      current.forEach((asset, identity) => {
        if (pageIdentities.has(identity)) next.set(identity, asset);
      });
      return next;
    });
  }, [pages, readerPageIdentityFor]);
  const readerChapters = useMemo(
    () => (pagesState.status === "ready" ? pagesState.chapters : []),
    [pagesState],
  );
  const orderedReaderSources = useMemo(
    () =>
      sortMobileSourceLinks(
        state.entry?.sources ?? [],
        state.entry?.item.sourceOrder,
      ),
    [state.entry?.item.sourceOrder, state.entry?.sources],
  );
  const chapterNavigation = useMemo(
    () => getMobileReaderChapterNavigation(readerChapters, chapter.id, mode),
    [chapter.id, mode, readerChapters],
  );
  const leftChapter = chapterNavigation.leftChapter;
  const rightChapter = chapterNavigation.rightChapter;
  const pagedMode = mode !== "scrolling";
  const currentSinglePageNaturalSize =
    pageCount === 1 && displayedPages[0]
      ? readerImageSizes.get(readerPageIdentityFor(displayedPages[0]))
      : null;
  const isLongStripLogicalPage = isMobileReaderLongStripLogicalPage({
    pageCount,
    naturalSize: currentSinglePageNaturalSize,
  });
  const useLongStripPresentation = shouldUseMobileReaderLongStripPresentation({
    pagedMode,
    pageCount,
    naturalSize: currentSinglePageNaturalSize,
  });
  // Keep the reader setting itself paged. Only this gallery instance changes
  // its geometry after the single page's intrinsic dimensions prove that
  // viewport-contain would make it unreadably narrow.
  const galleryPagedMode = pagedMode && !useLongStripPresentation;
  const readerPageWidth = Math.max(280, window.width);
  const isWideReader = window.width / Math.max(1, window.height) > 1;
  const twoPageSupported = isWideReader && galleryPagedMode && pageCount > 1;
  const isTwoPageMode = twoPageSupported && twoPageMode;
  const showPagePairingControls = shouldShowReaderPagePairingControls({
    twoPageSupported,
    twoPageEnabled: isTwoPageMode,
  });
  const readerSpreads = useMemo(
    () =>
      isTwoPageMode
        ? buildMobileReaderDisplaySpreads(pageCount, pagePairingMode, mode)
        : [],
    [isTwoPageMode, mode, pageCount, pagePairingMode],
  );
  const currentSpreadIndex = useMemo(
    () => findMobileReaderSpreadIndex(readerSpreads, clampedPageIndex),
    [clampedPageIndex, readerSpreads],
  );
  const visibleProgressPageIndex = useMemo(
    () =>
      readerProgressDisplayIndexForVisiblePages(
        isTwoPageMode
          ? (readerSpreads[currentSpreadIndex] ?? [clampedPageIndex])
          : [clampedPageIndex],
        pageCount,
        mode,
      ),
    [
      clampedPageIndex,
      currentSpreadIndex,
      isTwoPageMode,
      mode,
      pageCount,
      readerSpreads,
    ],
  );
  const activeScrollWidthPct = clampReaderScrollWidthPct(scrollWidthDraft);
  const readerImageWidth = pagedMode
    ? isTwoPageMode
      ? Math.max(160, Math.min(420, (readerPageWidth - 42) / 2))
      : Math.max(240, Math.min(720, readerPageWidth - 24))
    : Math.min(readerPageWidth, 720) *
      readerScrollWidthScale(activeScrollWidthPct);
  const segmentedImageFrames = useMemo(
    () =>
      currentSegmentedImage && pageCount === 1
        ? getMobileReaderSegmentFrames(currentSegmentedImage, readerImageWidth)
        : [],
    [currentSegmentedImage, pageCount, readerImageWidth],
  );
  const scrollingPageExtent = readerImageWidth * 1.5 + 10;
  const scrollingPageOffsetForIndex = useCallback(
    (pageIndex: number): number => {
      const targetIndex = clampReaderPageIndex(pageIndex, pageCount);
      let offset = 0;
      for (let index = 0; index < targetIndex; index += 1) {
        const measuredHeight = scrollingPageMetricsRef.current[index]?.height;
        offset +=
          measuredHeight && measuredHeight > 0
            ? measuredHeight + 10
            : scrollingPageExtent;
      }
      return offset;
    },
    [pageCount, scrollingPageExtent],
  );
  const readyFetchedAt =
    pagesState.status === "ready" ? pagesState.fetchedAt : 0;
  const routePageDisplayIndex = useMemo(
    () => readerDisplayIndexForRoutePage(routePage, pageCount, mode),
    [mode, pageCount, routePage],
  );
  const readerRestorePageIndex = useMemo(() => {
    if (pageCount <= 0) return 0;
    const savedProgress = state.chapterProgress;
    const savedIndex =
      savedProgress && savedProgress.total > 1
        ? readerDisplayIndexForSourceIndex(
            savedProgress.progress,
            pageCount,
            mode,
          )
        : 0;
    return clampReaderPageIndex(routePageDisplayIndex ?? savedIndex, pageCount);
  }, [mode, pageCount, routePageDisplayIndex, state.chapterProgress]);
  const readerRestoreFrameIndex = useMemo(
    () =>
      isTwoPageMode
        ? findMobileReaderSpreadIndex(readerSpreads, readerRestorePageIndex)
        : readerRestorePageIndex,
    [isTwoPageMode, readerRestorePageIndex, readerSpreads],
  );
  const readerRestoreFrameCount = isTwoPageMode
    ? readerSpreads.length
    : pageCount;
  const readerInitialContentOffset = useMemo(
    () => ({
      x: galleryPagedMode
        ? readerScrollOffsetForLogicalFrame(
            readerRestoreFrameIndex,
            readerRestoreFrameCount,
            readerPageWidth,
            mode,
          )
        : 0,
      y: galleryPagedMode
        ? 0
        : scrollingPageOffsetForIndex(readerRestorePageIndex),
    }),
    [
      galleryPagedMode,
      mode,
      readerPageWidth,
      readerRestoreFrameCount,
      readerRestoreFrameIndex,
      readerRestorePageIndex,
      scrollingPageOffsetForIndex,
    ],
  );
  const restoreReaderKey =
    pagesState.status === "ready"
      ? // routePage must NOT be part of this key: syncRoutePage rewrites the
        // route param after every page change, and re-arming the restore effect
        // from that echo snaps the scrolling-mode viewport to the page top.
        `${readyFetchedAt}:${chapterId}:${mode}:${pageCount}:${isTwoPageMode ? pagePairingMode : "single"}`
      : "";
  const readerScrollMountKey =
    pagesState.status === "ready"
      ? `${chapterId}:${readyFetchedAt}:${mode}:${
          galleryPagedMode
            ? `${Math.round(readerPageWidth)}:${
                isTwoPageMode ? pagePairingMode : "single"
              }`
            : currentSegmentedImage
              ? `segmented:${currentSegmentedImage.generation}:${Math.round(readerImageWidth)}`
              : isLongStripLogicalPage
                ? `long-strip:single:${Math.round(readerImageWidth)}`
                : "scrolling"
        }`
      : "loading";
  const readerRestoreComplete =
    Boolean(restoreReaderKey) && restoredReaderKey === restoreReaderKey;
  const silentProgressPersistenceKey = readerRestoreComplete
    ? mobileReaderProgressPersistenceKey(
        restoreReaderKey,
        visibleProgressPageIndex,
      )
    : "";
  const showReaderChrome = showControls;
  const showReaderBottomChrome =
    showReaderChrome && pagesState.status === "ready" && pageCount > 0;
  const readerBackgroundColor = "#000000";
  const readerStatusBarStyle = "light";
  const readerChromeTopPadding = showReaderChrome
    ? insets.top + 80
    : Math.max(insets.top + 8, 12);
  const readerCompactControlsHeight = 82;
  const readerScrollTopInset = insets.top + 80;
  const readerScrollBottomInset = insets.bottom + readerCompactControlsHeight;
  const readerBottomPadding = showReaderBottomChrome
    ? insets.bottom + readerCompactControlsHeight
    : Math.max(insets.bottom + 18, 24);
  const readerStateTopPadding = Math.max(insets.top + 82, 118);
  const readerChromeColors = useMemo(
    () =>
      scheme === "dark"
        ? {
            panel: "rgb(36,36,36)",
            border: "rgba(255,255,255,0.12)",
            primaryText: "rgba(250,250,250,1)",
            secondaryText: "rgba(250,250,250,0.65)",
            hover: "rgba(255,255,255,0.10)",
            disabled: "rgba(250,250,250,0.30)",
          }
        : {
            panel: "rgb(250,250,250)",
            border: "rgba(0,0,0,0.12)",
            primaryText: "rgba(38,38,38,1)",
            secondaryText: "rgba(38,38,38,0.65)",
            hover: "rgba(0,0,0,0.06)",
            disabled: "rgba(38,38,38,0.30)",
          },
    [scheme],
  );
  const readerChromePanelStyle = useMemo(
    () => ({
      backgroundColor: readerChromeColors.panel,
      borderColor: readerChromeColors.border,
    }),
    [readerChromeColors.border, readerChromeColors.panel],
  );
  useEffect(() => {
    if (!showReaderBottomChrome) {
      setReaderDisplaySettingsOpen(false);
    }
  }, [showReaderBottomChrome]);
  const readerMaxPagedImageHeight = Math.max(260, window.height);
  const selectedSourceLanguages =
    selectedInstalledSource?.packageMetadata?.languages ??
    selectedInstalledSource?.languages ??
    EMPTY_READER_SOURCE_LANGUAGES;
  const getReaderSourceSettings = useCallback(
    async (_sourceKey: string, sourceRecord: InstalledSource) => {
      const normalized = normalizeInstalledSource(sourceRecord);
      const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
      const saved = await loadMobileSourceSettingsByKeys(store, [
        runtimeSourceKey,
        ...getMobileInstalledSourceSettingsKeys(sourceRecord),
      ]);
      return mergeSourceSettingValues(
        sourceRecord.packageMetadata?.settings ?? [],
        saved?.values,
      );
    },
    [store],
  );
  const saveReaderSourcePackageHydration = useCallback(
    async (
      sourceRecord: InstalledSource,
      hydration: MobileSourcePackageHydration,
    ) => {
      const hydratedSource = applyMobileSourcePackageHydration(
        sourceRecord,
        hydration,
      );
      if (hydratedSource === sourceRecord) return;
      const saved = await store.saveInstalledSourceIfCurrent?.(
        hydratedSource,
        sourceRecord.updatedAt,
      );
      if (!saved) return;
      emitMobileDataChanged("settings");
    },
    [store],
  );

  useEffect(() => {
    setSourceMangaTitle(null);
  }, [mangaId, registryId, sourceId]);

  useEffect(() => {
    if (loading || state.entry || !selectedInstalledSource) return;

    let cancelled = false;
    void refreshMobileSourceMetadata(selectedInstalledSource, mangaId, {
      getSourceSettings: getReaderSourceSettings,
      onSourcePackageHydrated: saveReaderSourcePackageHydration,
    })
      .then((result) => {
        if (cancelled || result.status !== "ready") return;
        const nextTitle = result.metadata.title.trim();
        if (nextTitle) setSourceMangaTitle(nextTitle);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    getReaderSourceSettings,
    loading,
    mangaId,
    saveReaderSourcePackageHydration,
    selectedInstalledSource,
    state.entry,
  ]);

  // Dual-reader orchestrator context (mobile counterpart to web's
  // `DualReadReaderOverlay` ctx). Bundles what SessionManager / Prefetcher /
  // ConfigSheet / DebugOverlay / Fab need; per-page geometry is passed to the
  // per-page overlay at its mount site. `MobileDualReaderRoot` consumes this.
  const dualReaderContext = useMemo(
    () => ({
      registryId,
      sourceId,
      mangaId,
      primaryChapter: chapter ?? null,
      primaryChapters: readerChapters,
      primaryPages: pages,
      currentLocalIndex: currentDisplayedPage?.index ?? null,
      installedSources: installedReaderSources.data,
      linkedSources: orderedReaderSources,
      getSourceSettings: getReaderSourceSettings,
      readingMode: mode,
      strings,
      sourceLink: state.sourceLink,
    }),
    [
      registryId,
      sourceId,
      mangaId,
      chapter,
      readerChapters,
      pages,
      currentDisplayedPage,
      installedReaderSources.data,
      orderedReaderSources,
      getReaderSourceSettings,
      mode,
      strings,
      state.sourceLink,
    ],
  );

  // Dual-reader session lifecycle: start a session when the manga/source
  // identity changes; clean up runtime caches on unmount. Mirrors web's
  // `startSession`/`cleanupRuntime` plugin lifecycle hooks.
  const dualReadSessionKey = `${registryId}:${sourceId}:${mangaId}`;
  const startDualReadSession = useMobileDualReaderStore((s) => s.startSession);
  const cleanupDualReadRuntime = useMobileDualReaderStore(
    (s) => s.cleanupRuntime,
  );
  const dualReadEnabled = useMobileDualReaderStore((s) => s.enabled);
  const openDualReadConfig = useCallback(() => {
    getMobileDualReadStore().getState().setConfigOpen(true);
  }, []);
  useEffect(() => {
    startDualReadSession(dualReadSessionKey);
  }, [dualReadSessionKey, startDualReadSession]);
  useEffect(() => {
    return () => {
      cleanupDualReadRuntime();
    };
  }, [cleanupDualReadRuntime]);

  const enabledReaderPlugins = useMemo(
    () =>
      readerPlugins.data.filter((plugin) =>
        isMobileReaderPluginVisible(plugin, {
          linkedSourceCount: state.entry?.sources.length ?? 0,
          sourceLanguages: selectedSourceLanguages,
          chapterLanguage,
        }),
      ),
    [
      chapterLanguage,
      readerPlugins.data,
      selectedSourceLanguages,
      state.entry?.sources.length,
    ],
  );
  const activeReaderPlugin = useMemo(
    () =>
      enabledReaderPlugins.find(
        (plugin) => plugin.id === activeReaderPluginId,
      ) ?? null,
    [activeReaderPluginId, enabledReaderPlugins],
  );
  const japaneseLearningReaderPlugin = useMemo(
    () =>
      enabledReaderPlugins.find(
        (plugin) => plugin.id === "japanese-learning",
      ) ?? null,
    [enabledReaderPlugins],
  );

  useEffect(() => {
    setScrollWidthDraft(scrollWidthPct);
  }, [scrollWidthPct]);

  useEffect(() => {
    if (!activeReaderPluginId) return;
    if (
      enabledReaderPlugins.some((plugin) => plugin.id === activeReaderPluginId)
    )
      return;
    setActiveReaderPluginId(null);
  }, [activeReaderPluginId, enabledReaderPlugins]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const action = getMobileReaderHardwareBackAction({
          hasActivePlugin: Boolean(activeReaderPlugin),
          hasEndOfChapterPrompt: endOfChapterPromptVisible,
          showControls,
        });

        if (action === "dismiss-end-prompt") {
          if (endOfChapterProgressSaving) return true;
          setEndOfChapterPromptVisible(false);
          setEndOfChapterProgressSaved(false);
          setEndOfChapterProgressError(null);
          void hapticPress();
          return true;
        }

        if (action === "close-plugin") {
          setActiveReaderPluginId(null);
          void hapticPress();
          return true;
        }

        if (action === "show-controls") {
          setShowControls(true);
          void hapticPress();
          return true;
        }

        if (action === "navigate-back") {
          navigateBack();
          void hapticPress();
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [
    activeReaderPlugin,
    endOfChapterProgressSaving,
    endOfChapterPromptVisible,
    navigateBack,
    showControls,
  ]);

  useEffect(() => {
    japaneseLearningChatMessagesRef.current = japaneseLearningChatMessages;
  }, [japaneseLearningChatMessages]);

  useEffect(() => {
    if (activeReaderPluginId === "japanese-learning") return;
    japaneseLearningChatTtsAutoPlayRef.current = {
      enabled: false,
      currentId: null,
      armedAt: 0,
    };
  }, [activeReaderPluginId]);

  useEffect(() => {
    japaneseLearningLifecycleRef.current?.abortAll();
    japaneseLearningOcrRunRef.current += 1;
    japaneseLearningAutoOcrPageRef.current = "";
    japaneseLearningChatRunRef.current += 1;
    japaneseLearningGrammarRunRef.current += 1;
    japaneseLearningTtsRunRef.current += 1;
    japaneseLearningChatTtsAutoPlayRef.current = {
      enabled: false,
      currentId: null,
      armedAt: 0,
    };
    japaneseLearningTtsPlayerRef.current?.remove();
    japaneseLearningTtsPlayerRef.current = null;
    setJapaneseLearningOcrState({ status: "idle" });
    setJapaneseLearningChatState({ status: "idle" });
    setJapaneseLearningChatMessages([]);
    setJapaneseLearningChatInput("");
    setJapaneseLearningGrammarState({ status: "idle" });
    setJapaneseLearningTtsState({ status: "idle" });
    setJapaneseLearningGrammarActionNotice(null);
    setSelectedJapaneseLearningGrammarTokenIndex(null);
    setJapaneseLearningSelectedDetectionOrder(null);
  }, [chapterId, currentDisplayedPageKey, registryId, sourceId]);

  useEffect(() => {
    if (!currentSegmentedImage) return;
    japaneseLearningLifecycleRef.current?.abort("ocr");
    japaneseLearningOcrRunRef.current += 1;
    japaneseLearningAutoOcrPageRef.current = currentDisplayedPageIdentity;
    setJapaneseLearningOcrState({
      status: "error",
      detail: strings.reader.pluginJapaneseLearningNoImage,
    });
  }, [currentDisplayedPageIdentity, currentSegmentedImage, strings]);

  useEffect(() => {
    return () => {
      void clearMobileReaderImageMemoryCache();
      japaneseLearningLifecycleRef.current?.abortAll();
      japaneseLearningOcrRunRef.current += 1;
      japaneseLearningChatRunRef.current += 1;
      japaneseLearningGrammarRunRef.current += 1;
      japaneseLearningTtsRunRef.current += 1;
      japaneseLearningTtsPlayerRef.current?.remove();
      japaneseLearningTtsPlayerRef.current = null;
    };
  }, []);

  const scrollToPageIndex = useCallback(
    (nextPageIndex: number, animated: boolean) => {
      const targetFrameIndex = isTwoPageMode
        ? findMobileReaderSpreadIndex(readerSpreads, nextPageIndex)
        : nextPageIndex;
      const frameCount = isTwoPageMode ? readerSpreads.length : pageCount;
      const xOffset = readerScrollOffsetForLogicalFrame(
        targetFrameIndex,
        frameCount,
        readerPageWidth,
        mode,
      );
      readerScrollRef.current?.scrollTo({
        x: galleryPagedMode ? xOffset : 0,
        y: galleryPagedMode ? 0 : scrollingPageOffsetForIndex(nextPageIndex),
        index: galleryPagedMode ? undefined : nextPageIndex,
        animated,
      });
    },
    [
      galleryPagedMode,
      isTwoPageMode,
      mode,
      pageCount,
      readerPageWidth,
      readerSpreads,
      scrollingPageOffsetForIndex,
    ],
  );

  const syncRoutePage = useCallback(
    (nextPageIndex: number, options?: { debounce?: boolean }) => {
      if (pageCount <= 0) return;
      const nextPage = readerRoutePageForDisplayIndex(
        nextPageIndex,
        pageCount,
        mode,
      );
      if (routePage === String(nextPage)) return;
      if (routeSyncTimerRef.current) {
        clearTimeout(routeSyncTimerRef.current);
        routeSyncTimerRef.current = null;
      }
      const updateRoute = () => {
        router.setParams({ page: String(nextPage) });
      };
      if (options?.debounce) {
        routeSyncTimerRef.current = setTimeout(() => {
          routeSyncTimerRef.current = null;
          updateRoute();
        }, 300);
        return;
      }
      updateRoute();
    },
    [mode, pageCount, routePage],
  );

  useEffect(() => {
    return () => {
      if (routeSyncTimerRef.current) {
        clearTimeout(routeSyncTimerRef.current);
        routeSyncTimerRef.current = null;
      }
    };
  }, [chapterId, mode, pageCount, routePage]);

  const commitScrollWidth = useCallback(
    async (value: number) => {
      const nextValue = clampReaderScrollWidthPct(value);
      setScrollWidthDraft(nextValue);
      if (nextValue === scrollWidthPct) return;
      await runReaderSettingsAction("scroll-width", async () => {
        await setScrollWidthPct(nextValue);
        if (pagedMode) return;

        const nextPageIndex = clampReaderPageIndex(clampedPageIndex, pageCount);
        const nextImageWidth =
          Math.min(readerPageWidth, 720) * readerScrollWidthScale(nextValue);
        const nextPageExtent = nextImageWidth * 1.5 + 10;
        setTimeout(() => {
          readerScrollRef.current?.scrollTo({
            x: 0,
            y: nextPageIndex * nextPageExtent,
            index: nextPageIndex,
            animated: false,
          });
        }, 0);
      });
    },
    [
      clampedPageIndex,
      pageCount,
      pagedMode,
      readerPageWidth,
      runReaderSettingsAction,
      scrollWidthPct,
      setScrollWidthPct,
    ],
  );

  const goToPage = useCallback(
    (nextIndex: number, arrival: MobileReaderPageArrival = "initial") => {
      if (pageCount <= 0) return;
      const nextPageIndex = clampReaderPageIndex(nextIndex, pageCount);
      readerProgrammaticScrollRef.current = nextPageIndex;
      setPageArrival(arrival);
      setCurrentPageIndex(nextPageIndex);
      scrollToPageIndex(nextPageIndex, galleryPagedMode);
      syncRoutePage(nextPageIndex);
      // Paged mode clears the ref from onMomentumScrollEnd — but scrolling to
      // the already-displayed page fires no momentum event, which would strand
      // the ref and suppress page-turn haptics on later manual swipes.
      if (nextPageIndex === clampedPageIndex) {
        readerProgrammaticScrollRef.current = null;
      }
    },
    [
      clampedPageIndex,
      galleryPagedMode,
      pageCount,
      scrollToPageIndex,
      syncRoutePage,
    ],
  );

  const onScrollingPageLayout = useCallback(
    (pageIndex: number, metric: ReaderScrollPageMetric) => {
      scrollingPageMetricsRef.current[pageIndex] = metric;
    },
    [],
  );

  const onScrollingVisiblePageChange = useCallback(
    (pageIndex: number) => {
      if (galleryPagedMode || pageCount <= 0) return;
      const nextPageIndex = clampReaderPageIndex(pageIndex, pageCount);
      const programmaticTarget = readerProgrammaticScrollRef.current;
      if (scrollingVisiblePageIndexRef.current === nextPageIndex) {
        if (programmaticTarget === nextPageIndex) {
          readerProgrammaticScrollRef.current = null;
        }
        return;
      }
      scrollingVisiblePageIndexRef.current = nextPageIndex;
      if (programmaticTarget != null && nextPageIndex !== programmaticTarget) {
        return;
      }
      if (programmaticTarget === nextPageIndex) {
        readerProgrammaticScrollRef.current = null;
      }
      setPageArrival(
        programmaticTarget == null
          ? readerPageArrivalForStep(
              clampedPageIndex,
              nextPageIndex,
              pageCount,
              mode,
            )
          : "initial",
      );
      setCurrentPageIndex(nextPageIndex);
      syncRoutePage(nextPageIndex, { debounce: true });
    },
    [clampedPageIndex, galleryPagedMode, mode, pageCount, syncRoutePage],
  );

  const onScrollingSeekFailed = useCallback(
    (requestedPageIndex: number) => {
      if (readerProgrammaticScrollRef.current === requestedPageIndex) {
        readerProgrammaticScrollRef.current = null;
      }
      const visiblePageIndex = clampReaderPageIndex(
        scrollingVisiblePageIndexRef.current,
        pageCount,
      );
      // A failed seek lands wherever the list happened to be; that is not a
      // page turn the reader performed.
      setPageArrival("initial");
      setCurrentPageIndex(visiblePageIndex);
      syncRoutePage(visiblePageIndex);
    },
    [pageCount, syncRoutePage],
  );

  const goToChapter = useCallback(
    (
      targetChapter: ChapterSummary | null,
      options?: { startAt?: "start" | "end" },
    ) => {
      if (!targetChapter) {
        void hapticError();
        return;
      }
      const page = options?.startAt === "end" ? Number.MAX_SAFE_INTEGER : 1;
      setActiveReaderPluginId(null);
      setEndOfChapterPromptVisible(false);
      setEndOfChapterProgressSaving(false);
      setEndOfChapterProgressSaved(false);
      setEndOfChapterProgressError(null);
      // Entering a chapter is never a page turn, even when it lands on the
      // final page (`startAt: "end"` from backward navigation).
      setPageArrival("initial");
      router.replace(
        getMobileSourceReaderHref({
          registryId: routeRef.registryId,
          sourceId: routeRef.sourceId,
          mangaId,
          chapter: targetChapter,
          page: String(page),
          mangaTitle: title,
        }),
      );
    },
    [mangaId, routeRef.registryId, routeRef.sourceId, title],
  );

  // The chapter that follows the current one in reading order, independent of
  // which physical edge of the screen it lives on.
  const nextChapterInReadingOrder = mode === "rtl" ? leftChapter : rightChapter;
  const nextChapterLabel = useMemo(
    () =>
      nextChapterInReadingOrder
        ? formatChapterTitle(nextChapterInReadingOrder, strings)
        : null,
    [nextChapterInReadingOrder, strings],
  );

  const persistEndOfChapterCompletion = useCallback(async () => {
    setEndOfChapterProgressSaving(true);
    setEndOfChapterProgressError(null);
    try {
      return await persistMobileReaderCompletionBeforeNavigation({
        persist: () =>
          persistProgressRef.current(true, clampedPageIndex, {
            silent: true,
            throwOnError: true,
          }),
        navigate: () => setEndOfChapterProgressSaved(true),
        reportError: (error) => {
          setEndOfChapterProgressError(
            readerErrorDetail(
              error,
              strings.reader.progressNotCompleted,
              strings,
            ),
          );
          void hapticError();
        },
      });
    } finally {
      setEndOfChapterProgressSaving(false);
    }
  }, [clampedPageIndex, strings]);

  const showEndOfChapterPrompt = useCallback(() => {
    setEndOfChapterProgressSaved(false);
    setEndOfChapterPromptVisible(true);
    void hapticSelection();
    void persistEndOfChapterCompletion();
  }, [persistEndOfChapterCompletion]);

  /** One page forward/backward in source order, from a tap zone or a11y action. */
  const stepReaderPage = useCallback(
    (direction: "previous" | "next") => {
      if (pageCount <= 0) return;
      const targetPageIndex = readerSourceStepTargetForDisplayIndex(
        clampedPageIndex,
        pageCount,
        mode,
        direction,
      );
      if (targetPageIndex == null) {
        // The last page is no longer a dead wall: offer the next chapter.
        if (direction === "next") showEndOfChapterPrompt();
        return;
      }
      goToPage(targetPageIndex, direction === "next" ? "forward" : "backward");
    },
    [clampedPageIndex, goToPage, mode, pageCount, showEndOfChapterPrompt],
  );

  const goToNextChapterFromPrompt = useCallback(() => {
    if (endOfChapterProgressSaving) return;
    const navigateAfterPersistence = () => {
      if (nextChapterInReadingOrder) {
        setEndOfChapterPromptVisible(false);
        goToChapter(nextChapterInReadingOrder, { startAt: "start" });
      }
    };
    if (endOfChapterProgressSaved) {
      navigateAfterPersistence();
      return;
    }
    void persistEndOfChapterCompletion().then((persisted) => {
      if (persisted) navigateAfterPersistence();
    });
  }, [
    endOfChapterProgressSaving,
    endOfChapterProgressSaved,
    goToChapter,
    nextChapterInReadingOrder,
    persistEndOfChapterCompletion,
  ]);

  const startJapaneseLearningOcr = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!currentDisplayedPage) {
        setJapaneseLearningOcrState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        if (!silent) void hapticError();
        return;
      }

      if (
        currentSegmentedImage &&
        !MOBILE_READER_SEGMENTED_CAPABILITIES.japaneseLearningImageTools
      ) {
        setJapaneseLearningOcrState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        if (!silent) void hapticError();
        return;
      }

      if (
        !currentDisplayedPage.text?.trim() &&
        !currentDisplayedPage.imageUri
      ) {
        setJapaneseLearningOcrState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        if (!silent) void hapticError();
        return;
      }

      if (currentDisplayedPage.imageUri && !currentImageMetadataReady) {
        setJapaneseLearningOcrState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        if (!silent) void hapticError();
        return;
      }

      setJapaneseLearningOcrState({ status: "loading" });
      setJapaneseLearningSelectedDetectionOrder(null);
      const run = japaneseLearningOcrRunRef.current + 1;
      japaneseLearningOcrRunRef.current = run;
      const signal = japaneseLearningLifecycleRef.current!.begin("ocr");
      void runMobileJapaneseLearningOcr(currentDisplayedPage, { signal })
        .then((result) => {
          if (japaneseLearningOcrRunRef.current !== run) return;
          setJapaneseLearningOcrState({ status: "ready", result });
          if (!silent) void hapticConfirm();
        })
        .catch((error) => {
          if (japaneseLearningOcrRunRef.current !== run) return;
          setJapaneseLearningOcrState({
            status: "error",
            detail: readerErrorDetail(
              error,
              strings.reader.pluginJapaneseLearningOcrFailed,
              strings,
            ),
          });
          if (!silent) void hapticError();
        });
    },
    [
      currentDisplayedPage,
      currentImageMetadataReady,
      currentSegmentedImage,
      strings,
    ],
  );

  const runJapaneseLearningOcr = useCallback(() => {
    startJapaneseLearningOcr();
  }, [startJapaneseLearningOcr]);

  useEffect(() => {
    if (japaneseLearningReaderPlugin?.values.autoDetect !== true) return;
    if (japaneseLearningOcrState.status !== "idle") return;
    if (!currentDisplayedPage) return;
    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri)
      return;
    if (currentDisplayedPage.imageUri && !currentImageMetadataReady) return;

    const pageKey = `${readyFetchedAt}:${currentDisplayedPageKey}`;
    if (
      !currentDisplayedPageKey ||
      japaneseLearningAutoOcrPageRef.current === pageKey
    ) {
      return;
    }
    japaneseLearningAutoOcrPageRef.current = pageKey;
    startJapaneseLearningOcr({ silent: true });
  }, [
    currentDisplayedPage,
    currentDisplayedPageKey,
    currentImageMetadataReady,
    japaneseLearningOcrState.status,
    japaneseLearningReaderPlugin?.values.autoDetect,
    readyFetchedAt,
    startJapaneseLearningOcr,
  ]);

  const setReaderImageNaturalSize = useCallback(
    (pageId: string, size: MobileImageSize) => {
      setReaderImageSizes((current) => {
        const existing = current.get(pageId);
        if (
          existing &&
          existing.width === size.width &&
          existing.height === size.height
        ) {
          return current;
        }
        const next = new Map(current);
        next.set(pageId, size);
        return next;
      });
    },
    [],
  );
  const clearReaderImageError = useCallback((pageId: string) => {
    setReaderImageErrors((current) => {
      if (!current.has(pageId)) return current;
      const next = new Map(current);
      next.delete(pageId);
      return next;
    });
  }, []);
  /**
   * Clears a page's latched failure and bumps its nonce so the frame remounts
   * and the image is requested again — a failed page must be recoverable
   * without reloading the whole chapter.
   */
  const retryReaderImage = useCallback(
    (pageId: string) => {
      clearReaderImageError(pageId);
      setReaderImageRetryNonces((current) => {
        const next = new Map(current);
        next.set(pageId, (current.get(pageId) ?? 0) + 1);
        return next;
      });
    },
    [clearReaderImageError],
  );
  const setReaderImageLoadError = useCallback(
    (pageId: string, detail: string | undefined) => {
      setReaderImageErrors((current) => {
        const nextDetail = detail?.trim() || "Image request failed";
        if (current.get(pageId) === nextDetail) return current;
        const next = new Map(current);
        next.set(pageId, nextDetail);
        return next;
      });
    },
    [],
  );

  const runJapaneseLearningGrammar = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) {
        setJapaneseLearningGrammarState({ status: "idle" });
        setSelectedJapaneseLearningGrammarTokenIndex(null);
        return;
      }

      const run = japaneseLearningGrammarRunRef.current + 1;
      japaneseLearningGrammarRunRef.current = run;
      const signal = japaneseLearningLifecycleRef.current!.begin("grammar");
      setJapaneseLearningGrammarActionNotice(null);
      setSelectedJapaneseLearningGrammarTokenIndex(null);
      setJapaneseLearningGrammarState({
        status: "loading",
        text: clean,
        stage: "normalizing",
      });

      void (async () => {
        const result = await runMobileJapaneseLearningGrammar(clean, {
          signal,
          onStage: (stage) => {
            if (japaneseLearningGrammarRunRef.current !== run) return;
            setJapaneseLearningGrammarState({
              status: "loading",
              text: clean,
              stage,
            });
          },
        });
        if (japaneseLearningGrammarRunRef.current !== run) return;
        setJapaneseLearningGrammarState({
          status: "ready",
          text: clean,
          result,
        });
        setSelectedJapaneseLearningGrammarTokenIndex(
          result.tokens.length === 1 ? 0 : null,
        );
        void hapticConfirm();
      })().catch((error) => {
        if (japaneseLearningGrammarRunRef.current !== run) return;
        setJapaneseLearningGrammarState({
          status: "error",
          text: clean,
          detail: readerErrorDetail(
            error,
            strings.reader.pluginJapaneseLearningGrammarFailed,
            strings,
          ),
        });
        void hapticError();
      });
    },
    [strings],
  );

  const japaneseLearningGrammarContext = useMemo(() => {
    if (japaneseLearningGrammarState.status !== "ready") return undefined;
    return serializeMobileGrammarTokens(
      japaneseLearningGrammarState.result.tokens,
    );
  }, [japaneseLearningGrammarState]);

  const getJapaneseLearningSentenceText = useCallback(() => {
    if (japaneseLearningOcrState.status !== "ready") return "";
    return mobileJapaneseLearningSentenceText(
      japaneseLearningOcrState.result,
      japaneseLearningSelectedDetectionOrder,
    );
  }, [japaneseLearningOcrState, japaneseLearningSelectedDetectionOrder]);

  const copyJapaneseLearningGrammarSelection = useCallback(
    (text: string) => {
      const selectedText = text.trim();
      if (!selectedText) return;
      void (async () => {
        try {
          const copied = await Clipboard.setStringAsync(selectedText);
          setJapaneseLearningGrammarActionNotice(
            copied
              ? strings.reader.pluginJapaneseLearningCopied
              : strings.reader.pluginJapaneseLearningCopyFailed,
          );
          if (copied) {
            void hapticConfirm();
          } else {
            void hapticError();
          }
        } catch {
          setJapaneseLearningGrammarActionNotice(
            strings.reader.pluginJapaneseLearningCopyFailed,
          );
          void hapticError();
        }
      })();
    },
    [strings],
  );

  const nextJapaneseLearningChatMessageId = useCallback(() => {
    japaneseLearningChatMessageIdRef.current += 1;
    return `japanese-learning-chat-${japaneseLearningChatMessageIdRef.current}`;
  }, []);

  const prefetchJapaneseLearningChatVoice = useCallback(
    (result: MobileJapaneseLearningChatResult) => {
      if (result.kind !== "voice") return;
      const text = (result.ttsText ?? result.text).trim();
      if (!text) return;
      const signal =
        japaneseLearningLifecycleRef.current!.begin("tts-prefetch");
      void generateMobileJapaneseLearningTts(text, {
        getAuthCookie: () =>
          (
            mobileAuthClient as unknown as { getCookie?: () => string }
          ).getCookie?.() ?? "",
        source: "voice",
        signal,
      }).catch(() => undefined);
    },
    [],
  );

  const upsertJapaneseLearningChatContextSnapshot = useCallback(
    (key: string, content: string) => {
      const trimmedKey = key.trim();
      const trimmedContent = content.trim();
      if (!trimmedKey || !trimmedContent) return;
      const snapshotMessage: JapaneseLearningChatThreadMessage = {
        id: nextJapaneseLearningChatMessageId(),
        role: "user",
        text: trimmedContent,
        createdAt: Date.now(),
        hidden: true,
        isRead: true,
      };

      setJapaneseLearningChatMessages((current) => {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const message = current[index];
          if (
            message?.hidden &&
            message.role === "user" &&
            message.text.startsWith("NEMU_CTX_SNAPSHOT_V1") &&
            message.text.split("\n", 1)[0]?.includes(`key=${trimmedKey}`)
          ) {
            return current;
          }
          if (message?.role === "user" && !message.hidden) break;
        }

        const visibleUserIndex = current
          .map((message, index) => ({ message, index }))
          .reverse()
          .find(
            ({ message }) => message.role === "user" && !message.hidden,
          )?.index;

        if (visibleUserIndex == null) {
          return [...current, snapshotMessage];
        }

        const next = [...current];
        next.splice(visibleUserIndex, 0, snapshotMessage);
        return next;
      });
    },
    [nextJapaneseLearningChatMessageId],
  );

  const createJapaneseLearningChatStreamCallbacks = useCallback(
    (chatRun: number) => {
      let streamingMessageId: string | null = null;
      let lastAssistantMessageId: string | null = null;
      let streamingText = "";
      let streamingKind: "text" | "voice" | undefined;
      let streamingTtsText: string | undefined;

      const currentRunActive = () =>
        japaneseLearningChatRunRef.current === chatRun;

      const markStreaming = (messageId?: string) => {
        if (!currentRunActive()) return;
        setJapaneseLearningChatState({
          status: "loading",
          ...(messageId ? { streamingMessageId: messageId } : {}),
        });
      };

      const updateAssistantMessage = (
        message: JapaneseLearningChatThreadMessage,
      ) => {
        setJapaneseLearningChatMessages((current) => {
          const index = current.findIndex((item) => item.id === message.id);
          if (index < 0) return [...current, message];
          return current.map((item) =>
            item.id === message.id ? { ...item, ...message } : item,
          );
        });
      };

      const appendAssistantText = (
        chunk: string,
        options?: { kind?: "text" | "voice"; ttsText?: string },
      ) => {
        if (!currentRunActive()) return;
        const text = streamingText ? chunk : chunk.trimStart();
        if (!text) return;
        if (!streamingMessageId) {
          streamingMessageId = nextJapaneseLearningChatMessageId();
          lastAssistantMessageId = streamingMessageId;
        }
        streamingText += text;
        streamingKind = options?.kind ?? streamingKind;
        streamingTtsText = options?.ttsText ?? streamingTtsText;
        updateAssistantMessage({
          id: streamingMessageId,
          role: "assistant",
          kind: streamingKind,
          text: streamingText,
          ttsText: streamingTtsText,
          createdAt: Date.now(),
        });
        markStreaming(streamingMessageId);
      };

      const appendVoiceMessage = (rawText: string) => {
        if (!currentRunActive()) return;
        const text = stripMobileJapaneseLearningAudioTags(rawText);
        if (!text) return;
        const id = nextJapaneseLearningChatMessageId();
        lastAssistantMessageId = id;
        setJapaneseLearningChatMessages((current) => [
          ...current,
          {
            id,
            role: "assistant",
            kind: "voice",
            text,
            ttsText: rawText,
            createdAt: Date.now(),
          },
        ]);
        prefetchJapaneseLearningChatVoice({
          kind: "voice",
          text,
          ttsText: rawText,
          suggestions: [],
        });
        markStreaming(id);
      };

      const setLastAssistantSuggestions = (suggestions: string[]) => {
        if (!currentRunActive() || suggestions.length === 0) return;
        const messageId = lastAssistantMessageId ?? streamingMessageId;
        if (!messageId) return;
        setJapaneseLearningChatMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, suggestions } : message,
          ),
        );
      };

      return {
        callbacks: {
          onText: (text) => appendAssistantText(text),
          onSpeak: (text) => appendAssistantText(text),
          onVoice: appendVoiceMessage,
          onToolsAwaiting: (_toolCalls, partialContent) => {
            if (partialContent.trim()) {
              appendAssistantText(partialContent);
              return;
            }
            markStreaming();
          },
          onFollowups: setLastAssistantSuggestions,
          onActivity: (activity) => {
            if (activity === "client_tools") markStreaming();
          },
          onContextSnapshot: upsertJapaneseLearningChatContextSnapshot,
        } satisfies MobileJapaneseLearningChatStreamCallbacks,
        getLastAssistantMessageId: () =>
          lastAssistantMessageId ?? streamingMessageId,
      };
    },
    [
      nextJapaneseLearningChatMessageId,
      prefetchJapaneseLearningChatVoice,
      upsertJapaneseLearningChatContextSnapshot,
    ],
  );

  const executeJapaneseLearningChatTool = useCallback(
    async (
      toolCall: MobileJapaneseLearningChatToolCall,
      options?: { signal: AbortSignal },
    ): Promise<MobileJapaneseLearningChatToolResult> => {
      const fail = (result: string): MobileJapaneseLearningChatToolResult => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result,
        isError: true,
      });
      const ok = (result: string): MobileJapaneseLearningChatToolResult => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result,
      });

      if (
        toolCall.toolName !== "request_transcript" &&
        toolCall.toolName !== "trigger_ocr"
      ) {
        return fail(`Unknown tool: ${toolCall.toolName}`);
      }

      const pageNumber = Number(toolCall.args.pageNumber);
      if (!Number.isFinite(pageNumber) || pageNumber < 1) {
        return fail("Invalid page number provided.");
      }
      if (pageNumber > pageCount) {
        return fail("Page not found in the current chapter.");
      }

      const displayIndex = readerDisplayIndexForRoutePage(
        pageNumber,
        pageCount,
        mode,
      );
      if (displayIndex == null) {
        return fail("Page not found in the current chapter.");
      }

      const page = displayedPages[displayIndex];
      if (!page) {
        return fail("Page not available in the current chapter.");
      }

      const sourceText = page.text?.trim();
      if (sourceText) {
        return ok(
          toolCall.toolName === "trigger_ocr"
            ? `OCR already available for page ${pageNumber}.`
            : sourceText,
        );
      }
      if (!page.imageUri) {
        return fail(`Page ${pageNumber} image not available yet.`);
      }

      try {
        const ocrResult = await runMobileJapaneseLearningOcr(page, {
          signal: options?.signal,
        });
        const transcript = ocrResult.text.trim();
        if (!transcript) return fail("No text found on this page.");
        return ok(
          toolCall.toolName === "trigger_ocr"
            ? `OCR complete for page ${pageNumber}.`
            : transcript,
        );
      } catch (error) {
        // Tool results are read by the model, not the reader, so this stays
        // untranslated — but the stable summary still leads, with a sanitized
        // reason appended rather than replacing it.
        const reason = sanitizeMobileErrorDiagnostic(error);
        return fail(
          reason
            ? `OCR processing failed or timed out. (${reason})`
            : "OCR processing failed or timed out.",
        );
      }
    },
    [displayedPages, mode, pageCount],
  );

  const sendJapaneseLearningChatPrompt = useCallback(
    (promptText: string, options?: { transcript?: string }) => {
      const prompt = promptText.trim();
      if (!prompt) return false;
      if (!currentDisplayedPage || !chapter) {
        setJapaneseLearningChatState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        void hapticError();
        return false;
      }

      if (
        !currentDisplayedPage.text?.trim() &&
        !currentDisplayedPage.imageUri
      ) {
        setJapaneseLearningChatState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoImage,
        });
        void hapticError();
        return false;
      }

      if (
        japaneseLearningChatState.status === "loading" ||
        japaneseLearningOcrState.status === "loading"
      ) {
        return false;
      }

      const displayedPage = currentDisplayedPage;
      const displayedChapter = chapter;
      const chatRun = japaneseLearningChatRunRef.current + 1;
      const ocrRun = japaneseLearningOcrRunRef.current + 1;
      const userMessage: JapaneseLearningChatThreadMessage = {
        id: nextJapaneseLearningChatMessageId(),
        role: "user",
        text: prompt,
        createdAt: Date.now(),
        isRead: true,
      };
      const nextMessages = [...japaneseLearningChatMessages, userMessage];
      japaneseLearningChatRunRef.current = chatRun;
      setJapaneseLearningChatMessages(nextMessages);
      setJapaneseLearningChatState({ status: "loading" });
      void hapticPress();
      const chatStream = createJapaneseLearningChatStreamCallbacks(chatRun);
      const signal = japaneseLearningLifecycleRef.current!.begin("chat");

      let startedOcr = false;
      let completedOcr = false;

      void (async () => {
        let transcript = options?.transcript?.trim() ?? "";
        if (!transcript) {
          if (japaneseLearningOcrState.status === "ready") {
            const selectedTranscript =
              japaneseLearningOcrState.result.source === "ocr" &&
              japaneseLearningSelectedDetectionOrder != null
                ? japaneseLearningOcrState.result.detections
                    .find(
                      (detection) =>
                        detection.order ===
                        japaneseLearningSelectedDetectionOrder,
                    )
                    ?.text.trim()
                : undefined;
            transcript = (
              selectedTranscript || japaneseLearningOcrState.result.text
            ).trim();
          } else {
            startedOcr = true;
            japaneseLearningOcrRunRef.current = ocrRun;
            setJapaneseLearningOcrState({ status: "loading" });
            const ocrResult = await runMobileJapaneseLearningOcr(
              displayedPage,
              { signal },
            );
            if (
              japaneseLearningOcrRunRef.current !== ocrRun ||
              japaneseLearningChatRunRef.current !== chatRun
            ) {
              return;
            }
            setJapaneseLearningOcrState({ status: "ready", result: ocrResult });
            completedOcr = true;
            transcript = ocrResult.text.trim();
          }
        }

        if (!transcript) {
          throw new Error(strings.reader.pluginJapaneseLearningNoText);
        }

        return runMobileJapaneseLearningChat({
          appLanguage,
          callbacks: chatStream.callbacks,
          chapter: displayedChapter,
          ephemeralContext: japaneseLearningGrammarContext,
          executeTool: executeJapaneseLearningChatTool,
          getAuthCookie: () =>
            (
              mobileAuthClient as unknown as { getCookie?: () => string }
            ).getCookie?.() ?? "",
          mangaGenres: state.entry?.item.metadata.tags,
          mangaTitle: title,
          messages: mobileJapaneseLearningChatRequestMessages(nextMessages),
          pageCount,
          pageNumber: sourcePageNumber || clampedPageIndex + 1,
          plugin: activeReaderPlugin,
          signal,
          transcript,
        });
      })()
        .then((result) => {
          if (!result || japaneseLearningChatRunRef.current !== chatRun) return;
          prefetchJapaneseLearningChatVoice(result);
          setJapaneseLearningChatState({ status: "ready", result });
          const streamedMessageId = chatStream.getLastAssistantMessageId();
          if (streamedMessageId) {
            setJapaneseLearningChatMessages((current) =>
              current.map((message) =>
                message.id === streamedMessageId
                  ? {
                      ...message,
                      kind: message.kind ?? result.kind,
                      text:
                        message.kind === "voice"
                          ? message.text
                          : result.text || message.text,
                      ttsText: message.ttsText ?? result.ttsText,
                      suggestions: result.suggestions,
                    }
                  : message,
              ),
            );
          } else {
            setJapaneseLearningChatMessages((current) => [
              ...current,
              {
                id: nextJapaneseLearningChatMessageId(),
                role: "assistant",
                kind: result.kind,
                text: result.text,
                ttsText: result.ttsText,
                createdAt: Date.now(),
                suggestions: result.suggestions,
              },
            ]);
          }
          void hapticConfirm();
        })
        .catch((error) => {
          if (japaneseLearningChatRunRef.current !== chatRun) return;
          const detail = mobileJapaneseLearningChatErrorDetail(error, strings);
          if (
            startedOcr &&
            !completedOcr &&
            japaneseLearningOcrRunRef.current === ocrRun
          ) {
            setJapaneseLearningOcrState({ status: "error", detail });
          }
          setJapaneseLearningChatState({ status: "error", detail });
          setJapaneseLearningChatMessages((current) => [
            ...current,
            {
              id: nextJapaneseLearningChatMessageId(),
              role: "assistant",
              text: detail,
              createdAt: Date.now(),
              isError: true,
            },
          ]);
          void hapticError();
        });
      return true;
    },
    [
      activeReaderPlugin,
      appLanguage,
      chapter,
      clampedPageIndex,
      createJapaneseLearningChatStreamCallbacks,
      currentDisplayedPage,
      executeJapaneseLearningChatTool,
      japaneseLearningChatMessages,
      japaneseLearningChatState.status,
      japaneseLearningGrammarContext,
      japaneseLearningOcrState,
      japaneseLearningSelectedDetectionOrder,
      nextJapaneseLearningChatMessageId,
      pageCount,
      prefetchJapaneseLearningChatVoice,
      sourcePageNumber,
      state.entry?.item.metadata.tags,
      strings,
      title,
    ],
  );

  const askJapaneseLearningGrammarSelection = useCallback(
    (text: string, kind: "sentence" | "word" | "words") => {
      const selectedText = text.trim();
      if (!selectedText) return;

      const responseMode = parseMobileJapaneseLearningResponseMode(
        activeReaderPlugin?.values.nemuResponseMode,
      );
      const prompt = getMobileJapaneseLearningExplainPrompt(
        appLanguage,
        responseMode,
        kind,
        selectedText,
      );
      const transcript =
        japaneseLearningGrammarState.status === "ready"
          ? japaneseLearningGrammarState.text
          : currentDisplayedPage.text?.trim() || selectedText;
      setJapaneseLearningGrammarActionNotice(null);
      sendJapaneseLearningChatPrompt(prompt, { transcript });
    },
    [
      activeReaderPlugin,
      appLanguage,
      currentDisplayedPage,
      japaneseLearningGrammarState,
      sendJapaneseLearningChatPrompt,
    ],
  );

  const runJapaneseLearningChat = useCallback(() => {
    const responseMode = parseMobileJapaneseLearningResponseMode(
      activeReaderPlugin?.values.nemuResponseMode,
    );
    sendJapaneseLearningChatPrompt(
      getGreetingPrompt(appLanguage, responseMode),
    );
  }, [appLanguage, activeReaderPlugin, sendJapaneseLearningChatPrompt]);

  const sendJapaneseLearningChatInput = useCallback(() => {
    const prompt = japaneseLearningChatInput.trim();
    if (!prompt) return;
    if (sendJapaneseLearningChatPrompt(prompt)) {
      setJapaneseLearningChatInput("");
    }
  }, [japaneseLearningChatInput, sendJapaneseLearningChatPrompt]);

  const sendJapaneseLearningChatSuggestion = useCallback(
    (suggestion: string) => {
      const prompt = suggestion.trim();
      if (!prompt) return;
      if (sendJapaneseLearningChatPrompt(prompt)) {
        setJapaneseLearningChatInput("");
      }
    },
    [sendJapaneseLearningChatPrompt],
  );

  const openJapaneseLearningDetectionTool = useCallback(() => {
    setJapaneseLearningLauncherVisible(false);
    setJapaneseLearningTranscriptVisible(true);
    if (
      japaneseLearningOcrState.status !== "loading" &&
      japaneseLearningOcrState.status !== "ready"
    ) {
      runJapaneseLearningOcr();
    } else {
      void hapticPress();
    }
  }, [japaneseLearningOcrState.status, runJapaneseLearningOcr]);

  const openJapaneseLearningChatTool = useCallback(() => {
    setJapaneseLearningLauncherVisible(false);
    if (
      japaneseLearningChatState.status !== "loading" &&
      japaneseLearningChatMessages.length === 0
    ) {
      runJapaneseLearningChat();
    } else {
      void hapticPress();
    }
    setJapaneseLearningChatDrawerVisible(true);
  }, [
    japaneseLearningChatMessages.length,
    japaneseLearningChatState.status,
    runJapaneseLearningChat,
  ]);

  const copyJapaneseLearningSentence = useCallback(() => {
    const sentenceText = getJapaneseLearningSentenceText();
    if (!sentenceText) {
      void hapticError();
      return;
    }
    copyJapaneseLearningGrammarSelection(sentenceText);
  }, [copyJapaneseLearningGrammarSelection, getJapaneseLearningSentenceText]);

  const askJapaneseLearningSentence = useCallback(() => {
    if (!currentDisplayedPage) {
      setJapaneseLearningChatState({
        status: "error",
        detail: strings.reader.pluginJapaneseLearningNoImage,
      });
      void hapticError();
      return;
    }

    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri) {
      setJapaneseLearningChatState({
        status: "error",
        detail: strings.reader.pluginJapaneseLearningNoImage,
      });
      void hapticError();
      return;
    }

    if (japaneseLearningChatState.status === "loading") return;

    const existingSentenceText = getJapaneseLearningSentenceText();
    if (existingSentenceText) {
      askJapaneseLearningGrammarSelection(existingSentenceText, "sentence");
      return;
    }

    const chatRun = japaneseLearningChatRunRef.current + 1;
    const ocrRun = japaneseLearningOcrRunRef.current + 1;
    japaneseLearningChatRunRef.current = chatRun;
    japaneseLearningOcrRunRef.current = ocrRun;
    setJapaneseLearningChatState({ status: "loading" });
    setJapaneseLearningOcrState({ status: "loading" });
    const chatStream = createJapaneseLearningChatStreamCallbacks(chatRun);
    const signal = japaneseLearningLifecycleRef.current!.begin("chat");
    let completedOcr = false;
    let appendedUserMessage = false;

    void runMobileJapaneseLearningOcr(currentDisplayedPage, { signal })
      .then((ocrResult) => {
        if (
          japaneseLearningOcrRunRef.current !== ocrRun ||
          japaneseLearningChatRunRef.current !== chatRun
        ) {
          return;
        }
        setJapaneseLearningOcrState({ status: "ready", result: ocrResult });
        completedOcr = true;
        const sentenceText = mobileJapaneseLearningSentenceText(
          ocrResult,
          japaneseLearningSelectedDetectionOrder,
        );
        if (!sentenceText) {
          throw new Error(strings.reader.pluginJapaneseLearningNoText);
        }

        const responseMode = parseMobileJapaneseLearningResponseMode(
          activeReaderPlugin?.values.nemuResponseMode,
        );
        const prompt = getMobileJapaneseLearningExplainPrompt(
          appLanguage,
          responseMode,
          "sentence",
          sentenceText,
        );
        const userMessage: JapaneseLearningChatThreadMessage = {
          id: nextJapaneseLearningChatMessageId(),
          role: "user",
          text: prompt,
          createdAt: Date.now(),
          isRead: true,
        };
        const nextMessages = [...japaneseLearningChatMessages, userMessage];
        appendedUserMessage = true;
        setJapaneseLearningChatMessages(nextMessages);
        return runMobileJapaneseLearningChat({
          appLanguage,
          callbacks: chatStream.callbacks,
          chapter,
          ephemeralContext: japaneseLearningGrammarContext,
          executeTool: executeJapaneseLearningChatTool,
          getAuthCookie: () =>
            (
              mobileAuthClient as unknown as { getCookie?: () => string }
            ).getCookie?.() ?? "",
          mangaGenres: state.entry?.item.metadata.tags,
          mangaTitle: title,
          messages: mobileJapaneseLearningChatRequestMessages(nextMessages),
          pageCount,
          pageNumber: sourcePageNumber || clampedPageIndex + 1,
          plugin: activeReaderPlugin,
          prompt,
          signal,
          transcript: sentenceText,
        });
      })
      .then((result) => {
        if (!result || japaneseLearningChatRunRef.current !== chatRun) return;
        prefetchJapaneseLearningChatVoice(result);
        setJapaneseLearningChatState({ status: "ready", result });
        const streamedMessageId = chatStream.getLastAssistantMessageId();
        if (streamedMessageId) {
          setJapaneseLearningChatMessages((current) =>
            current.map((message) =>
              message.id === streamedMessageId
                ? {
                    ...message,
                    kind: message.kind ?? result.kind,
                    text:
                      message.kind === "voice"
                        ? message.text
                        : result.text || message.text,
                    ttsText: message.ttsText ?? result.ttsText,
                    suggestions: result.suggestions,
                  }
                : message,
            ),
          );
        } else {
          setJapaneseLearningChatMessages((current) => [
            ...current,
            {
              id: nextJapaneseLearningChatMessageId(),
              role: "assistant",
              kind: result.kind,
              text: result.text,
              ttsText: result.ttsText,
              createdAt: Date.now(),
              suggestions: result.suggestions,
            },
          ]);
        }
        void hapticConfirm();
      })
      .catch((error) => {
        if (japaneseLearningChatRunRef.current !== chatRun) return;
        const detail = mobileJapaneseLearningChatErrorDetail(error, strings);
        if (!completedOcr && japaneseLearningOcrRunRef.current === ocrRun) {
          setJapaneseLearningOcrState({ status: "error", detail });
        }
        setJapaneseLearningChatState({ status: "error", detail });
        if (appendedUserMessage) {
          setJapaneseLearningChatMessages((current) => [
            ...current,
            {
              id: nextJapaneseLearningChatMessageId(),
              role: "assistant",
              text: detail,
              createdAt: Date.now(),
              isError: true,
            },
          ]);
        }
        void hapticError();
      });
  }, [
    activeReaderPlugin,
    appLanguage,
    askJapaneseLearningGrammarSelection,
    chapter,
    clampedPageIndex,
    createJapaneseLearningChatStreamCallbacks,
    currentDisplayedPage,
    executeJapaneseLearningChatTool,
    getJapaneseLearningSentenceText,
    japaneseLearningChatState.status,
    japaneseLearningChatMessages,
    japaneseLearningGrammarContext,
    japaneseLearningSelectedDetectionOrder,
    nextJapaneseLearningChatMessageId,
    pageCount,
    prefetchJapaneseLearningChatVoice,
    sourcePageNumber,
    state.entry?.item.metadata.tags,
    strings,
    title,
  ]);

  const selectJapaneseLearningDetection = useCallback(
    (detection: MobileOcrDetection) => {
      setJapaneseLearningSelectedDetectionOrder(detection.order);
      setJapaneseLearningTranscriptVisible(false);
      setJapaneseLearningOcrSheetVisible(true);
      runJapaneseLearningGrammar(detection.text);
    },
    [runJapaneseLearningGrammar],
  );

  const japaneseLearningTtsSource =
    japaneseLearningTtsState.status === "loading" ||
    japaneseLearningTtsState.status === "playing"
      ? japaneseLearningTtsState.source
      : undefined;

  const stopJapaneseLearningTts = useCallback(() => {
    japaneseLearningLifecycleRef.current?.abort("tts-playback");
    japaneseLearningTtsRunRef.current += 1;
    japaneseLearningChatTtsAutoPlayRef.current = {
      enabled: false,
      currentId: null,
      armedAt: 0,
    };
    japaneseLearningTtsPlayerRef.current?.remove();
    japaneseLearningTtsPlayerRef.current = null;
    setJapaneseLearningTtsState({ status: "idle" });
  }, []);

  const toggleJapaneseLearningTts = useCallback(() => {
    const isSentenceTtsBusy =
      (japaneseLearningTtsState.status === "loading" ||
        japaneseLearningTtsState.status === "playing") &&
      japaneseLearningTtsSource === "sentence";

    if (isSentenceTtsBusy) {
      stopJapaneseLearningTts();
      return;
    }
    if (japaneseLearningTtsState.status === "loading") return;
    if (japaneseLearningTtsState.status === "playing") {
      stopJapaneseLearningTts();
    }

    if (!currentDisplayedPage) {
      setJapaneseLearningTtsState({
        status: "error",
        detail: strings.reader.pluginJapaneseLearningNoImage,
      });
      void hapticError();
      return;
    }

    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri) {
      setJapaneseLearningTtsState({
        status: "error",
        detail: strings.reader.pluginJapaneseLearningNoImage,
      });
      void hapticError();
      return;
    }

    const ttsRun = japaneseLearningTtsRunRef.current + 1;
    japaneseLearningTtsRunRef.current = ttsRun;
    const signal = japaneseLearningLifecycleRef.current!.begin("tts-playback");
    setJapaneseLearningTtsState({
      status: "loading",
      text: "",
      source: "sentence",
    });

    let ttsOcrRun: number | null = null;
    let completedOcr = japaneseLearningOcrState.status === "ready";
    void (async () => {
      let ocrResult =
        japaneseLearningOcrState.status === "ready"
          ? japaneseLearningOcrState.result
          : null;

      if (!ocrResult) {
        const ocrRun = japaneseLearningOcrRunRef.current + 1;
        japaneseLearningOcrRunRef.current = ocrRun;
        ttsOcrRun = ocrRun;
        setJapaneseLearningOcrState({ status: "loading" });
        ocrResult = await runMobileJapaneseLearningOcr(currentDisplayedPage, {
          signal,
        });
        if (japaneseLearningOcrRunRef.current !== ocrRun) return;
        // Commit the OCR result even if the user stopped TTS mid-fetch — the
        // detection state is independent of playback and must not stay
        // "loading" forever (spinner + disabled Detect button).
        setJapaneseLearningOcrState({ status: "ready", result: ocrResult });
        completedOcr = true;
        if (japaneseLearningTtsRunRef.current !== ttsRun) return;
      }

      const transcript = mobileJapaneseLearningSentenceText(
        ocrResult,
        japaneseLearningSelectedDetectionOrder,
      );
      if (!transcript)
        throw new Error(strings.reader.pluginJapaneseLearningNoText);
      if (japaneseLearningTtsRunRef.current !== ttsRun) return;
      setJapaneseLearningTtsState({
        status: "loading",
        text: transcript,
        source: "sentence",
      });

      const audio = await generateMobileJapaneseLearningTts(transcript, {
        getAuthCookie: () =>
          (
            mobileAuthClient as unknown as { getCookie?: () => string }
          ).getCookie?.() ?? "",
        source: "sentence",
        signal,
      });
      if (japaneseLearningTtsRunRef.current !== ttsRun) return;

      await setAudioModeAsync({ playsInSilentMode: true });
      if (signal.aborted || japaneseLearningTtsRunRef.current !== ttsRun) {
        return;
      }
      japaneseLearningTtsPlayerRef.current?.remove();
      const player = createAudioPlayer({ uri: audio.uri });
      japaneseLearningTtsPlayerRef.current = player;
      const subscription = player.addListener(
        "playbackStatusUpdate",
        (status) => {
          if (japaneseLearningTtsRunRef.current !== ttsRun) return;
          if (status.didJustFinish) {
            subscription.remove();
            player.remove();
            if (japaneseLearningTtsPlayerRef.current === player) {
              japaneseLearningTtsPlayerRef.current = null;
            }
            setJapaneseLearningTtsState({ status: "idle" });
          }
        },
      );
      player.play();
      setJapaneseLearningTtsState({
        status: "playing",
        text: transcript,
        id: audio.id,
        source: "sentence",
      });
      void hapticConfirm();
    })().catch((error) => {
      const detail =
        error instanceof Error && error.message === "auth_required"
          ? strings.reader.pluginJapaneseLearningSignInRequired
          : readerErrorDetail(
              error,
              strings.reader.pluginJapaneseLearningTtsFailed,
              strings,
            );
      // Clear the OCR spinner before the TTS-run guard, mirroring
      // askJapaneseLearningSentence — a stopped TTS run must not strand the
      // detection state in "loading".
      if (
        !completedOcr &&
        ttsOcrRun !== null &&
        japaneseLearningOcrRunRef.current === ttsOcrRun
      ) {
        setJapaneseLearningOcrState(
          error instanceof Error && error.name === "AbortError"
            ? { status: "idle" }
            : { status: "error", detail },
        );
      }
      if (japaneseLearningTtsRunRef.current !== ttsRun) return;
      setJapaneseLearningTtsState({ status: "error", detail });
      void hapticError();
    });
  }, [
    currentDisplayedPage,
    japaneseLearningOcrState,
    japaneseLearningSelectedDetectionOrder,
    japaneseLearningTtsSource,
    japaneseLearningTtsState.status,
    stopJapaneseLearningTts,
    strings,
  ]);

  const toggleJapaneseLearningTranscriptTts = useCallback(
    (text: string) => {
      const transcript = text.trim();
      if (!transcript) {
        setJapaneseLearningTtsState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningNoText,
        });
        void hapticError();
        return;
      }

      const isTranscriptTtsBusy =
        (japaneseLearningTtsState.status === "loading" ||
          japaneseLearningTtsState.status === "playing") &&
        japaneseLearningTtsState.source === "transcript";

      if (isTranscriptTtsBusy) {
        stopJapaneseLearningTts();
        return;
      }
      if (japaneseLearningTtsState.status === "loading") return;
      if (japaneseLearningTtsState.status === "playing") {
        stopJapaneseLearningTts();
      }

      if (transcript.length > 500) {
        setJapaneseLearningTtsState({
          status: "error",
          detail: strings.reader.pluginJapaneseLearningTranscriptTooLong,
        });
        void hapticError();
        return;
      }

      const ttsRun = japaneseLearningTtsRunRef.current + 1;
      japaneseLearningTtsRunRef.current = ttsRun;
      const signal =
        japaneseLearningLifecycleRef.current!.begin("tts-playback");
      setJapaneseLearningTtsState({
        status: "loading",
        text: transcript,
        source: "transcript",
        currentTime: 0,
        duration: 0,
      });

      void (async () => {
        const audio = await generateMobileJapaneseLearningTts(transcript, {
          getAuthCookie: () =>
            (
              mobileAuthClient as unknown as { getCookie?: () => string }
            ).getCookie?.() ?? "",
          source: "transcript",
          signal,
        });
        if (japaneseLearningTtsRunRef.current !== ttsRun) return;

        await setAudioModeAsync({ playsInSilentMode: true });
        if (signal.aborted || japaneseLearningTtsRunRef.current !== ttsRun) {
          return;
        }
        japaneseLearningTtsPlayerRef.current?.remove();
        const player = createAudioPlayer({ uri: audio.uri });
        japaneseLearningTtsPlayerRef.current = player;
        const subscription = player.addListener(
          "playbackStatusUpdate",
          (status) => {
            if (japaneseLearningTtsRunRef.current !== ttsRun) return;
            if (!status.didJustFinish) {
              setJapaneseLearningTtsState((current) => {
                if (
                  current.status === "idle" ||
                  current.status === "error" ||
                  current.source !== "transcript"
                ) {
                  return current;
                }
                const currentTime = Number.isFinite(status.currentTime)
                  ? status.currentTime
                  : 0;
                const duration = Number.isFinite(status.duration)
                  ? status.duration
                  : 0;
                if (
                  current.currentTime === currentTime &&
                  current.duration === duration
                ) {
                  return current;
                }
                return { ...current, currentTime, duration };
              });
            }
            if (status.didJustFinish) {
              subscription.remove();
              player.remove();
              if (japaneseLearningTtsPlayerRef.current === player) {
                japaneseLearningTtsPlayerRef.current = null;
              }
              setJapaneseLearningTtsState({ status: "idle" });
            }
          },
        );
        player.play();
        setJapaneseLearningTtsState({
          status: "playing",
          text: transcript,
          id: audio.id,
          source: "transcript",
          currentTime: 0,
          duration: 0,
        });
        void hapticConfirm();
      })().catch((error) => {
        if (japaneseLearningTtsRunRef.current !== ttsRun) return;
        setJapaneseLearningTtsState({
          status: "error",
          detail:
            error instanceof Error && error.message === "auth_required"
              ? strings.reader.pluginJapaneseLearningSignInRequired
              : readerErrorDetail(
                  error,
                  strings.reader.pluginJapaneseLearningTtsFailed,
                  strings,
                ),
        });
        void hapticError();
      });
    },
    [japaneseLearningTtsState, strings, stopJapaneseLearningTts],
  );

  const playJapaneseLearningChatTts = useCallback(
    (
      message: JapaneseLearningChatThreadMessage,
      options?: JapaneseLearningChatTtsOptions,
    ) => {
      const text = (message.ttsText ?? message.text).trim();
      if (!text || message.role !== "assistant" || message.isError) return;
      const autoPlayNext = options?.autoPlayNext ?? message.kind === "voice";
      const playHaptic = options?.haptic ?? true;
      const armedAt = Date.now();
      japaneseLearningChatTtsAutoPlayRef.current = autoPlayNext
        ? { enabled: true, currentId: message.id, armedAt }
        : { enabled: false, currentId: null, armedAt: 0 };
      const ttsRun = japaneseLearningTtsRunRef.current + 1;
      japaneseLearningTtsRunRef.current = ttsRun;
      const signal =
        japaneseLearningLifecycleRef.current!.begin("tts-playback");
      setJapaneseLearningTtsState({
        status: "loading",
        text,
        source: "chat",
        messageId: message.id,
      });

      void (async () => {
        const audio = await generateMobileJapaneseLearningTts(text, {
          getAuthCookie: () =>
            (
              mobileAuthClient as unknown as { getCookie?: () => string }
            ).getCookie?.() ?? "",
          source: "voice",
          signal,
        });
        if (japaneseLearningTtsRunRef.current !== ttsRun) return;

        await setAudioModeAsync({ playsInSilentMode: true });
        if (signal.aborted || japaneseLearningTtsRunRef.current !== ttsRun) {
          return;
        }
        japaneseLearningTtsPlayerRef.current?.remove();
        const player = createAudioPlayer({ uri: audio.uri });
        japaneseLearningTtsPlayerRef.current = player;
        const subscription = player.addListener(
          "playbackStatusUpdate",
          (status) => {
            if (japaneseLearningTtsRunRef.current !== ttsRun) return;
            if (status.didJustFinish) {
              subscription.remove();
              player.remove();
              if (japaneseLearningTtsPlayerRef.current === player) {
                japaneseLearningTtsPlayerRef.current = null;
              }

              const autoPlayState = japaneseLearningChatTtsAutoPlayRef.current;
              if (
                autoPlayState.enabled &&
                autoPlayState.currentId === message.id &&
                Date.now() > autoPlayState.armedAt
              ) {
                const currentIndex =
                  japaneseLearningChatMessagesRef.current.findIndex(
                    (item) => item.id === message.id,
                  );
                const nextMessage =
                  currentIndex >= 0
                    ? japaneseLearningChatMessagesRef.current
                        .slice(currentIndex + 1)
                        .find(
                          (item) =>
                            item.role === "assistant" &&
                            item.kind === "voice" &&
                            !item.isError,
                        )
                    : undefined;
                if (nextMessage) {
                  playJapaneseLearningChatTtsRef.current?.(nextMessage, {
                    autoPlayNext: true,
                    haptic: false,
                  });
                  return;
                }
              }

              japaneseLearningChatTtsAutoPlayRef.current = {
                enabled: false,
                currentId: null,
                armedAt: 0,
              };
              setJapaneseLearningTtsState({ status: "idle" });
            }
          },
        );
        player.play();
        setJapaneseLearningTtsState({
          status: "playing",
          text,
          id: audio.id,
          source: "chat",
          messageId: message.id,
        });
        if (playHaptic) void hapticConfirm();
      })().catch((error) => {
        if (japaneseLearningTtsRunRef.current !== ttsRun) return;
        japaneseLearningChatTtsAutoPlayRef.current = {
          enabled: false,
          currentId: null,
          armedAt: 0,
        };
        setJapaneseLearningTtsState({
          status: "error",
          detail:
            error instanceof Error && error.message === "auth_required"
              ? strings.reader.pluginJapaneseLearningSignInRequired
              : readerErrorDetail(
                  error,
                  strings.reader.pluginJapaneseLearningTtsFailed,
                  strings,
                ),
        });
        void hapticError();
      });
    },
    [strings],
  );

  useEffect(() => {
    playJapaneseLearningChatTtsRef.current = playJapaneseLearningChatTts;
  }, [playJapaneseLearningChatTts]);

  const toggleJapaneseLearningChatTts = useCallback(
    (message: JapaneseLearningChatThreadMessage) => {
      const text = (message.ttsText ?? message.text).trim();
      if (!text || message.role !== "assistant" || message.isError) return;
      const isCurrentChatAudio =
        (japaneseLearningTtsState.status === "loading" ||
          japaneseLearningTtsState.status === "playing") &&
        japaneseLearningTtsState.source === "chat" &&
        japaneseLearningTtsState.messageId === message.id;

      if (isCurrentChatAudio) {
        stopJapaneseLearningTts();
        return;
      }

      if (japaneseLearningTtsState.status === "loading") return;
      if (japaneseLearningTtsState.status === "playing") {
        stopJapaneseLearningTts();
      }

      playJapaneseLearningChatTts(message);
    },
    [
      japaneseLearningTtsState,
      playJapaneseLearningChatTts,
      stopJapaneseLearningTts,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const requestRun = readerPagesRequestRunRef.current + 1;
    readerPagesRequestRunRef.current = requestRun;
    const effectStrings = getMobileStrings(appLanguage);

    if (loading) {
      return () => {
        cancelled = true;
      };
    }

    const performanceKey = `${registryId}:${sourceId}:${mangaId}:${chapterId}`;
    readerFirstPageRequestRef.current = {
      key: performanceKey,
      startedAt: markMobilePerformance(
        MOBILE_PERFORMANCE_MARKS.readerPagesRequest,
        { registryId, sourceId, chapterId },
      ),
      measured: false,
    };

    setPagesState((current) =>
      current.status === "loading" &&
      current.detail === effectStrings.reader.loadingPages
        ? current
        : {
            status: "loading",
            pages: [],
            detail: effectStrings.reader.loadingPages,
          },
    );

    void (async () => {
      try {
        const installedSources = await store.getInstalledSources();
        const installedSource = installedSources.find((item) =>
          mobileInstalledSourceMatchesRoute(item, registryId, sourceId),
        );

        if (!installedSource) {
          if (!cancelled && readerPagesRequestRunRef.current === requestRun) {
            setPagesState({
              status: "blocked",
              pages: [],
              detail: effectStrings.reader.sourcePackageUnavailable,
            });
          }
          return;
        }

        const refreshed = await refreshMobileReaderPages(
          installedSource,
          mangaId,
          sourceChapterForRequest,
          {
            getSourceSettings: getReaderSourceSettings,
            onSourcePackageHydrated: saveReaderSourcePackageHydration,
            processPageImages,
          },
        );

        if (cancelled || readerPagesRequestRunRef.current !== requestRun)
          return;
        if (refreshed.status === "blocked") {
          setPagesState({
            status: "blocked",
            pages: [],
            detail: refreshed.detail,
          });
          return;
        }

        setPagesState({
          status: "ready",
          pages: refreshed.pages,
          pageProcessor: refreshed.pageProcessor,
          chapters: refreshed.chapters,
          detail: formatReaderLoadedPages(
            refreshed.pages.length,
            effectStrings,
          ),
          fetchedAt: refreshed.fetchedAt,
          chapter: refreshed.chapter,
        });
      } catch (nextError) {
        if (cancelled || readerPagesRequestRunRef.current !== requestRun) {
          return;
        }
        cloudflareSheetRef.current?.reportError(nextError);
        const presentation = getMobileSourceErrorPresentation(
          nextError,
          effectStrings,
        );
        setPagesState({
          status: "error",
          pages: [],
          title: presentation.title,
          detail: presentation.detail,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appLanguage,
    chapterId,
    loading,
    mangaId,
    pagesRefreshNonce,
    processPageImages,
    registryId,
    sourceChapterForRequest,
    sourceId,
    store,
    getReaderSourceSettings,
    saveReaderSourcePackageHydration,
  ]);

  useEffect(() => {
    if (pagesState.status !== "ready") return;
    if (!restoreReaderKey || restoredReaderKey === restoreReaderKey) return;
    const nextPageIndex = readerRestorePageIndex;
    readerProgrammaticScrollRef.current = nextPageIndex;
    // Restoring saved progress (or a route page) places the reader; it never
    // counts as having read forward onto that page.
    setPageArrival("initial");
    setCurrentPageIndex(nextPageIndex);
    const timeout = setTimeout(() => {
      scrollToPageIndex(nextPageIndex, false);
      setRestoredReaderKey(restoreReaderKey);
    }, 0);
    syncRoutePage(nextPageIndex);
    return () => clearTimeout(timeout);
  }, [
    pagesState.status,
    readyFetchedAt,
    readerRestorePageIndex,
    restoreReaderKey,
    restoredReaderKey,
    scrollToPageIndex,
    syncRoutePage,
  ]);

  const persistProgress = useCallback(
    async (
      complete: boolean,
      nextDisplayIndex = clampedPageIndex,
      options?: MobileReaderPersistProgressOptions,
    ) => {
      const priorPersistence = progressPersistenceQueueRef.current;
      let releasePersistence: () => void = () => undefined;
      progressPersistenceQueueRef.current = new Promise<void>((resolve) => {
        releasePersistence = resolve;
      });
      await priorPersistence.catch(() => undefined);
      try {
        if (!options?.silent) setSaving(true);
        const updatedAt = nextSyncTimestamp(
          state.chapterProgress?.updatedAt,
          state.mangaProgress?.updatedAt,
          progressPersistenceClockRef.current,
        );
        progressPersistenceClockRef.current = updatedAt;
        // Keep the user-facing read clock monotonic with the sync clock even if
        // the device wall clock moves backwards while the reader is open.
        const lastReadAt = updatedAt;
        const nextSourceIndex = complete
          ? Math.max(0, pageCount - 1)
          : readerSourceIndexForDisplayIndex(nextDisplayIndex, pageCount, mode);
        const nextTotal = Math.max(1, pageCount);
        // Never infer completion from the page position: opening a chapter at
        // its last page (backward navigation, or resuming saved progress) would
        // otherwise mark it read and sync that corruption. Completion is either
        // explicit or already recorded.
        const completed =
          complete || (state.chapterProgress?.completed ?? false);
        const intraPageState =
          normalizeMobileReaderIntraPageState({
            intraPageProgress: options?.intraPageProgress,
            intraPageContentIdentity: options?.intraPageContentIdentity,
          }) ??
          normalizeMobileReaderIntraPageState({
            intraPageProgress: state.chapterProgress?.intraPageProgress,
            intraPageContentIdentity:
              state.chapterProgress?.intraPageContentIdentity,
          });
        const progressSourceRef = state.sourceLink ?? routeSourceRef;
        const chapterProgress: LocalChapterProgress = {
          id: makeChapterProgressId(
            progressSourceRef.registryId,
            progressSourceRef.sourceId,
            progressSourceRef.sourceMangaId,
            chapterId,
          ),
          registryId: progressSourceRef.registryId,
          sourceId: progressSourceRef.sourceId,
          sourceMangaId: progressSourceRef.sourceMangaId,
          sourceChapterId: chapterId,
          libraryItemId: state.entry?.item.libraryItemId,
          progress: nextSourceIndex,
          total: nextTotal,
          completed,
          lastReadAt,
          chapterNumber: chapter.chapterNumber,
          volumeNumber: chapter.volumeNumber,
          chapterTitle: chapter.title,
          ...(intraPageState ?? {}),
          updatedAt,
        };
        const mangaProgress: LocalMangaProgress = {
          id: makeMangaProgressId(
            progressSourceRef.registryId,
            progressSourceRef.sourceId,
            progressSourceRef.sourceMangaId,
          ),
          registryId: progressSourceRef.registryId,
          sourceId: progressSourceRef.sourceId,
          sourceMangaId: progressSourceRef.sourceMangaId,
          libraryItemId: state.entry?.item.libraryItemId,
          lastReadAt,
          lastReadSourceChapterId: chapterId,
          lastReadChapterNumber: chapter.chapterNumber,
          lastReadVolumeNumber: chapter.volumeNumber,
          lastReadChapterTitle: chapter.title,
          updatedAt,
        };

        try {
          await store.saveChapterProgress(chapterProgress);
          await store.saveMangaProgress(mangaProgress);
          if (options?.updateState !== false) {
            const [savedChapterProgress, savedMangaProgress] =
              await Promise.all([
                store.getChapterProgress(
                  chapterProgress.registryId,
                  chapterProgress.sourceId,
                  chapterProgress.sourceMangaId,
                  chapterProgress.sourceChapterId,
                ),
                store.getMangaProgress(),
              ]);
            setState((current) => ({
              ...current,
              chapterProgress: savedChapterProgress ?? chapterProgress,
              mangaProgress:
                savedMangaProgress.find(
                  (entry) => entry.id === mangaProgress.id,
                ) ?? mangaProgress,
            }));
          }
          emitMobileDataChanged("progress");
          if (complete && !options?.silent) {
            await hapticConfirm();
            await load();
          }
        } catch (error) {
          if (!options?.silent) await hapticError();
          if (options?.throwOnError) throw error;
        } finally {
          if (!options?.silent) setSaving(false);
        }
      } finally {
        releasePersistence();
      }
    },
    [
      chapter.chapterNumber,
      chapter.title,
      chapter.volumeNumber,
      chapterId,
      clampedPageIndex,
      load,
      mode,
      pageCount,
      routeSourceRef,
      state.chapterProgress?.completed,
      state.chapterProgress?.intraPageContentIdentity,
      state.chapterProgress?.intraPageProgress,
      state.chapterProgress?.updatedAt,
      state.entry?.item.libraryItemId,
      state.mangaProgress?.updatedAt,
      state.sourceLink,
      store,
    ],
  );

  useEffect(() => {
    persistProgressRef.current = persistProgress;
  }, [persistProgress]);

  const flushPendingIntraPageProgress = useCallback((updateState: boolean) => {
    if (intraPageProgressSaveTimerRef.current) {
      clearTimeout(intraPageProgressSaveTimerRef.current);
      intraPageProgressSaveTimerRef.current = null;
    }
    const pending = pendingIntraPageProgressRef.current;
    pendingIntraPageProgressRef.current = null;
    if (!pending) return;
    void pending.persist(false, pending.displayIndex, {
      silent: true,
      updateState,
      intraPageProgress: pending.progress,
      intraPageContentIdentity: pending.contentIdentity,
    });
  }, []);

  const persistLongStripScrollProgress = useCallback(
    (contentIdentity: string, progress: number) => {
      if (contentIdentity !== currentDisplayedPageIdentity) return;
      const normalized = normalizeMobileReaderIntraPageState({
        intraPageProgress: progress,
        intraPageContentIdentity: contentIdentity,
      });
      if (!normalized) return;
      if (intraPageProgressSaveTimerRef.current) {
        clearTimeout(intraPageProgressSaveTimerRef.current);
      }
      pendingIntraPageProgressRef.current = {
        contentIdentity: normalized.intraPageContentIdentity,
        displayIndex: clampedPageIndex,
        persist: persistProgressRef.current,
        progress: normalized.intraPageProgress,
      };
      intraPageProgressSaveTimerRef.current = setTimeout(
        () => {
          flushPendingIntraPageProgress(true);
        },
        normalized.intraPageProgress >= 0.999 ? 0 : 500,
      );
    },
    [
      clampedPageIndex,
      currentDisplayedPageIdentity,
      flushPendingIntraPageProgress,
    ],
  );

  useEffect(() => {
    return () => flushPendingIntraPageProgress(false);
  }, [currentDisplayedPageIdentity, flushPendingIntraPageProgress]);

  useEffect(() => {
    if (!silentProgressPersistenceKey) return;
    const timeout = setTimeout(() => {
      // persistProgress captures the saved timestamps that this write advances.
      // Calling the latest implementation through a ref prevents that
      // timestamp-only state update from re-arming this debounce forever.
      void persistProgressRef.current(false, visibleProgressPageIndex, {
        silent: true,
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [silentProgressPersistenceKey, visibleProgressPageIndex]);

  useEffect(() => {
    if (pagesState.status !== "ready") return;
    if (!readerRestoreComplete) return;
    if (
      pageCount === 1 &&
      !shouldCompleteSingleImageReaderPage({
        hasImage: Boolean(displayedPages[0]?.imageUri),
        naturalSizeKnown:
          !displayedPages[0]?.imageUri ||
          Boolean(
            displayedPages[0] &&
            readerImageSizes.has(readerPageIdentityFor(displayedPages[0])),
          ),
        longStripPresentation:
          isLongStripLogicalPage || Boolean(currentSegmentedImage),
        reachedLogicalEnd: segmentedLogicalEndReached,
      })
    ) {
      return;
    }
    if (
      !shouldAutoCompleteMobileReaderChapter({
        displayIndex: visibleProgressPageIndex,
        pageCount,
        mode,
        completed,
        arrival: pageArrival,
      })
    ) {
      return;
    }
    void persistProgress(true, visibleProgressPageIndex, { silent: true });
  }, [
    completed,
    displayedPages,
    mode,
    pageArrival,
    pageCount,
    pagesState.status,
    persistProgress,
    readerRestoreComplete,
    readerImageSizes,
    readerPageIdentityFor,
    currentSegmentedImage,
    isLongStripLogicalPage,
    segmentedLogicalEndReached,
    useLongStripPresentation,
    visibleProgressPageIndex,
  ]);

  // The end-of-chapter prompt is about the final page; leaving it closes it.
  useEffect(() => {
    if (pageCount <= 0) return;
    if (
      readerSourceIndexForDisplayIndex(clampedPageIndex, pageCount, mode) >=
      pageCount - 1
    ) {
      return;
    }
    setEndOfChapterPromptVisible(false);
    setEndOfChapterProgressSaved(false);
    setEndOfChapterProgressError(null);
  }, [clampedPageIndex, mode, pageCount]);

  // A black reader with hidden chrome and a swallowed back gesture is a
  // dismiss trap. Any unreadable state brings the chrome back.
  useEffect(() => {
    if (pagesState.status !== "error" && pagesState.status !== "blocked") {
      return;
    }
    setShowControls(true);
  }, [pagesState.status]);

  // Opening a chapter shows the chrome, then gets out of the way. Readers who
  // asked for reduced motion keep it until they dismiss it themselves.
  useEffect(() => {
    if (!readerRestoreComplete) return;
    if (pagesState.status !== "ready" || pageCount <= 0) return;
    if (!showControls) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        timeout = setTimeout(() => {
          timeout = null;
          setShowControls(false);
        }, READER_CHROME_AUTO_HIDE_MS);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
    // Deliberately keyed on the chapter rather than on `showControls`: this is
    // the "just opened a chapter" auto-hide, not a general inactivity timer,
    // so re-showing the chrome by hand must not re-arm it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, pageCount, pagesState.status, readerRestoreComplete]);

  const onReaderMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const programmaticTarget = readerProgrammaticScrollRef.current;
    if (galleryPagedMode) {
      const frameCount = isTwoPageMode ? readerSpreads.length : pageCount;
      const visualFrameIndex = readerDisplayIndexFromOffset(
        event.nativeEvent.contentOffset.x,
        readerPageWidth,
        frameCount,
      );
      const nextFrameIndex = readerLogicalFrameIndexForVisualFrame(
        visualFrameIndex,
        frameCount,
        mode,
      );
      const nextPageIndex = isTwoPageMode
        ? firstPageIndexForMobileReaderSpread(readerSpreads, nextFrameIndex)
        : nextFrameIndex;
      if (programmaticTarget == null && nextPageIndex !== clampedPageIndex) {
        void hapticSelection();
      }
      if (programmaticTarget == null) {
        setPageArrival(
          readerPageArrivalForStep(
            clampedPageIndex,
            nextPageIndex,
            pageCount,
            mode,
          ),
        );
      }
      setCurrentPageIndex(nextPageIndex);
      syncRoutePage(nextPageIndex);
      if (programmaticTarget != null && nextPageIndex === programmaticTarget) {
        readerProgrammaticScrollRef.current = null;
      }
      return;
    }

    const nextPageIndex = clampReaderPageIndex(
      scrollingVisiblePageIndexRef.current,
      pageCount,
    );
    if (nextPageIndex === clampedPageIndex) {
      if (programmaticTarget != null && nextPageIndex === programmaticTarget) {
        readerProgrammaticScrollRef.current = null;
      }
      return;
    }
    if (programmaticTarget == null) {
      void hapticSelection();
      setPageArrival(
        readerPageArrivalForStep(
          clampedPageIndex,
          nextPageIndex,
          pageCount,
          mode,
        ),
      );
    }
    setCurrentPageIndex(nextPageIndex);
    syncRoutePage(nextPageIndex);
    if (programmaticTarget != null && nextPageIndex === programmaticTarget) {
      readerProgrammaticScrollRef.current = null;
    }
  };

  const onReaderScroll = (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
    void _event;
    // Scrolling mode is driven by FlatList viewability. Item onLayout offsets
    // are relative to virtualized cells and cannot identify the visible page.
  };

  const getReaderImageFrameSize = useCallback(
    (page: MobileReaderPage): MobileImageSize => {
      return getMobileReaderImageFrameSize({
        imageWidth: readerImageWidth,
        naturalSize: readerImageSizes.get(readerPageIdentityFor(page)),
        clampHeightToPagedViewport: galleryPagedMode,
        maximumPagedHeight: readerMaxPagedImageHeight,
      });
    },
    [
      galleryPagedMode,
      readerImageSizes,
      readerImageWidth,
      readerMaxPagedImageHeight,
      readerPageIdentityFor,
    ],
  );
  const japaneseLearningOverlayDetections =
    japaneseLearningOcrState.status === "ready" &&
    japaneseLearningOcrState.result.source === "ocr"
      ? sortedMobileOcrLines(japaneseLearningOcrState.result)
      : [];
  const activeJapaneseLearningTranscriptOrder =
    japaneseLearningTtsState.status === "playing" &&
    japaneseLearningTtsState.source === "transcript"
      ? findMobileTranscriptPlaybackLineOrder(
          japaneseLearningOverlayDetections,
          japaneseLearningTtsState.currentTime ?? 0,
          japaneseLearningTtsState.duration ?? 0,
        )
      : null;
  const measureReaderFirstContent = (page: MobileReaderPage) => {
    const performanceRequest = readerFirstPageRequestRef.current;
    const performanceKey = `${registryId}:${sourceId}:${mangaId}:${chapterId}`;
    if (
      page.id !== currentDisplayedPageKey ||
      performanceRequest?.key !== performanceKey ||
      performanceRequest.measured
    ) {
      return;
    }
    performanceRequest.measured = true;
    measureMobilePerformance(
      MOBILE_PERFORMANCE_MARKS.readerFirstPage,
      performanceRequest.startedAt,
      {
        registryId,
        sourceId,
        chapterId,
        pageIndex: clampedPageIndex,
        processed: page.imageProcessing === "ready",
      },
    );
  };
  const renderReaderImage = (page: MobileReaderPage) => {
    const pageIdentity = readerPageIdentityFor(page);
    const renderPolicy = getMobileReaderPageRenderPolicy({
      currentPageIndex: clampedPageIndex,
      displayIndex: readerDisplayIndexByPageId.get(page.id),
      hasImageUri: Boolean(page.imageUri),
      processingPending: page.imageProcessing === "pending",
    });
    if (renderPolicy === "none" || !page.imageUri) return null;
    const imageUri = page.imageUri;

    const readerImageFrameSize = getReaderImageFrameSize(page);
    // The gallery mounts every page in a plain ScrollView; apply the far-page
    // placeholder before the pending spinner so long chapters do not mount an
    // ActivityIndicator for every page awaiting lazy source processing.
    if (renderPolicy === "far-placeholder") {
      return (
        <View
          style={{
            width: readerImageFrameSize.width,
            height: readerImageFrameSize.height,
          }}
        />
      );
    }
    if (renderPolicy === "processing-placeholder") {
      return (
        <View
          style={[
            styles.readerImageProcessingPlaceholder,
            {
              width: readerImageFrameSize.width,
              height: readerImageFrameSize.height,
              backgroundColor: readerBackgroundColor,
            },
          ]}
        >
          <ActivityIndicator color="#f8fafc" size="small" />
        </View>
      );
    }
    const imageError = readerImageErrors.get(pageIdentity);
    const imageLoading = isMobileReaderImageLoading({
      error: imageError,
      hasNaturalSize: readerImageSizes.has(pageIdentity),
    });
    const retryNonce = readerImageRetryNonces.get(pageIdentity) ?? 0;
    const segmentedCacheKey = readerSegmentedCacheKeyFor(page);
    return (
      <ZoomableReaderImageFrame
        // Remounting on retry is what re-issues the image request.
        key={`${pageIdentity}:${retryNonce}`}
        frameSize={readerImageFrameSize}
        pageId={page.id}
      >
        <MobileReaderPageFrame
          allowLongStripSegments={pageCount === 1}
          backgroundColor={readerBackgroundColor}
          cacheKey={pageCount === 1 ? segmentedCacheKey : undefined}
          frameSize={readerImageFrameSize}
          headers={page.headers}
          imageUri={imageUri}
          imageUriOwnership={page.imageUriOwnership ?? "source"}
          loading={imageLoading}
          error={imageError}
          strings={strings}
          onImageLoadStart={() => {
            clearReaderImageError(pageIdentity);
          }}
          onImageLoad={({ width, height }) => {
            clearReaderImageError(pageIdentity);
            setReaderImageNaturalSize(pageIdentity, { width, height });
            measureReaderFirstContent(page);
          }}
          onImageError={(error) => {
            setReaderImageLoadError(pageIdentity, error);
          }}
          onSegmentedImage={(asset) => {
            if (!asset) {
              setReaderSegmentedImages((current) => {
                if (!current.has(pageIdentity)) return current;
                const next = new Map(current);
                next.delete(pageIdentity);
                return next;
              });
              return;
            }
            clearReaderImageError(pageIdentity);
            setReaderSegmentedImages((current) => {
              if (current.get(pageIdentity)?.generation === asset.generation) {
                return current;
              }
              const next = new Map(current);
              next.set(pageIdentity, asset);
              return next;
            });
            // Aggregate metadata is the logical page size. Individual tile
            // load callbacks below never write into this page-scoped map.
            setReaderImageNaturalSize(pageIdentity, {
              width: asset.width,
              height: asset.height,
            });
          }}
          onRetry={() => {
            retryReaderImage(pageIdentity);
          }}
        >
          {page.id === currentDisplayedPageKey ? (
            <JapaneseLearningDetectionOverlay
              detections={japaneseLearningOverlayDetections}
              frameSize={readerImageFrameSize}
              imageSize={readerImageSizes.get(pageIdentity) ?? null}
              activeOrder={activeJapaneseLearningTranscriptOrder}
              selectedOrder={japaneseLearningSelectedDetectionOrder}
              strings={strings}
              onSelectDetection={selectJapaneseLearningDetection}
            />
          ) : null}
          {pageCount !== 1 || readerImageSizes.has(pageIdentity) ? (
            <MobileDualReaderOverlay
              isGlobal={page.id === currentDisplayedPageKey}
              readingMode={mode}
              frameSize={readerImageFrameSize}
              primaryNaturalSize={readerImageSizes.get(pageIdentity) ?? null}
              chapterId={chapter?.id ?? null}
              localIndex={page.index}
              strings={strings}
            />
          ) : null}
        </MobileReaderPageFrame>
      </ZoomableReaderImageFrame>
    );
  };

  const renderReaderImageSegment = (frame: MobileReaderSegmentFrame) => {
    const page = currentDisplayedPage;
    const asset = currentSegmentedImage;
    if (!page || !asset) return null;
    const segmentKey = `${asset.generation}:${frame.index}`;
    const pageIdentity = readerPageIdentityFor(page);
    const errorKey = `${pageIdentity}:segment:${frame.index}`;
    const cacheKey = readerSegmentedCacheKeyFor(page);
    return (
      <MobileReaderPageFrame
        backgroundColor={readerBackgroundColor}
        frameSize={{ width: frame.width, height: frame.height }}
        imageUri={frame.segment.uri}
        imageUriOwnership="app"
        imageResizeMode="stretch"
        loading={!loadedReaderSegments.has(segmentKey)}
        error={readerImageErrors.get(errorKey)}
        strings={strings}
        onImageLoadStart={() => clearReaderImageError(errorKey)}
        onImageLoad={() => {
          clearReaderImageError(errorKey);
          setLoadedReaderSegments((current) => {
            if (current.has(segmentKey)) return current;
            const next = new Set(current);
            next.add(segmentKey);
            return next;
          });
          measureReaderFirstContent(page);
          // Deliberately do not write this tile's dimensions into
          // readerImageSizes[page.id]; that map owns aggregate page metadata.
        }}
        onImageError={(error) => setReaderImageLoadError(errorKey, error)}
        onRetry={() => {
          void invalidateCachedMobileImage(
            { uri: page.imageUri, headers: page.headers },
            cacheKey,
          )
            .catch(() => undefined)
            .finally(() => {
              setReaderSegmentedImages((current) => {
                const next = new Map(current);
                next.delete(pageIdentity);
                return next;
              });
              clearReaderImageError(errorKey);
              retryReaderImage(pageIdentity);
            });
        }}
      />
    );
  };

  const stageActionLabel = showControls
    ? strings.reader.hideControls
    : strings.reader.showControls;
  const canOpenReaderPluginSettingsAction =
    canOpenMobileReaderPluginSettingsAction({
      settingsOpen: readerPluginSettingsOpen,
      activePluginId: activeReaderPluginId,
      disabled: false,
    });

  return (
    <View style={[styles.root, { backgroundColor: readerBackgroundColor }]}>
      <ReaderStatusBar
        hidden={!showControls}
        animated
        hideTransitionAnimation="fade"
        style={readerStatusBarStyle}
      />
      <MobileReaderGallery
        accessibilityHidden={endOfChapterPromptVisible}
        accessibilityLabel={formatReaderStageAccessibilityLabel(
          clampedPageIndex,
          pageCount,
          mode,
          stageActionLabel,
          strings,
        )}
        backgroundColor={readerBackgroundColor}
        bottomPadding={
          galleryPagedMode ? readerBottomPadding : readerScrollBottomInset
        }
        chapter={chapter}
        chromeTopPadding={
          galleryPagedMode ? readerChromeTopPadding : readerScrollTopInset
        }
        completed={completed}
        displayedPages={displayedPages}
        initialContentOffset={readerInitialContentOffset}
        scrollMountKey={readerScrollMountKey}
        isTwoPageMode={isTwoPageMode}
        loading={loading}
        longStripPresentationMode={isLongStripLogicalPage}
        longStripContentIdentity={
          isLongStripLogicalPage || currentSegmentedImage
            ? currentDisplayedPageIdentity
            : undefined
        }
        initialLongStripScrollProgress={initialLongStripScrollProgress}
        mode={mode}
        onMomentumScrollEnd={onReaderMomentumEnd}
        onScroll={onReaderScroll}
        onScrollingPageLayout={onScrollingPageLayout}
        onScrollingSeekFailed={onScrollingSeekFailed}
        onScrollingVisiblePageChange={onScrollingVisiblePageChange}
        onRetry={() => {
          setPagesRefreshNonce((value) => value + 1);
        }}
        onPageStep={stepReaderPage}
        onRequestAdvancePastEnd={showEndOfChapterPrompt}
        onSegmentedLogicalEndReached={() => {
          if (currentLogicalEndIdentity) {
            setSegmentedLogicalEndReachedIdentity(currentLogicalEndIdentity);
          }
        }}
        onLongStripScrollProgressChange={persistLongStripScrollProgress}
        onOpenSourceSettings={() => {
          router.push({
            pathname: "/(tabs)/settings/[section]",
            params: { section: "sources" },
          });
        }}
        onToggleControls={() => {
          setShowControls((value) => !value);
        }}
        pagedMode={galleryPagedMode}
        pageTurnAccessibilityEnabled={
          pagedMode || isLongStripLogicalPage || Boolean(currentSegmentedImage)
        }
        pages={pages}
        pagesState={pagesState}
        readerImageWidth={readerImageWidth}
        readerPageWidth={readerPageWidth}
        readerScrollRef={readerScrollRef}
        renderImage={renderReaderImage}
        renderImageSegment={renderReaderImageSegment}
        segmentedImageFrames={segmentedImageFrames}
        sourcePageForDisplayIndex={sourcePageForDisplayIndex}
        spreads={readerSpreads}
        stateTopPadding={readerStateTopPadding}
        strings={strings}
        title={title}
        windowHeight={window.height}
      />

      {!endOfChapterPromptVisible &&
      currentWholeImageToolsAvailable &&
      (!currentSegmentedImage ||
        MOBILE_READER_SEGMENTED_CAPABILITIES.dualReaderOverlay) ? (
        <MobileDualReaderRoot {...dualReaderContext} />
      ) : null}

      {japaneseLearningReaderPlugin && !endOfChapterPromptVisible ? (
        <>
          <JapaneseLearningPluginLauncherSheet
            visible={japaneseLearningLauncherVisible}
            strings={strings}
            pluginName={japaneseLearningReaderPlugin.name}
            pluginIcon={japaneseLearningReaderPlugin.icon}
            enabled={japaneseLearningReaderPlugin.enabled}
            values={{
              autoDetect:
                japaneseLearningReaderPlugin.values.autoDetect === true,
              enableForAllLanguages:
                japaneseLearningReaderPlugin.values.enableForAllLanguages ===
                true,
              minConfidence:
                typeof japaneseLearningReaderPlugin.values.minConfidence ===
                "number"
                  ? japaneseLearningReaderPlugin.values.minConfidence
                  : 0.5,
              nemuResponseMode:
                typeof japaneseLearningReaderPlugin.values.nemuResponseMode ===
                "string"
                  ? japaneseLearningReaderPlugin.values.nemuResponseMode
                  : "app",
            }}
            ocrLoading={japaneseLearningOcrState.status === "loading"}
            ocrUnavailableDetail={
              currentSegmentedImage
                ? strings.reader.pluginJapaneseLearningNoImage
                : undefined
            }
            chatLoading={japaneseLearningChatState.status === "loading"}
            onClose={() => setJapaneseLearningLauncherVisible(false)}
            onDetectText={() => {
              setJapaneseLearningLauncherVisible(false);
              setJapaneseLearningTranscriptVisible(true);
              runJapaneseLearningOcr();
            }}
            onOpenChat={() => {
              setJapaneseLearningLauncherVisible(false);
              setJapaneseLearningChatDrawerVisible(true);
              if (
                japaneseLearningChatState.status !== "loading" &&
                japaneseLearningChatMessages.length === 0
              ) {
                runJapaneseLearningChat();
              }
            }}
            onOpenSettings={() => {
              setJapaneseLearningLauncherVisible(false);
              setReaderPluginSettingsOpen(true);
              setSelectedReaderPluginSettingsId("japanese-learning");
            }}
          />

          <JapaneseLearningOcrResultSheet
            visible={japaneseLearningOcrSheetVisible}
            strings={strings}
            ocrState={{
              status: japaneseLearningOcrState.status,
              detail:
                japaneseLearningOcrState.status === "error"
                  ? japaneseLearningOcrState.detail
                  : undefined,
              result:
                japaneseLearningOcrState.status === "ready"
                  ? japaneseLearningOcrState.result
                  : undefined,
            }}
            grammarState={japaneseLearningGrammarState}
            selectedTokenIndex={selectedJapaneseLearningGrammarTokenIndex}
            grammarActionNotice={japaneseLearningGrammarActionNotice}
            askDisabled={japaneseLearningChatState.status === "loading"}
            canActOnSentence={japaneseLearningOcrState.status !== "loading"}
            sentenceTtsBusy={
              (japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing") &&
              japaneseLearningTtsState.source === "sentence"
            }
            sentenceTtsLoading={
              japaneseLearningTtsState.status === "loading" &&
              japaneseLearningTtsState.source === "sentence"
            }
            onClose={() => setJapaneseLearningOcrSheetVisible(false)}
            onSelectToken={(index) => {
              setJapaneseLearningGrammarActionNotice(null);
              setSelectedJapaneseLearningGrammarTokenIndex(index);
            }}
            onAskSelection={askJapaneseLearningGrammarSelection}
            onCopySelection={copyJapaneseLearningGrammarSelection}
            onPlaySentence={toggleJapaneseLearningTts}
            onAskSentence={askJapaneseLearningSentence}
            onCopySentence={copyJapaneseLearningSentence}
          />

          <JapaneseLearningNemuChatDrawer
            visible={japaneseLearningChatDrawerVisible}
            appLanguage={appLanguage}
            strings={strings}
            chatMessages={japaneseLearningChatMessages}
            chatInput={japaneseLearningChatInput}
            chatLoading={japaneseLearningChatState.status === "loading"}
            chatStreamingMessageId={
              japaneseLearningChatState.status === "loading"
                ? japaneseLearningChatState.streamingMessageId
                : undefined
            }
            showTypingIndicator={
              japaneseLearningChatState.status === "loading" &&
              !(
                japaneseLearningChatState.status === "loading" &&
                japaneseLearningChatState.streamingMessageId
              )
            }
            ttsState={{
              status: japaneseLearningTtsState.status,
              source:
                japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing"
                  ? japaneseLearningTtsState.source
                  : undefined,
              messageId:
                japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing"
                  ? japaneseLearningTtsState.messageId
                  : undefined,
            }}
            onClose={() => setJapaneseLearningChatDrawerVisible(false)}
            onChangeInput={setJapaneseLearningChatInput}
            onSendInput={sendJapaneseLearningChatInput}
            onSendSuggestion={sendJapaneseLearningChatSuggestion}
            onToggleChatTts={toggleJapaneseLearningChatTts}
          />

          <JapaneseLearningTranscriptSheet
            visible={japaneseLearningTranscriptVisible}
            strings={strings}
            ocrResult={
              japaneseLearningOcrState.status === "ready"
                ? japaneseLearningOcrState.result
                : null
            }
            selectedDetectionOrder={japaneseLearningSelectedDetectionOrder}
            ttsState={{
              status: japaneseLearningTtsState.status,
              source:
                japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing"
                  ? japaneseLearningTtsState.source
                  : undefined,
              currentTime:
                japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing"
                  ? japaneseLearningTtsState.currentTime
                  : undefined,
              duration:
                japaneseLearningTtsState.status === "loading" ||
                japaneseLearningTtsState.status === "playing"
                  ? japaneseLearningTtsState.duration
                  : undefined,
              detail:
                japaneseLearningTtsState.status === "error"
                  ? japaneseLearningTtsState.detail
                  : undefined,
            }}
            minConfidence={
              typeof japaneseLearningReaderPlugin.values.minConfidence ===
              "number"
                ? japaneseLearningReaderPlugin.values.minConfidence
                : 0.5
            }
            onClose={() => setJapaneseLearningTranscriptVisible(false)}
            onSelectDetection={selectJapaneseLearningDetection}
            onToggleTts={toggleJapaneseLearningTranscriptTts}
          />
        </>
      ) : null}

      <ReaderPluginSettingsSheet
        visible={readerPluginSettingsOpen && !endOfChapterPromptVisible}
        plugins={readerPlugins.data}
        selectedPluginId={selectedReaderPluginSettingsId}
        loading={readerPlugins.loading}
        error={readerSettingsError}
        loadError={
          showReaderPluginSettingsLoadError ? readerPlugins.error : null
        }
        busy={readerPluginSettingsBusy}
        retryingLoad={retryingReaderPluginSettingsLoad}
        canRetryLoadError={canRetryReaderPluginSettingsLoadError}
        strings={strings}
        onClose={() => setReaderPluginSettingsOpen(false)}
        onDismissError={() => {
          setReaderSettingsError(null);
          if (readerPlugins.error) {
            setDismissedReaderPluginSettingsError(readerPlugins.error);
          }
        }}
        onDismissLoadError={() => {
          if (readerPlugins.error) {
            setDismissedReaderPluginSettingsError(readerPlugins.error);
          }
        }}
        onRetryLoad={retryReaderPluginSettingsLoad}
        onSelectPlugin={selectReaderPluginSettings}
        onClearSelectedPlugin={() => setSelectedReaderPluginSettingsId(null)}
        onTogglePlugin={toggleReaderPluginSetting}
        onResetPlugin={resetReaderPluginSettings}
        onChangePluginValue={changeReaderPluginSetting}
      />

      <ReaderDisplaySettingsPopover
        visible={readerDisplaySettingsOpen && !endOfChapterPromptVisible}
        mode={mode}
        activeScrollWidthPct={activeScrollWidthPct}
        isTwoPageMode={isTwoPageMode}
        twoPageSupported={twoPageSupported}
        showPagePairingControls={showPagePairingControls}
        pagePairingMode={pagePairingMode}
        processPageImages={processPageImages}
        busy={readerSettingsActionBusy}
        saving={saving}
        hasReaderPlugins={readerPlugins.data.length > 0}
        canOpenReaderPluginSettings={canOpenReaderPluginSettingsAction}
        strings={strings}
        onClose={() => setReaderDisplaySettingsOpen(false)}
        onSetMode={(nextMode) => {
          if (nextMode === mode || readerSettingsActionBusy) return;
          void runReaderSettingsAction("reading-mode", () => setMode(nextMode));
        }}
        onToggleTwoPageMode={() => {
          if (readerSettingsActionBusy) return;
          void runReaderSettingsAction("two-page-mode", () =>
            setTwoPageMode(!twoPageMode),
          );
        }}
        onTogglePagePairingMode={() => {
          if (readerSettingsActionBusy) return;
          void runReaderSettingsAction("page-pairing-mode", () =>
            setPagePairingMode(pagePairingMode === "book" ? "manga" : "book"),
          );
        }}
        onToggleProcessPageImages={() => {
          if (readerSettingsActionBusy) return;
          void runReaderSettingsAction("page-image-processing", () =>
            setProcessPageImages(!processPageImages),
          );
        }}
        onPreviewScrollWidth={setScrollWidthDraft}
        onCommitScrollWidth={(nextValue) => {
          void commitScrollWidth(nextValue);
        }}
        onOpenReaderPluginSettings={() => {
          if (!canOpenReaderPluginSettingsAction) return;
          setReaderDisplaySettingsOpen(false);
          setActiveReaderPluginId(null);
          setReaderPluginSettingsOpen(true);
        }}
        onMarkComplete={() => {
          void persistProgress(true);
        }}
      />

      {showReaderChrome && !endOfChapterPromptVisible ? (
        <View pointerEvents="box-none" style={styles.readerChromeLayer}>
          <Animated.View
            entering={readerTopBarEntering}
            exiting={readerTopBarExiting}
            pointerEvents="box-none"
            style={[styles.topBar, { paddingTop: insets.top + 16 }]}
          >
            <ReaderChromePanel
              panelStyle={readerChromePanelStyle}
              style={styles.readerChromePanelShell}
            >
              <View style={styles.readerTopPanel}>
                <NemuPressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.common.back}
                  onPress={() => {
                    navigateBack();
                  }}
                  style={[
                    styles.readerChromeIconButton,
                    { backgroundColor: "transparent" },
                  ]}
                >
                  <Ionicons
                    name="chevron-back-outline"
                    size={22}
                    color={readerChromeColors.secondaryText}
                  />
                </NemuPressable>
                <View style={styles.readerTopTitleBlock}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.topTitleText,
                      { color: readerChromeColors.primaryText },
                    ]}
                  >
                    {title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.topSubtitleText,
                      { color: readerChromeColors.secondaryText },
                    ]}
                  >
                    {chapterTitle}
                  </Text>
                </View>
                {pageCount ? (
                  <Text
                    style={[
                      styles.readerTopPageCount,
                      { color: readerChromeColors.secondaryText },
                    ]}
                  >
                    {sourcePageNumber} / {Math.max(1, pageCount)}
                  </Text>
                ) : (
                  <View style={styles.readerTopPageCountPlaceholder} />
                )}
              </View>
            </ReaderChromePanel>
          </Animated.View>

          {showReaderBottomChrome ? (
            <Animated.View
              entering={readerBottomBarEntering}
              exiting={readerBottomBarExiting}
              pointerEvents="box-none"
              style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
            >
              <ReaderChromePanel
                panelStyle={readerChromePanelStyle}
                style={styles.readerChromePanelShell}
              >
                <View style={styles.readerBottomPanel}>
                  {readerSettingsError ? (
                    <MobileInlineErrorBanner
                      title={strings.settings.settingsActionFailed}
                      detail={readerSettingsError}
                      dismissLabel={strings.common.clear}
                      onDismiss={() => setReaderSettingsError(null)}
                      variant="embedded"
                    />
                  ) : null}

                  <View style={styles.readerBottomChromeRow}>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        leftChapter
                          ? formatChapterAccessibilityLabel(
                              mode === "rtl" ? "next" : "previous",
                              leftChapter,
                              strings,
                            )
                          : mode === "rtl"
                            ? strings.reader.noNextChapter
                            : strings.reader.noPreviousChapter
                      }
                      accessibilityState={{ disabled: !leftChapter }}
                      disabled={!leftChapter}
                      onPress={() => {
                        if (!leftChapter) return;
                        goToChapter(leftChapter, {
                          startAt: mode === "rtl" ? "start" : "end",
                        });
                      }}
                      pressedScale={0.98}
                      style={[
                        styles.readerChromeIconButton,
                        { backgroundColor: "transparent" },
                      ]}
                    >
                      <Ionicons
                        name="play-skip-back-outline"
                        size={17}
                        color={
                          leftChapter
                            ? readerChromeColors.secondaryText
                            : readerChromeColors.disabled
                        }
                      />
                    </NemuPressable>

                    <View style={styles.readerChromeScrubber}>
                      <MobileReaderScrubber
                        pageIndex={clampedPageIndex}
                        pageCount={pageCount}
                        mode={mode}
                        strings={strings}
                        onChange={goToPage}
                      />
                    </View>

                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        rightChapter
                          ? formatChapterAccessibilityLabel(
                              mode === "rtl" ? "previous" : "next",
                              rightChapter,
                              strings,
                            )
                          : mode === "rtl"
                            ? strings.reader.noPreviousChapter
                            : strings.reader.noNextChapter
                      }
                      accessibilityState={{ disabled: !rightChapter }}
                      disabled={!rightChapter}
                      onPress={() => {
                        if (!rightChapter) return;
                        goToChapter(rightChapter, {
                          startAt: mode === "rtl" ? "end" : "start",
                        });
                      }}
                      pressedScale={0.98}
                      style={[
                        styles.readerChromeIconButton,
                        { backgroundColor: "transparent" },
                      ]}
                    >
                      <Ionicons
                        name="play-skip-forward-outline"
                        size={17}
                        color={
                          rightChapter
                            ? readerChromeColors.secondaryText
                            : readerChromeColors.disabled
                        }
                      />
                    </NemuPressable>

                    {enabledReaderPlugins.map((plugin) => {
                      if (plugin.id === "japanese-learning") {
                        const selected = activeReaderPluginId === plugin.id;
                        const ocrLoading =
                          japaneseLearningOcrState.status === "loading";
                        const chatLoading =
                          japaneseLearningChatState.status === "loading";

                        return (
                          <View
                            key={plugin.id}
                            style={styles.readerPluginActionGroup}
                          >
                            <NemuPressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                strings.reader.pluginJapaneseLearningDetectText
                              }
                              accessibilityState={{
                                selected,
                                disabled: Boolean(currentSegmentedImage),
                              }}
                              disabled={Boolean(currentSegmentedImage)}
                              onPress={openJapaneseLearningDetectionTool}
                              pressedScale={0.98}
                              style={[
                                styles.readerChromeIconButton,
                                {
                                  backgroundColor:
                                    selected &&
                                    japaneseLearningOcrState.status !== "idle"
                                      ? readerChromeColors.hover
                                      : "transparent",
                                },
                              ]}
                            >
                              {ocrLoading ? (
                                <ActivityIndicator
                                  size="small"
                                  color={readerChromeColors.secondaryText}
                                />
                              ) : (
                                <Ionicons
                                  name="scan-outline"
                                  size={18}
                                  color={
                                    selected &&
                                    japaneseLearningOcrState.status !== "idle"
                                      ? readerChromeColors.primaryText
                                      : readerChromeColors.secondaryText
                                  }
                                />
                              )}
                            </NemuPressable>
                            <NemuPressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                strings.reader.pluginJapaneseLearningNemuChat
                              }
                              accessibilityState={{ selected }}
                              onPress={openJapaneseLearningChatTool}
                              pressedScale={0.98}
                              style={[
                                styles.readerChromeIconButton,
                                {
                                  backgroundColor:
                                    selected &&
                                    (japaneseLearningChatMessages.length > 0 ||
                                      japaneseLearningChatState.status !==
                                        "idle")
                                      ? readerChromeColors.hover
                                      : "transparent",
                                },
                              ]}
                            >
                              {chatLoading ? (
                                <ActivityIndicator
                                  size="small"
                                  color={readerChromeColors.secondaryText}
                                />
                              ) : (
                                <Ionicons
                                  name="chatbubbles-outline"
                                  size={18}
                                  color={
                                    selected &&
                                    (japaneseLearningChatMessages.length > 0 ||
                                      japaneseLearningChatState.status !==
                                        "idle")
                                      ? readerChromeColors.primaryText
                                      : readerChromeColors.secondaryText
                                  }
                                />
                              )}
                            </NemuPressable>
                          </View>
                        );
                      }

                      const selected = dualReadEnabled;
                      const canSelect = canSelectMobileReaderPluginOption({
                        selected,
                        disabled: false,
                      });
                      return (
                        <NemuPressable
                          key={plugin.id}
                          accessibilityRole="button"
                          accessibilityLabel={formatMobileString(
                            strings.reader.openPlugin,
                            { name: plugin.name },
                          )}
                          accessibilityState={{ selected }}
                          hapticFeedback={canSelect ? "press" : "none"}
                          onPress={() => {
                            if (canSelect) {
                              openDualReadConfig();
                            }
                          }}
                          pressedScale={0.98}
                          style={[
                            styles.readerChromeIconButton,
                            {
                              backgroundColor: selected
                                ? readerChromeColors.hover
                                : "transparent",
                            },
                          ]}
                        >
                          <Ionicons
                            name={plugin.icon}
                            size={18}
                            color={
                              selected
                                ? readerChromeColors.primaryText
                                : readerChromeColors.secondaryText
                            }
                          />
                        </NemuPressable>
                      );
                    })}

                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.reader.title}
                      accessibilityState={{
                        selected: readerDisplaySettingsOpen,
                      }}
                      onPress={() => {
                        setReaderDisplaySettingsOpen(true);
                      }}
                      pressedScale={0.98}
                      style={[
                        styles.readerChromeIconButton,
                        {
                          backgroundColor: readerDisplaySettingsOpen
                            ? readerChromeColors.hover
                            : "transparent",
                        },
                      ]}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color={
                          readerDisplaySettingsOpen
                            ? readerChromeColors.primaryText
                            : readerChromeColors.secondaryText
                        }
                      />
                    </NemuPressable>
                  </View>
                </View>
              </ReaderChromePanel>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      <MobileNemuAgentSheet
        visible={cloudflareSheet.visible && !endOfChapterPromptVisible}
        status={cloudflareSheet.status}
        url={cloudflareSheet.url}
        onVerify={cloudflareSheet.verify}
        onDismiss={cloudflareSheet.dismiss}
      />
      <MobileReaderEndOfChapterOverlay
        visible={endOfChapterPromptVisible}
        nextChapterLabel={nextChapterLabel}
        strings={strings}
        bottomInset={insets.bottom}
        topInset={insets.top}
        busy={endOfChapterProgressSaving}
        error={endOfChapterProgressError}
        onGoToNextChapter={goToNextChapterFromPrompt}
        onDismiss={() => {
          if (endOfChapterProgressSaving) return;
          setEndOfChapterPromptVisible(false);
          setEndOfChapterProgressSaved(false);
          setEndOfChapterProgressError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  readerImageProcessingPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  japaneseLearningOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "box-none",
  },
  japaneseLearningDetectionBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 3,
  },
  readerChromeLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 0,
    alignItems: "center",
  },
  readerChromePanelShell: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  readerTopPanel: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  readerChromeIconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
  },
  readerTopTitleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  topTitleText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  topSubtitleText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
  },
  readerTopPageCount: {
    minWidth: 54,
    flexShrink: 0,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
  },
  readerTopPageCountPlaceholder: {
    width: 54,
    height: 1,
  },
  bottomBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    alignItems: "center",
  },
  readerBottomPanel: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  readerBottomChromeRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readerChromeScrubber: {
    flex: 1,
    minWidth: 0,
  },
  readerPluginActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pluginSheetShell: {
    overflow: "hidden",
    borderRadius: radius.xl,
  },
  pluginSettingsSheetFrame: {
    position: "absolute",
    right: 10,
    left: 10,
    maxHeight: "86%",
  },
  pluginSettingsSheet: {
    maxHeight: "100%",
    gap: 12,
    padding: 14,
  },
  pluginSettingsScroll: {
    flexGrow: 0,
  },
  pluginSettingsContent: {
    gap: 12,
    paddingBottom: 4,
  },
  pluginSettingsList: {
    gap: 8,
  },
  pluginSettingsRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pluginSettingsMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pluginSettingsActionButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  pluginSettingsDetailHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pluginSettingsBackButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  pluginSettingsIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pluginSettingsCopy: {
    flex: 1,
    minWidth: 0,
  },
  pluginSettingsTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  pluginSettingsDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: nemuFontWeight.bold,
  },
  pluginSettingsMeta: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
  },
  pluginSettingsEmpty: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pluginSettingsEmptyText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  pluginHandle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    borderRadius: radius.sm,
    backgroundColor: "rgba(128,128,128,0.35)",
  },
  pluginSheetHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pluginSheetIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  pluginSheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  pluginSheetTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.semibold,
  },
  pluginSheetSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
  },
  pluginCloseButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
});
