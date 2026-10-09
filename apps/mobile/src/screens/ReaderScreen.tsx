import { runMobileJapaneseLearningSpreadOcr } from "@/lib/mobileJapaneseLearningSpreadOcr";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { ExploreChapterFinishedToast } from "@/components/explore/ExploreChapterFinishedToast";
import { markMobileChapterFinished } from "@/components/explore/mobileChapterFinishedMoment";
import { resolveMobileReaderRestorePosition } from "@/lib/mobileReaderRestore";
import { shouldDismissMobileReaderSurfacesOnFocusChange } from "@/lib/mobileReaderFocus";
import { mobileReaderOcrPageReadiness } from "@/lib/mobileReaderOcrReadiness";
import { GlassContainer, VerticalBarBehavior, WindowLayoutObserver } from "../../modules/nemu-window-layout";
import { MOBILE_READER_QA_CHROME, MOBILE_READER_QA_NOTEBOOK, MOBILE_READER_QA_PANEL, MOBILE_READER_QA_PLUGIN } from "@/lib/mobileReaderQa";
import { mobileWindowAbsoluteBand, type MobileWindowLayout, type WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  mobileReaderAbsoluteRect,
  mobileReaderFrameInsets,
  mobileReaderAnticipatedWindowLayout,
  mobileReaderCapsuleActionSlots,
  mobileReaderHingeHintKey,
  mobileReaderNextSideInsetLatch,
  mobileReaderPoseLayout,
  mobileReaderSideInsetLatchKey,
  MOBILE_READER_HINGE_HINT_TIMEOUT_MS,
  type MobileReaderSideInsetLatch,
  mobileReaderVerticalBarPolicy,
  READER_CAPSULE_TITLE_FULL_MIN_WIDTH,
  READER_TOP_SCRIM_FEATHER,
} from "@/lib/mobileReaderPoseLayout";
import type { ViewInstance } from "react-native";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LayoutAnimationConfig,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  DuoBilingualLayoutToggle,
  DuoBilingualSpread,
  DuoDisplayHandoffToast,
  DuoPageFlipOverlay,
  useDuoPageFlip,
} from "@/components/duo";
import {
  isMobileDuoDualReaderConfigured,
  mobileDuoBilingualFromReaderPose,
  mobileDuoBilingualStageOverrides,
  resolveMobileDuoBilingualMode,
  useMobileDuoBilingualChoice,
} from "@/lib/mobileDuoBilingual";
import { mobileDuoPageFlipPlan } from "@/lib/mobileDuoSpine";
import {
  armMobileReaderConsoleFoldBack,
  MOBILE_READER_STAGE_MOTION_WINDOW_MS,
  mobileReaderCapsuleLayoutTransition,
  mobileReaderChromeArrangementEntering,
  mobileReaderConsoleExiting,
  mobileReaderStageLayoutTransition,
} from "@/lib/mobileReaderMotionAnimations";
import {
  MOBILE_READER_CONSOLE_UNFOLD_MS,
  MOBILE_READER_REDUCE_MOTION_FADE_MS,
  mobileReaderChromeArrangementKey,
  mobileReaderChromeArrangementMotion,
  mobileReaderChromeGeometryKey,
  mobileReaderChromeGlide,
  mobileReaderPoseVeilCaps,
  mobileReaderStageHorizontalInsets,
  mobileReaderStageMotion,
  type MobileReaderChromeArrangement,
  type MobileReaderChromeArrangementMotion,
  type MobileReaderStageMotion,
  type MobileReaderStageSnapshot,
} from "@/lib/mobileReaderStageMotion";
import { mobileDualReaderFabArea } from "@/lib/mobileDualReaderFabLayout";
import {
  MOBILE_READER_PAGE_FLIP_DECODE_WAIT_MS,
  mobileReaderFlatSpreadFlipPanes,
  mobileReaderPageFlipDecision,
  mobileReaderPrefetchPagesBehind,
} from "@/lib/mobileReaderPageFlip";
import {
  mobileReaderNotebookReveal,
  mobileReaderPageRevealed,
  resolveMobileReaderNotebookPane,
  type MobileReaderNotebookPaneOverride,
} from "@/lib/mobileReaderNotebookPane";
import { mobileReaderLearningPageResetKey } from "@/lib/mobileReaderLearningSession";
import { buildMobileReaderMoreMenu, type MobileReaderMoreMenuActionId } from "@/lib/mobileReaderMoreMenu";
import {
  useMobilePoseVeilAppearance,
  type MobilePoseVeilAppearance,
} from "@/lib/MobilePoseTransitionContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import {
  MobileReaderContinuousScrubber,
  type MobileReaderContinuousScrubberHandle,
} from "@/components/MobileReaderContinuousScrubber";
import { MobileReaderScrubber } from "@/components/MobileReaderScrubber";
import {
  MobileReaderScrubberPreview,
  type MobileReaderScrubberPreviewHandle,
} from "@/components/reader/MobileReaderScrubberPreview";
import { ReaderChromeLoadingTrack } from "@/components/reader/ReaderChromeLoadingTrack";
import {
  READER_CAPSULE_COLORS,
  READER_CAPSULE_TOKEN_OVERRIDES,
  ReaderCapsule,
} from "@/components/reader/ReaderCapsule";
import { ReaderDarkThemeScope } from "@/components/reader/ReaderDarkThemeScope";
import { ReaderMoreMenu } from "@/components/reader/ReaderMoreMenu";
import { useReaderScrubPreviewThumbnails } from "@/components/reader/useReaderScrubPreviewThumbnails";
import { ReaderPluginSettingsSheet } from "@/components/reader/ReaderPluginSettingsSheet";
import {
  ReaderSettingsNativePopover,
  readerSettingsNativePopoverAvailable,
} from "@/components/reader/ReaderSettingsNativePopover";
import { readerSettingsPopoverAvailableHeight } from "@/lib/readerSettingsNativePopoverLayout";
import { mobileAdaptiveLayout } from "@/lib/mobileAdaptiveLayout";
import { ReaderDisplaySettingsPopover } from "@/components/reader/ReaderDisplaySettingsPopover";
import { ReaderNotebookPane } from "@/components/reader/ReaderNotebookPane";
import { LinearGradient } from "expo-linear-gradient";
import {
  MobileReaderGallery,
  type MobileReaderScrollHandle,
} from "@/components/reader/MobileReaderGallery";
import { MobileReaderPageFrame } from "@/components/reader/MobileReaderPageFrame";
import { readerCentreTapBand, readerChromeDismissSweep } from "@/components/reader/readerTapZones";
import { MobileReaderEndOfChapterOverlay } from "@/components/reader/MobileReaderEndOfChapterOverlay";
import { MobileReaderConnectivityNotice } from "@/components/reader/MobileReaderConnectivityNotice";
import {
  useReaderDisplayEnvironment,
  useReaderDisplayPrefs,
} from "@/components/reader/useReaderDisplayEnvironment";
import { JapaneseLearningPluginLauncherSheet } from "@/components/reader/japaneseLearning/JapaneseLearningPluginLauncherSheet";
import { JapaneseLearningOcrResultSheet } from "@/components/reader/japaneseLearning/JapaneseLearningOcrResultSheet";
import { JapaneseLearningBubblePopout } from "@/components/reader/japaneseLearning/JapaneseLearningBubblePreview";
import { JapaneseLearningSheetBackdrop } from "@/components/reader/japaneseLearning/JapaneseLearningSheetBackdrop";
import {
  isJapaneseLearningBubblePopoutPresented,
  japaneseLearningBubblePopoutProgress,
} from "@/lib/mobileJapaneseLearningSheetBackdrop";
import {
  JAPANESE_LEARNING_SHEET_GONE,
  japaneseLearningSheetProgressSample,
  requestJapaneseLearningSheet,
  resolveJapaneseLearningChatDismissal,
  resolveJapaneseLearningSentenceSheetDismissal,
} from "@/lib/mobileJapaneseLearningSheetPresence";
import {
  MOBILE_JAPANESE_LEARNING_QA_ANALYZING_HOLD_MS,
  MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE,
  getMobileJapaneseLearningQaScenario,
  pickMobileJapaneseLearningQaDetection,
} from "@/lib/mobileJapaneseLearningQa";
import { JapaneseLearningNemuChatDrawer } from "@/components/reader/japaneseLearning/JapaneseLearningNemuChatDrawer";
import { JapaneseLearningTranscriptSheet } from "@/components/reader/japaneseLearning/JapaneseLearningTranscriptSheet";
import {
  MobileCachedImage,
  NemuPressable,
  NemuRingSpinner,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
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
import { formatChapterLabel, formatChapterShortLabel, formatChapterTitle } from "@/lib/formatChapter";
import { getMobileReaderHardwareBackAction } from "@/lib/mobileReaderBackBehavior";
import {
  hapticConfirm,
  hapticError,
  hapticPress,
  hapticSelection,
} from "@/lib/haptics";
import {
  useInstalledSources,
  useMobileFeedbackSettings,
  useMobileLanguageSettings,
  useMobileReaderPlugins,
  useReadingMode,
} from "@/data/mobileHooks";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { getMobileReaderChapterNavigation } from "@/lib/mobileReaderChapters";
import { findMobileReaderLibrarySource } from "@/lib/mobileReaderLibrary";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  getMobileSourceErrorPresentation,
  sanitizeMobileErrorDiagnostic,
} from "@/lib/mobileSourceErrors";
import { useNemuAgentSheet } from "@/lib/useNemuAgentSheet";
import type { NemuAgentSheetContext } from "@/lib/nemuAgentSheetReducer";
import { readMobileCloudflareUserAgent } from "@/sources/mobileAidokuUserAgent";
import {
  canRetryMobileReaderPluginSettingsLoadError,
  canStartMobileReaderSettingsAction,
  clampReaderScrollWidthPct,
  isMobileReaderSettingsActionBusy,
  readerScrollWidthScale,
  shouldShowReaderPagePairingControls,
} from "@/lib/mobileReaderSettings";
import {
  clampMobileReaderPan,
  mobileReaderFitFrame,
  mobileReaderFitRestingOffset,
  mobileReaderPanBound,
  mobileReaderPanClaim,
  readerFitModeForShape,
  readerFitRatio,
  type ReaderFitMode,
} from "@/lib/mobileReaderFit";
import { classifyReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import type { ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import {
  buildMobileReaderDisplaySpreads,
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
  getMobileReaderSpreadImageFrameSize,
  pageIndexForMobileReaderSpreadStep,
  visualPageIndexesForMobileReaderSpread,
} from "@/lib/mobileReaderSpreads";
import {
  clampReaderPageIndex,
  getReaderContinuousScrollMetrics,
  readerContinuousAccessibilityAction,
  readerDisplayIndexForRoutePage,
  readerDisplayIndexForSourceIndex,
  readerDisplayIndexFromOffset,
  type ReaderScrollPageMetric,
  readerProgressDisplayIndexForVisiblePages,
  readerRoutePageForDisplayIndex,
  readerScrollMetricsResetKey,
  readerLogicalFrameIndexForVisualFrame,
  readerScrollOffsetForLogicalFrame,
  readerSourceIndexForDisplayIndex,
  readerSourceStepTargetForDisplayIndex,
  formatReaderSpreadValue,
  readerPageArrivalForStep,
  shouldScheduleReaderChromeAutoHide,
  shouldAutoCompleteMobileReaderChapter,
  shouldUseReaderPhysicalScrollScrubber,
  type MobileReaderPageArrival,
  type ReaderContinuousScrollMetrics,
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
  getMobileReaderSegmentOcrImageSizes,
  getMobileReaderSegmentOcrPageId,
  getMobileReaderSegmentOcrPages,
  getMobileReaderVisibleSegmentIndexes,
  sameMobileReaderSegmentIndexes,
} from "@/lib/mobileReaderSegmentOcr";
import {
  getCachedMobileImageUriSync,
  invalidateCachedMobileImage,
  resolveCachedMobileImageUri,
  retainCachedMobileImageAsset,
  type MobileCachedSegmentedImageAsset,
} from "@/lib/mobileImageCache";
import {
  MOBILE_READER_PREFETCH_PAGES_BEHIND,
  MobileReaderImagePrefetcher,
  planMobileReaderNextChapterPrefetch,
  planMobileReaderPagePrefetch,
  shouldPrefetchMobileReaderNextChapter,
} from "@/lib/mobileReaderPagePrefetch";
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
  MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS,
  MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE,
  clampMobileReaderZoomScale,
  shouldResetMobileReaderZoom,
} from "@/lib/mobileReaderZoom";
import {
  READER_CHROME_LOADING_OPACITY,
  READER_CHROME_PANEL_VERTICAL_PADDING,
  getMobileReaderTitle,
  readerCapsuleTitleLabels,
  isReaderChromeLoading,
  readerChromeIndicatorPageIndex,
  readerChromePageCountLabel,
} from "@/lib/mobileReaderHeader";
import {
  acquireMobileReaderHostGestureLock,
  mobileReaderScreenOptions,
} from "@/lib/mobileReaderRouteOptions";
import { useMobileConnectivity } from "@/lib/useMobileConnectivity";
import { readerChromeAnimationsForMotion } from "@/lib/mobileReaderChromeAnimations";
import {
  READER_CHROME_MATERIAL_CURVE,
  readerChromeHasScrubber,
  readerChromeMaterialTiming,
} from "@/lib/mobileReaderChromeMotion";
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
  mobileJapaneseLearningChatRequestMessages,
  mobileJapaneseLearningMinConfidence,
  mobileJapaneseLearningSentenceText,
  mobileOcrLabelColor,
  mobileOcrLineKey,
  sortedMobileOcrLines,
  type JapaneseLearningChatThreadMessage,
} from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  runMobileJapaneseLearningOcr,
  type MobileOcrDetection,
  type MobileJapaneseLearningOcrOptions,
  type MobileJapaneseLearningOcrResult,
} from "@/lib/mobileJapaneseLearningOcr";
import {
  createMobileJapaneseLearningChatPageTools,
  type MobileJapaneseLearningChatPageSnapshot,
} from "@/lib/mobileJapaneseLearningChatPageTools";
import {
  mobileJapaneseLearningPageOcrKey,
  mobileJapaneseLearningPageOcrStore,
} from "@/lib/mobileJapaneseLearningPageOcrStore";
import {
  getMobileJapaneseLearningExplainPrompt,
  parseMobileJapaneseLearningResponseMode,
  runMobileJapaneseLearningChat,
  type MobileJapaneseLearningChatToolCall,
  type MobileJapaneseLearningChatToolResult,
} from "@/lib/mobileJapaneseLearningChat";
import {
  createMobileJapaneseLearningChatStreamController,
  mobileJapaneseLearningChatContextRetryMessages,
  MOBILE_JAPANESE_LEARNING_CHAT_SIGN_IN_ERROR,
  truncateMobileJapaneseLearningChatOldestHalf,
} from "@/lib/mobileJapaneseLearningChatStream";
import {
  createMobileJapaneseLearningChatSessionStreamStore,
  mobileJapaneseLearningChatSessionFor,
  mobileJapaneseLearningChatSessionKey,
  nextMobileJapaneseLearningChatMessageId,
  retainMobileJapaneseLearningChatSession,
  shouldResetMobileJapaneseLearningChatForPluginToggle,
} from "@/lib/mobileJapaneseLearningChatSession";
import { getExplainDisplayPrompt, getGreetingPrompt, nextSyncTimestamp } from "@nemu/core";
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
  resolveMobileReaderChapterIndex,
  type MobileReaderPage,
  type MobileReaderPageProcessor,
  type MobileReaderPageWindowResult,
} from "@/sources/mobileSourcePages";
import {
  MOBILE_READER_NEXT_CHAPTER_PREFETCH_DELAY_MS,
  disposeMobileReaderPagesPrefetchResult,
  makeMobileReaderPagesPrefetchKey,
  mobileReaderPagesPrefetchCache,
} from "@/sources/mobileReaderPagesPrefetch";
import {
  loadMobileReaderPageListCache,
  saveMobileReaderPageListCache,
} from "@/sources/mobileReaderPageListCache";
import { refreshMobileSourceMetadata } from "@/sources/mobileSourceDetails";
import {
  getCachedMobileSourceDetail,
  makeMobileSourceDetailCacheKey,
} from "@/lib/mobileSourceDetailCache";
import { loadMobileReaderMangaTitle } from "@/lib/mobileReaderMangaTitle";
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
import {
  getMobileReaderLockedChapterState,
  isMobileReaderLockedChapterFailure,
} from "@/lib/mobileReaderLockedChapter";
import {
  getMobileJapaneseLearningAuthCookie,
  isMobileJapaneseLearningSignInRequiredError,
} from "@/lib/mobileJapaneseLearningAuth";
import {
  MOBILE_READER_CHROME_GLYPHS,
  mobileReaderPluginGlyph,
} from "@/lib/mobileReaderBarIcons";
import {
  preloadReaderBarIconImages,
  useReaderBarIconImages,
} from "@/components/reader/useReaderBarIconImages";

// Render the vertical-bar glyphs as soon as the reader module loads, so the
// bar never waits on them (or shows its text fallback).
if (Platform.OS === "ios") {
  preloadReaderBarIconImages([
    ...Object.values(MOBILE_READER_CHROME_GLYPHS),
    mobileReaderPluginGlyph("copy-outline"),
  ]);
}

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
      /** The source refused the chapter because it is paywalled/locked. */
      locked?: boolean;
    };

type MobileReaderPersistProgressOptions = {
  silent?: boolean;
  throwOnError?: boolean;
  updateState?: boolean;
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
};

type ReaderProgrammaticScrollTarget =
  | { kind: "frame"; frameIndex: number }
  | { kind: "page"; pageIndex: number }
  | { kind: "scrub" };

type JapaneseLearningOcrState =
  | { status: "idle" }
  /** `partial`: bubbles read so far (on-device manga-ocr streams them). */
  | { status: "loading"; partial?: MobileJapaneseLearningOcrResult }
  | { status: "ready"; result: MobileJapaneseLearningOcrResult }
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
  | {
      status: "error";
      detail: string;
      source: "sentence" | "transcript" | "chat";
      messageId?: string;
    };

/** The chapter-finished capsule rests under the reader's title capsule. */
const CHAPTER_FINISHED_BELOW_INSET = 72;
const EMPTY_READER_SOURCE_LANGUAGES: string[] = [];
const EMPTY_READER_VISITED_PAGES: ReadonlySet<number> = new Set();
/** Top scrim: dark at the edge (status glyphs), gone by the feather below the row. */
const READER_TOP_SCRIM_COLORS = [
  "rgba(0,0,0,0.62)",
  "rgba(0,0,0,0.42)",
  "rgba(0,0,0,0.14)",
  "rgba(0,0,0,0)",
] as const;
const READER_TOP_SCRIM_LOCATIONS = [0, 0.45, 0.8, 1] as const;
/** Glass pieces closer than this blend (the row's pieces sit 10pt apart, so they stay separate at rest). */
const READER_CAPSULE_GLASS_SPACING = 8;
/** How long the chrome stays up after a chapter opens before it fades away. */
const READER_CHROME_AUTO_HIDE_MS = 3000;
/** A segmented strip's on-screen tiles are re-read once scrolling rests. */
const READER_SEGMENT_OCR_SETTLE_MS = 180;
/**
 * The root pose veil over the reader: a dark frost (the stage is black), so a
 * display switch never flashes the light page background over the manga.
 * Capped low: a near-opaque black wash over black pages read as a blank frame
 * after every rotation; the pages stay visible through a light frost that
 * clears as the new layout settles. Fold-only changes get no veil at all —
 * the reader glides them itself.
 */
const READER_POSE_VEIL: MobilePoseVeilAppearance = {
  tintColor: "#000000",
  blurTint: "dark",
  ...mobileReaderPoseVeilCaps(Platform.OS),
};

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
  // A server feature used signed out: the sign-in line, not a failure.
  if (isMobileJapaneseLearningSignInRequiredError(error)) {
    return strings.reader.pluginJapaneseLearningSignInRequired;
  }
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
          detection.imageSize ?? imageSize,
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
            containerStyle={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: Math.max(10, rect.width),
              height: Math.max(10, rect.height),
            }}
            style={[
              styles.japaneseLearningDetectionBox,
              {
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
  onZoomActiveChange,
  pageId,
  rtl = false,
  viewport,
  zoomTapBand,
}: {
  children: ReactNode;
  frameSize: MobileImageSize;
  /** Reports whether this page is currently zoomed in past its fit scale. */
  onZoomActiveChange?: (pageId: string, active: boolean) => void;
  pageId: string;
  /** Right-to-left books start an overflowing page at its right edge. */
  rtl?: boolean;
  /**
   * The window the page sits in, when the page is fitted to it (fit width,
   * fit height, fill) and so may be larger than it: the page then rests at its
   * top (and reading-start edge) and pans on the axes it overflows, handing a
   * drag at the edge back to the gallery's page turn. Omitted: the page is
   * its own window (the classic fit).
   */
  viewport?: { width: number; height: number };
  /**
   * Stage-x span where a double tap may *zoom in*. The page-turn bands act on
   * touch-up, so letting a double tap zoom there would page twice *and* zoom;
   * `null` lifts the restriction (no page turns are listening). A zoomed page
   * owns the whole stage, so resetting the zoom is never band-limited.
   */
  zoomTapBand: { start: number; end: number } | null;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const onZoomActiveChangeRef = useRef(onZoomActiveChange);

  useLayoutEffect(() => {
    onZoomActiveChangeRef.current = onZoomActiveChange;
  }, [onZoomActiveChange]);

  const publishZoomActive = useCallback(
    (active: boolean) => {
      onZoomActiveChangeRef.current?.(pageId, active);
    },
    [pageId],
  );

  const frameWidth = frameSize.width;
  const frameHeight = frameSize.height;
  const viewportWidth = viewport?.width ?? frameWidth;
  const viewportHeight = viewport?.height ?? frameHeight;
  // Where the page rests at its own scale: 0 for a page that fits its window.
  const rest = useMemo(
    () =>
      mobileReaderFitRestingOffset({
        frame: { width: frameWidth, height: frameHeight },
        viewport: { width: viewportWidth, height: viewportHeight },
        rtl,
      }),
    [frameHeight, frameWidth, rtl, viewportHeight, viewportWidth],
  );
  const restX = rest.x;
  const restY = rest.y;
  const panAtRest = restX !== 0 || restY !== 0;

  useEffect(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    // Straight to where the page rests: a fitted page must not slide in.
    translateX.value = restX;
    translateY.value = restY;
    savedTranslateX.value = restX;
    savedTranslateY.value = restY;
    publishZoomActive(false);
    // A new frame size (fold / unfold, rotation, spread ⇄ single, fit mode)
    // resets the zoom too: the saved scale and offsets were for the old
    // geometry.
  }, [
    frameHeight,
    frameWidth,
    pageId,
    publishZoomActive,
    restX,
    restY,
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

  // RNGH re-serializes a gesture's whole config to native whenever the Gesture
  // objects change identity, and every page in the gallery mounts one of these
  // frames. Build the composition once per frame size instead.
  const composedGesture = useMemo(() => {
    const springConfig = {
      damping: 20,
      mass: 0.7,
      stiffness: 220,
    };

    const publishZoomActiveFromWorklet = (active: boolean) => {
      "worklet";
      runOnJS(publishZoomActive)(active);
    };

    const resetZoom = () => {
      "worklet";
      scale.value = withSpring(1, springConfig);
      savedScale.value = 1;
      translateX.value = withSpring(restX, springConfig);
      translateY.value = withSpring(restY, springConfig);
      savedTranslateX.value = restX;
      savedTranslateY.value = restY;
      publishZoomActiveFromWorklet(false);
    };

    const pinchGesture = Gesture.Pinch()
      .onUpdate((event) => {
        const nextScale = clampMobileReaderZoomScale(
          savedScale.value * event.scale,
        );
        scale.value = nextScale;
        translateX.value = clampMobileReaderPan(
          translateX.value,
          frameWidth,
          viewportWidth,
          nextScale,
        );
        translateY.value = clampMobileReaderPan(
          translateY.value,
          frameHeight,
          viewportHeight,
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
        translateX.value = clampMobileReaderPan(
          translateX.value,
          frameWidth,
          viewportWidth,
          nextScale,
        );
        translateY.value = clampMobileReaderPan(
          translateY.value,
          frameHeight,
          viewportHeight,
          nextScale,
        );
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        publishZoomActiveFromWorklet(true);
      });

    const panGesture = Gesture.Pan()
      .minPointers(1)
      .averageTouches(true)
      // Single-finger panning is what a zoomed page needs, but at scale 1 that
      // same finger belongs to the gallery's page swipe. Manual activation lets
      // the gesture claim the touch only while zoomed in, and fail immediately
      // otherwise so the FlatList keeps its swipe. A fitted page that overflows
      // its window claims a drag only while it can still move that way.
      .manualActivation(true)
      .onTouchesDown((event) => {
        "worklet";
        const touch = event.allTouches[0];
        if (!touch) return;
        touchStartX.value = touch.absoluteX;
        touchStartY.value = touch.absoluteY;
      })
      .onTouchesMove((event, stateManager) => {
        "worklet";
        // Two fingers always pan (this is the pinch companion that already
        // worked); one finger only pans once the page is actually zoomed.
        if (event.numberOfTouches >= 2 || scale.value > 1) {
          stateManager.activate();
          return;
        }
        if (!panAtRest) {
          stateManager.fail();
          return;
        }
        const touch = event.allTouches[0];
        if (!touch) return;
        const claim = mobileReaderPanClaim({
          dx: touch.absoluteX - touchStartX.value,
          dy: touch.absoluteY - touchStartY.value,
          offsetX: translateX.value,
          offsetY: translateY.value,
          boundX: mobileReaderPanBound(frameWidth, viewportWidth, 1),
          boundY: mobileReaderPanBound(frameHeight, viewportHeight, 1),
        });
        if (claim === "claim") stateManager.activate();
        else if (claim === "yield") stateManager.fail();
      })
      .onUpdate((event) => {
        if (scale.value <= 1 && !panAtRest) return;
        translateX.value = clampMobileReaderPan(
          savedTranslateX.value + event.translationX,
          frameWidth,
          viewportWidth,
          scale.value,
        );
        translateY.value = clampMobileReaderPan(
          savedTranslateY.value + event.translationY,
          frameHeight,
          viewportHeight,
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
      .maxDelay(MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS)
      .onStart((event) => {
        if (shouldResetMobileReaderZoom(scale.value)) {
          // `absoluteX` is window-relative; zoomTapBand has been translated
          // using the Gallery's measured window origin. Only zooming *in*
          // competes with a page-turn band; a zoomed
          // page owns the stage outright, so its reset is never band-limited.
          if (
            zoomTapBand &&
            (event.absoluteX < zoomTapBand.start ||
              event.absoluteX > zoomTapBand.end)
          ) {
            return;
          }
          const nextScale = MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE;
          const nextTranslateX = clampMobileReaderPan(
            restX + (frameWidth / 2 - event.x) * (nextScale - 1),
            frameWidth,
            viewportWidth,
            nextScale,
          );
          const nextTranslateY = clampMobileReaderPan(
            restY + (frameHeight / 2 - event.y) * (nextScale - 1),
            frameHeight,
            viewportHeight,
            nextScale,
          );
          scale.value = withSpring(nextScale, springConfig);
          savedScale.value = nextScale;
          translateX.value = withSpring(nextTranslateX, springConfig);
          translateY.value = withSpring(nextTranslateY, springConfig);
          savedTranslateX.value = nextTranslateX;
          savedTranslateY.value = nextTranslateY;
          publishZoomActiveFromWorklet(true);
        } else {
          resetZoom();
        }
        runOnJS(hapticSelection)();
      });

    return Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  }, [
    frameHeight,
    frameWidth,
    panAtRest,
    publishZoomActive,
    restX,
    restY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    touchStartX,
    touchStartY,
    translateX,
    translateY,
    viewportHeight,
    viewportWidth,
    zoomTapBand,
  ]);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
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
    chapterLocked?: string;
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
      locked: firstParam(params.chapterLocked) === "true" ? true : undefined,
    }),
    [chapterId, params.chapterLocked, params.chapterNumber, params.chapterTitle, params.volumeNumber],
  );
  const { reduceMotion, scheme } = useNemuTheme();
  // Reduce Motion keeps the chrome's cross-fade but drops its 8px slide.
  const readerChromeAnimations = readerChromeAnimationsForMotion(reduceMotion);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [readerIsFocused, setReaderIsFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setReaderIsFocused(true);
    return () => setReaderIsFocused(false);
  }, []));
  useMobilePoseVeilAppearance(readerIsFocused ? READER_POSE_VEIL : null);
  const [readerStageWindowOrigin, setReaderStageWindowOrigin] = useState({ x: 0, y: 0 });
  const [reservedLayout, setReservedLayout] = useState<MobileWindowLayout | null>(null);
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const {
    mode,
    setMode,
    scrollWidthPct,
    setScrollWidthPct,
    pagePairingMode,
    setPagePairingMode,
    processPageImages,
    setProcessPageImages,
  } = useReadingMode();
  const { chapterCompleteCelebration } = useMobileFeedbackSettings();
  const {
    keepAwake: readerKeepAwake,
    setKeepAwake: setReaderKeepAwake,
    lockPortrait: readerLockPortrait,
    setLockPortrait: setReaderLockPortrait,
    notebookPane: readerNotebookPanePreference,
    setNotebookPane: setReaderNotebookPanePreference,
    spreadMode: readerSpreadMode,
    setSpreadMode: setReaderSpreadMode,
    fitModes: readerFitModes,
    setFitMode: setReaderFitMode,
  } = useReaderDisplayPrefs();
  const readerConnectivity = useMobileConnectivity();
  const readerPlugins = useMobileReaderPlugins();
  const installedReaderSources = useInstalledSources();
  const readerScrollRef = useRef<MobileReaderScrollHandle | null>(null);
  const readerContinuousScrubberRef =
    useRef<MobileReaderContinuousScrubberHandle | null>(null);
  const routeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intraPageProgressSaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const progressPersistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** The debounced silent progress write, kept reachable so backgrounding can
   * flush it instead of losing it to a suspended timer. */
  const pendingSilentProgressRef = useRef<{
    timeout: ReturnType<typeof setTimeout>;
    displayIndex: number;
  } | null>(null);
  const progressPersistenceClockRef = useRef(0);
  const readerProgrammaticScrollRef =
    useRef<ReaderProgrammaticScrollTarget | null>(null);
  const readerProgrammaticScrollClearTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const scrollingPageMetricsRef = useRef<ReaderScrollPageMetric[]>([]);
  const scrollingVisiblePageIndexRef = useRef(0);
  const readerRelayoutPageAnchorRef = useRef<number | null>(null);
  const readerRelayoutInteractionActiveRef = useRef(false);
  const readerRelayoutAnchorClearTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const readerScrollMetricsRef = useRef<ReaderContinuousScrollMetrics>(
    getReaderContinuousScrollMetrics({
      contentOffset: 0,
      contentLength: 0,
      viewportLength: 0,
    }),
  );
  const readerSettingsActionRef = useRef<ReaderSettingsAction | null>(null);
  const readerChromeAutoHideKeyRef = useRef<string | null>(null);
  const japaneseLearningOcrRunRef = useRef(0);
  const japaneseLearningAutoOcrPageRef = useRef("");
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
  const [showControlsState, setShowControls] = useState(true);
  // QA builds (EXPO_PUBLIC_READER_QA_CHROME=1) keep the chrome up for screenshots.
  const showControls = MOBILE_READER_QA_CHROME || showControlsState;
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
  const openReaderPluginSettingsAfterDisplaySettingsRef = useRef(false);
  const [selectedReaderPluginSettingsId, setSelectedReaderPluginSettingsId] =
    useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [readerScrubPreviewPageIndex, setReaderScrubPreviewPageIndex] =
    useState<number | null>(null);
  // The preview bubble is drawn by an overlay outside the clipped chrome panel;
  // the scrubber pushes thumb geometry straight into it so a drag repaints the
  // bubble without re-rendering the reader.
  const readerScrubPreviewRef =
    useRef<MobileReaderScrubberPreviewHandle | null>(null);
  const readerBottomPanelAnchorRef = useRef<ViewInstance | null>(null);
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
  const scrollWidthDraftRef = useRef(scrollWidthPct);
  const [readerScrollMetrics, setReaderScrollMetrics] =
    useState<ReaderContinuousScrollMetrics>(() =>
      getReaderContinuousScrollMetrics({
        contentOffset: 0,
        contentLength: 0,
        viewportLength: 0,
      }),
    );
  const [continuousReaderScrubActive, setContinuousReaderScrubActive] =
    useState(false);
  const [restoredReaderKey, setRestoredReaderKey] = useState("");
  const [pagesState, setPagesState] = useState<ReaderPagesState>({
    status: "idle",
    pages: [],
    detail: strings.reader.readerPagesIdle,
  });
  // Keep-awake waits for pages: a chapter stuck loading or blocked should not
  // hold the screen on. Portrait lock applies for the whole reader session.
  useReaderDisplayEnvironment({
    keepAwakeEnabled: readerKeepAwake,
    keepAwakeReady: pagesState.status === "ready",
    lockPortraitEnabled: readerLockPortrait,
  });
  const [japaneseLearningOcrState, setJapaneseLearningOcrState] =
    useState<JapaneseLearningOcrState>({ status: "idle" });
  // Web `useNemuChatStore` + `chat/actions.ts`: the thread, its flags and the
  // reply in flight live per reader session (manga) in the session module,
  // surviving page turns, chapter remounts and drawer close. Every screen for
  // the manga reads and writes that one session, so the next chapter's screen
  // re-attaches to a reply that is still streaming.
  const japaneseLearningChatSessionKey = mobileJapaneseLearningChatSessionKey({
    registryId,
    sourceId,
    mangaId,
  });
  const japaneseLearningChatSession = useMemo(
    () => mobileJapaneseLearningChatSessionFor(japaneseLearningChatSessionKey),
    [japaneseLearningChatSessionKey],
  );
  const japaneseLearningChatState = useSyncExternalStore(
    japaneseLearningChatSession.subscribe,
    japaneseLearningChatSession.getState,
  );
  const japaneseLearningChatStreaming = japaneseLearningChatState.streaming;
  const japaneseLearningChatShowTypingIndicator =
    japaneseLearningChatState.showTypingIndicator;
  const japaneseLearningChatFollowUps = japaneseLearningChatState.followUps;
  const japaneseLearningChatMessages = japaneseLearningChatState.messages;
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
  const japaneseLearningLauncherNextSurfaceRef = useRef<
    "transcript" | "chat" | null
  >(null);
  const [japaneseLearningOcrSheetVisible, setJapaneseLearningOcrSheetVisibleState] =
    useState(false);
  // Mirrors the latest request synchronously: an interactive dismissal
  // reports close and dismissed in the same tick, before React commits. It
  // also gates the overlay's progress samples (see
  // `mobileJapaneseLearningSheetPresence`).
  const japaneseLearningOcrSheetPresenceRef = useRef(JAPANESE_LEARNING_SHEET_GONE);
  const setJapaneseLearningOcrSheetVisible = useCallback((visible: boolean) => {
    japaneseLearningOcrSheetPresenceRef.current = requestJapaneseLearningSheet(
      japaneseLearningOcrSheetPresenceRef.current,
      visible,
    );
    setJapaneseLearningOcrSheetVisibleState(visible);
  }, []);
  const japaneseLearningOcrProgress = useSharedValue(0);
  const japaneseLearningChatProgress = useSharedValue(0);
  const [
    japaneseLearningChatDrawerVisible,
    setJapaneseLearningChatDrawerVisibleState,
  ] = useState(false);
  const japaneseLearningChatDrawerPresenceRef = useRef(JAPANESE_LEARNING_SHEET_GONE);
  const setJapaneseLearningChatDrawerVisible = useCallback((visible: boolean) => {
    japaneseLearningChatDrawerPresenceRef.current = requestJapaneseLearningSheet(
      japaneseLearningChatDrawerPresenceRef.current,
      visible,
    );
    setJapaneseLearningChatDrawerVisibleState(visible);
  }, []);
  const [
    japaneseLearningTranscriptVisible,
    setJapaneseLearningTranscriptVisible,
  ] = useState(false);
  const japaneseLearningTranscriptNextSurfaceRef = useRef<"ocr" | null>(null);
  const [readerImageSizes, setReaderImageSizes] = useState(
    () => new Map<string, MobileImageSize>(),
  );
  const [readerSegmentedImages, setReaderSegmentedImages] = useState(
    () => new Map<string, MobileCachedSegmentedImageAsset>(),
  );
  // The tiles of a segmented strip that are on screen: what page-scoped
  // tools (OCR) read instead of the whole strip.
  const [readerVisibleSegmentIndexes, setReaderVisibleSegmentIndexes] =
    useState<number[]>([0]);
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
  // React may invoke a state updater more than once for a single dispatch, so
  // the connectivity-restore retry reads the latched failures from here rather
  // than from inside `setReaderImageErrors` — a re-invoked updater used to
  // bump every failed page's nonce twice and re-download it twice.
  const readerImageErrorsRef = useRef(readerImageErrors);
  useEffect(() => {
    readerImageErrorsRef.current = readerImageErrors;
  }, [readerImageErrors]);
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
  // The request key whose pages are currently rendered. The pages effect also
  // re-runs on incidental dependency churn (any settings write flips `loading`
  // through the installed-sources revision); an unchanged key must not blank
  // the reader and refetch the chapter.
  const readerPagesLoadedKeyRef = useRef<string | null>(null);
  /** The request key whose source fetch is running right now, if any. */
  const readerPagesInFlightKeyRef = useRef<string | null>(null);
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
    reportError: (
      error: unknown,
      context?: NemuAgentSheetContext,
    ) => boolean;
  } | null>(null);

  const clearReaderProgrammaticScroll = useCallback(() => {
    if (readerProgrammaticScrollClearTimerRef.current) {
      clearTimeout(readerProgrammaticScrollClearTimerRef.current);
      readerProgrammaticScrollClearTimerRef.current = null;
    }
    readerProgrammaticScrollRef.current = null;
  }, []);

  const armReaderProgrammaticScroll = useCallback(
    (target: ReaderProgrammaticScrollTarget, timeoutMs = 1_500) => {
      clearReaderProgrammaticScroll();
      readerProgrammaticScrollRef.current = target;
      readerProgrammaticScrollClearTimerRef.current = setTimeout(() => {
        if (readerProgrammaticScrollRef.current === target) {
          readerProgrammaticScrollRef.current = null;
        }
        readerProgrammaticScrollClearTimerRef.current = null;
      }, timeoutMs);
    },
    [clearReaderProgrammaticScroll],
  );

  const settleReaderProgrammaticScroll = useCallback((delayMs = 0) => {
    if (readerProgrammaticScrollClearTimerRef.current) {
      clearTimeout(readerProgrammaticScrollClearTimerRef.current);
      readerProgrammaticScrollClearTimerRef.current = null;
    }
    const target = readerProgrammaticScrollRef.current;
    if (!target) return;
    if (delayMs <= 0) {
      readerProgrammaticScrollRef.current = null;
      return;
    }
    readerProgrammaticScrollClearTimerRef.current = setTimeout(() => {
      if (readerProgrammaticScrollRef.current === target) {
        readerProgrammaticScrollRef.current = null;
      }
      readerProgrammaticScrollClearTimerRef.current = null;
    }, delayMs);
  }, []);

  useEffect(() => {
    clearReaderProgrammaticScroll();
    setContinuousReaderScrubActive(false);
    return clearReaderProgrammaticScroll;
  }, [chapterId, clearReaderProgrammaticScroll, mode]);

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
          // The switch never navigates: the plugins sheet keeps the list (or
          // the plugin's own page) where it is, like a Settings switch row.
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
  // `null` while unknown: the chrome then leads with the chapter line.
  const mangaTitle = getMobileReaderTitle(
    state.entry,
    mangaId,
    sourceMangaTitle,
    routeMangaTitle,
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
  // No "Untitled" in the chrome while the chapter is known only by its id:
  // the capsule shows the manga title over the page count until it loads.
  const chapterTitle =
    formatChapterLabel(chapter, strings) ??
    (mangaTitle ? "" : formatChapterTitle(chapter, strings));
  const sourcePageForDisplayIndex = useCallback(
    (displayIndex: number) =>
      readerRoutePageForDisplayIndex(displayIndex, pageCount, mode),
    [mode, pageCount],
  );
  const displayedPages = useMemo(() => {
    return pages;
  }, [pages]);
  // Resolving a cached page URI hashes it with a pure-JS SHA-256. The
  // notebook filmstrip asks for the same handful of pages again and again, so
  // a resolved URI is remembered per page id and thrown away with the page list.
  const readerScrubPreviewUriByPageIdRef = useRef(new Map<string, string>());
  useEffect(() => {
    readerScrubPreviewUriByPageIdRef.current = new Map();
  }, [displayedPages]);
  // Notebook filmstrip thumbnails: the cached page file, remembered per page.
  // Only ever asked for revealed pages.
  const readerNotebookThumbnailUri = useCallback(
    (index: number): string | null => {
      const page = displayedPages[index];
      if (!page?.imageUri) return null;
      if (page.imageUriOwnership === "app") return page.imageUri;
      const resolvedByPageId = readerScrubPreviewUriByPageIdRef.current;
      const remembered = resolvedByPageId.get(page.id);
      if (remembered !== undefined) return remembered;
      const resolved = getCachedMobileImageUriSync({
        uri: page.imageUri,
        headers: page.headers,
        cacheKind: "page",
      });
      if (resolved) resolvedByPageId.set(page.id, resolved);
      return resolved ?? null;
    },
    [displayedPages],
  );
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
  const dualReaderControlsAvailable =
    !endOfChapterPromptVisible &&
    currentWholeImageToolsAvailable &&
    (!currentSegmentedImage ||
      MOBILE_READER_SEGMENTED_CAPABILITIES.dualReaderOverlay);
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
  // The capsule's page number: the displayed page while a paged scrub only
  // previews its target (see readerChromeIndicatorPageIndex).
  const readerChromePageIndex = readerChromeIndicatorPageIndex({
    currentPageIndex: clampedPageIndex,
    scrubPreviewPageIndex: readerScrubPreviewPageIndex,
    pagedMode: galleryPagedMode,
    pageCount,
  });
  const readerChromeSourcePageNumber = pageCount
    ? readerRoutePageForDisplayIndex(readerChromePageIndex, pageCount, mode)
    : 0;
  const usePhysicalScrollScrubber = shouldUseReaderPhysicalScrollScrubber({
    pagedMode: galleryPagedMode,
    pageCount,
  });
  // iPhone Duo vertical bar (`mobileReaderVerticalBarPolicy`): the outer
  // display and a Split View half keep it — Back and the actions live in the
  // system bar along its edge; the inner display full-screen opts out in
  // every posture and uses the capsule row, like the Android foldable reader
  // (owner decision, overriding the HIG's inner-landscape side bar).
  const readerVerticalBar = mobileReaderVerticalBarPolicy(reservedLayout ?? {});
  const readerSideBar = readerVerticalBar.sideBar;
  // With the bar kept, pages sit beside its column. The column's inset can
  // come and go with the status bar (chrome shown/hidden): keep the widest
  // one seen for this bar configuration so toggling the controls never
  // resizes a page. The latch is dropped when the bar is disabled, the
  // display / size / Split View changes, or the column changes side
  // (`mobileReaderNextSideInsetLatch`: never store an inset beyond its
  // configuration).
  const [readerSideBarInsetLatch, setReaderSideBarInsetLatch] =
    useState<MobileReaderSideInsetLatch | null>(null);
  const readerSideBarInsets = mobileReaderNextSideInsetLatch(
    readerSideBarInsetLatch,
    mobileReaderSideInsetLatchKey(reservedLayout, readerSideBar),
    reservedLayout?.safeAreaInsets,
  );
  if (readerSideBarInsets !== readerSideBarInsetLatch) {
    setReaderSideBarInsetLatch(readerSideBarInsets);
  }
  // A "partially open" hinge that arrives before the fold region turns
  // active lays the fold out early; if the region has not followed within
  // MOBILE_READER_HINGE_HINT_TIMEOUT_MS the region wins and the reader goes
  // back to flat (Apple: layout follows the region APIs, not the hinge).
  const readerHingeHintKey = reservedLayout ? mobileReaderHingeHintKey(reservedLayout) : null;
  const [expiredReaderHingeHint, setExpiredReaderHingeHint] = useState<string | null>(null);
  useEffect(() => {
    if (!readerHingeHintKey) {
      setExpiredReaderHingeHint(null);
      return;
    }
    const timer = setTimeout(() => setExpiredReaderHingeHint(readerHingeHintKey), MOBILE_READER_HINGE_HINT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readerHingeHintKey]);
  const readerHingeHintExpired = readerHingeHintKey !== null && expiredReaderHingeHint === readerHingeHintKey;
  const readerSideBarInsetLeft = readerSideBarInsets?.left ?? null;
  const readerSideBarInsetRight = readerSideBarInsets?.right ?? null;
  const readerWindowLayout = useMemo<MobileWindowLayout>(() => {
    if (!reservedLayout) {
      return {
        width: window.width, height: window.height, supported: false,
        divisions: [], occlusions: [],
      };
    }
    // The hinge reports before the fold region turns active: lay the fold
    // out as soon as the hinge says it is partially open (until it expires).
    const anticipated = mobileReaderAnticipatedWindowLayout(reservedLayout, {
      hintExpired: readerHingeHintExpired,
    });
    if (readerSideBarInsetLeft === null || readerSideBarInsetRight === null || !anticipated.safeAreaInsets) {
      return anticipated;
    }
    return {
      ...anticipated,
      safeAreaInsets: { ...anticipated.safeAreaInsets, left: readerSideBarInsetLeft, right: readerSideBarInsetRight },
    };
  }, [readerHingeHintExpired, readerSideBarInsetLeft, readerSideBarInsetRight, reservedLayout, window.height, window.width]);
  const selectedSourceLanguages =
    selectedInstalledSource?.packageMetadata?.languages ??
    selectedInstalledSource?.languages ??
    EMPTY_READER_SOURCE_LANGUAGES;
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
  const japaneseLearningReaderPlugin = useMemo(
    () =>
      enabledReaderPlugins.find(
        (plugin) => plugin.id === "japanese-learning",
      ) ?? null,
    [enabledReaderPlugins],
  );
  // The system vertical bar shows the capsule's own Ionicons (template
  // images the bar tints), never SF Symbols.
  const dualReaderPluginIcon =
    enabledReaderPlugins.find((plugin) => plugin.id === "dual-reader")?.icon ?? null;
  const readerBarIconImages = useReaderBarIconImages(
    {
      ...MOBILE_READER_CHROME_GLYPHS,
      dualRead: mobileReaderPluginGlyph(dualReaderPluginIcon ?? "copy-outline"),
    },
    readerSideBar,
  );
  // A Japanese Learning sheet (transcript, OCR result, chat) owns the stage:
  // the same system sheets in every pose, placed off the fold by the system.
  // The transcript → OCR result hand-off counts as open throughout.
  const japaneseLearningSurfaceOpen =
    japaneseLearningOcrSheetVisible ||
    japaneseLearningChatDrawerVisible ||
    japaneseLearningTranscriptVisible ||
    japaneseLearningTranscriptNextSurfaceRef.current === "ocr";
  // Icon slots in the capsule chrome's actions capsule, without the bilingual
  // toggle (added below once the pose says whether it shows). Derived in the
  // same render as the pose, so the title capsule is never clamped against a
  // stale action count.
  const readerBaseActionSlots = mobileReaderCapsuleActionSlots({
    enabledPluginIds: enabledReaderPlugins.map((plugin) => plugin.id),
    bilingualToggle: false,
  });
  // Notebook posture: what the bottom pane holds — trackpad, filmstrip, or
  // the continuous strip in scroll mode. The preference is saved; expanding
  // and collapsing are session choices.
  const [readerNotebookPaneOverride, setReaderNotebookPaneOverride] =
    useState<MobileReaderNotebookPaneOverride>(MOBILE_READER_QA_NOTEBOOK);
  const readerNotebookPane = resolveMobileReaderNotebookPane({
    preference: readerNotebookPanePreference,
    paged: galleryPagedMode,
    override: readerNotebookPaneOverride,
  });
  const buildReaderPose = useCallback(
    (actionCount: number, spreadMode: ReaderSpreadMode) =>
      mobileReaderPoseLayout({
        layout: readerWindowLayout,
        fallbackInsets: insets,
        paged: galleryPagedMode,
        pageCount,
        twoPage: spreadMode === "double",
        spreadMode,
        rtl: mode === "rtl",
        notebookPane: readerNotebookPane,
        actionCount,
        sideBar: readerSideBar,
      }),
    [
      readerSideBar,
      galleryPagedMode,
      insets,
      mode,
      pageCount,
      readerNotebookPane,
      readerWindowLayout,
    ],
  );
  // The action count only moves the capsule chrome, never the stage, so the
  // pose without the bilingual toggle decides whether the toggle shows.
  const readerBasePose = useMemo(
    () => buildReaderPose(readerBaseActionSlots, readerSpreadMode),
    [buildReaderPose, readerBaseActionSlots, readerSpreadMode],
  );
  const setReaderNotebookPaneFromSettings = useCallback(
    (value: typeof readerNotebookPanePreference) => {
      if (value === readerNotebookPanePreference || readerSettingsActionBusy) return;
      // A new preference replaces this session's expand / collapse choice.
      setReaderNotebookPaneOverride(null);
      void runReaderSettingsAction("notebook-pane", () => setReaderNotebookPanePreference(value));
    },
    [readerNotebookPanePreference, readerSettingsActionBusy, runReaderSettingsAction, setReaderNotebookPanePreference],
  );
  // Bilingual book (对照书): on a book / wide flat window with the dual reader
  // configured, the primary page takes the reading-start pane and the aligned
  // secondary page the other. Effective values only — the two-page setting is
  // never rewritten; the toggle is a session choice.
  const dualReaderConfigured = useMobileDualReaderStore(isMobileDuoDualReaderConfigured);
  const bilingualChoice = useMobileDuoBilingualChoice();
  const bilingualBaseSpreadPose = useMemo(
    () =>
      readerBasePose.spread || !dualReaderConfigured
        ? readerBasePose
        : buildReaderPose(readerBaseActionSlots, "double"),
    [buildReaderPose, dualReaderConfigured, readerBaseActionSlots, readerBasePose],
  );
  const bilingualEligibility = useMemo(
    () =>
      mobileDuoBilingualFromReaderPose({
        pose: bilingualBaseSpreadPose,
        rtl: mode === "rtl",
        paged: galleryPagedMode,
        dualReaderConfigured,
      }),
    [bilingualBaseSpreadPose, dualReaderConfigured, galleryPagedMode, mode],
  );
  const bilingualMode = resolveMobileDuoBilingualMode({
    eligible: bilingualEligibility.eligible && pageCount > 0,
    choice: bilingualChoice,
  });
  const readerActionSlots = mobileReaderCapsuleActionSlots({
    enabledPluginIds: enabledReaderPlugins.map((plugin) => plugin.id),
    bilingualToggle: bilingualMode.showToggle,
  });
  const readerPose = useMemo(
    () =>
      readerActionSlots === readerBaseActionSlots
        ? readerBasePose
        : buildReaderPose(readerActionSlots, readerSpreadMode),
    [buildReaderPose, readerActionSlots, readerBaseActionSlots, readerBasePose, readerSpreadMode],
  );
  const bilingualSpreadPose = useMemo(
    () =>
      readerPose.spread || !dualReaderConfigured
        ? readerPose
        : readerActionSlots === readerBaseActionSlots
          ? bilingualBaseSpreadPose
          : buildReaderPose(readerActionSlots, "double"),
    [
      bilingualBaseSpreadPose,
      buildReaderPose,
      dualReaderConfigured,
      readerActionSlots,
      readerBaseActionSlots,
      readerPose,
    ],
  );
  // The notebook setting only means something on a device that folds.
  const readerNotebookPaneSettingAvailable =
    readerWindowLayout.divisions.length > 0 || readerPose.posture === "notebook";
  const bilingualLayout =
    bilingualMode.sideBySide && bilingualEligibility.eligible
      ? bilingualEligibility.layout
      : null;
  const bilingualOverrides = useMemo(
    () =>
      bilingualLayout
        ? mobileDuoBilingualStageOverrides({
            layout: bilingualLayout,
            poseStage: bilingualSpreadPose.stage,
            tapExclusions: bilingualSpreadPose.tapExclusions,
          })
        : null,
    [bilingualLayout, bilingualSpreadPose],
  );
  const readerStage = bilingualOverrides?.stage ?? readerPose.stage;
  const readerStageConstrained = Boolean(bilingualOverrides) || readerPose.constrained;
  const readerSpreadSlots = bilingualOverrides ? undefined : readerPose.spreadSlots;
  const readerFoldGap = bilingualOverrides ? null : readerPose.foldGap;
  const readerStageHeight = Math.max(1, readerStage.height);
  const readerPageWidth = readerStageConstrained ? Math.max(1, readerStage.width) : Math.max(280, readerStage.width);
  // The pose decides whether spreads are possible at all (drives the setting)
  // and whether one is shown right now.
  const twoPageSupported = readerPose.twoPageAvailable;
  const isTwoPageMode = !bilingualOverrides && readerPose.spread && pageCount > 1;
  // Page fit is remembered per window shape (narrow, wide, large), judged by
  // the rectangle the page sits in — the pane in the notebook pose, the whole
  // window across a fold — never by orientation or idiom. Spreads, the
  // bilingual book and long strips are always fitted whole.
  const readerWindowShape = classifyReaderWindowShape(readerStage);
  const readerFitSetting = readerFitModeForShape(readerFitModes, readerWindowShape);
  const readerFitMode: ReaderFitMode =
    galleryPagedMode && !isTwoPageMode && !bilingualOverrides ? readerFitSetting : "page";
  const readerPageLayoutVisible = galleryPagedMode && pageCount > 0;
  const setReaderSpreadModeFromSettings = useCallback(
    (value: ReaderSpreadMode) => {
      if (value === readerSpreadMode || readerSettingsActionBusy) return;
      void runReaderSettingsAction("two-page-mode", () => setReaderSpreadMode(value));
    },
    [readerSettingsActionBusy, readerSpreadMode, runReaderSettingsAction, setReaderSpreadMode],
  );
  const setReaderFitModeFromSettings = useCallback(
    (value: ReaderFitMode) => {
      if (value === readerFitSetting || readerSettingsActionBusy) return;
      void runReaderSettingsAction("page-fit", () => setReaderFitMode(readerWindowShape, value));
    },
    [readerFitSetting, readerSettingsActionBusy, readerWindowShape, runReaderSettingsAction, setReaderFitMode],
  );
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
  const readerVisiblePages = useMemo(
    () => (isTwoPageMode
      ? (readerSpreads[currentSpreadIndex] ?? [clampedPageIndex])
      : [clampedPageIndex])
      .map((index) => displayedPages[index])
      .filter((page): page is MobileReaderPage => Boolean(page)),
    [isTwoPageMode, readerSpreads, currentSpreadIndex, clampedPageIndex, displayedPages],
  );
  // What the page-scoped learning tools read. A segmented strip is read as
  // the tiles on screen, each its own bounded image, so OCR boxes are in the
  // pixel space of the tile they are drawn on.
  const japaneseLearningVisiblePages = useMemo(
    () =>
      currentSegmentedImage && pageCount === 1 && currentDisplayedPage
        ? getMobileReaderSegmentOcrPages(
            currentDisplayedPage,
            currentSegmentedImage,
            readerVisibleSegmentIndexes,
          )
        : readerVisiblePages,
    [
      currentDisplayedPage,
      currentSegmentedImage,
      pageCount,
      readerVisiblePages,
      readerVisibleSegmentIndexes,
    ],
  );
  const readerSegmentOcrImageSizes = useMemo(
    () =>
      currentSegmentedImage && currentDisplayedPage
        ? getMobileReaderSegmentOcrImageSizes(
            currentDisplayedPage.id,
            currentSegmentedImage,
          )
        : null,
    [currentDisplayedPage, currentSegmentedImage],
  );
  // Any page on screen still without an image: tap zones must not turn past it.
  const readerVisiblePageLoading = readerVisiblePages.some((page) => {
    if (page.imageProcessing === "pending") return true;
    // A page without an image (text-only) has nothing to wait for.
    if (!page.imageUri) return false;
    const pageIdentity = readerPageIdentityFor(page);
    return isMobileReaderImageLoading({
      error: readerImageErrors.get(pageIdentity),
      hasNaturalSize: readerImageSizes.has(pageIdentity),
    });
  });
  const japaneseLearningVisiblePageKey = JSON.stringify(
    japaneseLearningVisiblePages.map((page) => readerPageIdentityFor(page)),
  );
  // Page ids only: a page's image URL or headers can be rewritten while it
  // stays on screen (the page processor resolving it, a background page-list
  // refresh with freshly signed URLs), and that must not reset OCR, the
  // sentence or audio under an open sheet.
  const japaneseLearningVisiblePageIdsKey = JSON.stringify(
    japaneseLearningVisiblePages.map((page) => page.id),
  );
  // One transcript per page for the reader and Nemu Chat alike (web's
  // text-detector `transcripts` map): keyed by page id, so a page Nemu read
  // before it was ever processed for display is the same page on screen.
  const japaneseLearningPageOcrKeyFor = useCallback(
    (page: MobileReaderPage) =>
      mobileJapaneseLearningPageOcrKey({
        registryId: routeRef.registryId,
        sourceId: routeRef.sourceId,
        mangaId,
        chapterId,
        pageId: page.id,
      }),
    [chapterId, mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const recognizeJapaneseLearningReaderPage = useCallback(
    (page: MobileReaderPage, options: MobileJapaneseLearningOcrOptions = {}) =>
      page.text?.trim() || getMobileJapaneseLearningQaScenario("ocr")
        ? runMobileJapaneseLearningOcr(page, options)
        : mobileJapaneseLearningPageOcrStore.recognize({
            key: japaneseLearningPageOcrKeyFor(page),
            page,
            priority: "reader",
            ...(options.signal ? { signal: options.signal } : {}),
            ...(options.onPartialResult
              ? { onPartialResult: options.onPartialResult }
              : {}),
          }),
    [japaneseLearningPageOcrKeyFor],
  );
  const japaneseLearningPageOcrVersion = useSyncExternalStore(
    mobileJapaneseLearningPageOcrStore.subscribe,
    mobileJapaneseLearningPageOcrStore.version,
  );
  // Every visible page already read (by Nemu, or earlier on this page):
  // like web, its boxes and transcript show without another tap.
  const japaneseLearningVisiblePagesOcrCached = useMemo(() => {
    void japaneseLearningPageOcrVersion;
    if (japaneseLearningVisiblePages.length === 0) return false;
    if (getMobileJapaneseLearningQaScenario("ocr")) return false;
    return japaneseLearningVisiblePages.every(
      (page) =>
        !page.text?.trim() &&
        mobileJapaneseLearningPageOcrStore.peek(
          japaneseLearningPageOcrKeyFor(page),
        ) !== undefined,
    );
  }, [
    japaneseLearningPageOcrKeyFor,
    japaneseLearningPageOcrVersion,
    japaneseLearningVisiblePages,
  ]);
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
  // Page images stay inside the horizontal safe area: a landscape iPhone's
  // Dynamic Island / notch must not cover the page edge. Portrait insets are
  // zero, so this is the full window width there.
  const readerSafeContentWidth = readerStageConstrained
    ? readerSpreadSlots
      ? Math.min(...readerSpreadSlots.map((slot) => slot.width)) * 2
      : readerPageWidth
    : Math.max(
        280,
        // Never the live status-bar insets: the page keeps its size when the
        // chrome (and the status bar with it) toggles.
        readerPageWidth - readerPose.pageSideInsets.left - readerPose.pageSideInsets.right,
      );
  const readerImageWidth = pagedMode
    ? isTwoPageMode
      ? Math.max(1, readerSafeContentWidth / 2)
      : // The whole page as large as fits: a regular-width window (an iPad, the
        // Duo's open display) is not held to a phone-sized column.
        Math.max(readerStageConstrained ? 1 : 240, readerSafeContentWidth - 24)
    : Math.min(readerSafeContentWidth, 720) *
      readerScrollWidthScale(activeScrollWidthPct);
  const segmentedImageFrames = useMemo(
    () =>
      currentSegmentedImage && pageCount === 1
        ? getMobileReaderSegmentFrames(currentSegmentedImage, readerImageWidth)
        : [],
    [currentSegmentedImage, pageCount, readerImageWidth],
  );
  const scrollingPageExtent = readerImageWidth * 1.45 + 10;
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
  const layoutRestorePageIndex = restoredReaderKey.startsWith(`${readyFetchedAt}:${chapterId}:`)
    ? clampedPageIndex : readerRestorePageIndex;
  const readerRestoreFrameIndex = useMemo(
    () =>
      isTwoPageMode
        ? findMobileReaderSpreadIndex(readerSpreads, layoutRestorePageIndex)
        : layoutRestorePageIndex,
    [isTwoPageMode, layoutRestorePageIndex, readerSpreads],
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
        `${readyFetchedAt}:${chapterId}:${mode}:${pageCount}:${isTwoPageMode ? pagePairingMode : "single"}:${
          // Stage geometry is not part of the key: a fold, dock or rail keeps
          // the mounted list at its logical page (MobileReaderGallery
          // re-places the offset). Only the user's column width re-anchors.
          galleryPagedMode ? "paged" : `width-${activeScrollWidthPct}`
        }`
      : "";
  const readerScrollMountKey =
    pagesState.status === "ready"
      ? `${chapterId}:${readyFetchedAt}:${mode}:${
          // Presentation only (spread ⇄ single remounts under a cross-fade);
          // stage size changes never remount the gallery.
          galleryPagedMode
            ? `${isTwoPageMode ? pagePairingMode : "single"}`
            : currentSegmentedImage
              ? `segmented:${currentSegmentedImage.generation}:${activeScrollWidthPct}`
              : isLongStripLogicalPage
                ? `long-strip:single:${activeScrollWidthPct}`
                : `scrolling:${activeScrollWidthPct}`
        }`
      : "loading";
  const readerContinuousContentIdentity =
    pagesState.status === "ready" && !galleryPagedMode
      ? JSON.stringify([
          registryId,
          sourceId,
          mangaId,
          chapterId,
          readyFetchedAt,
          mode,
          pageCount,
        ])
      : undefined;
  const readerScrollMetricsScopeKey = readerScrollMetricsResetKey({
    continuousContentIdentity: readerContinuousContentIdentity,
    pagedMode: galleryPagedMode,
    scrollMountKey: readerScrollMountKey,
  });
  const readerRestoreComplete =
    Boolean(restoreReaderKey) && restoredReaderKey === restoreReaderKey;
  // Notebook filmstrip / scrub previews are spoiler-safe: only pages read
  // before this chapter opened (saved position, a completed chapter), pages
  // actually shown in this session and the current page show their image.
  const [readerNotebookVisits, setReaderNotebookVisits] = useState<{
    chapterId: string;
    openedAt: number | null;
    visited: ReadonlySet<number>;
  } | null>(null);
  if (readerRestoreComplete && pageCount > 0) {
    if (readerNotebookVisits?.chapterId !== chapterId) {
      const saved = state.chapterProgress;
      setReaderNotebookVisits({
        chapterId,
        openedAt: saved && saved.sourceChapterId === chapterId && saved.total > 1 ? saved.progress : null,
        visited: new Set([clampedPageIndex]),
      });
    } else if (!readerNotebookVisits.visited.has(clampedPageIndex)) {
      setReaderNotebookVisits({
        ...readerNotebookVisits,
        visited: new Set([...readerNotebookVisits.visited, clampedPageIndex]),
      });
    }
  }
  const readerNotebookVisitsForChapter =
    readerNotebookVisits?.chapterId === chapterId ? readerNotebookVisits : null;
  const readerNotebookRevealed = useMemo(
    () =>
      mobileReaderNotebookReveal({
        pageCount,
        currentIndex: clampedPageIndex,
        openedAtIndex: readerNotebookVisitsForChapter?.openedAt ?? null,
        completed,
        visited: readerNotebookVisitsForChapter?.visited ?? EMPTY_READER_VISITED_PAGES,
      }),
    [clampedPageIndex, completed, pageCount, readerNotebookVisitsForChapter],
  );
  const readerChromeChapterKey = JSON.stringify([registryId, sourceId, mangaId, chapterId]);
  const readerChromeAutoHideKey = readerRestoreComplete ? readerChromeChapterKey : "";
  const silentProgressPersistenceKey = readerRestoreComplete
    ? mobileReaderProgressPersistenceKey(
        restoreReaderKey,
        visibleProgressPageIndex,
      )
    : "";
  // The notebook console is always visible: the bottom pane is the controls half.
  const showReaderChrome = showControls || readerPose.chromePinned;
  const showReaderBottomChrome =
    showReaderChrome &&
    ((pagesState.status === "ready" && pageCount > 0) ||
      pagesState.status === "loading");
  useEffect(() => {
    const emptyMetrics = getReaderContinuousScrollMetrics({
      contentOffset: 0,
      contentLength: 0,
      viewportLength: 0,
    });
    readerScrollMetricsRef.current = emptyMetrics;
    setReaderScrollMetrics(emptyMetrics);
  }, [readerScrollMetricsScopeKey]);

  const readerSegmentViewportRef = useRef<{
    frames: ReadonlyArray<MobileReaderSegmentFrame>;
    topInset: number;
  }>({ frames: [], topInset: 0 });
  const readerVisibleSegmentTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const publishReaderVisibleSegments = useCallback(() => {
    readerVisibleSegmentTimerRef.current = null;
    const { frames, topInset } = readerSegmentViewportRef.current;
    if (frames.length === 0) return;
    const metrics = readerScrollMetricsRef.current;
    const next = getMobileReaderVisibleSegmentIndexes(frames, {
      contentOffset: metrics.contentOffset,
      viewportLength: metrics.viewportLength,
      contentInsetTop: topInset,
    });
    setReaderVisibleSegmentIndexes((current) =>
      sameMobileReaderSegmentIndexes(current, next) ? current : next,
    );
  }, []);
  useEffect(
    () => () => {
      if (readerVisibleSegmentTimerRef.current) {
        clearTimeout(readerVisibleSegmentTimerRef.current);
      }
    },
    [],
  );

  const onReaderContinuousScrollMetricsChange = useCallback(
    (metrics: ReaderContinuousScrollMetrics) => {
      const previousMetrics = readerScrollMetricsRef.current;
      readerScrollMetricsRef.current = metrics;
      readerContinuousScrubberRef.current?.updateMetrics(metrics);
      if (readerSegmentViewportRef.current.frames.length > 0) {
        // Published once the scroll settles: the tile set scopes OCR, which
        // must not restart for every tile a fling passes.
        if (readerVisibleSegmentTimerRef.current) {
          clearTimeout(readerVisibleSegmentTimerRef.current);
        }
        readerVisibleSegmentTimerRef.current = setTimeout(
          publishReaderVisibleSegments,
          READER_SEGMENT_OCR_SETTLE_MS,
        );
      }
      const layoutRangeChanged =
        previousMetrics.scrollable !== metrics.scrollable ||
        Math.abs(previousMetrics.contentLength - metrics.contentLength) > 1 ||
        Math.abs(previousMetrics.viewportLength - metrics.viewportLength) > 1 ||
        Math.abs(previousMetrics.maximumOffset - metrics.maximumOffset) > 1;
      if (layoutRangeChanged) {
        // The parent only needs coarse layout capability for accessibility.
        // Thumb progress is published directly to the isolated scrubber above.
        setReaderScrollMetrics(metrics);
      }
    },
    [publishReaderVisibleSegments],
  );
  const readerBackgroundColor = "#000000";
  // Only the status bar follows the chrome here. The pop gesture is disabled
  // statically on the route (app/sources/_layout.tsx) and on the root stack
  // that hosts the flow (app/_layout.tsx) — see mobileReaderRouteOptions.
  const navigation = useNavigation();
  useEffect(() => {
    // The root stack keeps the iOS 26 full-screen back swipe on; the sources
    // flow is one screen of it, so a page turn or scrub here would pop the
    // whole flow. Hold the host screen's gesture off for the reader's lifetime.
    const parent = navigation.getParent();
    return acquireMobileReaderHostGestureLock(
      parent ? (options) => parent.setOptions(options) : undefined,
    );
  }, [navigation]);
  const readerScreenOptions = useMemo(
    () =>
      readerSideBar
        ? {
            ...mobileReaderScreenOptions({ showControls }),
            // A transparent native header that only carries Back and the
            // toolbar items (the system presents them in the vertical bar);
            // it stays mounted — its items hide with the chrome — so the
            // bar column never comes and goes under the page.
            headerShown: true,
            headerTransparent: true,
            headerShadowVisible: false,
            headerBackVisible: false,
            headerTintColor: READER_CAPSULE_COLORS.primaryText,
            title: "",
          }
        : { ...mobileReaderScreenOptions({ showControls }), headerShown: false },
    [readerSideBar, showControls],
  );
  const readerChromeTopPadding = showReaderChrome
    ? insets.top + 80
    : Math.max(insets.top + 8, 12);
  const readerCompactControlsHeight = 82;
  const readerScrollTopInset = insets.top + 80;
  // The segmented list's leading padding (see the gallery's chromeTopPadding).
  const readerSegmentTopInset =
    readerPose.chrome.kind === "console" ? 0 : readerScrollTopInset;
  useLayoutEffect(() => {
    readerSegmentViewportRef.current = {
      frames: segmentedImageFrames,
      topInset: readerSegmentTopInset,
    };
    publishReaderVisibleSegments();
  }, [publishReaderVisibleSegments, readerSegmentTopInset, segmentedImageFrames]);
  const readerScrollBottomInset = insets.bottom + readerCompactControlsHeight;
  const readerBottomPadding = showReaderBottomChrome
    ? insets.bottom + readerCompactControlsHeight
    : Math.max(insets.bottom + 18, 24);
  const readerStateTopPadding = Math.max(insets.top + 82, 118);

  const readerChromeColorsForTheme = useMemo(
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
  // A chapter that has not resolved its page list keeps both chrome panels up
  // in a greyed loading state instead of collapsing to a black screen.
  const readerChromeLoading = isReaderChromeLoading(pagesState.status);
  // Only an actively-fetching chapter gets the "fetching pages" subtitle and
  // spinner; error and blocked states have their own dedicated surfaces.
  const readerChromePagesPending = pagesState.status === "loading";
  // Hidden entirely while the page list is unresolved: the ring spinner next
  // to it already says the chapter is loading, and "— / —" reads as broken.
  const readerTopPageCountLabel = readerChromePageCountLabel({
    pagesStatus: pagesState.status,
    pageNumber: readerChromeSourcePageNumber,
    pageCount,
  });
  const readerInteractionSurfaceOpen =
    readerDisplaySettingsOpen ||
    readerPluginSettingsOpen ||
    japaneseLearningLauncherVisible ||
    japaneseLearningSurfaceOpen ||
    endOfChapterPromptVisible;
  useEffect(() => {
    if (!showReaderChrome) {
      setReaderDisplaySettingsOpen(false);
    }
  }, [showReaderChrome]);
  const readerMaxPagedImageHeight = readerStageConstrained
    ? Math.max(1, Math.min(readerStageHeight, ...(readerSpreadSlots?.map((slot) => slot.height) ?? [readerStageHeight])))
    : Math.max(260, readerStageHeight);
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
      emitMobileDataChanged("sources");
    },
    [store],
  );

  useEffect(() => {
    setSourceMangaTitle(null);
  }, [mangaId, registryId, sourceId]);

  // Outside the library the title comes from the source: the persisted
  // detail cache first (no network), then the source's details with one
  // retry. Until then the chrome shows the chapter line, never a fake title.
  useEffect(() => {
    if (loading || state.entry) return;

    let cancelled = false;
    void loadMobileReaderMangaTitle({
      mangaId,
      readCachedTitle: async () =>
        (
          await getCachedMobileSourceDetail(
            makeMobileSourceDetailCacheKey(registryId, sourceId, mangaId),
          )
        )?.payload.metadata.title,
      fetchSourceTitle: selectedInstalledSource
        ? async () => {
            const result = await refreshMobileSourceMetadata(
              selectedInstalledSource,
              mangaId,
              {
                getSourceSettings: getReaderSourceSettings,
                onSourcePackageHydrated: saveReaderSourcePackageHydration,
              },
            );
            return result.status === "ready"
              ? { status: "ready", title: result.metadata.title }
              : { status: "blocked" };
          }
        : undefined,
      isCancelled: () => cancelled,
    })
      .then((nextTitle) => {
        if (!cancelled && nextTitle) setSourceMangaTitle(nextTitle);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    getReaderSourceSettings,
    loading,
    mangaId,
    registryId,
    saveReaderSourcePackageHydration,
    selectedInstalledSource,
    sourceId,
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
    if (!dualReaderControlsAvailable) return;
    getMobileDualReadStore().getState().setConfigOpen(true);
  }, [dualReaderControlsAvailable]);
  useEffect(() => {
    startDualReadSession(dualReadSessionKey);
  }, [dualReadSessionKey, startDualReadSession]);
  useEffect(() => {
    return () => {
      cleanupDualReadRuntime();
    };
  }, [cleanupDualReadRuntime]);

  const activeReaderPlugin = useMemo(
    () =>
      enabledReaderPlugins.find(
        (plugin) => plugin.id === activeReaderPluginId,
      ) ?? null,
    [activeReaderPluginId, enabledReaderPlugins],
  );
  const japaneseLearningPresentationPluginRef =
    useRef<MobileReaderPluginState | null>(null);
  if (japaneseLearningReaderPlugin) {
    japaneseLearningPresentationPluginRef.current =
      japaneseLearningReaderPlugin;
  }
  const japaneseLearningPresentationPlugin =
    japaneseLearningReaderPlugin ??
    japaneseLearningPresentationPluginRef.current;

  useEffect(() => {
    if (scrollWidthDraftRef.current === scrollWidthPct) return;
    if (usePhysicalScrollScrubber) {
      readerScrollRef.current?.scrollToProgressAfterContentChange(
        readerScrollMetricsRef.current.progress,
      );
    } else if (!pagedMode) {
      readerRelayoutPageAnchorRef.current ??=
        scrollingVisiblePageIndexRef.current;
    }
    scrollWidthDraftRef.current = scrollWidthPct;
    setScrollWidthDraft(scrollWidthPct);
  }, [pagedMode, scrollWidthPct, usePhysicalScrollScrubber]);

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
    if (activeReaderPluginId === "japanese-learning") return;
    japaneseLearningChatTtsAutoPlayRef.current = {
      enabled: false,
      currentId: null,
      armedAt: 0,
    };
  }, [activeReaderPluginId]);

  // Page-scoped tools (OCR, grammar, audio, selection) always follow the
  // page. Nemu chat does not: like web, a page turn neither clears the thread
  // nor cancels a reply in flight (the next request carries the new page).
  const japaneseLearningPageResetKey = mobileReaderLearningPageResetKey({
    registryId,
    sourceId,
    chapterId,
    pageKey: japaneseLearningVisiblePageIdsKey,
  });
  useEffect(() => {
    void japaneseLearningPageResetKey;
    const lifecycle = japaneseLearningLifecycleRef.current;
    lifecycle?.abort("ocr");
    lifecycle?.abort("grammar");
    lifecycle?.abort("tts-prefetch");
    lifecycle?.abort("tts-playback");
    japaneseLearningOcrRunRef.current += 1;
    japaneseLearningAutoOcrPageRef.current = "";
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
    setJapaneseLearningGrammarState({ status: "idle" });
    setJapaneseLearningTtsState({ status: "idle" });
    setJapaneseLearningGrammarActionNotice(null);
    setSelectedJapaneseLearningGrammarTokenIndex(null);
    setJapaneseLearningSelectedDetectionOrder(null);
  }, [japaneseLearningPageResetKey]);
  // Web resets the chat store only in the plugin's `onUnmount` (reader closed
  // or a different manga). Chapter changes remount this screen; the session
  // module keeps the thread and the reply in flight across the remount, and
  // ends them only once no reader for this manga has held it for the grace
  // period. A different manga gets its own session; the previous manga's
  // ends once its reader lets go.
  useEffect(
    () => retainMobileJapaneseLearningChatSession(japaneseLearningChatSession),
    [japaneseLearningChatSession],
  );
  const japaneseLearningChatSessionRef = useRef(japaneseLearningChatSession);
  useEffect(() => {
    if (japaneseLearningChatSessionRef.current === japaneseLearningChatSession) return;
    japaneseLearningChatSessionRef.current = japaneseLearningChatSession;
    setJapaneseLearningChatInput("");
  }, [japaneseLearningChatSession]);
  /** Web `useNemuChatStore.reset()`, run from the plugin's `onUnmount`. */
  const resetJapaneseLearningChat = useCallback(() => {
    japaneseLearningChatSession.reset();
    setJapaneseLearningChatInput("");
  }, [japaneseLearningChatSession]);
  // Web's plugin host unmounts a plugin disabled mid-session, and the
  // Japanese-learning `onUnmount` resets the chat store: the thread, the
  // follow-ups and any reply in flight all go.
  const japaneseLearningPluginEnabled = readerPlugins.data.find(
    (plugin) => plugin.id === "japanese-learning",
  )?.enabled;
  const japaneseLearningPluginEnabledRef = useRef(japaneseLearningPluginEnabled);
  useEffect(() => {
    const previous = japaneseLearningPluginEnabledRef.current;
    japaneseLearningPluginEnabledRef.current = japaneseLearningPluginEnabled;
    if (
      shouldResetMobileJapaneseLearningChatForPluginToggle(
        previous,
        japaneseLearningPluginEnabled,
      )
    ) {
      resetJapaneseLearningChat();
    }
  }, [japaneseLearningPluginEnabled, resetJapaneseLearningChat]);

  useEffect(() => {
    return () => {
      japaneseLearningLauncherNextSurfaceRef.current = null;
      japaneseLearningTranscriptNextSurfaceRef.current = null;
      void clearMobileReaderImageMemoryCache();
      // Page-scoped work only: the Nemu chat request and its speak queue
      // belong to the session module, which lets the next chapter's screen
      // re-attach and ends them when the reader itself closes.
      japaneseLearningLifecycleRef.current?.abortAll();
      japaneseLearningOcrRunRef.current += 1;
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

  const beginScrollWidthInteraction = useCallback(() => {
    if (usePhysicalScrollScrubber || pagedMode) return;
    if (readerRelayoutAnchorClearTimerRef.current) {
      clearTimeout(readerRelayoutAnchorClearTimerRef.current);
      readerRelayoutAnchorClearTimerRef.current = null;
    }
    readerRelayoutInteractionActiveRef.current = true;
    readerRelayoutPageAnchorRef.current ??=
      scrollingVisiblePageIndexRef.current;
  }, [pagedMode, usePhysicalScrollScrubber]);

  const endScrollWidthInteraction = useCallback(() => {
    readerRelayoutInteractionActiveRef.current = false;
    if (readerRelayoutAnchorClearTimerRef.current) {
      clearTimeout(readerRelayoutAnchorClearTimerRef.current);
    }
    // The last preview state commits after the responder release callback.
    // Keep the anchor through that render/effect boundary, then discard it.
    readerRelayoutAnchorClearTimerRef.current = setTimeout(() => {
      readerRelayoutPageAnchorRef.current = null;
      readerRelayoutAnchorClearTimerRef.current = null;
    }, 250);
  }, []);

  useEffect(
    () => () => {
      if (readerRelayoutAnchorClearTimerRef.current) {
        clearTimeout(readerRelayoutAnchorClearTimerRef.current);
        readerRelayoutAnchorClearTimerRef.current = null;
      }
    },
    [],
  );

  const previewScrollWidth = useCallback(
    (value: number) => {
      const nextValue = clampReaderScrollWidthPct(value);
      if (nextValue === scrollWidthDraftRef.current) return;
      if (usePhysicalScrollScrubber) {
        // Queue before draft state changes; FlatList's next content-size event
        // then restores against the new geometry, not the old maximum offset.
        readerScrollRef.current?.scrollToProgressAfterContentChange(
          readerScrollMetricsRef.current.progress,
        );
      } else if (!pagedMode) {
        // A multi-page FlatList has no stable physical content length until
        // every page is measured. Preserve the visible logical page and let
        // the post-remount scrollToIndex retry path restore it exactly.
        readerRelayoutPageAnchorRef.current ??=
          scrollingVisiblePageIndexRef.current;
      }
      scrollWidthDraftRef.current = nextValue;
      setScrollWidthDraft(nextValue);
    },
    [pagedMode, usePhysicalScrollScrubber],
  );

  const commitScrollWidth = useCallback(
    async (value: number) => {
      const nextValue = clampReaderScrollWidthPct(value);
      previewScrollWidth(nextValue);
      if (nextValue === scrollWidthPct) return;
      await runReaderSettingsAction("scroll-width", async () => {
        await setScrollWidthPct(nextValue);
      });
    },
    [
      previewScrollWidth,
      runReaderSettingsAction,
      scrollWidthPct,
      setScrollWidthPct,
    ],
  );

  /**
   * The one place a page turn is felt. Tap turns and step buttons come through
   * `goToPage`, swipes through the scroll settle — both call this, and only for
   * a real forward/backward turn, so placing the reader (restore, scrub, a
   * chapter jump) stays silent and a single turn never buzzes twice.
   */
  const notifyReaderPageTurn = useCallback(
    (arrival: MobileReaderPageArrival) => {
      if (arrival === "initial") return;
      void hapticSelection();
    },
    [],
  );

  const goToPage = useCallback(
    (
      nextIndex: number,
      arrival: MobileReaderPageArrival = "initial",
      options?: { animated?: boolean },
    ) => {
      if (pageCount <= 0) return;
      const requestedPageIndex = clampReaderPageIndex(nextIndex, pageCount);
      const targetFrameIndex = isTwoPageMode
        ? findMobileReaderSpreadIndex(readerSpreads, requestedPageIndex)
        : requestedPageIndex;
      const nextPageIndex =
        galleryPagedMode && isTwoPageMode
          ? firstPageIndexForMobileReaderSpread(readerSpreads, targetFrameIndex)
          : requestedPageIndex;
      armReaderProgrammaticScroll(
        galleryPagedMode
          ? { kind: "frame", frameIndex: targetFrameIndex }
          : { kind: "page", pageIndex: nextPageIndex },
      );
      notifyReaderPageTurn(arrival);
      setPageArrival(arrival);
      setCurrentPageIndex(nextPageIndex);
      const animated = options?.animated ?? galleryPagedMode;
      scrollToPageIndex(nextPageIndex, animated);
      syncRoutePage(nextPageIndex);
      // A jump (the page flip moves the pager under its leaf) emits no
      // momentum settle: release the programmatic target right after it.
      if (!animated && galleryPagedMode) settleReaderProgrammaticScroll(120);
      const currentNativeIndex =
        galleryPagedMode && isTwoPageMode
          ? currentSpreadIndex
          : clampedPageIndex;
      const targetNativeIndex = galleryPagedMode
        ? targetFrameIndex
        : nextPageIndex;
      // Native lists do not emit a settle event when already at the requested
      // page/frame, so clear immediately instead of suppressing a later turn.
      if (targetNativeIndex === currentNativeIndex) {
        clearReaderProgrammaticScroll();
      }
    },
    [
      armReaderProgrammaticScroll,
      clampedPageIndex,
      clearReaderProgrammaticScroll,
      currentSpreadIndex,
      galleryPagedMode,
      isTwoPageMode,
      notifyReaderPageTurn,
      pageCount,
      readerSpreads,
      scrollToPageIndex,
      settleReaderProgrammaticScroll,
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
      const requestedPageIndex =
        programmaticTarget?.kind === "page"
          ? programmaticTarget.pageIndex
          : null;
      if (scrollingVisiblePageIndexRef.current === nextPageIndex) {
        if (requestedPageIndex === nextPageIndex) {
          clearReaderProgrammaticScroll();
        }
        return;
      }
      scrollingVisiblePageIndexRef.current = nextPageIndex;
      if (requestedPageIndex != null && nextPageIndex !== requestedPageIndex) {
        return;
      }
      if (requestedPageIndex === nextPageIndex) {
        clearReaderProgrammaticScroll();
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
    [
      clampedPageIndex,
      clearReaderProgrammaticScroll,
      galleryPagedMode,
      mode,
      pageCount,
      syncRoutePage,
    ],
  );

  const onScrollingSeekFailed = useCallback(
    (requestedPageIndex: number) => {
      const programmaticTarget = readerProgrammaticScrollRef.current;
      if (
        programmaticTarget?.kind === "page" &&
        programmaticTarget.pageIndex === requestedPageIndex
      ) {
        clearReaderProgrammaticScroll();
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
    [clearReaderProgrammaticScroll, pageCount, syncRoutePage],
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
          mangaTitle,
        }),
      );
    },
    [mangaId, routeRef.registryId, routeRef.sourceId, mangaTitle],
  );

  // The chapter that follows the current one in reading order, independent of
  // which physical edge of the screen it lives on.
  const nextChapterInReadingOrder = mode === "rtl" ? leftChapter : rightChapter;
  const previousChapterInReadingOrder =
    mode === "rtl" ? rightChapter : leftChapter;
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
          persistProgressRef.current(true, visibleProgressPageIndex, {
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
  }, [strings, visibleProgressPageIndex]);

  const showEndOfChapterPrompt = useCallback(() => {
    if (
      readerDisplaySettingsOpen ||
      readerPluginSettingsOpen ||
      japaneseLearningLauncherVisible ||
      japaneseLearningOcrSheetVisible ||
      japaneseLearningChatDrawerVisible ||
      japaneseLearningTranscriptVisible
    ) {
      return;
    }
    // Design-explore: reading past the last page always goes straight on to
    // the next chapter (the setting's blocking card is gone), and a capsule
    // marks the chapter just finished on the way in. The setting keeps its
    // light tap. With no next chapter the caught-up card still shows.
    if (mobileDesignExploreFlag && nextChapterInReadingOrder) {
      const finished = formatChapterShortLabel(chapter, strings);
      void persistEndOfChapterCompletion().then((persisted) => {
        if (!persisted) return;
        if (finished) markMobileChapterFinished(finished);
        if (chapterCompleteCelebration) void hapticConfirm();
        goToChapter(nextChapterInReadingOrder, { startAt: "start" });
      });
      return;
    }
    if (!chapterCompleteCelebration && nextChapterInReadingOrder) {
      void persistEndOfChapterCompletion().then((persisted) => {
        if (persisted) {
          goToChapter(nextChapterInReadingOrder, { startAt: "start" });
        }
      });
      return;
    }
    setEndOfChapterProgressSaved(false);
    setEndOfChapterPromptVisible(true);
    if (chapterCompleteCelebration) void hapticConfirm();
    void persistEndOfChapterCompletion();
  }, [
    chapter,
    chapterCompleteCelebration,
    goToChapter,
    strings,
    japaneseLearningChatDrawerVisible,
    japaneseLearningLauncherVisible,
    japaneseLearningOcrSheetVisible,
    japaneseLearningTranscriptVisible,
    persistEndOfChapterCompletion,
    nextChapterInReadingOrder,
    readerDisplaySettingsOpen,
    readerPluginSettingsOpen,
  ]);

  // Stepping back from the first page opens the previous chapter on its last
  // page, the mirror of advancing past the final page (web prepends the
  // previous chapter the same way). A tap-zone turn and a pinned drag can both
  // land for one gesture, so a repeat for the same chapter is dropped.
  const retreatRequestRef = useRef<{ chapterId: string; at: number } | null>(
    null,
  );
  const showPreviousChapterFromEnd = useCallback(() => {
    if (
      readerDisplaySettingsOpen ||
      readerPluginSettingsOpen ||
      japaneseLearningLauncherVisible ||
      japaneseLearningOcrSheetVisible ||
      japaneseLearningChatDrawerVisible ||
      japaneseLearningTranscriptVisible
    ) {
      return;
    }
    const previousChapter = previousChapterInReadingOrder;
    if (!previousChapter) return;
    const now = Date.now();
    const lastRequest = retreatRequestRef.current;
    if (
      lastRequest?.chapterId === previousChapter.id &&
      now - lastRequest.at < 1_000
    ) {
      return;
    }
    retreatRequestRef.current = { chapterId: previousChapter.id, at: now };
    goToChapter(previousChapter, { startAt: "end" });
  }, [
    goToChapter,
    japaneseLearningChatDrawerVisible,
    japaneseLearningLauncherVisible,
    japaneseLearningOcrSheetVisible,
    japaneseLearningTranscriptVisible,
    previousChapterInReadingOrder,
    readerDisplaySettingsOpen,
    readerPluginSettingsOpen,
  ]);

  /** One page/spread forward or backward in source reading order. */
  // Real-book spine, part 2: a single-step turn in a book-posture spread lifts
  // the page around the fold. The leaves are static copies of the pages; the
  // pager jumps under them (no scroll animation) once they are drawn.
  const readerPageFlip = useDuoPageFlip();
  const [readerPageFlipReady, setReaderPageFlipReady] = useState(false);
  const readerPageFlipPendingRef = useRef<{
    token: number;
    target: number;
    arrival: MobileReaderPageArrival;
    loaded: Set<"outgoing" | "under">;
  } | null>(null);
  const readerPageFlipTokenRef = useRef(0);
  const markReaderPageFlipLeafLoaded = useCallback(
    (token: number, role: "outgoing" | "under" | "incoming") => {
      const pending = readerPageFlipPendingRef.current;
      if (!pending || pending.token !== token || role === "incoming") return;
      pending.loaded.add(role);
      if (pending.loaded.size === 2) setReaderPageFlipReady(true);
    },
    [],
  );
  // Assigned below, once the page geometry helpers exist.
  const startReaderPageFlipRef = useRef<
    (targetPageIndex: number, direction: "previous" | "next", arrival: MobileReaderPageArrival) => boolean
  >(() => false);

  const stepReaderPage = useCallback(
    (direction: "previous" | "next") => {
      if (pageCount <= 0) return;
      const targetPageIndex = isTwoPageMode
        ? pageIndexForMobileReaderSpreadStep(
            readerSpreads,
            clampedPageIndex,
            direction,
          )
        : readerSourceStepTargetForDisplayIndex(
            clampedPageIndex,
            pageCount,
            mode,
            direction,
          );
      const pendingFlip = readerPageFlipPendingRef.current;
      if (pendingFlip) {
        // A flip still waiting for its leaves: land that turn now, plainly.
        readerPageFlipPendingRef.current = null;
        readerPageFlip.finish();
        goToPage(pendingFlip.target, pendingFlip.arrival);
        return;
      }
      if (targetPageIndex == null) {
        // Neither edge is a dead wall: the last page offers the next chapter
        // and the first page steps back into the previous one.
        if (direction === "next") showEndOfChapterPrompt();
        else showPreviousChapterFromEnd();
        return;
      }
      const arrival = direction === "next" ? "forward" : "backward";
      if (startReaderPageFlipRef.current(targetPageIndex, direction, arrival)) return;
      goToPage(targetPageIndex, arrival);
    },
    [
      clampedPageIndex,
      goToPage,
      isTwoPageMode,
      mode,
      pageCount,
      readerPageFlip,
      readerSpreads,
      showEndOfChapterPrompt,
      showPreviousChapterFromEnd,
    ],
  );

  const goToReaderScrubIndex = useCallback(
    (scrubIndex: number) => {
      if (!isTwoPageMode) {
        goToPage(scrubIndex);
        return;
      }
      goToPage(firstPageIndexForMobileReaderSpread(readerSpreads, scrubIndex));
    },
    [goToPage, isTwoPageMode, readerSpreads],
  );
  const getReaderScrubPreviewPageIndex = useCallback(
    (scrubIndex: number) =>
      isTwoPageMode
        ? firstPageIndexForMobileReaderSpread(readerSpreads, scrubIndex)
        : scrubIndex,
    [isTwoPageMode, readerSpreads],
  );

  const beginContinuousReaderScrub = useCallback(() => {
    const progress = readerScrollMetricsRef.current.progress;
    // User interaction cancels the opening timer. Re-arm from a full interval
    // after release so controls never disappear under the active gesture.
    readerChromeAutoHideKeyRef.current = null;
    setContinuousReaderScrubActive(true);
    armReaderProgrammaticScroll({ kind: "scrub" }, 15_000);
    return progress;
  }, [armReaderProgrammaticScroll]);

  const updateContinuousReaderScrub = useCallback((progress: number) => {
    readerScrollRef.current?.scrollToProgress(progress, false);
  }, []);

  const finishContinuousReaderScrub = useCallback(() => {
    // FlatList viewability may arrive just after the last imperative offset.
    // Keep scrub semantics through that bounded settle window, then always
    // release suppression even if native emits no momentum callback.
    settleReaderProgrammaticScroll(350);
    setContinuousReaderScrubActive(false);
  }, [settleReaderProgrammaticScroll]);

  const stepContinuousReaderAccessibility = useCallback(
    (direction: "previous" | "next") => {
      const metrics = readerScrollMetricsRef.current;
      if (!metrics.scrollable || metrics.maximumOffset <= 0) return;
      const action = readerContinuousAccessibilityAction(metrics, direction);
      if (action.kind === "end") {
        if (direction === "next") showEndOfChapterPrompt();
        return;
      }
      readerScrollRef.current?.scrollToProgress(
        action.offset / metrics.maximumOffset,
        true,
      );
    },
    [showEndOfChapterPrompt],
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

  // An OCR request made before the page image has loaded (the transcript
  // opened as the chapter opens): held as "recognising" until it can run.
  const japaneseLearningOcrAwaitingPageRef = useRef<{
    run: number;
    silent: boolean;
  } | null>(null);
  const japaneseLearningOcrPageReadiness = mobileReaderOcrPageReadiness({
    pagesStatus: pagesState.status,
    hasPage: Boolean(currentDisplayedPage),
    hasText: Boolean(currentDisplayedPage?.text?.trim()),
    hasImage: Boolean(currentDisplayedPage?.imageUri),
    imageLoaded: currentImageMetadataReady,
    imageFailed: readerImageErrors.has(currentDisplayedPageIdentity),
    segmentedUnsupported:
      Boolean(currentSegmentedImage) &&
      !MOBILE_READER_SEGMENTED_CAPABILITIES.japaneseLearningImageTools,
  });
  const startJapaneseLearningOcr = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      japaneseLearningOcrAwaitingPageRef.current = null;
      if (japaneseLearningOcrPageReadiness === "waiting") {
        const run = japaneseLearningOcrRunRef.current + 1;
        japaneseLearningOcrRunRef.current = run;
        japaneseLearningOcrAwaitingPageRef.current = { run, silent };
        setJapaneseLearningSelectedDetectionOrder(null);
        setJapaneseLearningOcrState({ status: "loading" });
        return;
      }
      if (japaneseLearningOcrPageReadiness === "unavailable" || !currentDisplayedPage) {
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
      void runMobileJapaneseLearningSpreadOcr(
        japaneseLearningVisiblePages,
        {
          signal,
          onPartialResult: (partial) => {
            if (japaneseLearningOcrRunRef.current !== run) return;
            setJapaneseLearningOcrState({ status: "loading", partial });
          },
        },
        recognizeJapaneseLearningReaderPage,
      )
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
      japaneseLearningOcrPageReadiness,
      japaneseLearningVisiblePages,
      recognizeJapaneseLearningReaderPage,
      strings,
    ],
  );
  useEffect(() => {
    const awaiting = japaneseLearningOcrAwaitingPageRef.current;
    if (!awaiting || japaneseLearningOcrPageReadiness === "waiting") return;
    japaneseLearningOcrAwaitingPageRef.current = null;
    // Superseded (a newer run, or the request was reset meanwhile).
    if (japaneseLearningOcrRunRef.current !== awaiting.run) return;
    if (japaneseLearningOcrState.status !== "loading") return;
    startJapaneseLearningOcr({ silent: awaiting.silent });
  }, [
    japaneseLearningOcrPageReadiness,
    japaneseLearningOcrState.status,
    startJapaneseLearningOcr,
  ]);

  const runJapaneseLearningOcr = useCallback(() => {
    startJapaneseLearningOcr();
  }, [startJapaneseLearningOcr]);

  useEffect(() => {
    if (!japaneseLearningReaderPlugin) return;
    if (
      japaneseLearningReaderPlugin.values.autoDetect !== true &&
      !japaneseLearningVisiblePagesOcrCached
    ) {
      return;
    }
    if (japaneseLearningOcrState.status !== "idle") return;
    if (!currentDisplayedPage) return;
    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri)
      return;
    if (currentDisplayedPage.imageUri && !currentImageMetadataReady) return;

    const pageKey = `${readyFetchedAt}:${japaneseLearningVisiblePageKey}`;
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
    japaneseLearningVisiblePageKey,
    currentImageMetadataReady,
    japaneseLearningOcrState.status,
    japaneseLearningReaderPlugin,
    japaneseLearningVisiblePagesOcrCached,
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
  const readerWasOfflineRef = useRef(false);
  useEffect(() => {
    if (readerConnectivity.resolving) return;
    const restored = readerWasOfflineRef.current && !readerConnectivity.offline;
    readerWasOfflineRef.current = readerConnectivity.offline;
    if (!restored) return;
    if (pagesState.status === "error") {
      setPagesRefreshNonce((value) => value + 1);
    }
    const failedPageIds = [...readerImageErrorsRef.current.keys()];
    if (failedPageIds.length === 0) return;
    setReaderImageRetryNonces((nonces) => {
      const next = new Map(nonces);
      for (const pageId of failedPageIds) {
        next.set(pageId, (next.get(pageId) ?? 0) + 1);
      }
      return next;
    });
    setReaderImageErrors((current) =>
      current.size === 0 ? current : new Map(),
    );
  }, [
    pagesState.status,
    readerConnectivity.offline,
    readerConnectivity.resolving,
  ]);
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
        // QA timeline builds: hold "Analyzing sentence…" long enough to capture.
        if (MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE === "fixture") {
          await new Promise((resolve) => setTimeout(resolve, MOBILE_JAPANESE_LEARNING_QA_ANALYZING_HOLD_MS));
        }
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

  const nextJapaneseLearningChatMessageId = nextMobileJapaneseLearningChatMessageId;

  /** Web `useTtsStore.prefetch(messageId, text, { source: 'voice' })` per voice bubble. */
  const japaneseLearningChatVoicePrefetchRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => japaneseLearningChatVoicePrefetchRef.current?.abort(),
    [],
  );
  const prefetchJapaneseLearningChatVoice = useCallback((ttsText: string) => {
    const text = ttsText.trim();
    if (!text) return;
    if (!japaneseLearningChatVoicePrefetchRef.current) {
      japaneseLearningChatVoicePrefetchRef.current = new AbortController();
    }
    void generateMobileJapaneseLearningTts(text, {
      getAuthCookie: getMobileJapaneseLearningAuthCookie,
      source: "voice",
      signal: japaneseLearningChatVoicePrefetchRef.current.signal,
    }).catch(() => undefined);
  }, []);

  /** Web `createChatStreamCallbacks()` bound to the manga's chat session. */
  const createJapaneseLearningChatStreamController = useCallback(
    () =>
      createMobileJapaneseLearningChatStreamController(
        createMobileJapaneseLearningChatSessionStreamStore(
          japaneseLearningChatSession,
          {
            prefetchVoice: (_messageId, ttsText) =>
              prefetchJapaneseLearningChatVoice(ttsText),
          },
        ),
      ),
    [japaneseLearningChatSession, prefetchJapaneseLearningChatVoice],
  );

  /**
   * Web `executeTool` (chat/service.ts): Nemu reads any page of this chapter
   * off screen and the reader never moves. The tools read the page list at
   * call time — a reply outlives the render that sent it — and the reader
   * leaving cancels whatever page work Nemu still has queued.
   */
  const japaneseLearningChatPagesRef =
    useRef<MobileJapaneseLearningChatPageSnapshot | null>(null);
  useEffect(() => {
    const status = pagesState.status;
    japaneseLearningChatPagesRef.current = {
      status:
        status === "ready"
          ? "ready"
          : status === "loading" || status === "idle"
            ? "loading"
            : "unavailable",
      pages: displayedPages,
      indexForPageNumber: (pageNumber) =>
        Number.isInteger(pageNumber) && pageNumber <= displayedPages.length
          ? readerDisplayIndexForRoutePage(
              pageNumber,
              displayedPages.length,
              mode,
            )
          : null,
      pageKey: japaneseLearningPageOcrKeyFor,
      resolvePage: pageProcessor?.resolvePage
        ? (index, signal) =>
            pageProcessor.resolvePage!(index, { signal, priority: "normal" })
        : undefined,
    };
  }, [
    displayedPages,
    japaneseLearningPageOcrKeyFor,
    mode,
    pageProcessor,
    pagesState.status,
  ]);
  const japaneseLearningChatToolsRef = useRef<ReturnType<
    typeof createMobileJapaneseLearningChatPageTools
  > | null>(null);
  useEffect(() => {
    const lifetime = new AbortController();
    japaneseLearningChatToolsRef.current =
      createMobileJapaneseLearningChatPageTools({
        getSnapshot: () => japaneseLearningChatPagesRef.current,
        lifetimeSignal: lifetime.signal,
      });
    return () => lifetime.abort();
  }, []);
  const executeJapaneseLearningChatTool = useCallback(
    async (
      toolCall: MobileJapaneseLearningChatToolCall,
      options?: { signal: AbortSignal },
    ): Promise<MobileJapaneseLearningChatToolResult> => {
      const execute = japaneseLearningChatToolsRef.current;
      if (!execute) {
        return {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          result: "Page not available in the current chapter.",
          isError: true,
        };
      }
      return execute(toolCall, options);
    },
    [],
  );

  /** Web `buildHiddenContextFromReader`: the OCR transcript when this page has one. */
  const japaneseLearningPageTranscript =
    japaneseLearningOcrState.status === "ready"
      ? japaneseLearningOcrState.result.text.trim() || undefined
      : currentDisplayedPage?.text?.trim() || undefined;

  /** Bumped by every chat request; the sentence → chat handoff keys on it. */
  const [japaneseLearningChatRequestSeq, setJapaneseLearningChatRequestSeq] =
    useState(0);

  /**
   * Web `sendChatMessage` / `sendChatGreeting` (chat/actions.ts). No streaming
   * guard: like web's `streamChat`, a new request cancels the one in flight.
   */
  const startJapaneseLearningChatRequest = useCallback(
    (request: {
      text: string;
      /** Web `displayContent`: the bubble text when it differs from the prompt. */
      displayText?: string;
      /** False for the greeting, whose prompt web sends without storing. */
      storeUserMessage: boolean;
      /** Web `openChatAndSend` one-turn `ephemeralContext`. */
      ephemeralContext?: string;
      /** Transcript override for a page whose OCR result is not in state yet. */
      transcript?: string;
    }) => {
      const prompt = request.text.trim();
      if (!prompt || !chapter) return false;

      const session = japaneseLearningChatSession;
      const existingMessages = mobileJapaneseLearningChatRequestMessages(
        session.getState().messages,
      );
      if (request.storeUserMessage) {
        const userMessage: JapaneseLearningChatThreadMessage = {
          id: nextJapaneseLearningChatMessageId(),
          role: "user",
          text: prompt,
          displayText: request.displayText,
          createdAt: Date.now(),
        };
        session.updateMessages((current) => [...current, userMessage]);
      }
      session.setFollowUps([]);
      session.setStreaming(true);
      // No dots during the initial wait; `onStreamStart` decides.
      session.setShowTypingIndicator(false);
      setJapaneseLearningChatRequestSeq((seq) => seq + 1);

      // The session owns the request, so a chapter change (which remounts
      // this screen) neither aborts it nor loses its answer or error bubble.
      const controller = createJapaneseLearningChatStreamController();
      const inFlight = session.beginRequest(controller);
      controller.onStreamStart();
      const signal = inFlight.signal;

      void runMobileJapaneseLearningChat({
        appLanguage,
        callbacks: {
          onText: controller.onText,
          onSpeak: controller.onSpeak,
          onVoice: controller.onVoice,
          onToolCall: controller.onToolCall,
          onToolsAwaiting: controller.onToolsAwaiting,
          onToolResults: controller.onToolResults,
          onFollowups: controller.onFollowups,
          onActivity: controller.onActivity,
          onContextSnapshot: controller.onContextSnapshot,
          onDone: controller.onDone,
          onError: controller.onError,
        },
        chapter,
        ephemeralContext: request.ephemeralContext,
        executeTool: executeJapaneseLearningChatTool,
        getAuthCookie: getMobileJapaneseLearningAuthCookie,
        mangaGenres: state.entry?.item.metadata.tags,
        mangaTitle: mangaTitle ?? "",
        messages: [...existingMessages, { role: "user", content: prompt }],
        // Web `truncateOldestHalf`: the visible thread loses its oldest half
        // too, so the next turn does not hit the limit again.
        onContextTooLong: () => {
          session.updateMessages(truncateMobileJapaneseLearningChatOldestHalf);
          return mobileJapaneseLearningChatContextRetryMessages(
            session.getState().messages,
            prompt,
            request.storeUserMessage,
          );
        },
        pageCount,
        pageNumber: sourcePageNumber || clampedPageIndex + 1,
        plugin: activeReaderPlugin,
        prompt,
        signal,
        transcript: request.transcript ?? japaneseLearningPageTranscript,
      }).then(
        () => {
          if (!inFlight.finish()) return;
          // Web: a stream that ends without an explicit `done` still finishes.
          if (!controller.isCompleted()) controller.onDone();
        },
        (error: unknown) => {
          if (!inFlight.finish()) return;
          // A stream `error` event already produced its bubble via `onError`.
          if (controller.isCompleted()) return;
          controller.onError(
            isMobileJapaneseLearningSignInRequiredError(error)
              ? MOBILE_JAPANESE_LEARNING_CHAT_SIGN_IN_ERROR
              : "",
          );
        },
      );
      return true;
    },
    [
      activeReaderPlugin,
      appLanguage,
      chapter,
      clampedPageIndex,
      createJapaneseLearningChatStreamController,
      executeJapaneseLearningChatTool,
      japaneseLearningPageTranscript,
      nextJapaneseLearningChatMessageId,
      pageCount,
      sourcePageNumber,
      state.entry?.item.metadata.tags,
      mangaTitle,
      japaneseLearningChatSession,
    ],
  );

  const askJapaneseLearningGrammarSelection = useCallback(
    (text: string, kind: "sentence" | "word" | "words") => {
      const selectedText = text.trim();
      if (!selectedText) return;

      const responseMode = parseMobileJapaneseLearningResponseMode(
        activeReaderPlugin?.values.nemuResponseMode,
      );
      setJapaneseLearningGrammarActionNotice(null);
      // Web `openChatAndSend(message, displayContent, { ephemeralContext })`.
      startJapaneseLearningChatRequest({
        text: getMobileJapaneseLearningExplainPrompt(
          appLanguage,
          responseMode,
          kind,
          selectedText,
        ),
        displayText: getExplainDisplayPrompt(appLanguage, kind, selectedText),
        storeUserMessage: true,
        ephemeralContext: japaneseLearningGrammarContext,
      });
    },
    [
      activeReaderPlugin,
      appLanguage,
      japaneseLearningGrammarContext,
      startJapaneseLearningChatRequest,
    ],
  );

  /** Web `sendChatGreeting`: the greeting prompt is sent but never stored. */
  const runJapaneseLearningChat = useCallback(() => {
    const responseMode = parseMobileJapaneseLearningResponseMode(
      activeReaderPlugin?.values.nemuResponseMode,
    );
    startJapaneseLearningChatRequest({
      text: getGreetingPrompt(appLanguage, responseMode),
      storeUserMessage: false,
    });
  }, [appLanguage, activeReaderPlugin, startJapaneseLearningChatRequest]);

  /** Web drawer `sendMessage` (haptic, clear the draft, stream). */
  const sendJapaneseLearningChatInput = useCallback(() => {
    const prompt = japaneseLearningChatInput.trim();
    if (!prompt) return;
    void hapticPress();
    setJapaneseLearningChatInput("");
    startJapaneseLearningChatRequest({ text: prompt, storeUserMessage: true });
  }, [japaneseLearningChatInput, startJapaneseLearningChatRequest]);

  const sendJapaneseLearningChatSuggestion = useCallback(
    (suggestion: string) => {
      const prompt = suggestion.trim();
      if (!prompt) return;
      void hapticPress();
      setJapaneseLearningChatInput("");
      startJapaneseLearningChatRequest({ text: prompt, storeUserMessage: true });
    },
    [startJapaneseLearningChatRequest],
  );

  const openJapaneseLearningSurfaceAfterLauncher = useCallback(
    (surface: "transcript" | "chat") => {
      // The native launcher remains physically interactive while its dismissal
      // animates. The first accepted destination owns that visibility cycle.
      if (japaneseLearningLauncherNextSurfaceRef.current) return;
      if (japaneseLearningLauncherVisible) {
        japaneseLearningLauncherNextSurfaceRef.current = surface;
        setJapaneseLearningLauncherVisible(false);
        return;
      }
      if (surface === "transcript") {
        setJapaneseLearningTranscriptVisible(true);
      } else {
        setJapaneseLearningChatDrawerVisible(true);
      }
    },
    [japaneseLearningLauncherVisible, setJapaneseLearningChatDrawerVisible],
  );

  const handleJapaneseLearningLauncherClosed = useCallback(() => {
    setJapaneseLearningLauncherVisible(false);
    const nextSurface = japaneseLearningLauncherNextSurfaceRef.current;
    japaneseLearningLauncherNextSurfaceRef.current = null;
    if (nextSurface === "transcript") {
      setJapaneseLearningTranscriptVisible(true);
    } else if (nextSurface === "chat") {
      setJapaneseLearningChatDrawerVisible(true);
    }
  }, [setJapaneseLearningChatDrawerVisible]);

  const openJapaneseLearningDetectionTool = useCallback(() => {
    openJapaneseLearningSurfaceAfterLauncher("transcript");
    if (
      japaneseLearningOcrState.status !== "loading" &&
      japaneseLearningOcrState.status !== "ready"
    ) {
      runJapaneseLearningOcr();
    } else {
      void hapticPress();
    }
  }, [
    japaneseLearningOcrState.status,
    openJapaneseLearningSurfaceAfterLauncher,
    runJapaneseLearningOcr,
  ]);

  /** Web `handleNemuChatClick`: open, and greet only an empty, idle chat. */
  const openJapaneseLearningChatTool = useCallback(() => {
    if (
      !japaneseLearningChatStreaming &&
      japaneseLearningChatSession.getState().messages.length === 0
    ) {
      runJapaneseLearningChat();
    } else {
      void hapticPress();
    }
    openJapaneseLearningSurfaceAfterLauncher("chat");
  }, [
    japaneseLearningChatSession,
    japaneseLearningChatStreaming,
    openJapaneseLearningSurfaceAfterLauncher,
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
      void hapticError();
      return;
    }

    const existingSentenceText = getJapaneseLearningSentenceText();
    if (existingSentenceText) {
      askJapaneseLearningGrammarSelection(existingSentenceText, "sentence");
      return;
    }

    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri) {
      void hapticError();
      return;
    }

    // Mobile-only: Ask before the page was scanned reads the sentence first,
    // then asks Nemu exactly as the sentence view's Ask does.
    const ocrRun = japaneseLearningOcrRunRef.current + 1;
    japaneseLearningOcrRunRef.current = ocrRun;
    setJapaneseLearningOcrState({ status: "loading" });
    const signal = japaneseLearningLifecycleRef.current!.begin("ocr");
    void runMobileJapaneseLearningSpreadOcr(
      japaneseLearningVisiblePages,
      { signal },
      recognizeJapaneseLearningReaderPage,
    )
      .then((ocrResult) => {
        if (japaneseLearningOcrRunRef.current !== ocrRun) return;
        setJapaneseLearningOcrState({ status: "ready", result: ocrResult });
        const sentenceText = mobileJapaneseLearningSentenceText(
          ocrResult,
          japaneseLearningSelectedDetectionOrder,
        );
        if (!sentenceText) {
          void hapticError();
          return;
        }
        const responseMode = parseMobileJapaneseLearningResponseMode(
          activeReaderPlugin?.values.nemuResponseMode,
        );
        startJapaneseLearningChatRequest({
          text: getMobileJapaneseLearningExplainPrompt(
            appLanguage,
            responseMode,
            "sentence",
            sentenceText,
          ),
          displayText: getExplainDisplayPrompt(appLanguage, "sentence", sentenceText),
          storeUserMessage: true,
          ephemeralContext: japaneseLearningGrammarContext,
          transcript: ocrResult.text.trim() || undefined,
        });
      })
      .catch((error: unknown) => {
        if (japaneseLearningOcrRunRef.current !== ocrRun) return;
        setJapaneseLearningOcrState({
          status: "error",
          detail: readerErrorDetail(
            error,
            strings.reader.pluginJapaneseLearningOcrFailed,
            strings,
          ),
        });
        void hapticError();
      });
  }, [
    activeReaderPlugin,
    appLanguage,
    askJapaneseLearningGrammarSelection,
    currentDisplayedPage,
    japaneseLearningVisiblePages,
    getJapaneseLearningSentenceText,
    recognizeJapaneseLearningReaderPage,
    japaneseLearningGrammarContext,
    japaneseLearningSelectedDetectionOrder,
    startJapaneseLearningChatRequest,
    strings,
  ]);

  const selectJapaneseLearningDetection = useCallback(
    (detection: MobileOcrDetection) => {
      // The transcript remains physically interactive during its native close.
      // The first row tapped owns the OCR transition and selected detection.
      if (japaneseLearningTranscriptNextSurfaceRef.current) return;
      if (!japaneseLearningOcrSheetVisible && !japaneseLearningChatDrawerVisible) {
        japaneseLearningOcrProgress.value = 0;
        japaneseLearningChatProgress.value = 0;
      }
      setJapaneseLearningSelectedDetectionOrder(detection.order);
      if (japaneseLearningTranscriptVisible) {
        japaneseLearningTranscriptNextSurfaceRef.current = "ocr";
        setJapaneseLearningTranscriptVisible(false);
      } else {
        setJapaneseLearningOcrSheetVisible(true);
      }
      runJapaneseLearningGrammar(detection.text);
    },
    [japaneseLearningTranscriptVisible, japaneseLearningOcrSheetVisible, setJapaneseLearningOcrSheetVisible,
      japaneseLearningChatDrawerVisible, japaneseLearningOcrProgress,
      japaneseLearningChatProgress, runJapaneseLearningGrammar],
  );

  const handleJapaneseLearningTranscriptClosed = useCallback(() => {
    setJapaneseLearningTranscriptVisible(false);
    const nextSurface = japaneseLearningTranscriptNextSurfaceRef.current;
    japaneseLearningTranscriptNextSurfaceRef.current = null;
    if (nextSurface === "ocr") setJapaneseLearningOcrSheetVisible(true);
  }, [setJapaneseLearningOcrSheetVisible]);

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

  const closeJapaneseLearningOcrSheet = useCallback(() => {
    if (
      japaneseLearningTtsState.status !== "idle" &&
      japaneseLearningTtsState.source === "sentence"
    ) {
      // Match the web drawer lifecycle: sentence audio has no visible stop
      // control once this surface closes, so abort loading/playback and clear
      // a sentence-scoped error before dismissing it.
      stopJapaneseLearningTts();
    }
    setJapaneseLearningOcrSheetVisible(false);
  }, [japaneseLearningTtsState, setJapaneseLearningOcrSheetVisible, stopJapaneseLearningTts]);

  // Web parity (`openChatAndSend` opens the chat drawer over the sentence
  // sheet): when a chat request starts while the sentence view is open, the
  // conversation replaces it, sheet after sheet (a native sheet must finish
  // dismissing before the next presents). Closing the chat then brings the
  // same sentence back, as uncovering it does on web.
  const japaneseLearningOcrNextSurfaceRef = useRef<"chat" | null>(null);
  const japaneseLearningChatNextSurfaceRef = useRef<"ocr" | null>(null);
  const [japaneseLearningChatReturnsToSentence, setJapaneseLearningChatReturnsToSentence] = useState(false);
  const japaneseLearningChatHandledRequestSeqRef = useRef(japaneseLearningChatRequestSeq);
  useEffect(() => {
    const started =
      japaneseLearningChatRequestSeq !== japaneseLearningChatHandledRequestSeqRef.current;
    japaneseLearningChatHandledRequestSeqRef.current = japaneseLearningChatRequestSeq;
    if (!started) return;
    if (!japaneseLearningOcrSheetVisible || japaneseLearningChatDrawerVisible) return;
    setJapaneseLearningChatReturnsToSentence(true);
    japaneseLearningOcrNextSurfaceRef.current = "chat";
    setJapaneseLearningOcrSheetVisible(false);
  }, [
    setJapaneseLearningOcrSheetVisible,
    japaneseLearningChatDrawerVisible,
    japaneseLearningChatRequestSeq,
    japaneseLearningOcrSheetVisible,
  ]);
  // Web text popout: the selected bubble cropped from the page image.
  const japaneseLearningBubbleSource = useMemo(() => {
    if (japaneseLearningOcrState.status !== "ready") return null;
    if (japaneseLearningOcrState.result.source !== "ocr") return null;
    if (japaneseLearningSelectedDetectionOrder == null) return null;
    const detection = japaneseLearningOcrState.result.detections.find(
      (entry) => entry.order === japaneseLearningSelectedDetectionOrder,
    );
    const page = detection?.pageId
      ? japaneseLearningVisiblePages.find((entry) => entry.id === detection.pageId)
      : currentDisplayedPage;
    if (!detection || !page?.imageUri) return null;
    // A tile page of a segmented strip carries its own pixel size.
    const naturalSize =
      readerSegmentOcrImageSizes?.get(page.id) ??
      readerImageSizes.get(readerPageIdentityFor(page));
    if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) return null;
    return {
      imageUri: page.imageUri,
      headers: page.headers,
      uriOwnership: page.imageUriOwnership ?? ("source" as const),
      naturalSize,
      box: detection,
      boxSpace: detection.imageSize ?? japaneseLearningOcrState.result.imageSize,
    };
  }, [
    currentDisplayedPage,
    japaneseLearningVisiblePages,
    japaneseLearningOcrState,
    japaneseLearningSelectedDetectionOrder,
    readerImageSizes,
    readerPageIdentityFor,
    readerSegmentOcrImageSizes,
  ]);
  const japaneseLearningPresentationProgress = useDerivedValue(() =>
    Math.max(japaneseLearningOcrProgress.value, japaneseLearningChatProgress.value),
  );
  // The popout rides the chat only when that chat was opened from this
  // bubble's sentence (Ask). Decided when the chat presents, and kept through
  // its dismissal so the popout fades out with the sheet.
  const [japaneseLearningChatFromSentence, setJapaneseLearningChatFromSentence] =
    useState(false);
  useEffect(() => {
    if (!japaneseLearningChatDrawerVisible) return;
    setJapaneseLearningChatFromSentence(japaneseLearningChatReturnsToSentence);
  }, [japaneseLearningChatDrawerVisible, japaneseLearningChatReturnsToSentence]);
  // The bubble an Ask chat is about outlives the page-scoped OCR: a rotation
  // or fold that changes the visible pages (a Duo spread becoming one page)
  // resets detection under the open chat, and the popout must stay.
  const [japaneseLearningLastBubbleSource, setJapaneseLearningLastBubbleSource] =
    useState<typeof japaneseLearningBubbleSource>(null);
  useEffect(() => {
    if (japaneseLearningBubbleSource) setJapaneseLearningLastBubbleSource(japaneseLearningBubbleSource);
  }, [japaneseLearningBubbleSource]);
  // iPhone Duo outer display: a learning sheet spans the system vertical
  // bar's column, and the reader's bar items under it peeked out past the
  // sheet's rounded corner. They are unreachable under the sheet anyway, so
  // they step aside while one is up and return with the controls after.
  const readerBarItemsHidden =
    !showControls ||
    japaneseLearningLauncherVisible ||
    japaneseLearningOcrSheetVisible ||
    japaneseLearningChatDrawerVisible ||
    japaneseLearningTranscriptVisible;
  const japaneseLearningPopoutBubbleSource =
    japaneseLearningBubbleSource ??
    (japaneseLearningChatFromSentence && !japaneseLearningOcrSheetVisible
      ? japaneseLearningLastBubbleSource
      : null);
  const japaneseLearningBubblePopoutPresentationProgress = useDerivedValue(
    () =>
      japaneseLearningBubblePopoutProgress(
        japaneseLearningOcrProgress.value,
        japaneseLearningChatProgress.value,
        japaneseLearningChatFromSentence,
      ),
    [japaneseLearningChatFromSentence],
  );
  const japaneseLearningBubblePopoutPresented =
    isJapaneseLearningBubblePopoutPresented({
      ocrSheetVisible: japaneseLearningOcrSheetVisible,
      chatVisible: japaneseLearningChatDrawerVisible,
      chatOpenedFromSentence: japaneseLearningChatFromSentence,
    });

  // Native samples drive the overlay only while their sheet is on screen:
  // the last few of a dismissal can reach JS after the sheet reported itself
  // gone, and the final 0 never does (see `mobileJapaneseLearningSheetPresence`).
  const handleJapaneseLearningOcrProgress = useCallback((progress: number) => {
    const sample = japaneseLearningSheetProgressSample(
      japaneseLearningOcrSheetPresenceRef.current,
      progress,
    );
    if (sample === null) return;
    japaneseLearningOcrProgress.value = Platform.OS === "ios"
      ? sample
      : withSpring(sample, { stiffness: 500, damping: 30 });
  }, [japaneseLearningOcrProgress]);
  const handleJapaneseLearningChatProgress = useCallback((progress: number) => {
    const sample = japaneseLearningSheetProgressSample(
      japaneseLearningChatDrawerPresenceRef.current,
      progress,
    );
    if (sample === null) return;
    japaneseLearningChatProgress.value = Platform.OS === "ios"
      ? sample
      : withSpring(sample, { stiffness: 500, damping: 30 });
  }, [japaneseLearningChatProgress]);
  // Web `closeOcrSheet`: the bubble is no longer selected (its popout cannot
  // resurface over the reader or an unrelated chat later on this page), and
  // its analysis stops, so a late result never lands on a closed sheet.
  const releaseJapaneseLearningSentenceSelection = useCallback(() => {
    japaneseLearningLifecycleRef.current?.abort("grammar");
    japaneseLearningGrammarRunRef.current += 1;
    setJapaneseLearningGrammarState({ status: "idle" });
    setJapaneseLearningGrammarActionNotice(null);
    setSelectedJapaneseLearningGrammarTokenIndex(null);
    setJapaneseLearningSelectedDetectionOrder(null);
  }, []);
  const handleJapaneseLearningOcrSheetDismissed = useCallback(() => {
    const dismissal = resolveJapaneseLearningSentenceSheetDismissal({
      presence: japaneseLearningOcrSheetPresenceRef.current,
      handsOffToChat: japaneseLearningOcrNextSurfaceRef.current === "chat",
      transcriptReopensSentence: japaneseLearningTranscriptNextSurfaceRef.current === "ocr",
    });
    japaneseLearningOcrSheetPresenceRef.current = dismissal.presence;
    // The sheet is gone: the backdrop and the popout drop to 0 whatever the
    // last sample that reached JS said, and later samples are ignored.
    if (dismissal.resetProgress) japaneseLearningOcrProgress.value = 0;
    if (dismissal.releaseSelection) releaseJapaneseLearningSentenceSelection();
    if (!dismissal.presentChat) return;
    japaneseLearningOcrNextSurfaceRef.current = null;
    setJapaneseLearningChatDrawerVisible(true);
  }, [
    japaneseLearningOcrProgress,
    releaseJapaneseLearningSentenceSelection,
    setJapaneseLearningChatDrawerVisible,
  ]);
  const handleJapaneseLearningChatDismissed = useCallback(() => {
    const dismissal = resolveJapaneseLearningChatDismissal({
      presence: japaneseLearningChatDrawerPresenceRef.current,
      returnsToSentence: japaneseLearningChatNextSurfaceRef.current === "ocr",
      sentenceWanted: japaneseLearningOcrSheetPresenceRef.current.wanted,
    });
    japaneseLearningChatDrawerPresenceRef.current = dismissal.presence;
    if (dismissal.resetProgress) japaneseLearningChatProgress.value = 0;
    if (dismissal.releaseSelection) {
      // An Ask chat closed for good (e.g. the reader lost focus): the bubble
      // it was about leaves with it instead of floating over a later chat.
      setJapaneseLearningChatFromSentence(false);
      setJapaneseLearningLastBubbleSource(null);
      releaseJapaneseLearningSentenceSelection();
    }
    if (!dismissal.presentSentence) return;
    japaneseLearningChatNextSurfaceRef.current = null;
    setJapaneseLearningOcrSheetVisible(true);
  }, [
    japaneseLearningChatProgress,
    releaseJapaneseLearningSentenceSelection,
    setJapaneseLearningOcrSheetVisible,
  ]);
  // Web drawer has no Back: closing it uncovers whatever was underneath —
  // the sentence sheet when the chat was opened from it, else the reader.
  const closeJapaneseLearningChatDrawer = useCallback(() => {
    japaneseLearningChatNextSurfaceRef.current = japaneseLearningChatReturnsToSentence
      ? "ocr"
      : null;
    setJapaneseLearningChatReturnsToSentence(false);
    setJapaneseLearningChatDrawerVisible(false);
  }, [japaneseLearningChatReturnsToSentence, setJapaneseLearningChatDrawerVisible]);
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
        source: "sentence",
        detail: strings.reader.pluginJapaneseLearningNoImage,
      });
      void hapticError();
      return;
    }

    if (!currentDisplayedPage.text?.trim() && !currentDisplayedPage.imageUri) {
      setJapaneseLearningTtsState({
        status: "error",
        source: "sentence",
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
        ocrResult = await runMobileJapaneseLearningSpreadOcr(
          japaneseLearningVisiblePages,
          { signal },
          recognizeJapaneseLearningReaderPage,
        );
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
        getAuthCookie: getMobileJapaneseLearningAuthCookie,
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
        isMobileJapaneseLearningSignInRequiredError(error)
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
      setJapaneseLearningTtsState({
        status: "error",
        source: "sentence",
        detail,
      });
      void hapticError();
    });
  }, [
    currentDisplayedPage,
    japaneseLearningVisiblePages,
    japaneseLearningOcrState,
    japaneseLearningSelectedDetectionOrder,
    recognizeJapaneseLearningReaderPage,
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
          source: "transcript",
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
          source: "transcript",
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
          getAuthCookie: getMobileJapaneseLearningAuthCookie,
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
          source: "transcript",
          detail:
            isMobileJapaneseLearningSignInRequiredError(error)
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
          getAuthCookie: getMobileJapaneseLearningAuthCookie,
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
                  japaneseLearningChatSession.getState().messages.findIndex(
                    (item) => item.id === message.id,
                  );
                const nextMessage =
                  currentIndex >= 0
                    ? japaneseLearningChatSession.getState().messages
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
          source: "chat",
          messageId: message.id,
          detail:
            isMobileJapaneseLearningSignInRequiredError(error)
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
    [japaneseLearningChatSession, strings],
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
    const effectStrings = getMobileStrings(appLanguage);

    // Opening a chapter no longer waits on the library/progress reads in
    // `load()`: the request identity is fully known from the route params and
    // the installed source, so the source request runs in parallel with SQLite
    // and only the restore-to-last-page step below waits for progress. The
    // installed-source list comes from `useInstalledSources()` — gate on its
    // load state instead of re-reading the table here.
    if (installedReaderSources.loading) return;

    const pageListCacheKey = makeMobileReaderPagesPrefetchKey({
      registryId,
      sourceId,
      mangaId,
      chapterId,
      processPageImages,
    });
    const pagesRequestKey = `${pageListCacheKey}:${pagesRefreshNonce}:${appLanguage}`;
    // Reading mode, theme, and similar settings writes re-run this effect
    // (through the installed-sources revision) without changing what should be
    // on screen. Only a changed request key may reset the rendered pages.
    if (readerPagesLoadedKeyRef.current === pagesRequestKey) {
      return;
    }
    // A re-render that keeps the same request identity (the library/progress
    // reads landing, a settings write) must ride the request already in
    // flight instead of firing a second one at the source.
    if (readerPagesInFlightKeyRef.current === pagesRequestKey) {
      return;
    }

    const requestRun = readerPagesRequestRunRef.current + 1;
    readerPagesRequestRunRef.current = requestRun;
    readerPagesInFlightKeyRef.current = pagesRequestKey;

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
      let restoredPersistedPageList = false;
      try {
        const installedSource = selectedInstalledSource;

        if (!installedSource) {
          if (readerPagesRequestRunRef.current === requestRun) {
            setPagesState({
              status: "blocked",
              pages: [],
              detail: effectStrings.reader.sourcePackageUnavailable,
            });
          }
          return;
        }

        const persisted = await loadMobileReaderPageListCache(pageListCacheKey);
        if (persisted && readerPagesRequestRunRef.current === requestRun) {
          restoredPersistedPageList = true;
          readerPagesLoadedKeyRef.current = pagesRequestKey;
          setPagesState({
            status: "ready",
            pages: persisted.pages,
            chapters: persisted.chapters,
            detail: formatReaderLoadedPages(
              persisted.pages.length,
              effectStrings,
            ),
            fetchedAt: persisted.fetchedAt,
            chapter: persisted.chapter,
          });
        }

        // A background chapter-turn prefetch (started while the previous
        // chapter was being read) makes this render without a network wait.
        const prefetched = mobileReaderPagesPrefetchCache.take(
          makeMobileReaderPagesPrefetchKey({
            registryId,
            sourceId,
            mangaId,
            chapterId,
            processPageImages,
          }),
        );
        const refreshed =
          (prefetched ? await prefetched : null) ??
          (await refreshMobileReaderPages(
            installedSource,
            mangaId,
            sourceChapterForRequest,
            {
              getSourceSettings: getReaderSourceSettings,
              onSourcePackageHydrated: saveReaderSourcePackageHydration,
              processPageImages,
              // Paint the chapter as soon as its page list lands; the chapter
              // index only feeds adjacent-chapter navigation and arrives in
              // the final result a moment later with the same `fetchedAt`.
              onPagesReady: (firstPaint) => {
                if (readerPagesRequestRunRef.current !== requestRun) return;
                setPagesState({
                  status: "ready",
                  pages: firstPaint.pages,
                  pageProcessor: firstPaint.pageProcessor,
                  chapters: [],
                  detail: formatReaderLoadedPages(
                    firstPaint.pages.length,
                    effectStrings,
                  ),
                  fetchedAt: firstPaint.fetchedAt,
                  chapter: firstPaint.chapter,
                });
              },
            },
          ));

        if (readerPagesRequestRunRef.current !== requestRun) return;
        if (refreshed.status === "blocked") {
          // The executor's refusal detail is an English log line (for a
          // disabled source it carries the `[source-disabled]` marker); the
          // user reads the localized presentation, never that text. A disabled
          // source is a known app state, not a blocked request, so it does not
          // get the "reinstall or update settings" hint either.
          const blockedPresentation = getMobileSourceErrorPresentation(
            refreshed.detail,
            effectStrings,
          );
          setPagesState(
            blockedPresentation.kind === "disabled"
              ? {
                  status: "error",
                  pages: [],
                  title: blockedPresentation.title,
                  detail: blockedPresentation.detail,
                }
              : {
                  status: "blocked",
                  pages: [],
                  detail: refreshed.detail,
                },
          );
          return;
        }

        readerPagesLoadedKeyRef.current = pagesRequestKey;
        // A locked chapter that some sources answer with an empty page list
        // is the same dead end as one they refuse outright.
        if (
          refreshed.pages.length === 0 &&
          isMobileReaderLockedChapterFailure({
            chapter: refreshed.chapter.locked
              ? refreshed.chapter
              : sourceChapterForRequest,
          })
        ) {
          setPagesState({
            ...getMobileReaderLockedChapterState(effectStrings),
            pages: [],
          });
          return;
        }
        // A failed chapter-index request comes back as `chapters: []` for that
        // reason alone. Neither the cache nor the live state may take that
        // emptiness: the cache would serve an empty chapter list for its whole
        // life, and the reader would lose adjacent-chapter navigation for the
        // rest of the session.
        const cacheableChapters = resolveMobileReaderChapterIndex({
          chapterIndexStatus: refreshed.chapterIndexStatus,
          chapters: refreshed.chapters,
          persistedChapters: persisted?.chapters,
        });
        if (cacheableChapters) {
          void saveMobileReaderPageListCache(pageListCacheKey, {
            pages: refreshed.pages,
            chapters: cacheableChapters,
            chapter: refreshed.chapter,
            fetchedAt: refreshed.fetchedAt,
          }).catch(() => undefined);
        }
        setPagesState((previous) => ({
          status: "ready",
          pages: refreshed.pages,
          pageProcessor: refreshed.pageProcessor,
          chapters:
            resolveMobileReaderChapterIndex({
              chapterIndexStatus: refreshed.chapterIndexStatus,
              chapters: refreshed.chapters,
              previousChapters:
                previous.status === "ready" ? previous.chapters : undefined,
              persistedChapters: persisted?.chapters,
            }) ?? [],
          detail: formatReaderLoadedPages(
            refreshed.pages.length,
            effectStrings,
          ),
          fetchedAt: refreshed.fetchedAt,
          chapter: refreshed.chapter,
        }));
      } catch (nextError) {
        if (readerPagesRequestRunRef.current !== requestRun) return;
        if (restoredPersistedPageList) return;
        cloudflareSheetRef.current?.reportError(nextError, {
          sourceKey: selectedInstalledSource
            ? makeMobileRuntimeSourceKey(
                normalizeInstalledSource(selectedInstalledSource),
              )
            : undefined,
          userAgent: readMobileCloudflareUserAgent(nextError),
        });
        if (
          isMobileReaderLockedChapterFailure({
            chapter: sourceChapterForRequest,
            error: nextError,
          })
        ) {
          setPagesState({
            ...getMobileReaderLockedChapterState(effectStrings),
            pages: [],
          });
          return;
        }
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
      } finally {
        if (readerPagesInFlightKeyRef.current === pagesRequestKey) {
          readerPagesInFlightKeyRef.current = null;
        }
      }
    })();

    // No teardown flag: this request is owned by `readerPagesRequestRunRef`,
    // so a same-key re-render keeps it, a new key supersedes it, and unmount
    // invalidates every run (see the effect below).
    return;
  }, [
    appLanguage,
    chapterId,
    installedReaderSources.loading,
    mangaId,
    pagesRefreshNonce,
    processPageImages,
    registryId,
    selectedInstalledSource,
    sourceChapterForRequest,
    sourceId,
    getReaderSourceSettings,
    saveReaderSourcePackageHydration,
  ]);

  // Unmounting invalidates whichever page-list request is still in flight.
  useEffect(() => {
    return () => {
      readerPagesRequestRunRef.current = -1;
      readerPagesInFlightKeyRef.current = null;
    };
  }, []);

  // Once the current chapter renders, warm the next chapter's page list in
  // the background so turning the chapter never waits on the source. Delayed
  // so it cannot compete with the current chapter's first page images.
  useEffect(() => {
    if (pagesState.status !== "ready") return;
    const nextChapter = nextChapterInReadingOrder;
    if (!nextChapter || nextChapter.locked) return;

    const installedSource = selectedInstalledSource;
    if (!installedSource) return;

    const timeout = setTimeout(() => {
      try {
        mobileReaderPagesPrefetchCache.start(
          makeMobileReaderPagesPrefetchKey({
            registryId,
            sourceId,
            mangaId,
            chapterId: nextChapter.id,
            processPageImages,
          }),
          () =>
            refreshMobileReaderPages(installedSource, mangaId, nextChapter, {
              getSourceSettings: getReaderSourceSettings,
              onSourcePackageHydrated: saveReaderSourcePackageHydration,
              processPageImages,
              // A warm-up: the current chapter's own page work goes first.
              priority: "normal",
            }),
          disposeMobileReaderPagesPrefetchResult,
        );
      } catch {
        // A failed warmup must never surface; the chapter turn falls back
        // to the normal load path.
      }
    }, MOBILE_READER_NEXT_CHAPTER_PREFETCH_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [
    getReaderSourceSettings,
    mangaId,
    nextChapterInReadingOrder,
    pagesState.status,
    processPageImages,
    registryId,
    saveReaderSourcePackageHydration,
    selectedInstalledSource,
    sourceId,
  ]);

  // Page-image prefetch: warm the on-disk page cache for the next pages, the
  // previous one and, near the end, the next chapter's opening pages, through
  // the same cache key/headers/native decoration a mounted page uses. Only
  // pages near the current one are ever mounted, so without this every swipe
  // after a cache clear waited on the network.
  const [readerImagePrefetcher] = useState(
    () =>
      new MobileReaderImagePrefetcher((image, signal) =>
        resolveCachedMobileImageUri(
          { uri: image.uri, headers: image.headers, cacheKind: "page" },
          undefined,
          undefined,
          { priority: "prefetch", signal },
        ),
      ),
  );
  useEffect(() => () => readerImagePrefetcher.cancelAll(), [
    readerImagePrefetcher,
  ]);
  const [nextChapterPrefetchPages, setNextChapterPrefetchPages] = useState<{
    key: string;
    pages: MobileReaderPage[];
  } | null>(null);
  const nextChapterPrefetchKey = nextChapterInReadingOrder
    ? makeMobileReaderPagesPrefetchKey({
        registryId,
        sourceId,
        mangaId,
        chapterId: nextChapterInReadingOrder.id,
        processPageImages,
      })
    : null;
  const [nextChapterPrefetchRetry, setNextChapterPrefetchRetry] = useState({
    key: nextChapterPrefetchKey,
    count: 0,
  });
  const nearChapterEnd =
    pagesState.status === "ready" &&
    shouldPrefetchMobileReaderNextChapter({
      pageCount,
      currentIndex: clampedPageIndex,
    });
  useEffect(() => {
    const nextChapter = nextChapterInReadingOrder;
    if (!nearChapterEnd || !nextChapter || nextChapter.locked || !nextChapterPrefetchKey) return;
    if (nextChapterPrefetchPages?.key === nextChapterPrefetchKey) return;
    // Read-only look at the background page-list prefetch: the chapter turn
    // still takes (and owns) that result.
    const pending = mobileReaderPagesPrefetchCache.peek(nextChapterPrefetchKey);
    if (!pending) {
      // The page-list warmup starts a moment after the chapter renders; look
      // again once it has had the chance to begin.
      const retryCount = nextChapterPrefetchRetry.key === nextChapterPrefetchKey
        ? nextChapterPrefetchRetry.count
        : 0;
      if (retryCount >= 3) return;
      const timer = setTimeout(
        () => setNextChapterPrefetchRetry({
          key: nextChapterPrefetchKey,
          count: retryCount + 1,
        }),
        MOBILE_READER_NEXT_CHAPTER_PREFETCH_DELAY_MS,
      );
      return () => clearTimeout(timer);
    }
    let active = true;
    void pending.then((result) => {
      if (!active || result?.status !== "ready") return;
      setNextChapterPrefetchPages({
        key: nextChapterPrefetchKey,
        pages: result.pages,
      });
    });
    return () => {
      active = false;
    };
  }, [
    mangaId,
    nearChapterEnd,
    nextChapterInReadingOrder,
    nextChapterPrefetchKey,
    nextChapterPrefetchPages?.key,
    nextChapterPrefetchRetry,
    processPageImages,
    registryId,
    sourceId,
  ]);
  useEffect(() => {
    if (pagesState.status !== "ready") {
      readerImagePrefetcher.cancelAll();
      return;
    }
    // The page on screen gets the bandwidth first: until its image has
    // loaded (or failed) nothing is prefetched, and prefetches from the
    // previous position are released. A load the mounted page shares keeps
    // running under the page's own request.
    const currentPage = pages[clampedPageIndex];
    const currentPageIdentity = currentPage
      ? readerPageIdentityFor(currentPage)
      : null;
    if (
      currentPage?.imageUri &&
      currentPageIdentity &&
      !readerImageSizes.has(currentPageIdentity) &&
      !readerImageErrors.has(currentPageIdentity)
    ) {
      readerImagePrefetcher.update([]);
      return;
    }
    // Settle first: a fast scrub or swipe run should not queue downloads for
    // every page it passes.
    const timer = setTimeout(() => {
      const nextChapterPages =
        nearChapterEnd &&
        nextChapterPrefetchPages &&
        nextChapterPrefetchPages.key === nextChapterPrefetchKey
          ? planMobileReaderNextChapterPrefetch(nextChapterPrefetchPages.pages)
          : [];
      readerImagePrefetcher.update([
        ...planMobileReaderPagePrefetch({
          pages,
          currentIndex: clampedPageIndex,
          // A spread turn back needs the whole previous spread warm.
          behind: mobileReaderPrefetchPagesBehind(isTwoPageMode, MOBILE_READER_PREFETCH_PAGES_BEHIND),
        }),
        ...nextChapterPages,
      ]);
    }, 250);
    return () => clearTimeout(timer);
  }, [
    clampedPageIndex,
    isTwoPageMode,
    nearChapterEnd,
    nextChapterPrefetchKey,
    nextChapterPrefetchPages,
    pages,
    pagesState.status,
    readerImageErrors,
    readerImagePrefetcher,
    readerImageSizes,
    readerPageIdentityFor,
  ]);

  useEffect(() => {
    // Prefetched pages may arrive before the persisted progress query.
    const targetPageIndex = resolveMobileReaderRestorePosition({
      progressLoading: loading,
      pagesReady: pagesState.status === "ready",
      restoreKey: restoreReaderKey,
      restoredKey: restoredReaderKey,
      chapterPrefix: `${readyFetchedAt}:${chapterId}:`,
      currentPageIndex: clampedPageIndex,
      savedPageIndex: readerRestorePageIndex,
      relayoutPageAnchor: readerRelayoutPageAnchorRef.current,
      pageCount,
    });
    if (targetPageIndex === null) return;
    if (!readerRelayoutInteractionActiveRef.current) {
      readerRelayoutPageAnchorRef.current = null;
    }
    const targetFrameIndex = isTwoPageMode
      ? findMobileReaderSpreadIndex(readerSpreads, targetPageIndex)
      : targetPageIndex;
    const nextPageIndex = isTwoPageMode
      ? firstPageIndexForMobileReaderSpread(readerSpreads, targetFrameIndex)
      : targetPageIndex;
    armReaderProgrammaticScroll(
      galleryPagedMode
        ? { kind: "frame", frameIndex: targetFrameIndex }
        : { kind: "page", pageIndex: nextPageIndex },
    );
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
    armReaderProgrammaticScroll,
    chapterId,
    clampedPageIndex,
    galleryPagedMode,
    isTwoPageMode,
    loading,
    pageCount,
    pagesState.status,
    readyFetchedAt,
    readerRestorePageIndex,
    readerSpreads,
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
            // Read back the one row that was just written; scanning
            // `getMangaProgress()` decodes every stored manga on every turn.
            const [savedChapterProgress, savedMangaProgress] =
              await Promise.all([
                store.getChapterProgress(
                  chapterProgress.registryId,
                  chapterProgress.sourceId,
                  chapterProgress.sourceMangaId,
                  chapterProgress.sourceChapterId,
                ),
                store.getMangaProgressById(mangaProgress.id),
              ]);
            setState((current) => ({
              ...current,
              chapterProgress: savedChapterProgress ?? chapterProgress,
              mangaProgress: savedMangaProgress ?? mangaProgress,
            }));
          }
          emitMobileDataChanged("progress");
          if (complete && !options?.silent) {
            await hapticConfirm();
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

  /**
   * Leaving the reader must commit a page turned inside the 500 ms debounce
   * window: `router.replace` remounts this screen on every chapter change, so
   * the timer below never fires for the page the reader left on. Effect
   * cleanups run in hook definition order, which is why this sits *above* the
   * debounce effect — its own cleanup clears the pending timer, and a flush
   * declared later would find nothing to write. The call goes through a ref so
   * the flush only runs on unmount.
   */
  const flushPendingReaderProgressRef = useRef<() => void>(() => {});
  useEffect(() => {
    return () => flushPendingReaderProgressRef.current();
  }, []);

  useEffect(() => {
    if (!silentProgressPersistenceKey) return;
    const timeout = setTimeout(() => {
      pendingSilentProgressRef.current = null;
      // persistProgress captures the saved timestamps that this write advances.
      // Calling the latest implementation through a ref prevents that
      // timestamp-only state update from re-arming this debounce forever.
      void persistProgressRef.current(false, visibleProgressPageIndex, {
        silent: true,
      });
    }, 500);
    pendingSilentProgressRef.current = {
      timeout,
      displayIndex: visibleProgressPageIndex,
    };
    return () => {
      clearTimeout(timeout);
      if (pendingSilentProgressRef.current?.timeout === timeout) {
        pendingSilentProgressRef.current = null;
      }
    };
  }, [silentProgressPersistenceKey, visibleProgressPageIndex]);

  /**
   * Write everything still sitting in a debounce timer, immediately.
   * `updateState: false` skips the read-back that refreshes screen state, which
   * a reader that is going away has no use for.
   */
  const flushPendingReaderProgress = useCallback(
    (options?: { updateState?: boolean }) => {
      const pending = pendingSilentProgressRef.current;
      if (pending) {
        clearTimeout(pending.timeout);
        pendingSilentProgressRef.current = null;
        void persistProgressRef.current(false, pending.displayIndex, {
          silent: true,
          updateState: options?.updateState,
        });
      }
      flushPendingIntraPageProgress(false);
    },
    [flushPendingIntraPageProgress],
  );

  useEffect(() => {
    flushPendingReaderProgressRef.current = () =>
      flushPendingReaderProgress({ updateState: false });
  }, [flushPendingReaderProgress]);

  // The OS can suspend — or kill — a backgrounded reader long before the 500 ms
  // progress debounce fires, so leaving the app commits the page and the
  // intra-page offset right away. Returning to `active` needs nothing extra:
  // the next page change re-arms both timers.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") return;
      flushPendingReaderProgress();
    });
    return () => subscription.remove();
  }, [flushPendingReaderProgress]);

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
      readerSourceIndexForDisplayIndex(
        visibleProgressPageIndex,
        pageCount,
        mode,
      ) >=
      pageCount - 1
    ) {
      return;
    }
    setEndOfChapterPromptVisible(false);
    setEndOfChapterProgressSaved(false);
    setEndOfChapterProgressError(null);
  }, [mode, pageCount, visibleProgressPageIndex]);

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
    if (
      !shouldScheduleReaderChromeAutoHide({
        hasReaderKey: Boolean(readerChromeAutoHideKey),
        ready: pagesState.status === "ready",
        pageCount,
        showControls,
        scrubActive: continuousReaderScrubActive,
        reduceMotion,
      })
    ) {
      return;
    }
    if (readerInteractionSurfaceOpen) return;
    if (readerChromeAutoHideKeyRef.current === readerChromeAutoHideKey) return;

    const timeout = setTimeout(() => {
      // Already settled for this chapter while the timer ran (a touch on the
      // ⋯ menu, whose system menu reports no open state).
      if (readerChromeAutoHideKeyRef.current === readerChromeAutoHideKey) return;
      readerChromeAutoHideKeyRef.current = readerChromeAutoHideKey;
      setShowControls(false);
    }, READER_CHROME_AUTO_HIDE_MS);

    return () => {
      clearTimeout(timeout);
    };
    // This is the "just opened a chapter" auto-hide, not a general inactivity
    // timer. Mode/layout changes rebuild the gallery restore key; remembering
    // the fetched chapter key keeps those changes from closing a settings
    // popover the reader is actively using.
  }, [
    pageCount,
    pagesState.status,
    readerChromeAutoHideKey,
    reduceMotion,
    readerInteractionSurfaceOpen,
    showControls,
    continuousReaderScrubActive,
  ]);

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
      // A tap turn arms a programmatic target and already played its haptic in
      // `goToPage`; only a user swipe reaches this branch.
      if (programmaticTarget == null) {
        const arrival = readerPageArrivalForStep(
          clampedPageIndex,
          nextPageIndex,
          pageCount,
          mode,
        );
        if (nextPageIndex !== clampedPageIndex) notifyReaderPageTurn(arrival);
        setPageArrival(arrival);
      }
      setCurrentPageIndex(nextPageIndex);
      syncRoutePage(nextPageIndex);
      if (
        programmaticTarget?.kind === "frame" &&
        programmaticTarget.frameIndex === nextFrameIndex
      ) {
        clearReaderProgrammaticScroll();
      }
      return;
    }

    const nextPageIndex = clampReaderPageIndex(
      scrollingVisiblePageIndexRef.current,
      pageCount,
    );
    if (nextPageIndex === clampedPageIndex) {
      if (programmaticTarget != null && programmaticTarget.kind !== "scrub") {
        clearReaderProgrammaticScroll();
      }
      return;
    }
    if (programmaticTarget == null) {
      const arrival = readerPageArrivalForStep(
        clampedPageIndex,
        nextPageIndex,
        pageCount,
        mode,
      );
      notifyReaderPageTurn(arrival);
      setPageArrival(arrival);
    }
    setCurrentPageIndex(nextPageIndex);
    syncRoutePage(nextPageIndex);
    if (programmaticTarget != null && programmaticTarget.kind !== "scrub") {
      clearReaderProgrammaticScroll();
    }
  };

  const onReaderScroll = (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
    void _event;
    // Scrolling mode is driven by FlatList viewability. Item onLayout offsets
    // are relative to virtualized cells and cannot identify the visible page.
  };

  // The window a fitted page is measured against (fit width / height / fill).
  const readerFitViewport = useMemo(
    () => ({ width: readerSafeContentWidth, height: readerMaxPagedImageHeight }),
    [readerMaxPagedImageHeight, readerSafeContentWidth],
  );
  const getReaderImageFrameSize = useCallback(
    (page: MobileReaderPage): MobileImageSize => {
      if (galleryPagedMode && readerFitMode !== "page") {
        const fitted = mobileReaderFitFrame({
          mode: readerFitMode,
          viewport: readerFitViewport,
          ratio: readerFitRatio(readerImageSizes.get(readerPageIdentityFor(page))),
        });
        return { width: fitted.width, height: fitted.height };
      }
      if (galleryPagedMode && isTwoPageMode) {
        return getMobileReaderSpreadImageFrameSize({
          availableWidth: readerImageWidth,
          availableHeight: readerMaxPagedImageHeight,
          naturalSize: readerImageSizes.get(readerPageIdentityFor(page)),
        });
      }
      return getMobileReaderImageFrameSize({
        imageWidth: readerImageWidth,
        naturalSize: readerImageSizes.get(readerPageIdentityFor(page)),
        clampHeightToPagedViewport: galleryPagedMode,
        maximumPagedHeight: readerMaxPagedImageHeight,
      });
    },
    [
      galleryPagedMode,
      isTwoPageMode,
      readerFitMode,
      readerFitViewport,
      readerImageSizes,
      readerImageWidth,
      readerMaxPagedImageHeight,
      readerPageIdentityFor,
    ],
  );
  // The detections flow into `renderReaderImage`, which every mounted page
  // cell is memoized against, so a fresh array identity per render would undo
  // that memoization for the whole gallery.
  const japaneseLearningOverlayDetections = useMemo(
    () =>
      japaneseLearningOcrState.status === "ready"
        ? sortedMobileOcrLines(japaneseLearningOcrState.result)
        : japaneseLearningOcrState.status === "loading" && japaneseLearningOcrState.partial
          ? sortedMobileOcrLines(japaneseLearningOcrState.partial)
          : [],
    [japaneseLearningOcrState],
  );
  const activeJapaneseLearningTranscriptOrder =
    japaneseLearningTtsState.status === "playing" &&
    japaneseLearningTtsState.source === "transcript"
      ? findMobileTranscriptPlaybackLineOrder(
          japaneseLearningOverlayDetections,
          japaneseLearningTtsState.currentTime ?? 0,
          japaneseLearningTtsState.duration ?? 0,
        )
      : null;
  const measureReaderFirstContent = useCallback(
    (page: MobileReaderPage) => {
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
    },
    [
      chapterId,
      clampedPageIndex,
      currentDisplayedPageKey,
      mangaId,
      registryId,
      sourceId,
    ],
  );
  // Page-turn bands act on touch-up, so double-tap zoom is confined to the
  // centre band while they are listening; with an overlay owning the stage
  // (no page turns) a double tap may zoom anywhere on the page.
  const readerStageTapOwned =
    readerInteractionSurfaceOpen || cloudflareSheet.visible;
  // A zoomed page owns the whole stage: its edge bands stop turning pages so a
  // double tap there resets the zoom instead of paging twice.
  const [zoomedReaderPageId, setZoomedReaderPageId] = useState<string | null>(
    null,
  );
  const handleReaderPageZoomActiveChange = useCallback(
    (pageId: string, active: boolean) => {
      setZoomedReaderPageId((current) =>
        active ? pageId : current === pageId ? null : current,
      );
    },
    [],
  );
  const readerZoomTapBand = useMemo(
    () =>
      galleryPagedMode && !readerStageTapOwned
        ? mobileWindowAbsoluteBand(readerCentreTapBand({ width: readerPageWidth }), readerStageWindowOrigin.x)
        : null,
    [galleryPagedMode, readerPageWidth, readerStageTapOwned, readerStageWindowOrigin.x],
  );

  const startReaderPageFlip = useCallback(
    (
      targetPageIndex: number,
      direction: "previous" | "next",
      arrival: MobileReaderPageArrival,
    ): boolean => {
      const oldSpread = readerSpreads[currentSpreadIndex];
      const newSpread =
        readerSpreads[findMobileReaderSpreadIndex(readerSpreads, targetPageIndex)];
      const plan = mobileDuoPageFlipPlan({
        turn: direction === "next" ? "forward" : "backward",
        rtl: mode === "rtl",
      });
      const oldVisual = oldSpread ? visualPageIndexesForMobileReaderSpread(oldSpread, mode) : [];
      const newVisual = newSpread ? visualPageIndexesForMobileReaderSpread(newSpread, mode) : [];
      const at = (side: "left" | "right") => (side === "left" ? 0 : 1);
      const outgoingPage = displayedPages[oldVisual[at(plan.outgoingSide)]];
      const underPage = displayedPages[oldVisual[at(plan.incomingSide)]];
      const incomingPage = displayedPages[newVisual[at(plan.incomingSide)]];
      // Leaf panes: the fold panes in book posture; in a flat spread each
      // side hugs the centre seam at its page width (the pages meet there).
      const frameWidth = (page: MobileReaderPage | undefined) =>
        page ? getReaderImageFrameSize(page).width : 0;
      const panes = readerSpreadSlots && readerSpreadSlots.length === 2
        ? { left: readerSpreadSlots[0], right: readerSpreadSlots[1] }
        : isTwoPageMode && !readerStageConstrained
          ? mobileReaderFlatSpreadFlipPanes({
              stageWidth: readerStage.width,
              stageHeight: readerStage.height,
              leftWidth: Math.max(
                frameWidth(displayedPages[oldVisual[0]]),
                frameWidth(displayedPages[newVisual[0]]),
              ),
              rightWidth: Math.max(
                frameWidth(displayedPages[oldVisual[1]]),
                frameWidth(displayedPages[newVisual[1]]),
              ),
            })
          : null;
      const decision = mobileReaderPageFlipDecision({
        paged: galleryPagedMode,
        spreadMode: isTwoPageMode,
        reduceMotion: readerPageFlip.reduceMotion,
        zoomed: zoomedReaderPageId != null,
        step: 1,
        fromSpreadLength: oldSpread?.length ?? null,
        toSpreadLength: newSpread?.length ?? null,
        sameSpread: oldSpread === newSpread,
        hasPanes: panes !== null,
        onScreenPagesReady: Boolean(outgoingPage?.imageUri && underPage?.imageUri),
      });
      if (!decision.flip || !panes || !outgoingPage || !underPage) return false;
      const token = ++readerPageFlipTokenRef.current;
      const leaf = (page: MobileReaderPage | undefined, role: "outgoing" | "under" | "incoming") => {
        // The incoming page may still be resolving: its leaf lands empty and
        // its page fades in when it decodes (never a silent plain turn).
        if (!page?.imageUri) return null;
        const frame = getReaderImageFrameSize(page);
        return (
          <MobileCachedImage
            cacheKind="page"
            fadeIn={role === "incoming"}
            fallback={null}
            uriOwnership={page.imageUriOwnership ?? "source"}
            source={{ uri: page.imageUri!, headers: page.headers }}
            resizeMode="contain"
            style={{ width: frame.width, height: frame.height }}
            onLoad={() => markReaderPageFlipLeafLoaded(token, role)}
          />
        );
      };
      readerPageFlipPendingRef.current = {
        token,
        target: targetPageIndex,
        arrival,
        loaded: new Set(),
      };
      setReaderPageFlipReady(false);
      const started = readerPageFlip.start({
        plan,
        panes,
        outgoing: leaf(outgoingPage, "outgoing"),
        under: leaf(underPage, "under"),
        incoming: leaf(incomingPage, "incoming"),
        backgroundColor: readerBackgroundColor,
      });
      if (!started) {
        readerPageFlipPendingRef.current = null;
        return false;
      }
      // On-screen copies that have not decoded in time: flip anyway (they
      // are cached pages; a late one pops in on its leaf) — never a silent
      // plain turn.
      setTimeout(() => {
        const pending = readerPageFlipPendingRef.current;
        if (!pending || pending.token !== token) return;
        setReaderPageFlipReady(true);
      }, MOBILE_READER_PAGE_FLIP_DECODE_WAIT_MS);
      return true;
    },
    [
      currentSpreadIndex,
      displayedPages,
      galleryPagedMode,
      getReaderImageFrameSize,
      isTwoPageMode,
      markReaderPageFlipLeafLoaded,
      mode,
      readerPageFlip,
      readerSpreadSlots,
      readerSpreads,
      readerStage.height,
      readerStage.width,
      readerStageConstrained,
      zoomedReaderPageId,
    ],
  );
  const handleReaderPageFlipStart = useCallback(() => {
    const pending = readerPageFlipPendingRef.current;
    if (!pending) return;
    readerPageFlipPendingRef.current = null;
    goToPage(pending.target, pending.arrival, { animated: false });
  }, [goToPage]);

  useLayoutEffect(() => {
    startReaderPageFlipRef.current = startReaderPageFlip;
  }, [startReaderPageFlip]);
  const bilingualSideBySide = Boolean(bilingualLayout);
  useEffect(() => {
    // A hold-to-peek that began before the fold must not stay stuck on.
    if (bilingualSideBySide) getMobileDualReadStore().getState().setPeekActive(false);
  }, [bilingualSideBySide]);

  const renderReaderImage = useCallback(
    (page: MobileReaderPage) => {
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
      const pageFrame = (
        <MobileReaderPageFrame
          allowLongStripSegments={pageCount === 1}
          backgroundColor={readerBackgroundColor}
          cacheKey={pageCount === 1 ? segmentedCacheKey : undefined}
          frameSize={readerImageFrameSize}
          headers={page.headers}
          imageUri={imageUri}
          imageUriOwnership={page.imageUriOwnership ?? "source"}
          loading={imageLoading}
          offline={readerConnectivity.offline}
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
          {japaneseLearningOverlayDetections.some((detection) => detection.pageId === page.id) ? (
            <JapaneseLearningDetectionOverlay
              detections={japaneseLearningOverlayDetections.filter((detection) => detection.pageId === page.id)}
              frameSize={readerImageFrameSize}
              imageSize={readerImageSizes.get(pageIdentity) ?? null}
              activeOrder={activeJapaneseLearningTranscriptOrder}
              selectedOrder={japaneseLearningSelectedDetectionOrder}
              strings={strings}
              onSelectDetection={selectJapaneseLearningDetection}
            />
          ) : null}
          {/* The overlay runs a dozen store selectors per mounted page before
              it can decide it has nothing to draw, so a disabled dual reader
              must not mount it at all. `dualReadEnabled` is the same flag the
              overlay itself gates every render path on. */}
          {dualReadEnabled &&
          // Side by side: the secondary has its own pane — never paint it
          // over the primary as well.
          !bilingualSideBySide &&
          (pageCount !== 1 || readerImageSizes.has(pageIdentity)) ? (
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
      );

      // Long-strip presentations zoom the whole list (ZoomableReaderStrip);
      // per-page pinch/double-tap zoom only applies to paged galleries.
      if (!galleryPagedMode) return pageFrame;
      return (
        <ZoomableReaderImageFrame
          // Remounting on retry is what re-issues the image request.
          key={`${pageIdentity}:${retryNonce}`}
          frameSize={readerImageFrameSize}
          viewport={readerFitMode === "page" ? undefined : readerFitViewport}
          rtl={mode === "rtl"}
          onZoomActiveChange={handleReaderPageZoomActiveChange}
          pageId={page.id}
          zoomTapBand={readerZoomTapBand}
        >
          {pageFrame}
        </ZoomableReaderImageFrame>
      );
    },
    [
      activeJapaneseLearningTranscriptOrder,
      chapter?.id,
      clampedPageIndex,
      clearReaderImageError,
      currentDisplayedPageKey,
      dualReadEnabled,
      bilingualSideBySide,
      galleryPagedMode,
      getReaderImageFrameSize,
      handleReaderPageZoomActiveChange,
      readerFitMode,
      readerFitViewport,
      japaneseLearningOverlayDetections,
      japaneseLearningSelectedDetectionOrder,
      measureReaderFirstContent,
      mode,
      pageCount,
      readerConnectivity.offline,
      readerDisplayIndexByPageId,
      readerImageErrors,
      readerImageRetryNonces,
      readerImageSizes,
      readerPageIdentityFor,
      readerSegmentedCacheKeyFor,
      readerZoomTapBand,
      retryReaderImage,
      selectJapaneseLearningDetection,
      setReaderImageLoadError,
      setReaderImageNaturalSize,
      strings,
    ],
  );
  const renderReaderImageSegment = useCallback(
    (frame: MobileReaderSegmentFrame) => {
      const page = currentDisplayedPage;
      const asset = currentSegmentedImage;
      if (!page || !asset) return null;
      const segmentKey = `${asset.generation}:${frame.index}`;
      const pageIdentity = readerPageIdentityFor(page);
      const errorKey = `${pageIdentity}:segment:${frame.index}`;
      const cacheKey = readerSegmentedCacheKeyFor(page);
      // OCR reads each tile as its own image, so its boxes are in this
      // tile's pixels and are drawn in this tile's frame.
      const tileOcrPageId = getMobileReaderSegmentOcrPageId(
        page.id,
        frame.index,
        asset.segments.length,
      );
      const tileDetections = japaneseLearningOverlayDetections.filter(
        (detection) => detection.pageId === tileOcrPageId,
      );
      return (
        <MobileReaderPageFrame
          backgroundColor={readerBackgroundColor}
          frameSize={{ width: frame.width, height: frame.height }}
          imageUri={frame.segment.uri}
          imageUriOwnership="app"
          imageResizeMode="stretch"
          loading={!loadedReaderSegments.has(segmentKey)}
          offline={readerConnectivity.offline}
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
              { uri: page.imageUri, headers: page.headers, cacheKind: "page" },
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
        >
          {tileDetections.length > 0 ? (
            <JapaneseLearningDetectionOverlay
              detections={tileDetections}
              frameSize={{ width: frame.width, height: frame.height }}
              imageSize={{
                width: frame.segment.width,
                height: frame.segment.height,
              }}
              activeOrder={activeJapaneseLearningTranscriptOrder}
              selectedOrder={japaneseLearningSelectedDetectionOrder}
              strings={strings}
              onSelectDetection={selectJapaneseLearningDetection}
            />
          ) : null}
        </MobileReaderPageFrame>
      );
    },
    [
      activeJapaneseLearningTranscriptOrder,
      clearReaderImageError,
      currentDisplayedPage,
      currentSegmentedImage,
      japaneseLearningOverlayDetections,
      japaneseLearningSelectedDetectionOrder,
      selectJapaneseLearningDetection,
      loadedReaderSegments,
      measureReaderFirstContent,
      readerConnectivity.offline,
      readerImageErrors,
      readerPageIdentityFor,
      readerSegmentedCacheKeyFor,
      retryReaderImage,
      setReaderImageLoadError,
      strings,
    ],
  );

  const stageActionLabel = showControls
    ? strings.reader.hideControls
    : strings.reader.showControls;
  const closeReaderDisplaySettings = useCallback(() => {
    openReaderPluginSettingsAfterDisplaySettingsRef.current = false;
    setReaderDisplaySettingsOpen(false);
  }, []);
  // The reader settings popover's "Plugins" row hands off to the plugin
  // settings sheet (web parity: plugin settings live in the reader settings
  // popover). The sheet presents only once the popover's Modal has finished
  // dismissing, so iOS never presents a native sheet over a live Modal.
  const showReaderPluginSettingsEntry =
    readerPlugins.data.length > 0 || Boolean(readerPlugins.error);
  const openReaderPluginSettingsFromDisplaySettings = useCallback(() => {
    if (readerSettingsActionBusy) return;
    openReaderPluginSettingsAfterDisplaySettingsRef.current = true;
    setReaderDisplaySettingsOpen(false);
  }, [readerSettingsActionBusy]);
  const handleReaderDisplaySettingsDismissed = useCallback(() => {
    if (!openReaderPluginSettingsAfterDisplaySettingsRef.current) return;
    openReaderPluginSettingsAfterDisplaySettingsRef.current = false;
    setSelectedReaderPluginSettingsId(null);
    setReaderPluginSettingsOpen(true);
  }, []);

  // Native sheets are presented above the whole navigation stack, not inside
  // the reader's screen: when the reader loses focus (a deep link, a pushed
  // screen, Back) with one up, it would stay over whatever is shown next.
  // Leaving the reader closes every reader-owned surface, and drops the
  // queued hand-offs so none re-presents as the others finish dismissing.
  const readerWasFocusedRef = useRef(false);
  useEffect(() => {
    const lostFocus = shouldDismissMobileReaderSurfacesOnFocusChange(
      readerWasFocusedRef.current,
      readerIsFocused,
    );
    readerWasFocusedRef.current = readerIsFocused;
    if (!lostFocus) return;
    japaneseLearningLauncherNextSurfaceRef.current = null;
    japaneseLearningOcrNextSurfaceRef.current = null;
    japaneseLearningChatNextSurfaceRef.current = null;
    japaneseLearningTranscriptNextSurfaceRef.current = null;
    openReaderPluginSettingsAfterDisplaySettingsRef.current = false;
    setJapaneseLearningChatReturnsToSentence(false);
    setJapaneseLearningLauncherVisible(false);
    setJapaneseLearningOcrSheetVisible(false);
    setJapaneseLearningChatDrawerVisible(false);
    setJapaneseLearningTranscriptVisible(false);
    setReaderDisplaySettingsOpen(false);
    setReaderPluginSettingsOpen(false);
    stopJapaneseLearningTts();
    if (cloudflareSheet.visible) cloudflareSheet.dismiss();
    const dualReadStore = getMobileDualReadStore().getState();
    if (dualReadStore.configOpen) dualReadStore.setConfigOpen(false);
  }, [
    cloudflareSheet,
    readerIsFocused,
    setJapaneseLearningChatDrawerVisible,
    setJapaneseLearningOcrSheetVisible,
    stopJapaneseLearningTts,
  ]);

  // Reader chrome for the current pose (mobileReaderPoseLayout): the
  // horizontal title pill + toolbar, the HIG vertical rail (Back first, then
  // the prominent actions) beside a compact title capsule and a bottom
  // scrubber, or the notebook's pinned reading console. The controls and
  // their order are the same in every pose; only the arrangement moves.
  // --- Pose-transition motion (motion spec rows 1, 3, 4) -------------------
  // Decided while rendering the change, before its frames mount, so the
  // UI-thread transitions of this very commit see it.
  const readerStageContentKey = readerRestoreComplete
    ? `${chapterId}:${readyFetchedAt}:${mode}`
    : "pending";
  const readerStageSnapshot: MobileReaderStageSnapshot = {
    bounds: { width: readerPose.bounds.width, height: readerPose.bounds.height },
    stage: readerStage,
    presentation: readerScrollMountKey,
    spread: isTwoPageMode,
    // Slots and page-frame limits: flat ⇄ book with a spread keeps the stage
    // (the window) but moves the halves into the panes.
    pages: galleryPagedMode
      ? JSON.stringify([
          readerSpreadSlots ?? null,
          Math.round(readerImageWidth * 2) / 2,
          Math.round(readerMaxPagedImageHeight * 2) / 2,
        ])
      : undefined,
    contentKey: readerStageContentKey,
  };
  const readerStageSignature = JSON.stringify(readerStageSnapshot);
  const [trackedReaderStage, setTrackedReaderStage] = useState<{
    signature: string;
    snapshot: MobileReaderStageSnapshot;
    /** The motion of the latest stage change while it is armed (null = frames snap). */
    motion: MobileReaderStageMotion | null;
    aspect: number | null;
    motionId: number;
  }>(() => ({
    signature: readerStageSignature,
    snapshot: readerStageSnapshot,
    motion: null,
    aspect: null,
    motionId: 0,
  }));
  let readerStageMotion = trackedReaderStage.motion;
  let readerStageMotionAspect = trackedReaderStage.aspect;
  if (trackedReaderStage.signature !== readerStageSignature) {
    const naturalSize =
      !isTwoPageMode && currentDisplayedPage
        ? readerImageSizes.get(readerPageIdentityFor(currentDisplayedPage))
        : null;
    const decided = mobileReaderStageMotion(trackedReaderStage.snapshot, readerStageSnapshot, {
      reduceMotion: reduceMotion === true,
    });
    // Decided while rendering the change: this very commit carries the
    // matching `layout` configs (stage FLIP, or slot + page-frame glides).
    readerStageMotion = decided.kind === "glide" || decided.kind === "fade" ? decided : null;
    readerStageMotionAspect =
      naturalSize && naturalSize.height > 0 ? naturalSize.width / naturalSize.height : null;
    setTrackedReaderStage({
      signature: readerStageSignature,
      snapshot: readerStageSnapshot,
      motion: readerStageMotion,
      aspect: readerStageMotionAspect,
      motionId: trackedReaderStage.motionId + 1,
    });
  }
  const readerStageMotionId = trackedReaderStage.motionId;
  const readerStageMotionArmed = trackedReaderStage.motion !== null;
  useEffect(() => {
    if (!readerStageMotionArmed) return;
    // Follow-up measurements of the same pose change (observer, stage origin)
    // still glide; after that, frames snap again.
    const timer = setTimeout(() => {
      setTrackedReaderStage((current) =>
        current.motionId === readerStageMotionId ? { ...current, motion: null } : current,
      );
    }, MOBILE_READER_STAGE_MOTION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [readerStageMotionArmed, readerStageMotionId]);
  const readerStageLayoutTransition = mobileReaderStageLayoutTransition(
    readerStageMotion,
    readerStageMotionAspect,
  );
  const readerPageGlide =
    readerStageMotion?.kind === "glide" && readerStageMotion.flip === "translate";

  const readerChromeArrangement: MobileReaderChromeArrangement = {
    kind: readerPose.chrome.kind,
    geometry:
      readerPose.chrome.kind === "capsules"
        ? mobileReaderChromeGeometryKey([
            readerPose.chrome.back,
            readerPose.chrome.title,
            readerPose.chrome.more,
            readerPose.chrome.actions,
            readerPose.chrome.scrubber,
          ])
        : undefined,
  };
  const readerChromeArrangementVisible = showReaderChrome && !endOfChapterPromptVisible;
  const readerChromeArrangementSignature = `${readerChromeArrangementVisible ? mobileReaderChromeArrangementKey(readerChromeArrangement) : "hidden"}|${readerChromeArrangement.kind}`;
  const [readerChromeArrangementTrack, setReaderChromeArrangementTrack] = useState<{
    signature: string;
    visible: MobileReaderChromeArrangement | null;
    lastKind: MobileReaderChromeArrangement["kind"];
    motion: MobileReaderChromeArrangementMotion | null;
  }>(() => ({
    signature: readerChromeArrangementSignature,
    visible: readerChromeArrangementVisible ? readerChromeArrangement : null,
    lastKind: readerChromeArrangement.kind,
    motion: null,
  }));
  if (readerChromeArrangementTrack.signature !== readerChromeArrangementSignature) {
    const previous = readerChromeArrangementTrack;
    const kindChanged = previous.lastKind !== readerChromeArrangement.kind;
    // The console folds back into the hinge whenever the posture takes it away.
    if (previous.lastKind === "console" && readerChromeArrangement.kind !== "console") {
      armMobileReaderConsoleFoldBack(
        reduceMotion === true,
        reduceMotion === true ? MOBILE_READER_REDUCE_MOTION_FADE_MS : MOBILE_READER_CONSOLE_UNFOLD_MS,
      );
    }
    const from =
      previous.visible ??
      (kindChanged && readerChromeArrangement.kind === "console"
        ? { kind: previous.lastKind }
        : null);
    setReaderChromeArrangementTrack({
      signature: readerChromeArrangementSignature,
      visible: readerChromeArrangementVisible ? readerChromeArrangement : null,
      lastKind: readerChromeArrangement.kind,
      motion: readerChromeArrangementVisible
        ? mobileReaderChromeArrangementMotion({
            from,
            to: readerChromeArrangement,
            reduceMotion: reduceMotion === true,
          })
        : null,
    });
  }

  // Visible capsules that moved (flat ⇄ book, dock): the same pieces glide
  // to their new frames — decided while rendering the change, armed for the
  // follow-up measurements of that pose change.
  const readerChromeGeometry = readerChromeArrangementVisible ? readerChromeArrangement.geometry ?? "" : null;
  const [readerChromeGlideTrack, setReaderChromeGlideTrack] = useState<{
    geometry: string | null;
    kind: MobileReaderChromeArrangement["kind"];
    gliding: boolean;
    id: number;
  }>(() => ({ geometry: readerChromeGeometry, kind: readerChromeArrangement.kind, gliding: false, id: 0 }));
  let readerChromeGliding = readerChromeGlideTrack.gliding;
  if (
    readerChromeGlideTrack.geometry !== readerChromeGeometry ||
    readerChromeGlideTrack.kind !== readerChromeArrangement.kind
  ) {
    const glide =
      readerChromeGlideTrack.geometry !== null &&
      readerChromeGeometry !== null &&
      mobileReaderChromeGlide({
        from: { kind: readerChromeGlideTrack.kind, geometry: readerChromeGlideTrack.geometry },
        to: readerChromeArrangement,
        reduceMotion: reduceMotion === true,
      });
    // A move while hidden, or a show/hide, never glides.
    readerChromeGliding = glide || (readerChromeGlideTrack.gliding && readerChromeGeometry !== null);
    setReaderChromeGlideTrack({
      geometry: readerChromeGeometry,
      kind: readerChromeArrangement.kind,
      gliding: readerChromeGliding,
      id: readerChromeGlideTrack.id + (glide ? 1 : 0),
    });
  }
  const readerChromeGlideId = readerChromeGlideTrack.id;
  const readerChromeGlideArmed = readerChromeGlideTrack.gliding;
  useEffect(() => {
    if (!readerChromeGlideArmed) return;
    const timer = setTimeout(() => {
      setReaderChromeGlideTrack((current) =>
        current.id === readerChromeGlideId ? { ...current, gliding: false } : current,
      );
    }, MOBILE_READER_STAGE_MOTION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [readerChromeGlideArmed, readerChromeGlideId]);
  const readerCapsuleLayout = readerChromeGliding ? mobileReaderCapsuleLayoutTransition : undefined;

  // Capsules float over the page: taps on them never turn pages.
  const readerTapExclusions = bilingualOverrides?.tapExclusions ?? readerPose.tapExclusions;
  // Loading / locked / error cards centre in the page region (one pane when folded).
  const readerStateInsets = useMemo(
    () => mobileReaderStageHorizontalInsets(readerPose.modalFrame, readerStage),
    [readerPose.modalFrame, readerStage],
  );
  const readerPageNaturalSize = useCallback(
    (page: MobileReaderPage) => readerImageSizes.get(readerPageIdentityFor(page)) ?? null,
    [readerImageSizes, readerPageIdentityFor],
  );
  const readerFabArea = useMemo(
    () =>
      mobileDualReaderFabArea({
        chrome:
          readerPose.chrome.kind === "capsules"
            ? { kind: "capsules", content: readerPose.chrome.content }
            : { kind: readerPose.chrome.kind },
        stage: readerStage,
        modalFrame: readerPose.modalFrame,
        bounds: readerPose.bounds,
        safeInsets: readerPose.safeInsets,
      }),
    [readerPose, readerStage],
  );

  // Capsule chrome on iOS presents reader settings as a system popover whose
  // arrow points at the settings button (measured when it opens).
  const useNativeReaderSettings = readerSettingsNativePopoverAvailable;
  const readerSettingsButtonRef = useRef<ViewInstance>(null);
  const [measuredReaderSettingsAnchor, setMeasuredReaderSettingsAnchor] =
    useState<WindowLayoutRect | null>(null);
  const measureReaderSettingsAnchor = useCallback((then?: () => void) => {
    const node = readerSettingsButtonRef.current;
    if (!node) {
      then?.();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setMeasuredReaderSettingsAnchor((current) =>
          current &&
          current.x === x &&
          current.y === y &&
          current.width === width &&
          current.height === height
            ? current
            : { x, y, width, height },
        );
      }
      then?.();
    });
  }, []);
  const openReaderDisplaySettings = useCallback(() => {
    if (!useNativeReaderSettings) {
      setReaderDisplaySettingsOpen(true);
      return;
    }
    measureReaderSettingsAnchor(() => setReaderDisplaySettingsOpen(true));
  }, [measureReaderSettingsAnchor, useNativeReaderSettings]);
  // A pose change while the popover is open moves the button: follow it.
  useEffect(() => {
    if (!readerDisplaySettingsOpen || !useNativeReaderSettings) return;
    const frame = requestAnimationFrame(() => measureReaderSettingsAnchor());
    return () => cancelAnimationFrame(frame);
  }, [measureReaderSettingsAnchor, readerDisplaySettingsOpen, readerPose, useNativeReaderSettings]);
  // QA builds (EXPO_PUBLIC_READER_QA_PANEL) open one panel once the chapter
  // is ready, so simulator screenshots need no synthesized taps.
  const readerQaPanelStageRef = useRef<"idle" | "opened" | "selected" | "asked">("idle");
  const readerQaReady = pagesState.status === "ready" && pageCount > 0 && readerRestoreComplete;
  useEffect(() => {
    if (!MOBILE_READER_QA_PANEL || !readerQaReady || readerQaPanelStageRef.current !== "idle") return;
    const timer = setTimeout(() => {
      readerQaPanelStageRef.current = "opened";
      if (MOBILE_READER_QA_PANEL === "settings") openReaderDisplaySettings();
      else if (MOBILE_READER_QA_PANEL === "plugins") {
        // `plugins:<id>` opens straight onto that plugin's settings page.
        setSelectedReaderPluginSettingsId(MOBILE_READER_QA_PLUGIN);
        setReaderPluginSettingsOpen(true);
      } else if (MOBILE_READER_QA_PANEL === "chat") openJapaneseLearningChatTool();
      else openJapaneseLearningDetectionTool();
    }, 1500);
    return () => clearTimeout(timer);
  }, [openJapaneseLearningChatTool, openJapaneseLearningDetectionTool, openReaderDisplaySettings, readerQaReady]);
  useEffect(() => {
    if ((MOBILE_READER_QA_PANEL !== "ocr" && MOBILE_READER_QA_PANEL !== "ask") || readerQaPanelStageRef.current !== "opened") return;
    if (japaneseLearningOcrState.status !== "ready" || japaneseLearningOcrState.result.source !== "ocr") return;
    // Fixture: the web reference captures analyze the second line (一緒に図書館へ…);
    // real timeline: the page's most substantial Japanese line.
    const detections = japaneseLearningOcrState.result.detections;
    const first = pickMobileJapaneseLearningQaDetection(detections, MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE);
    if (!first) return;
    // Long enough to capture the transcript before it hands off to the result.
    const timer = setTimeout(() => {
      readerQaPanelStageRef.current = "selected";
      selectJapaneseLearningDetection(first);
    }, 8000);
    return () => clearTimeout(timer);
  }, [japaneseLearningOcrState, selectJapaneseLearningDetection]);
  useEffect(() => {
    if (MOBILE_READER_QA_PANEL !== "ask" || readerQaPanelStageRef.current !== "selected") return;
    if (japaneseLearningGrammarState.status !== "ready") return;
    const timer = setTimeout(() => {
      readerQaPanelStageRef.current = "asked";
      askJapaneseLearningSentence();
    }, 5000);
    return () => clearTimeout(timer);
  }, [askJapaneseLearningSentence, japaneseLearningGrammarState.status]);
  // Unmeasured (first frame): the settings slot is the actions capsule's last one.
  const readerSettingsAnchorRect: WindowLayoutRect | null =
    measuredReaderSettingsAnchor ??
    (readerPose.chrome.kind === "capsules" || readerPose.chrome.kind === "console"
      ? {
          x: readerPose.chrome.actions.x + readerPose.chrome.actions.width - 46,
          y: readerPose.chrome.actions.y,
          width: 44,
          height: 44,
        }
      : null);

  // Capsule chrome stays mounted for its dismiss animation (the glass
  // dematerializes with its content) instead of relying on exiting fades.
  const readerChromePresent = showReaderChrome && !endOfChapterPromptVisible;
  const { durationMs: readerChromeMaterialMs, slide: readerChromeSlide } = readerChromeMaterialTiming(reduceMotion);
  const [readerChromeLingering, setReaderChromeLingering] = useState(false);
  const [readerChromeWasPresent, setReaderChromeWasPresent] = useState(readerChromePresent);
  if (readerChromeWasPresent !== readerChromePresent) {
    setReaderChromeWasPresent(readerChromePresent);
    setReaderChromeLingering(!readerChromePresent && readerPose.chrome.kind === "capsules");
  }
  useEffect(() => {
    if (!readerChromeLingering) return;
    const timer = setTimeout(() => setReaderChromeLingering(false), readerChromeMaterialMs + 40);
    return () => clearTimeout(timer);
  }, [readerChromeLingering, readerChromeMaterialMs]);
  const readerChromeMounted = readerChromePresent || readerChromeLingering;
  // Non-glass chrome (scrim) fades and the rows slide on the same clock as
  // the glass materialize animation — same duration, same curve (UIKit's
  // ease-out, see READER_CHROME_MATERIAL_CURVE); a remount starts from hidden.
  const readerChromeFade = useSharedValue(0);
  useLayoutEffect(() => {
    readerChromeFade.value = withTiming(readerChromePresent ? 1 : 0, {
      duration: readerChromeMaterialMs,
      easing: Easing.bezier(...READER_CHROME_MATERIAL_CURVE),
    });
  }, [readerChromeFade, readerChromeMaterialMs, readerChromePresent]);
  const readerChromeFadeStyle = useAnimatedStyle(() => ({ opacity: readerChromeFade.value }));
  const readerChromeTopSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - readerChromeFade.value) * -readerChromeSlide }],
  }));
  const readerChromeBottomSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - readerChromeFade.value) * readerChromeSlide }],
  }));
  // Notebook: an unread page previews as its number only (no spoilers).
  const readerScrubPreviewRevealed = useCallback(
    (pageIndex: number) =>
      readerPose.chrome.kind !== "console" ||
      mobileReaderPageRevealed(pageIndex, readerNotebookRevealed),
    [readerNotebookRevealed, readerPose.chrome.kind],
  );
  const readerScrubPreviewThumbnails = useReaderScrubPreviewThumbnails({
    pages: displayedPages,
    previewPageIndex: readerScrubPreviewPageIndex,
    spreads: isTwoPageMode ? readerSpreads : null,
    isRevealed: readerScrubPreviewRevealed,
  });
  const renderReaderChrome = () => {
    const chrome = readerPose.chrome;
    const arrangementMotion =
      readerChromeArrangementTrack.visible &&
      mobileReaderChromeArrangementKey(readerChromeArrangementTrack.visible) ===
        mobileReaderChromeArrangementKey(readerChromeArrangement)
        ? readerChromeArrangementTrack.motion
        : null;
    const boundsWidth = readerPose.bounds.width;
    const boundsHeight = readerPose.bounds.height;
    // The capsule chrome and the notebook console are always dark: the reader
    // is a black immersive surface, whatever the app theme.
    const readerChromeColors = {
      ...readerChromeColorsForTheme,
      primaryText: READER_CAPSULE_COLORS.primaryText,
      // Icons on glass read at full strength, like Safari's toolbar glyphs.
      secondaryText: READER_CAPSULE_COLORS.primaryText,
      hover: READER_CAPSULE_COLORS.hover,
      disabled: READER_CAPSULE_COLORS.disabled,
      border: READER_CAPSULE_COLORS.border,
    };
    const chromeButtonStyle = styles.readerCapsuleButton;
    const pluginGroupStyle = styles.readerCapsuleActionGroup;
    const layerPointerEvents = readerStageTapOwned ? "none" : "box-none";
    // One layer per arrangement: a pose change remounts it with the
    // arrangement motion (rail: fade + 8pt toward its edge; console: unfolds
    // from the hinge) instead of the per-bar show animation.
    const chromeLayer = (children: ReactNode) => (
      <Animated.View
        key={mobileReaderChromeArrangementKey(readerChromeArrangement)}
        entering={
          arrangementMotion
            ? mobileReaderChromeArrangementEntering(arrangementMotion)
            : undefined
        }
        exiting={chrome.kind === "console" ? mobileReaderConsoleExiting : undefined}
        pointerEvents={layerPointerEvents}
        style={[
          styles.readerChromeLayer,
          chrome.kind === "console"
            ? { transformOrigin: [boundsWidth / 2, chrome.frame.y, 0] }
            : null,
        ]}
      >
        <LayoutAnimationConfig skipEntering={Boolean(arrangementMotion)}>
          <ReaderDarkThemeScope overrides={READER_CAPSULE_TOKEN_OVERRIDES}>{children}</ReaderDarkThemeScope>
        </LayoutAnimationConfig>
      </Animated.View>
    );
    const backButton = (
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={strings.common.back}
        onPress={() => {
          navigateBack();
        }}
        style={[
          chromeButtonStyle,
          { backgroundColor: "transparent" },
        ]}
      >
        <Ionicons
          name={MOBILE_READER_CHROME_GLYPHS.back.name}
          size={MOBILE_READER_CHROME_GLYPHS.back.size}
          color={readerChromeColors.secondaryText}
        />
      </NemuPressable>
    );
    // Capsule chrome: one centred two-line label, like Safari's URL capsule.
    const capsuleLabels = readerCapsuleTitleLabels({
      mangaTitle,
      chapterTitle,
      pageCountLabel: readerTopPageCountLabel,
      pagesPending: readerChromePagesPending,
      fetchingPagesLabel: strings.reader.fetchingPages,
    });
    // A narrow title capsule (a crowded row) keeps only the position, which
    // is what a glance at the chrome is for.
    const compactCapsuleTitle =
      chrome.kind === "capsules" &&
      chrome.title !== null &&
      chrome.title.width < READER_CAPSULE_TITLE_FULL_MIN_WIDTH &&
      readerTopPageCountLabel !== null &&
      !readerChromePagesPending;
    const capsuleTitleBlock = compactCapsuleTitle ? (
      <View style={styles.readerCapsuleTitleBlock}>
        <Text
          accessibilityLabel={[mangaTitle, chapterTitle, readerTopPageCountLabel].filter(Boolean).join(", ")}
          numberOfLines={1}
          style={[styles.readerCapsuleTitle, { color: READER_CAPSULE_COLORS.primaryText, fontVariant: ["tabular-nums"] }]}
        >
          {readerTopPageCountLabel}
        </Text>
      </View>
    ) : (
      <View style={styles.readerCapsuleTitleBlock}>
        <Text
          numberOfLines={1}
          style={[styles.readerCapsuleTitle, { color: READER_CAPSULE_COLORS.primaryText }]}
        >
          {capsuleLabels.title}
        </Text>
        <View style={styles.readerCapsuleSubtitleRow}>
          {readerChromePagesPending ? (
            <NemuRingSpinner
              accessibilityLabel={strings.reader.fetchingPages}
              size={10}
              color={READER_CAPSULE_COLORS.primaryText}
              trackColor={READER_CAPSULE_COLORS.border}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.readerCapsuleSubtitle, { color: READER_CAPSULE_COLORS.secondaryText }]}
          >
            {capsuleLabels.subtitle}
          </Text>
        </View>
      </View>
    );
    const settingsErrorBanner =
      readerSettingsError ? (
      <MobileInlineErrorBanner
        title={strings.settings.settingsActionFailed}
        detail={readerSettingsError}
        dismissLabel={strings.common.clear}
        onDismiss={() => setReaderSettingsError(null)}
        variant="embedded"
      />
    ) : null;
    const previousChapterButton = (
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
        // No slop toward the scrubber: the thumb rests at the track's end
        // (page 1 sits there in either direction), and a touch on it landed
        // in this button's hit slop — disabled or not — so the drag never
        // reached the slider.
        hitSlop={READER_SCRUBBER_LEADING_BUTTON_HIT_SLOP}
        pressedScale={0.98}
        style={[
          chromeButtonStyle,
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
    );
    const scrubber = (
      <View style={styles.readerChromeScrubber}>
        {readerChromeLoading ? (
          <ReaderChromeLoadingTrack
            accessibilityLabel={strings.reader.fetchingPages}
            color={readerChromeColors.secondaryText}
          />
        ) : !usePhysicalScrollScrubber ? (
          <MobileReaderScrubber
            pageIndex={visibleProgressPageIndex}
            pageCount={pageCount}
            scrubIndex={
              isTwoPageMode
                ? currentSpreadIndex
                : clampedPageIndex
            }
            scrubCount={
              isTwoPageMode ? readerSpreads.length : pageCount
            }
            mode={mode}
            strings={strings}
            onChange={goToPage}
            onScrubChange={goToReaderScrubIndex}
            onStep={stepReaderPage}
            interactionScopeKey={readerScrollMountKey}
            spreadScrubbing={isTwoPageMode}
            getPreviewPageIndex={getReaderScrubPreviewPageIndex}
            onPreviewPageIndexChange={
              setReaderScrubPreviewPageIndex
            }
            previewRef={readerScrubPreviewRef}
          />
        ) : (
          <MobileReaderContinuousScrubber
            key={readerScrollMetricsScopeKey}
            ref={readerContinuousScrubberRef}
            initialMetrics={readerScrollMetricsRef.current}
            pageIndex={visibleProgressPageIndex}
            pageCount={pageCount}
            scrubIndex={
              isTwoPageMode
                ? currentSpreadIndex
                : clampedPageIndex
            }
            scrubCount={
              isTwoPageMode ? readerSpreads.length : pageCount
            }
            mode={mode}
            strings={strings}
            onChange={goToPage}
            onScrubChange={goToReaderScrubIndex}
            onStep={stepReaderPage}
            interactionScopeKey={readerScrollMountKey}
            onScrollScrubStart={beginContinuousReaderScrub}
            onScrollProgressChange={updateContinuousReaderScrub}
            onScrollScrubEnd={finishContinuousReaderScrub}
            onScrollScrubCancel={finishContinuousReaderScrub}
            onContinuousAccessibilityStep={
              stepContinuousReaderAccessibility
            }
            spreadScrubbing={isTwoPageMode}
            getPreviewPageIndex={getReaderScrubPreviewPageIndex}
            onPreviewPageIndexChange={
              setReaderScrubPreviewPageIndex
            }
            previewRef={readerScrubPreviewRef}
          />
        )}
      </View>
    );
    const nextChapterButton = (
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
        // No slop toward the scrubber (see the leading button).
        hitSlop={READER_SCRUBBER_TRAILING_BUTTON_HIT_SLOP}
        pressedScale={0.98}
        style={[
          chromeButtonStyle,
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
    );
    const pluginActions =
      enabledReaderPlugins.map((plugin) => {
      if (plugin.id === "japanese-learning") {
        const selected = activeReaderPluginId === plugin.id;
        const ocrLoading =
          japaneseLearningOcrState.status === "loading";

        return (
          <View
            key={plugin.id}
            style={pluginGroupStyle}
          >
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={
                strings.reader.pluginJapaneseLearningDetectText
              }
              accessibilityState={{ selected }}
              onPress={openJapaneseLearningDetectionTool}
              pressedScale={0.98}
              style={[
                chromeButtonStyle,
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
                  name={MOBILE_READER_CHROME_GLYPHS.detectText.name}
                  size={MOBILE_READER_CHROME_GLYPHS.detectText.size}
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
                chromeButtonStyle,
                {
                  backgroundColor:
                    selected &&
                    (japaneseLearningChatMessages.length > 0 ||
                      japaneseLearningChatStreaming)
                      ? readerChromeColors.hover
                      : "transparent",
                },
              ]}
            >
              {/* Web's Nemu navbar action never shows a loading state. */}
              <Ionicons
                name={MOBILE_READER_CHROME_GLYPHS.nemuChat.name}
                size={MOBILE_READER_CHROME_GLYPHS.nemuChat.size}
                color={
                  selected &&
                  (japaneseLearningChatMessages.length > 0 ||
                    japaneseLearningChatStreaming)
                    ? readerChromeColors.primaryText
                    : readerChromeColors.secondaryText
                }
              />
            </NemuPressable>
          </View>
        );
      }

      const selected = dualReadEnabled;
      const canSelect = canSelectMobileReaderPluginOption({
        selected,
        disabled: !dualReaderControlsAvailable,
      });
      return (
        <NemuPressable
          key={plugin.id}
          accessibilityRole="button"
          accessibilityLabel={formatMobileString(
            strings.reader.openPlugin,
            { name: plugin.name },
          )}
          accessibilityState={{
            selected,
            disabled: !dualReaderControlsAvailable,
          }}
          disabled={!dualReaderControlsAvailable}
          hapticFeedback={canSelect ? "press" : "none"}
          onPress={() => {
            if (canSelect) {
              openDualReadConfig();
            }
          }}
          pressedScale={0.98}
          style={[
            chromeButtonStyle,
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
    });
    if (bilingualMode.showToggle) {
      // "Spread" ⇄ "Side by side" (bilingual book), next to the plugin actions.
      pluginActions.push(
        <DuoBilingualLayoutToggle
          key="duo-bilingual-layout"
          mode={bilingualMode.mode}
          strings={strings}
          color={readerChromeColors.secondaryText}
          style={chromeButtonStyle}
        />,
      );
    }
    const settingsButton = (
      <View ref={readerSettingsButtonRef} collapsable={false}>
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={strings.reader.title}
        accessibilityState={{
          selected: readerDisplaySettingsOpen,
        }}
        onPress={openReaderDisplaySettings}
        pressedScale={0.98}
        style={[
          chromeButtonStyle,
          {
            backgroundColor: readerDisplaySettingsOpen
              ? readerChromeColors.hover
              : "transparent",
            opacity: readerChromeLoading
              ? READER_CHROME_LOADING_OPACITY
              : 1,
          },
        ]}
      >
        <Ionicons
          name={MOBILE_READER_CHROME_GLYPHS.settings.name}
          size={MOBILE_READER_CHROME_GLYPHS.settings.size}
          color={
            readerDisplaySettingsOpen
              ? readerChromeColors.primaryText
              : readerChromeColors.secondaryText
          }
        />
      </NemuPressable>
      </View>
    );
    // Sibling of the toolbar, not a child: the glass panel clips its content,
    // so the scrub bubble is drawn here and anchored to the thumb from window
    // coordinates.
    const scrubberPreview = (
      <MobileReaderScrubberPreview
        ref={readerScrubPreviewRef}
        panelAnchorRef={readerBottomPanelAnchorRef}
        pageIndex={readerScrubPreviewPageIndex}
        pageCount={pageCount}
        mode={mode}
        thumbnails={readerScrubPreviewThumbnails}
      />
    );

    if (chrome.kind === "console") {
      // Notebook (paged): the bottom pane is always there — the trackpad or
      // the filmstrip console. The top pane gets the flat capsule row over the page
      // while the chrome is shown; the filmstrip carries those pieces itself,
      // so the row stays away then (no duplicated controls).
      const actionsCapsule = (
        <ReaderCapsule style={styles.readerActionsCapsule}>
          {pluginActions}
          {settingsButton}
        </ReaderCapsule>
      );
      const topRowVisible = showControls && chrome.state !== "filmstrip";
      const { back, title: titleRect, actions } = chrome;
      const actionsOnRight = actions.x + actions.width / 2 >= boundsWidth / 2;
      return chromeLayer(
        <>
          <View
            pointerEvents="none"
            style={[
              mobileReaderAbsoluteRect(chrome.frame),
              { backgroundColor: readerBackgroundColor },
            ]}
          />
          <ReaderNotebookPane
            pane={chrome.pane}
            state={chrome.state}
            reduceMotion={reduceMotion === true}
            rtl={mode === "rtl"}
            strings={strings}
            pageIndex={visibleProgressPageIndex}
            pageCount={pageCount}
            pageLabel={readerTopPageCountLabel}
            onStep={stepReaderPage}
            onExpand={() => setReaderNotebookPaneOverride("filmstrip")}
            onCollapse={() => setReaderNotebookPaneOverride("trackpad")}
            filmstripHeader={
              <View accessibilityLabel={strings.reader.readerControls} pointerEvents="box-none" style={styles.readerNotebookHeader}>
                <ReaderCapsule style={styles.readerCapsuleCircle}>{backButton}</ReaderCapsule>
                <ReaderCapsule style={styles.readerConsoleTitleCapsule}>{capsuleTitleBlock}</ReaderCapsule>
                {chrome.state === "filmstrip" ? actionsCapsule : null}
              </View>
            }
            filmstripScrubber={
              showReaderBottomChrome && chrome.state === "filmstrip" ? (
                <View
                  ref={readerBottomPanelAnchorRef}
                  pointerEvents="box-none"
                  style={styles.readerConsoleScrubberAnchor}
                >
                  {/* A panel, not a button: interactive glass claims drags on
                      it (its press/stretch response), which cancelled every
                      scrub after the first touch — only taps got through. */}
                  <ReaderCapsule interactive={false} style={styles.readerScrubberCapsule}>
                    {previousChapterButton}
                    {scrubber}
                    {nextChapterButton}
                  </ReaderCapsule>
                </View>
              ) : null
            }
            filmstrip={{
              pageCount,
              currentIndex: clampedPageIndex,
              revealed: readerNotebookRevealed,
              thumbnailUri: readerNotebookThumbnailUri,
              onSelectPage: goToPage,
            }}
          />
          {topRowVisible ? (
            <Animated.View
              entering={readerChromeAnimations.topEntering}
              exiting={readerChromeAnimations.topExiting}
              accessibilityLabel={strings.reader.readerControls}
              accessibilityRole="toolbar"
              pointerEvents="box-none"
              style={StyleSheet.absoluteFill}
            >
              {/* Same edgeless top scrim as the flat capsule chrome, so the
                  status glyphs stay legible over the top pane's page. */}
              <LinearGradient
                pointerEvents="none"
                colors={READER_TOP_SCRIM_COLORS}
                locations={READER_TOP_SCRIM_LOCATIONS}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: boundsWidth,
                  height: Math.max(readerPose.safeInsets.top, back.y + back.height) + READER_TOP_SCRIM_FEATHER,
                }}
              />
              <GlassContainer spacing={READER_CAPSULE_GLASS_SPACING} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                <ReaderCapsule
                  style={[styles.readerCapsuleCircle, { position: "absolute", left: back.x, top: back.y }]}
                >
                  {backButton}
                </ReaderCapsule>
                {titleRect ? (
                  <ReaderCapsule
                    pointerEvents="auto"
                    style={[styles.readerTitleCapsule, mobileReaderAbsoluteRect(titleRect)]}
                  >
                    {capsuleTitleBlock}
                  </ReaderCapsule>
                ) : null}
                <View
                  pointerEvents="box-none"
                  style={[
                    { position: "absolute", top: actions.y },
                    actionsOnRight
                      ? { right: boundsWidth - actions.x - actions.width }
                      : { left: actions.x },
                  ]}
                >
                  {actionsCapsule}
                </View>
              </GlassContainer>
            </Animated.View>
          ) : null}
          {settingsErrorBanner ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: chrome.pane.x + 16,
                width: Math.max(0, chrome.pane.width - 32),
                top: chrome.pane.y + 8,
              }}
            >
              {settingsErrorBanner}
            </View>
          ) : null}
          {scrubberPreview}
        </>
      );
    }

    {
      // Safari / Photos on iPhone Duo, on every device: separate glass pieces
      // on the top row (Back · title · actions; compact width moves the
      // actions beside the scrubber; with a vertical-bar edge — Duo inner
      // landscape — title · actions · Back, Back on the hardware bar side
      // like the outer display's bar) and one scrubber capsule. Folded, the
      // same pieces glide to their pane; the pose layout keeps them off the
      // fold and clear of the status bar, islands and cameras.
      const { back, title: titleRect, actions, scrubber: scrubberRect } = chrome;
      const actionsOnRight = actions.x + actions.width / 2 >= boundsWidth / 2;
      // Show / hide: every glass piece materializes and dematerializes its
      // effect together with its icons and text (one UIKit animation), while
      // the rows slide 8pt and the non-glass bits (scrim) fade on the same
      // clock. Glass is never alpha-faded, so it can't lag behind its content.
      const glass = {
        materialized: readerChromePresent,
        animateAppearance: true,
        materializeDurationMs: readerChromeMaterialMs,
      };
      const actionsCapsule = (
        <ReaderCapsule
          layout={readerCapsuleLayout}
          {...glass}
          style={[
            styles.readerActionsCapsule,
            { position: "absolute", top: actions.y },
            // Anchored at its trailing end: the capsule grows with its actions.
            actionsOnRight
              ? { right: boundsWidth - actions.x - actions.width }
              : { left: actions.x },
          ]}
        >
          {pluginActions}
          {settingsButton}
        </ReaderCapsule>
      );
      // Compact without a vertical bar (phones in portrait): the top row is
      // Back + title; the actions share the bottom row with the scrubber.
      // With the system vertical bar kept, it carries Back and the actions:
      // only the title capsule and the scrubber are ours.
      const actionsInBottomRow = chrome.actionsRow === "bottom" && !readerSideBar;
      const piecesPointerEvents = readerChromePresent ? "box-none" : "none";
      // With the actions down there, a ⋯ circle mirrors Back at the top row's
      // trailing end; its system menu gathers actions the reader already has
      // (the scrubber's chapter buttons, the error retry, the settings sheet's
      // Mark complete and Plugins rows) within reach of the top row.
      const moreRect = readerSideBar ? null : chrome.more;
      const runReaderMoreAction = (id: MobileReaderMoreMenuActionId) => {
        switch (id) {
          case "previous-chapter":
            goToChapter(previousChapterInReadingOrder, { startAt: "end" });
            return;
          case "next-chapter":
            goToChapter(nextChapterInReadingOrder, { startAt: "start" });
            return;
          case "reload-chapter":
            setPagesRefreshNonce((value) => value + 1);
            return;
          case "mark-complete":
            void persistProgress(true, clampedPageIndex, { throwOnError: true }).catch(() => undefined);
            return;
          case "reader-settings":
            openReaderDisplaySettings();
            return;
          case "reader-plugins":
            setSelectedReaderPluginSettingsId(null);
            setReaderPluginSettingsOpen(true);
            return;
        }
      };
      const moreCapsule = moreRect ? (
        <ReaderCapsule
          layout={readerCapsuleLayout}
          {...glass}
          style={[styles.readerCapsuleCircle, { position: "absolute", left: moreRect.x, top: moreRect.y }]}
        >
          <ReaderMoreMenu
            sections={buildMobileReaderMoreMenu({
              strings,
              previousChapter: previousChapterInReadingOrder,
              nextChapter: nextChapterInReadingOrder,
              pagesStatus: pagesState.status,
              pageCount,
              completed,
              saving,
              showPlugins: showReaderPluginSettingsEntry,
            })}
            accessibilityLabel={strings.reader.moreActions}
            accessibilityHint={strings.reader.moreActionsHint}
            color={readerChromeColors.secondaryText}
            onAction={runReaderMoreAction}
            onInteract={() => {
              // Engaging the chrome settles the chapter-open auto-hide, so
              // the chrome never dematerializes under the open menu — keyed
              // on the chapter itself, so a touch while it is still loading
              // (before the auto-hide key exists) counts too.
              readerChromeAutoHideKeyRef.current = readerChromeChapterKey;
            }}
          />
        </ReaderCapsule>
      ) : null;
      return chromeLayer(
        <>
          <Animated.View
            accessibilityLabel={strings.reader.readerControls}
            accessibilityRole="toolbar"
            pointerEvents={piecesPointerEvents}
            style={[StyleSheet.absoluteFill, readerChromeTopSlideStyle]}
          >
            {/* Edgeless top scrim under the status bar and the row; it fades
                with the chrome (the status bar hides with it). */}
            <Animated.View pointerEvents="none" style={[mobileReaderAbsoluteRect(chrome.topScrim), readerChromeFadeStyle]}>
              <LinearGradient
                pointerEvents="none"
                colors={READER_TOP_SCRIM_COLORS}
                locations={READER_TOP_SCRIM_LOCATIONS}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* One glass container for the row (SwiftUI GlassEffectContainer):
                the pieces render as one system glass layer and morph together. */}
            <GlassContainer spacing={READER_CAPSULE_GLASS_SPACING} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {readerSideBar ? null : (
              <ReaderCapsule
                layout={readerCapsuleLayout}
                {...glass}
                style={[styles.readerCapsuleCircle, { position: "absolute", left: back.x, top: back.y }]}
              >
                {backButton}
              </ReaderCapsule>
            )}
            {titleRect ? (
              <ReaderCapsule
                layout={readerCapsuleLayout}
                {...glass}
                pointerEvents="auto"
                style={[styles.readerTitleCapsule, mobileReaderAbsoluteRect(titleRect)]}
              >
                {capsuleTitleBlock}
              </ReaderCapsule>
            ) : null}
            {moreCapsule}
            {actionsInBottomRow || readerSideBar ? null : actionsCapsule}
            </GlassContainer>
          </Animated.View>
          {actionsInBottomRow ? (
            <Animated.View
              pointerEvents={piecesPointerEvents}
              style={[StyleSheet.absoluteFill, readerChromeBottomSlideStyle]}
            >
              {actionsCapsule}
            </Animated.View>
          ) : null}
          {readerChromeHasScrubber({ pagesStatus: pagesState.status, pageCount }) ? (
            <Animated.View
              // One persistent scrubber: a pose change glides it to its new
              // pane and width, content visible (never a fade out/in). It
              // stays mounted through a dismiss (the chrome lingers) so its
              // glass dematerializes with the other pieces.
              layout={readerCapsuleLayout}
              pointerEvents={piecesPointerEvents}
              style={[mobileReaderAbsoluteRect(scrubberRect), readerChromeBottomSlideStyle]}
            >
              <View
                ref={readerBottomPanelAnchorRef}
                pointerEvents="box-none"
                style={styles.readerCapsuleFill}
              >
                {/* Non-interactive glass: the scrubber must own horizontal
                    drags (see the console scrubber above). */}
                <ReaderCapsule {...glass} interactive={false} style={styles.readerScrubberCapsule}>
                  {previousChapterButton}
                  {scrubber}
                  {nextChapterButton}
                </ReaderCapsule>
              </View>
            </Animated.View>
          ) : null}
          {settingsErrorBanner ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: scrubberRect.x,
                width: scrubberRect.width,
                bottom: boundsHeight - scrubberRect.y + 8,
              }}
            >
              {settingsErrorBanner}
            </View>
          ) : null}
          {scrubberPreview}
        </>
      );
    }
  };

  // Transient notices stay over the page's controls area: between the capsule
  // rows, or inside the page's pane when folded.
  const readerNoticeRect =
    readerPose.chrome.kind === "capsules"
      ? readerPose.chrome.content
      : readerPose.modalFrame;
  const readerNoticeFrame =
    readerNoticeRect.x > 0 ||
    readerNoticeRect.x + readerNoticeRect.width < readerPose.bounds.width
      ? {
          left: readerNoticeRect.x,
          right:
            readerPose.bounds.width - readerNoticeRect.x - readerNoticeRect.width,
        }
      : null;

  // Transcript / OCR result / chat: the same native sheets in every pose.
  const japaneseLearningSurfaces = japaneseLearningPresentationPlugin ? (
    <>
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
        onRetryGrammar={
          japaneseLearningGrammarState.status === "error"
            ? () => runJapaneseLearningGrammar(japaneseLearningGrammarState.text)
            : undefined
        }
        ttsState={{
          status: japaneseLearningTtsState.status,
          source:
            japaneseLearningTtsState.status !== "idle"
              ? japaneseLearningTtsState.source
              : undefined,
          detail:
            japaneseLearningTtsState.status === "error"
              ? japaneseLearningTtsState.detail
              : undefined,
        }}
        askDisabled={false}
        canActOnSentence={
          japaneseLearningOcrState.status === "ready" &&
          mobileJapaneseLearningSentenceText(
            japaneseLearningOcrState.result,
            japaneseLearningSelectedDetectionOrder,
          ).length > 0
        }
        sentenceTtsBusy={
          (japaneseLearningTtsState.status === "loading" ||
            japaneseLearningTtsState.status === "playing") &&
          japaneseLearningTtsState.source === "sentence"
        }
        sentenceTtsLoading={
          japaneseLearningTtsState.status === "loading" &&
          japaneseLearningTtsState.source === "sentence"
        }
        onClose={closeJapaneseLearningOcrSheet}
        onDismiss={handleJapaneseLearningOcrSheetDismissed}
        onPresentationProgress={handleJapaneseLearningOcrProgress}
        onSelectToken={(index) => {
          setJapaneseLearningGrammarActionNotice(null);
          setSelectedJapaneseLearningGrammarTokenIndex(index);
        }}
        onAskSelection={askJapaneseLearningGrammarSelection}
        onCopySelection={copyJapaneseLearningGrammarSelection}
        onPlaySentence={toggleJapaneseLearningTts}
        onAskSentence={askJapaneseLearningSentence}
        onCopySentence={copyJapaneseLearningSentence}
        bubble={japaneseLearningBubbleSource}
      />

      <JapaneseLearningNemuChatDrawer
        visible={japaneseLearningChatDrawerVisible}
        appLanguage={appLanguage}
        strings={strings}
        chatMessages={japaneseLearningChatMessages}
        chatInput={japaneseLearningChatInput}
        chatLoading={japaneseLearningChatStreaming}
        followUpSuggestions={japaneseLearningChatFollowUps}
        showTypingIndicator={japaneseLearningChatShowTypingIndicator}
        ttsState={{
          status: japaneseLearningTtsState.status,
          currentTime: japaneseLearningTtsState.status === "playing" ? japaneseLearningTtsState.currentTime : undefined,
          duration: japaneseLearningTtsState.status === "playing" ? japaneseLearningTtsState.duration : undefined,
          source:
            japaneseLearningTtsState.status !== "idle"
              ? japaneseLearningTtsState.source
              : undefined,
          messageId:
            japaneseLearningTtsState.status !== "idle"
              ? japaneseLearningTtsState.messageId
              : undefined,
          detail:
            japaneseLearningTtsState.status === "error"
              ? japaneseLearningTtsState.detail
              : undefined,
        }}
        onClose={closeJapaneseLearningChatDrawer}
        onDismiss={handleJapaneseLearningChatDismissed}
        onPresentationProgress={handleJapaneseLearningChatProgress}
        onChangeInput={setJapaneseLearningChatInput}
        onSendInput={sendJapaneseLearningChatInput}
        onSendSuggestion={sendJapaneseLearningChatSuggestion}
        onToggleChatTts={toggleJapaneseLearningChatTts}
      />

      <JapaneseLearningTranscriptSheet
        visible={japaneseLearningTranscriptVisible}
        strings={strings}
        ocrStatus={japaneseLearningOcrState.status}
        ocrErrorDetail={
          japaneseLearningOcrState.status === "error"
            ? japaneseLearningOcrState.detail
            : undefined
        }
        ocrResult={
          japaneseLearningOcrState.status === "ready"
            ? japaneseLearningOcrState.result
            : japaneseLearningOcrState.status === "loading"
              ? (japaneseLearningOcrState.partial ?? null)
              : null
        }
        selectedDetectionOrder={japaneseLearningSelectedDetectionOrder}
        ttsState={{
          status: japaneseLearningTtsState.status,
          source:
            japaneseLearningTtsState.status !== "idle"
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
        minConfidence={mobileJapaneseLearningMinConfidence(
          japaneseLearningPresentationPlugin.values.minConfidence,
        )}
        onClose={() => setJapaneseLearningTranscriptVisible(false)}
        onDismiss={handleJapaneseLearningTranscriptClosed}
        onRetryOcr={runJapaneseLearningOcr}
        onSelectDetection={selectJapaneseLearningDetection}
        onToggleTts={toggleJapaneseLearningTranscriptTts}
      />
    </>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: readerBackgroundColor }]}>
      <Stack.Screen options={readerScreenOptions} />
      <WindowLayoutObserver style={StyleSheet.absoluteFill} enabled={readerIsFocused} onLayoutChange={setReservedLayout} />
      {/* Wherever the reader keeps the system vertical bar (the Duo outer
          display, a Split View half) Back and the actions are real toolbar
          items in it: Back alone on top of the vertical axis, then the
          actions group — the capsule chrome's own Ionicons, tinted like the
          capsule glyphs, on dark glass (`appearanceCoversBars` below).
          Everywhere else (the Duo inner display full-screen, phones, tablets,
          Android) they are our horizontal capsules. */}
      {readerSideBar ? (
        <>
          {/* Back first (the top of the vertical bar), whether or not the
              stack has a previous screen (deep links open the reader alone).
              Icon-only items, no title: react-native-screens loads an image
              icon asynchronously, and an item that is created with only a
              title is inferred as a text item (`UIBarButtonItem.axisBehavior`
              automatic), which keeps the whole bar horizontal even after its
              image arrives. The label is the accessibility label. */}
          <Stack.Toolbar placement="left" tintColor={READER_CAPSULE_COLORS.primaryText}>
            <Stack.Toolbar.Button
              icon={readerBarIconImages?.back ?? "chevron.backward"}
              iconRenderingMode="template"
              tintColor={READER_CAPSULE_COLORS.primaryText}
              accessibilityLabel={strings.common.back}
              hidden={readerBarItemsHidden}
              onPress={() => navigateBack()}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right" tintColor={READER_CAPSULE_COLORS.primaryText}>
            {japaneseLearningReaderPlugin ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.detectText ?? "text.viewfinder"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginJapaneseLearningDetectText}
                hidden={readerBarItemsHidden}
                onPress={openJapaneseLearningDetectionTool}
              />
            ) : null}
            {japaneseLearningReaderPlugin ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.nemuChat ?? "bubble.left.and.text.bubble.right"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginJapaneseLearningNemuChat}
                hidden={readerBarItemsHidden}
                onPress={openJapaneseLearningChatTool}
              />
            ) : null}
            {enabledReaderPlugins.some((plugin) => plugin.id === "dual-reader") ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.dualRead ?? "square.on.square"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginDualReadName}
                hidden={readerBarItemsHidden}
                disabled={!dualReaderControlsAvailable}
                selected={dualReadEnabled}
                onPress={openDualReadConfig}
              />
            ) : null}
            <Stack.Toolbar.Button
              icon={readerBarIconImages?.settings ?? "gearshape"}
              iconRenderingMode="template"
              tintColor={READER_CAPSULE_COLORS.primaryText}
              accessibilityLabel={strings.reader.title}
              hidden={readerBarItemsHidden}
              onPress={openReaderDisplaySettings}
            />
          </Stack.Toolbar>
        </>
      ) : null}
      {/* Mounted on every display, so the forced dark screen appearance never
          drops out when the Duo folds or unfolds. The inner display
          full-screen opts out of the vertical bar (`mobileReaderVerticalBarPolicy`).
          While the reader is the focused screen the dark appearance also
          covers its navigation containers, which host the system bars: a
          screen-level override never reaches them, so they rendered light. */}
      <VerticalBarBehavior
        disabled={readerVerticalBar.optOut}
        appearance="dark"
        appearanceCoversBars={readerIsFocused}
      />
      <Animated.View
        // Never remounted for a size change: the frame snaps, a FLIP glides
        // the page from where it was (fold, dock, rail), and the list keeps
        // its page, zoom and strip position.
        layout={readerStageLayoutTransition}
        style={readerStageConstrained
          ? [mobileReaderAbsoluteRect(readerStage), styles.readerStageClip]
          : styles.root}
      >
      <MobileReaderGallery
        geometryKey={`${readerStage.x}:${readerStage.y}:${readerStage.width}:${readerStage.height}`}
        contentIdentityKey={readerStageContentKey}
        pageGlide={readerPageGlide}
        windowKey={`${Math.round(readerPose.bounds.width)}x${Math.round(readerPose.bounds.height)}`}
        pageNaturalSize={readerPageNaturalSize}
        stateInsets={readerStateInsets}
        onStageOriginChange={setReaderStageWindowOrigin}
        accessibilityHidden={endOfChapterPromptVisible}
        accessibilityLabel={formatReaderStageAccessibilityLabel(
          isTwoPageMode ? visibleProgressPageIndex : clampedPageIndex,
          pageCount,
          mode,
          isTwoPageMode
            ? `${formatReaderSpreadValue(
                currentSpreadIndex,
                readerSpreads.length,
                strings,
              )}. ${stageActionLabel}`
            : stageActionLabel,
          strings,
        )}
        backgroundColor={readerBackgroundColor}
        bottomPadding={
          readerPose.chrome.kind === "console" ? 0 : galleryPagedMode ? readerBottomPadding : readerScrollBottomInset
        }
        chapter={chapter}
        chromeTopPadding={
          readerPose.chrome.kind === "console" ? 0 : galleryPagedMode ? readerChromeTopPadding : readerScrollTopInset
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
        continuousContentIdentity={readerContinuousContentIdentity}
        mode={mode}
        onMomentumScrollEnd={onReaderMomentumEnd}
        onScroll={onReaderScroll}
        onContinuousScrollMetricsChange={onReaderContinuousScrollMetricsChange}
        onUserScrollBegin={clearReaderProgrammaticScroll}
        onScrollingPageLayout={onScrollingPageLayout}
        onScrollingSeekFailed={onScrollingSeekFailed}
        onScrollingVisiblePageChange={onScrollingVisiblePageChange}
        onRetry={() => {
          setPagesRefreshNonce((value) => value + 1);
        }}
        onPageStep={stepReaderPage}
        onRequestAdvancePastEnd={showEndOfChapterPrompt}
        onRequestRetreatPastStart={showPreviousChapterFromEnd}
        pagedDisplayIndex={
          // Until the opening position is restored the list sits at the
          // restore frame (its initial offset), not at the placeholder page
          // 0: a stage relayout in that window (the Duo outer display
          // settling its vertical bar) re-placed the list on page 1 and the
          // reader then reported 1/53 instead of the requested 8/53.
          !readerRestoreComplete
            ? readerRestoreFrameIndex
            : isTwoPageMode
              ? currentSpreadIndex
              : clampedPageIndex
        }
        pagedDisplayCount={isTwoPageMode ? readerSpreads.length : pageCount}
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
        onOpenNextChapter={
          nextChapterInReadingOrder
            ? () => goToChapter(nextChapterInReadingOrder, { startAt: "start" })
            : undefined
        }
        onOpenPreviousChapter={
          previousChapterInReadingOrder
            ? () =>
                goToChapter(previousChapterInReadingOrder, { startAt: "end" })
            : undefined
        }
        onToggleControls={() => {
          setShowControls((value) => !value);
        }}
        pageZoomActive={
          zoomedReaderPageId != null &&
          zoomedReaderPageId === currentDisplayedPageKey
        }
        tapGesturesEnabled={!readerStageTapOwned}
        visiblePageLoading={readerVisiblePageLoading}
        pagedMode={galleryPagedMode}
        fitClip={readerFitMode !== "page"}
        pageTurnAccessibilityEnabled={
          pagedMode ||
          (!galleryPagedMode &&
            readerScrollMetrics.contentLength > 0 &&
            !readerScrollMetrics.scrollable) ||
          isLongStripLogicalPage ||
          Boolean(currentSegmentedImage)
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
        title={mangaTitle}
        windowHeight={readerStageHeight}
        spreadSlots={readerSpreadSlots}
        // Capsule pieces own their rects for as long as they are on screen:
        // while they dematerialize they no longer hit-test, so a tap on one
        // would otherwise reach the page-turn bands under it.
        tapExclusions={
          (readerPose.chrome.kind === "console"
            ? showControls && readerPose.chrome.state !== "filmstrip"
            : showReaderChrome || readerChromeLingering)
            ? readerChromeLingering && readerPose.chrome.kind === "capsules"
              // Reserve the 8pt dismiss path as well as the pose rect:
              // hit-testing reads the stage coordinates, not its native slide.
              ? readerTapExclusions.map((rect) =>
                  readerChromeDismissSweep(rect, { slide: readerChromeSlide, stageHeight: readerStageHeight }))
              : readerTapExclusions
            : undefined
        }
        chromeDismissing={readerChromeLingering && !readerChromePresent}
        onRevealChrome={() => setShowControls(true)}
        foldGap={readerFoldGap}
      />
      <DuoPageFlipOverlay
        flip={readerPageFlip.flip}
        paused={!readerPageFlipReady}
        onStart={handleReaderPageFlipStart}
        onFinished={readerPageFlip.finish}
      />
      </Animated.View>

      {readerPose.foldBand ? (
        // Notebook scroll mode: the strip runs through both panes and passes
        // under the fold, drawn as a thin dark crease.
        <View pointerEvents="none" style={mobileReaderAbsoluteRect(readerPose.foldBand)}>
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.9)", "rgba(0,0,0,0.9)", "rgba(0,0,0,0)"]}
            locations={[0, 0.3, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.readerFoldCrease} />
        </View>
      ) : null}

      {bilingualLayout ? (
        <DuoBilingualSpread
          layout={bilingualLayout}
          chapterId={chapter?.id ?? null}
          localIndex={currentDisplayedPage?.index ?? null}
          primaryNaturalSize={
            currentDisplayedPage
              ? readerImageSizes.get(readerPageIdentityFor(currentDisplayedPage)) ?? null
              : null
          }
          backgroundColor={readerBackgroundColor}
          strings={strings}
        />
      ) : null}

      <MobileDualReaderRoot
        {...dualReaderContext}
        // Side by side shows both pages: the toggle / peek FAB has nothing to do.
        showFloatingControls={dualReaderControlsAvailable && !bilingualSideBySide}
        floatingControlsArea={readerFabArea}
      />

      {japaneseLearningPresentationPlugin ? (
        <>
          <JapaneseLearningPluginLauncherSheet
            visible={japaneseLearningLauncherVisible}
            strings={strings}
            pluginName={japaneseLearningPresentationPlugin.name}
            pluginIcon={japaneseLearningPresentationPlugin.icon}
            enabled={japaneseLearningPresentationPlugin.enabled}
            values={{
              autoDetect:
                japaneseLearningPresentationPlugin.values.autoDetect === true,
              enableForAllLanguages:
                japaneseLearningPresentationPlugin.values
                  .enableForAllLanguages === true,
              minConfidence:
                typeof japaneseLearningPresentationPlugin.values
                  .minConfidence === "number"
                  ? japaneseLearningPresentationPlugin.values.minConfidence
                  : 0.5,
              nemuResponseMode:
                typeof japaneseLearningPresentationPlugin.values
                  .nemuResponseMode === "string"
                  ? japaneseLearningPresentationPlugin.values.nemuResponseMode
                  : "app",
            }}
            ocrLoading={japaneseLearningOcrState.status === "loading"}
            onClose={() => setJapaneseLearningLauncherVisible(false)}
            onDismiss={handleJapaneseLearningLauncherClosed}
            onDetectText={openJapaneseLearningDetectionTool}
            onOpenChat={openJapaneseLearningChatTool}
          />

          {/* Sheets presented by the reader are dark like the reader (its
              screen forces the dark appearance for the system containers).
              The same system sheets in every pose: the system moves them off
              the fold. */}
          <ReaderDarkThemeScope>{japaneseLearningSurfaces}</ReaderDarkThemeScope>
        </>
      ) : null}

      <ReaderDarkThemeScope>
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
      </ReaderDarkThemeScope>

      {/* Capsule chrome on iOS: a real system popover anchored to the settings
          button (Liquid Glass, arrow and fold-aware placement from UIKit).
          The phone chrome and Android keep the React Native popover. */}
      {useNativeReaderSettings ? (
        // Dark like the reader: the scope's scheme is the one source for the
        // presentation's appearance and its rows' colours.
        <ReaderDarkThemeScope>
        <ReaderSettingsNativePopover
          visible={readerDisplaySettingsOpen && !endOfChapterPromptVisible}
          mode={mode}
          activeScrollWidthPct={activeScrollWidthPct}
          isTwoPageMode={isTwoPageMode}
          twoPageSupported={readerPageLayoutVisible}
          showPagePairingControls={showPagePairingControls}
          pagePairingMode={pagePairingMode}
          processPageImages={processPageImages}
          busy={readerSettingsActionBusy}
          saving={saving}
          completed={completed}
          strings={strings}
          onClose={closeReaderDisplaySettings}
          onDismissComplete={handleReaderDisplaySettingsDismissed}
          showReaderPluginSettings={showReaderPluginSettingsEntry}
          onOpenReaderPluginSettings={openReaderPluginSettingsFromDisplaySettings}
          anchor={readerSettingsAnchorRect}
          // Popover only on a regular-width window; compact (phones, Duo
          // outer display) presents the sheet.
          regularWidth={mobileAdaptiveLayout(readerWindowLayout).regularWidth}
          availableHeight={
            readerSettingsAnchorRect
              ? readerSettingsPopoverAvailableHeight({
                  anchor: readerSettingsAnchorRect,
                  bounds: readerPose.bounds,
                  safeInsets: readerPose.safeInsets,
                  panes: readerPose.posture === "notebook" ? mobileAdaptiveLayout(readerWindowLayout).panels : null,
                })
              : 0
          }
          keepAwake={readerKeepAwake}
          onToggleKeepAwake={() => {
            void runReaderSettingsAction("keep-awake", () =>
              setReaderKeepAwake(!readerKeepAwake),
            );
          }}
          lockPortrait={readerLockPortrait}
          onToggleLockPortrait={() => {
            void runReaderSettingsAction("lock-portrait", () =>
              setReaderLockPortrait(!readerLockPortrait),
            );
          }}
          showNotebookPane={readerNotebookPaneSettingAvailable}
          notebookPane={readerNotebookPanePreference}
          onSetNotebookPane={setReaderNotebookPaneFromSettings}
          onSetMode={(nextMode) => {
            if (nextMode === mode || readerSettingsActionBusy) return;
            void runReaderSettingsAction("reading-mode", () => setMode(nextMode));
          }}
          spreadMode={readerSpreadMode}
          onSetSpreadMode={setReaderSpreadModeFromSettings}
          fitMode={readerFitSetting}
          windowShape={readerWindowShape}
          onSetFitMode={setReaderFitModeFromSettings}
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
          onPreviewScrollWidth={previewScrollWidth}
          onCommitScrollWidth={(nextValue) => {
            void commitScrollWidth(nextValue);
          }}
          onMarkComplete={() => {
            void persistProgress(true, clampedPageIndex, {
              throwOnError: true,
            })
              .then(() => {
                setReaderDisplaySettingsOpen(false);
              })
              .catch(() => undefined);
          }}
        />
        </ReaderDarkThemeScope>
      ) : (
        // Dark in either app theme, like the plugin settings sheet it hands
        // off to (the light panel over the black reader was Android's).
        <ReaderDarkThemeScope>
        <ReaderDisplaySettingsPopover
          visible={readerDisplaySettingsOpen && !endOfChapterPromptVisible}
          mode={mode}
          activeScrollWidthPct={activeScrollWidthPct}
          isTwoPageMode={isTwoPageMode}
          twoPageSupported={readerPageLayoutVisible}
          showPagePairingControls={showPagePairingControls}
          pagePairingMode={pagePairingMode}
          processPageImages={processPageImages}
          busy={readerSettingsActionBusy}
          saving={saving}
          completed={completed}
          strings={strings}
          onClose={closeReaderDisplaySettings}
          onDismissComplete={handleReaderDisplaySettingsDismissed}
          showReaderPluginSettings={showReaderPluginSettingsEntry}
          onOpenReaderPluginSettings={openReaderPluginSettingsFromDisplaySettings}
          // Confined between the capsule rows, to the chrome pane, or to the
          // notebook console.
          anchor={readerPose.popover}
          keepAwake={readerKeepAwake}
          onToggleKeepAwake={() => {
            void runReaderSettingsAction("keep-awake", () =>
              setReaderKeepAwake(!readerKeepAwake),
            );
          }}
          lockPortrait={readerLockPortrait}
          onToggleLockPortrait={() => {
            void runReaderSettingsAction("lock-portrait", () =>
              setReaderLockPortrait(!readerLockPortrait),
            );
          }}
          showNotebookPane={readerNotebookPaneSettingAvailable}
          notebookPane={readerNotebookPanePreference}
          onSetNotebookPane={setReaderNotebookPaneFromSettings}
          onSetMode={(nextMode) => {
            if (nextMode === mode || readerSettingsActionBusy) return;
            void runReaderSettingsAction("reading-mode", () => setMode(nextMode));
          }}
          spreadMode={readerSpreadMode}
          onSetSpreadMode={setReaderSpreadModeFromSettings}
          fitMode={readerFitSetting}
          windowShape={readerWindowShape}
          onSetFitMode={setReaderFitModeFromSettings}
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
          onPreviewScrollWidth={previewScrollWidth}
          onScrollWidthInteractionStart={beginScrollWidthInteraction}
          onScrollWidthInteractionEnd={endScrollWidthInteraction}
          onCommitScrollWidth={(nextValue) => {
            void commitScrollWidth(nextValue);
          }}
          onMarkComplete={() => {
            void persistProgress(true, clampedPageIndex, {
              throwOnError: true,
            })
              .then(() => {
                setReaderDisplaySettingsOpen(false);
              })
              .catch(() => undefined);
          }}
        />
        </ReaderDarkThemeScope>
      )}

      {readerChromeMounted ? renderReaderChrome() : null}
      {/* Web drawer overlay + text popout: over a compact sentence / chat
          sheet the reader and its chrome are dimmed and blurred, and the
          selected bubble floats above everything (kept over a chat opened
          from its sentence, never over one opened from the capsule). Above the chrome layer (zIndex 20); the native sheet itself
          presents above this whole screen. */}
      <View pointerEvents="none" style={styles.japaneseLearningSheetOverlay}>
        <JapaneseLearningSheetBackdrop progress={japaneseLearningPresentationProgress} />
        {japaneseLearningPopoutBubbleSource ? (
          <ReaderDarkThemeScope>
            <JapaneseLearningBubblePopout
              key={`${japaneseLearningPopoutBubbleSource.box.pageId}:${japaneseLearningPopoutBubbleSource.box.order}`}
              source={japaneseLearningPopoutBubbleSource}
              progress={japaneseLearningBubblePopoutPresentationProgress}
              presented={japaneseLearningBubblePopoutPresented}
              accessibilityLabel={strings.reader.pluginJapaneseLearningSelectedText}
            />
          </ReaderDarkThemeScope>
        ) : null}
      </View>
      <MobileNemuAgentSheet
        visible={cloudflareSheet.visible && !endOfChapterPromptVisible}
        status={cloudflareSheet.status}
        url={cloudflareSheet.url}
        failureReason={cloudflareSheet.failureReason}
        interactive={cloudflareSheet.interactive}
        failedAt={cloudflareSheet.failedAt}
        onVerify={cloudflareSheet.verify}
        onDismiss={cloudflareSheet.dismiss}
      />
      <MobileReaderConnectivityNotice
        topOffset={insets.top + 76}
        horizontalFrame={readerNoticeFrame}
        pageRequestPending={pagesState.status === "loading"}
        strings={strings}
        connectivity={readerConnectivity}
      />
      {/* Duo signature feature 5 (duo-signature-integration.md): folding shut
          or unfolding moves the reader between displays; a short toast
          confirms it continued at the same page. Never for rotation, book ⇄
          flat, resizes or non-foldables (`mobileDuoDisplayTransition`). */}
      <DuoDisplayHandoffToast
        width={readerWindowLayout.width}
        height={readerWindowLayout.height}
        hinge={readerWindowLayout.hinge}
        hasFold={readerWindowLayout.divisions.length > 0}
        pageNumber={
          pageCount > 0
            ? (isTwoPageMode ? visibleProgressPageIndex : clampedPageIndex) + 1
            : null
        }
        enabled={readerIsFocused && pagesState.status === "ready"}
        topOffset={insets.top + 76}
        insets={
          readerNoticeFrame
            ? { left: readerNoticeFrame.left + 12, right: readerNoticeFrame.right + 12 }
            : undefined
        }
        strings={strings}
      />
      {mobileDesignExploreFlag ? (
        <ExploreChapterFinishedToast top={insets.top + CHAPTER_FINISHED_BELOW_INSET} strings={strings} />
      ) : null}
      <MobileReaderEndOfChapterOverlay
        visible={endOfChapterPromptVisible}
        nextChapterLabel={nextChapterLabel}
        strings={strings}
        bottomInset={insets.bottom}
        topInset={insets.top}
        contentInsets={mobileReaderFrameInsets(
          readerPose.modalFrame,
          readerPose.bounds,
          readerPose.safeInsets,
        )}
        busy={endOfChapterProgressSaving}
        error={endOfChapterProgressError}
        celebration={chapterCompleteCelebration}
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

/**
 * The chapter buttons either side of the page scrubber keep their hit slop on
 * every side except the one facing the slider, whose ends (where the thumb
 * rests on page 1 and the last page) must belong to the slider.
 */
const READER_SCRUBBER_LEADING_BUTTON_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 0 } as const;
const READER_SCRUBBER_TRAILING_BUTTON_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 6 } as const;

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
    flex: 1,
    borderWidth: 2,
    borderRadius: 3,
  },
  readerChromeLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
  // Web drawer overlay + text popout: above the chrome layer (20).
  japaneseLearningSheetOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    elevation: 30,
  },
  readerStageClip: {
    overflow: "hidden",
  },
  readerFoldCrease: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  readerNotebookHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // Matches the shell box exactly, so measuring the anchor measures the panel.
  // Both chrome panels share one shell so the top info bar and the bottom
  // toolbar read as the same surface: same height, inset and corner radius.
  readerChromeScrubber: {
    flex: 1,
    minWidth: 0,
    // Reach into the panel's vertical padding so the slider's touch box
    // covers the whole visible pill, not just the 48pt content row.
    alignSelf: "stretch",
    justifyContent: "center",
    marginVertical: -READER_CHROME_PANEL_VERTICAL_PADDING,
  },
  // --- Capsule chrome (regular width, book, notebook console) -------------
  // Safari on iPhone Duo, measured at 3x: 44pt circles and capsules, icon
  // slots 44pt wide, the title centred on two lines.
  readerCapsuleCircle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  readerCapsuleButton: {
    flexShrink: 0,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    // Concentric with the 44pt capsule it sits in.
    borderRadius: 22,
  },
  readerCapsuleActionGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  readerActionsCapsule: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  readerTitleCapsule: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  readerCapsuleTitleBlock: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  readerCapsuleTitle: {
    maxWidth: "100%",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  readerCapsuleSubtitleRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 1,
  },
  readerCapsuleSubtitle: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: nemuFontWeight.medium,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  readerCapsuleFill: {
    flex: 1,
  },
  readerScrubberCapsule: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  readerConsoleTitleCapsule: {
    flex: 1,
    minWidth: 0,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  readerConsoleScrubberAnchor: {
    width: "100%",
    maxWidth: 560,
  },
});
