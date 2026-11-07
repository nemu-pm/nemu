import { runMobileJapaneseLearningSpreadOcr } from "@/lib/mobileJapaneseLearningSpreadOcr";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { ExploreChapterFinishedToast } from "@/components/explore/ExploreChapterFinishedToast";
import { markMobileChapterFinished } from "@/components/explore/mobileChapterFinishedMoment";
import {
  resolveMobileReaderRestorePosition,
  resolveMobileReaderRestoreSpot,
} from "@/lib/mobileReaderRestore";
import { shouldDismissMobileReaderSurfacesOnFocusChange } from "@/lib/mobileReaderFocus";
import { mobileReaderOcrPageReadiness } from "@/lib/mobileReaderOcrReadiness";
import {
  GlassContainer,
  glassMaterializeMotionAvailable,
  interfaceOrientationLockAvailable,
  pageCurlAvailable,
  VerticalBarBehavior,
  WindowLayoutObserver,
} from "../../modules/nemu-window-layout";
import { useMobileExploreZoomLandsAt } from "@/components/explore/mobileExploreZoomLanded";
import { ReaderTitleCapsule } from "@/components/reader/ReaderTitleCapsule";
import {
  mobileReaderTitleContentKey,
  mobileReaderTitleLabelsFinal,
  peekMobileReaderTitleLabels,
  rememberMobileReaderTitleLabels,
  resolveMobileReaderTitleLabels,
  type MobileReaderTitleLabels,
} from "@/lib/mobileReaderTitleMemory";
import { MOBILE_READER_QA_CHROME, MOBILE_READER_QA_PANEL, MOBILE_READER_QA_PLUGIN } from "@/lib/mobileReaderQa";
import { mobileWindowAbsoluteBand, type MobileWindowLayout, type WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  mobileReaderAbsoluteRect,
  mobileReaderFrameInsets,
  mobileReaderAnticipatedWindowLayout,
  mobileReaderCapsuleActionSlots,
  MOBILE_READER_BOOK_SHEET_COVER_MS,
  mobileReaderBookSheetPlacement,
  mobileReaderBookSheetSide,
  mobileReaderLayoutWithoutFold,
  mobileReaderHingeHintKey,
  mobileReaderNextSideInsetLatch,
  mobileReaderPoseLayout,
  mobileReaderSideInsetLatchKey,
  mobileReaderSpreadHalves,
  mobileReaderLatchedWindowLayout,
  mobileReaderLayoutInsetLatchBase,
  mobileReaderLayoutInsetLatchKey,
  mobileReaderNextLayoutInsetLatch,
  mobileReaderDerivedWindowLayout,
  peekMobileReaderWindowLayout,
  rememberMobileReaderLayoutInsetLatch,
  rememberMobileReaderWindowLayout,
  type MobileReaderLayoutInsetLatch,
  mobileReaderScrollStableTopInset,
  mobileReaderSafePadding,
  MOBILE_READER_HINGE_HINT_TIMEOUT_MS,
  type MobileReaderSideInsetLatch,
  mobileReaderVerticalBarPolicy,
  READER_CAPSULE_ACTION_WIDTH,
  READER_CAPSULE_HEIGHT,
  READER_CAPSULE_TITLE_FULL_MIN_WIDTH,
  mobileReaderTitleCapsuleWidthRange,
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
  type SetStateAction,
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
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LayoutAnimationConfig,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
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
  MOBILE_READER_STAGE_MOTION_WINDOW_MS,
  mobileReaderCapsuleLayoutTransition,
  mobileReaderChromeArrangementEntering,
  mobileReaderStageLayoutTransition,
} from "@/lib/mobileReaderMotionAnimations";
import {
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
import { mobileReaderLearningPageResetKey } from "@/lib/mobileReaderLearningSession";
import { buildMobileReaderMoreMenu, mobileReaderChapterNeighbourLabel, type MobileReaderMoreMenuActionId } from "@/lib/mobileReaderMoreMenu";
import {
  useMobilePoseVeilAppearance,
  type MobilePoseVeilAppearance,
} from "@/lib/MobilePoseTransitionContext";
import { useMobileObservedWindowLayout } from "@/lib/MobileWindowLayoutContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileNemuAgentSheet } from "@/components/MobileNemuAgentSheet";
import { useMobileSourceQuickSettings } from "@/components/useMobileSourceQuickSettings";
import {
  MobileReaderContinuousScrubber,
  type MobileReaderContinuousScrubberHandle,
} from "@/components/MobileReaderContinuousScrubber";
import { MobileReaderLiveScrubber } from "@/components/MobileReaderScrubber";
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
import { ReaderBackGlyph } from "@/components/reader/ReaderBackGlyph";
import { ReaderDarkThemeScope } from "@/components/reader/ReaderDarkThemeScope";
import { useReaderOpeningHudHeld, useReaderZoomEntry } from "@/components/reader/readerZoomEntry";
import { useMobileExploreEntryCover } from "@/components/explore/mobileExploreCover";
import { waitForReaderOpeningWindow } from "@/components/reader/readerOpeningGate";
import {
  keepMobileReaderResolvedPages,
  rememberMobileReaderResolvedPages,
  withMobileReaderResolvedPages,
} from "@/lib/mobileReaderResolvedPages";
import {
  mobileReaderStandInKey,
  rememberMobileReaderStandIn,
  type MobileReaderStandInPage,
} from "@/lib/mobileReaderOpeningStandIn";
import {
  READER_OPENING_SPREAD_PARTNER_WAIT_MS,
  readerOpeningPagesDecoded,
  readerOpeningSince,
  readerPagesNeedProcessing,
  resolveReaderFirstScreenImages,
  resolveReaderFirstScreenIndexes,
  resolveReaderOpeningPagedTarget,
  shouldRetakeReaderFirstScreen,
  resolveReaderImageProcessor,
  READER_FIRST_SCREEN_PENDING_LOG_MS,
  shouldHoldReaderOpeningForImages,
  type ReaderImageProcessorReason,
} from "@/components/reader/readerOpeningHold";
import { createReaderCrossingTapQueue } from "@/components/reader/readerCrossingTapQueue";
import { ReaderMoreMenu } from "@/components/reader/ReaderMoreMenu";
import { useReaderScrubPreviewThumbnails } from "@/components/reader/useReaderScrubPreviewThumbnails";
import { ReaderPluginSettingsSheet } from "@/components/reader/ReaderPluginSettingsSheet";
import {
  ReaderSettingsNativePopover,
  readerSettingsNativePopoverAvailable,
} from "@/components/reader/ReaderSettingsNativePopover";
import {
  readerNotebookSheetMaxHeight,
  readerSettingsPopoverAvailableHeight,
} from "@/lib/readerSettingsNativePopoverLayout";
import {
  mobileReaderOrientationLockAvailable,
  mobileReaderOrientationRequest,
} from "@/lib/mobileOrientationPolicy";
import { useMobileDeviceFormFactor } from "@/lib/mobileOrientationStore";
import { mobileAdaptiveLayout } from "@/lib/mobileAdaptiveLayout";
import { ReaderDisplaySettingsPopover } from "@/components/reader/ReaderDisplaySettingsPopover";
import { ReaderCoverView } from "@/components/reader/ReaderCoverView";
import { useReaderTitleCover } from "@/components/reader/useReaderTitleCover";
import {
  MOBILE_READER_COVER_VIEW_SYMBOLS,
  mobileReaderCoverViewAvailable,
  mobileReaderCoverViewBarChromeShown,
  mobileReaderCoverViewFadeMs,
  mobileReaderNextCoverViewRequest,
  resolveMobileReaderCoverViewImage,
} from "@/lib/mobileReaderCoverView";
import { ReaderChapterDivider } from "@/components/reader/ReaderChapterDivider";
import {
  ReaderChapterCrossingCapsule,
  type ReaderChapterCrossingCapsuleState,
} from "@/components/reader/ReaderChapterCrossingCapsule";
import {
  buildMobileReaderPagedStrip,
  isMobileReaderPagedStripPlaceholderKey,
  mobileReaderPagedStripCrossing,
  mobileReaderPagedStripFrameBase,
  mobileReaderPagedStripLocate,
  mobileReaderPagedStripLocatePage,
  mobileReaderPagedStripPlaceholderKey,
  sameMobileReaderPagedStripFrames,
  shouldWarmMobileReaderPagedStripPrevious,
  type MobileReaderPagedStrip,
  type MobileReaderPagedStripSegment,
} from "@/lib/mobileReaderPagedStrip";
import {
  readerStripSessionKey,
  useReaderChapterStrip,
  type ReaderChapterStrip,
  type ReaderStripSegmentData,
} from "@/components/reader/useReaderChapterStrip";
import {
  combineMobileReaderStripLayouts,
  isMobileReaderStripHeadRemovalOffscreen,
  MOBILE_READER_STRIP_PREPEND_MODE,
  mobileReaderStripCrossing,
  mobileReaderStripHeadRemoval,
  mobileReaderStripPageKey,
  mobileReaderStripRows,
  mobileReaderStripSegmentOffset,
  mobileReaderStripSegmentStarts,
  MOBILE_READER_STRIP_PREPEND_LEAD_PAGES,
  readerSeamlessPaged,
  readerSeamlessScroll,
  shouldAppendMobileReaderStripSegment,
  shouldPrependMobileReaderStripSegment,
  shouldSpliceMobileReaderStripPrevious,
  type MobileReaderStripRow,
} from "@/lib/mobileReaderChapterStrip";
import {
  isMobileReaderStripPlacementOff,
  MOBILE_READER_STRIP_IDENTITY_BRIDGE,
  mobileReaderStripBridgeClampedLocalIndex,
  mobileReaderStripBridgeGlobalIndex,
  mobileReaderStripBridgeLocalAnchor,
  mobileReaderStripBridgeLocalIndex,
  mobileReaderStripBridgeOpenAnchor,
  type MobileReaderStripBridge,
} from "@/lib/mobileReaderStripBridge";
import {
  isMobileReaderStripReanchor,
  nextMobileReaderStripUserMoved,
  shouldTakeMobileReaderStripCrossing,
  type MobileReaderStripAnchor,
  type MobileReaderStripCrossingGateEvent,
} from "@/lib/mobileReaderStripCrossingGate";
import { LinearGradient } from "expo-linear-gradient";
import {
  MobileReaderGallery,
  type MobileReaderImagePlacement,
  type MobileReaderScrollHandle,
  type MobileReaderScrollViewport,
} from "@/components/reader/MobileReaderGallery";
import { readerSegmentErrorKey, readerVisiblePageFailures } from "@/components/reader/readerPageFailures";
import { MobileReaderPageFrame } from "@/components/reader/MobileReaderPageFrame";
import { MobileReaderPageSpinner } from "@/components/reader/MobileReaderPageSpinner";
import { MobileReaderLivePageView } from "@/components/reader/MobileReaderLivePageView";
import {
  readerBookCentreTapBand,
  readerBookTapLayout,
  readerCentreTapBand,
  readerChromeDismissSweep,
} from "@/components/reader/readerTapZones";
import {
  ReaderPairingShiftToast,
  type ReaderPairingShiftToastState,
} from "@/components/reader/ReaderPairingShiftToast";
import { MobileReaderEndOfChapterOverlay } from "@/components/reader/MobileReaderEndOfChapterOverlay";
import { MobileReaderConnectivityNotice } from "@/components/reader/MobileReaderConnectivityNotice";
import { useReportMobileToastRegion } from "@/lib/useReportMobileToastRegion";
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
import { JapaneseLearningSignInSheet } from "@/components/reader/japaneseLearning/JapaneseLearningSignInSheet";
import {
  addJapaneseLearningWaveSample,
  beginJapaneseLearningWave,
  commitJapaneseLearningWave,
  estimateJapaneseLearningWaveDuration,
  flushJapaneseLearningWave,
  JAPANESE_LEARNING_WAVE_RENDER_THROTTLE_MS,
  japaneseLearningWaveAmplitude,
  setJapaneseLearningWaveDuration,
} from "@/lib/mobileJapaneseLearningWave";
import { JapaneseLearningTranscriptSheet } from "@/components/reader/japaneseLearning/JapaneseLearningTranscriptSheet";
import {
  MobileCachedImage,
  MobileSheetMaxHeightProvider,
  MobileSheetPlacementProvider,
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
import { formatChapterRowLabel, formatChapterRowTitle, formatChapterShortLabel, formatChapterTitle } from "@/lib/formatChapter";
import { getMobileChapterVolumeHeaders } from "@/lib/mobileExploreChapterList";
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
  mobileReaderPageFitMode,
  mobileReaderPanBound,
  mobileReaderPanClaim,
  mobileReaderPanFlingTurn,
  mobileReaderPanStepTarget,
  READER_PAN_RESET_AFTER_TURN_MS,
  readerFitModeForShape,
  readerFitRatio,
  type ReaderFitMode,
} from "@/lib/mobileReaderFit";
import { classifyReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import { resolveReaderSpreadWanted, type ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import {
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
  mobileReaderPageIndexForSettledSpread,
  getMobileReaderSpreadImageFrameSize,
  getMobileReaderSpreadSheetFrames,
  getMobileReaderSplitWidePageFrame,
  pageIndexForMobileReaderSpreadStep,
  visualPageIndexesForMobileReaderSpread,
} from "@/lib/mobileReaderSpreads";
import {
  mobileReaderCentresLonePages,
  mobileReaderFlatSpreadState,
  mobileReaderPageReadyForSpread,
  mobileReaderSpreadSettledOnScreen,
} from "@/lib/mobileReaderLoneSpreadPage";
import {
  buildMobileReaderPairedSpreads,
  mobileReaderColourOddPages,
  isMobileReaderWidePage,
  nextMobileReaderSpreadTable,
  type MobileReaderPageSize,
} from "@/lib/mobileReaderPairing";
import { isMobileReaderPageCurlActive } from "@/lib/mobileReaderPageCurl";
import {
  mobileReaderPairingShiftFor,
  mobileReaderPairingShiftKey,
  mobileReaderPairingShifted,
} from "@/lib/mobileReaderPairingShift";
import { useReaderPagePrefs } from "@/components/reader/useReaderPagePrefs";
import { useMobileReaderPageFeatures } from "@/components/reader/useMobileReaderPageFeatures";
import { inferMobileReaderCalibratedParity } from "@/lib/mobileReaderParityInference";
import {
  mobileReaderPageBackgroundColor,
  mobileReaderPageBackgroundIsLight,
} from "@/lib/mobileReaderPageBackground";
import { mobileReaderPageStatusColor } from "@/lib/mobileReaderPageLoading";
import {
  clampReaderPageIndex,
  getReaderContinuousScrollMetrics,
  readerContinuousAccessibilityAction,
  readerContinuousScreenStep,
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
  buildMobileReaderProgressRecords,
  shouldApplyMobileReaderProgressToScreen,
  type MobileReaderProgressTarget,
} from "@/lib/mobileReaderProgressTarget";
import {
  mobileReaderProgressPersistenceKey,
  normalizeMobileReaderIntraPageState,
  persistMobileReaderCompletionBeforeNavigation,
} from "@/lib/mobileReaderProgressPersistence";
import {
  getMobileReaderPageRenderPolicy,
  MOBILE_READER_PAGE_RENDER_WINDOW,
  nextMobileReaderScrollDirection,
  orderMobileReaderScrollProcessing,
  resolveMobileReaderScrollPageRange,
  type MobileReaderPageRange,
  type MobileReaderScrollDirection,
} from "@/lib/mobileReaderPageWindow";
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
  MOBILE_READER_SCROLL_PREFETCH_LANDING_MAX,
  MOBILE_READER_SCROLL_PREFETCH_MIN_AHEAD,
  MOBILE_READER_SCROLL_PREFETCH_MIN_BEHIND,
  MobileReaderImagePrefetcher,
  planMobileReaderNextChapterPrefetch,
  planMobileReaderPagePrefetch,
  planMobileReaderScrollPrefetch,
  shouldPrefetchMobileReaderNextChapter,
} from "@/lib/mobileReaderPagePrefetch";
import { createMobileReaderLivePageStore, mobileReaderLivePageIndex } from "@/lib/mobileReaderLivePage";
import {
  MOBILE_READER_SCROLL_PAGE_SPACING,
  MOBILE_READER_SCROLL_SIDE_MARGIN,
  mobileReaderScrollPageGaps,
  mobileReaderBookScrollStrip,
  isMobileReaderScrollStripChapter,
  mobileReaderScrollSideMargin,
} from "@/lib/mobileReaderScrollPresentation";
import {
  chooseMobileReaderResumePosition,
  flushMobileReaderResumePositions,
  loadMobileReaderResumePosition,
  isMobileReaderLastPageVisible,
  markMobileReaderResumeFinished,
  mobileReaderResumeReread,
  noteMobileReaderResumeProgressWrite,
  saveMobileReaderResumePosition,
  type MobileReaderResumePosition,
} from "@/lib/mobileReaderResumePosition";
import {
  buildMobileReaderScrollLayout,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollOffsetForAnchor,
  mobileReaderScrollKnownMedianRatio,
  mobileReaderScrollStablePageRatios,
  recallMobileReaderPageNaturalSize,
  type MobileReaderScrollRowEstimates,
  rememberMobileReaderPageNaturalSize,
  type MobileReaderScrollPageAnchor,
} from "@/lib/mobileReaderScrollLayout";
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
  acquireMobileReaderHostBackground,
  acquireMobileReaderHostGestureLock,
  mobileReaderScreenOptions,
} from "@/lib/mobileReaderRouteOptions";
import { useMobileConnectivity } from "@/lib/useMobileConnectivity";
import {
  READER_CHROME_MATERIAL_CURVE,
  readerChromeHasScrubber,
  readerChromeMaterialTiming,
  readerOpeningChromeFadeStartsAt,
  resolveReaderOpeningChromeMs,
  resolveReaderOpeningChromeRelease,
} from "@/lib/mobileReaderChromeMotion";
import {
  chapterFromState,
  firstParam,
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
  type MobileReaderPagesRefresh,
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
  loadMobileReaderSourceImageProcessor,
  saveMobileReaderSourceImageProcessor,
} from "@/sources/mobileReaderPageListCache";
import { refreshMobileSourceMetadata } from "@/sources/mobileSourceDetails";
import {
  loadMobileReaderPageSizes,
  makeMobileReaderPageSizeChapterKey,
  saveMobileReaderPageSize,
} from "@/sources/mobileReaderPageSizeCache";
import { resolveMobileReaderPageListFetchedAt } from "@/lib/mobileReaderPageListFetchedAt";
import {
  loadMobileSourceMangaViewer,
  type MobileSourceMangaViewer,
} from "@/lib/mobileSourceMangaViewer";
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
  isMobileJapaneseLearningSignedIn,
  isMobileJapaneseLearningSignInRequiredError,
  useMobileJapaneseLearningAuthState,
} from "@/lib/mobileJapaneseLearningAuth";
import {
  getMobileJapaneseLearningAuthGateStatus,
  resolveMobileJapaneseLearningAuthGate,
  resolveMobileJapaneseLearningChatSignInFailure,
  resolveMobileJapaneseLearningSignInHost,
  type MobileJapaneseLearningSignInHost,
} from "@/lib/mobileJapaneseLearningAuthGate";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import {
  MOBILE_READER_BACK_SYMBOL,
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
  /** The chapter written; defaults to the open one. */
  target?: MobileReaderProgressTarget;
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
/** Top scrim: dark at the edge (status glyphs), gone by the feather below the row. */
const READER_TOP_SCRIM_COLORS = [
  "rgba(0,0,0,0.62)",
  "rgba(0,0,0,0.42)",
  "rgba(0,0,0,0.14)",
  "rgba(0,0,0,0)",
] as const;
/** The same scrim over a light page background (白色), under dark status glyphs. */
const READER_TOP_SCRIM_LIGHT_COLORS = [
  "rgba(255,255,255,0.62)",
  "rgba(255,255,255,0.42)",
  "rgba(255,255,255,0.14)",
  "rgba(255,255,255,0)",
] as const;
const READER_TOP_SCRIM_LOCATIONS = [0, 0.45, 0.8, 1] as const;
/** The vertical bar's status column (time, signal) and a feather below it. */
const READER_RAIL_STATUS_SCRIM_HEIGHT = 200;
/** Glass pieces closer than this blend (the row's pieces sit 10pt apart, so they stay separate at rest). */
const READER_CAPSULE_GLASS_SPACING = 8;
/** How long the chrome stays up after a chapter opens before it fades away. */
const READER_CHROME_AUTO_HIDE_MS = 3000;
// Two-finger double tap (错开一页): each tap is short and the fingers stay put
// (a pinch or a two-finger pan never counts).
const READER_TWO_FINGER_TAP_MAX_DURATION_MS = 300;
const READER_TWO_FINGER_TAP_MAX_DISTANCE = 24;
/** A segmented strip's on-screen tiles are re-read once scrolling rests. */
const READER_SEGMENT_OCR_SETTLE_MS = 180;
/**
 * Scroll mode: a visible page held back during the reader's own scroll lands
 * in the reader state after this pause even if no settle event arrives.
 */
const READER_SCROLL_PAGE_PUBLISH_IDLE_MS = 700;
/**
 * Scroll reading: how long an opening restore may take to come to rest on
 * its page. Past it the restored page stands as the reader's page anyway.
 */
const READER_SCROLL_RESTORE_LANDING_MS = 4_000;
/**
 * iOS presents a sheet on top of another (sheet-on-sheet) when the second is
 * hosted inside the first one's content: the chat opened from the sentence
 * sheet stacks on it, as web's drawer does.
 */
const JAPANESE_LEARNING_CHAT_STACKS_ON_SENTENCE = Platform.OS === "ios";
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

const MOBILE_READER_NO_DETECTIONS: ReturnType<typeof sortedMobileOcrLines> = [];

/**
 * A wide page panned by tap turns (`ZoomableReaderImageFrame.panControls`):
 * `step` pans one window towards the turn's direction and says whether it
 * did (false: the page is at that edge, so the turn goes ahead); `reset`
 * puts a page the reader has left back at its reading-start edge.
 */
type MobileReaderPagePanControl = {
  step: (direction: "previous" | "next") => boolean;
  reset: () => void;
};

const READER_PAN_STEP_TIMING = { duration: 320, easing: Easing.inOut(Easing.cubic) };

function ZoomableReaderImageFrame({
  children,
  frameSize,
  onZoomActiveChange,
  onSwipeTurn,
  pageId,
  panControls,
  rtl = false,
  stageTwoFingerTap,
  viewport,
  zoomTapBand,
}: {
  children: ReactNode;
  /**
   * The stage's two-finger double tap (错开一页): the page's own double-tap
   * zoom waits for it to fail (RNGH taps count any number of fingers), and
   * a two-finger pan never cancels it.
   */
  stageTwoFingerTap?: GestureType;
  frameSize: MobileImageSize;
  /** Reports whether this page is currently zoomed in past its fit scale. */
  onZoomActiveChange?: (pageId: string, active: boolean) => void;
  /**
   * A page fitted larger than its window (not zoomed) that claimed a drag to
   * pan: a drag ending as a sideways swipe turns the page instead
   * (mobileReaderPanFlingTurn), whatever is left to pan.
   */
  onSwipeTurn?: (direction: "previous" | "next") => void;
  pageId: string;
  /**
   * Where a page that overflows its window sideways registers its pan for
   * tap turns, which pan it a window at a time before turning. Omitted: taps
   * turn at once (drags still pan).
   */
  panControls?: Map<string, MobileReaderPagePanControl>;
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
  /** The drag had a second finger at some point (a pinch's pan, never a swipe). */
  const panMultiTouch = useSharedValue(false);
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
  const onSwipeTurnRef = useRef(onSwipeTurn);
  useLayoutEffect(() => {
    onSwipeTurnRef.current = onSwipeTurn;
  }, [onSwipeTurn]);
  const publishSwipeTurn = useCallback((direction: "previous" | "next") => {
    onSwipeTurnRef.current?.(direction);
  }, []);

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

  useEffect(() => {
    if (!panControls) return;
    const boundX = mobileReaderPanBound(frameWidth, viewportWidth, 1);
    if (boundX <= 0) return;
    const control: MobileReaderPagePanControl = {
      step: (direction) => {
        // A zoomed page pans by hand; a tap turns it as before.
        if (scale.value > 1) return false;
        const target = mobileReaderPanStepTarget({
          offset: savedTranslateX.value,
          bound: boundX,
          viewportWidth,
          direction,
          rtl,
        });
        if (target === null) return false;
        savedTranslateX.value = target;
        translateX.value = withTiming(target, READER_PAN_STEP_TIMING);
        return true;
      },
      reset: () => {
        if (scale.value > 1) return;
        translateX.value = restX;
        savedTranslateX.value = restX;
      },
    };
    panControls.set(pageId, control);
    return () => {
      if (panControls.get(pageId) === control) panControls.delete(pageId);
    };
  }, [frameWidth, pageId, panControls, restX, rtl, savedTranslateX, scale, translateX, viewportWidth]);

  // The resting offset is a plain style on a wrapper and the animated
  // transform only the movement away from it. A transform set from the UI
  // thread never reaches the shadow tree, so a page view UIKit re-hosts (the
  // curl pager's leaves) would come back at the centre instead of at rest.
  const restStyle = useMemo(
    () => (panAtRest ? { transform: [{ translateX: restX }, { translateY: restY }] } : null),
    [panAtRest, restX, restY],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value - restX },
      { translateY: translateY.value - restY },
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
        // The first finger down starts a new drag; a second one marks it.
        panMultiTouch.value = event.numberOfTouches >= 2;
        touchStartX.value = touch.absoluteX;
        touchStartY.value = touch.absoluteY;
      })
      .onTouchesMove((event, stateManager) => {
        "worklet";
        // Two fingers always pan (this is the pinch companion that already
        // worked); one finger only pans once the page is actually zoomed.
        if (event.numberOfTouches >= 2) panMultiTouch.value = true;
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
      .onEnd((event) => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        // Fitted larger than the window, not zoomed: a swipe still turns the
        // page (the outer display's wide page fitted by height used to take
        // every swipe as a pan). A zoomed page pans by hand, as before.
        if (scale.value > 1 || !panAtRest || panMultiTouch.value) return;
        const turn = mobileReaderPanFlingTurn({
          velocityX: event.velocityX,
          velocityY: event.velocityY,
          translationX: event.translationX,
          rtl,
        });
        if (turn) runOnJS(publishSwipeTurn)(turn);
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

    if (stageTwoFingerTap) {
      pinchGesture.simultaneousWithExternalGesture(stageTwoFingerTap);
      panGesture.simultaneousWithExternalGesture(stageTwoFingerTap);
      doubleTapGesture.requireExternalGestureToFail(stageTwoFingerTap);
    }
    return Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  }, [
    frameHeight,
    frameWidth,
    panAtRest,
    panMultiTouch,
    publishSwipeTurn,
    publishZoomActive,
    restX,
    restY,
    rtl,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    stageTwoFingerTap,
    touchStartX,
    touchStartY,
    translateX,
    translateY,
    viewportHeight,
    viewportWidth,
    zoomTapBand,
  ]);

  return (
    <View style={restStyle}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={animatedStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * One line per end-of-chapter decision (why the prompt shows, or why a turn
 * past a chapter's edge did something else), for QA on device. No native
 * os_log bridge is callable from JS, so dev builds only, like the strip's
 * prepend log.
 */
/** Past this, a chapter switch showed its loading state (see `readerSwitchPageFade`). */
const MOBILE_READER_SWITCH_PAGE_FADE_AFTER_MS = 150;

function logReaderEndOfChapter(message: string): void {
  if (!__DEV__) return;
  console.info(`[reader-end] ${message}`);
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
  const routeChapterId = normalizeMobileSourceRouteParam(params.chapterId);
  // Seamless scroll: crossing into the next (or previous) chapter in the same
  // list makes it the open chapter at once, without remounting the screen.
  // The route follows through `setParams`, a moment later; until then (and
  // for any route id this list has set) the crossed-into chapter is open.
  const [readerSeamlessChapter, setReaderSeamlessChapter] = useState<{
    chapterId: string;
    /** Route chapter ids this list has stood on (the opening one included). */
    routeChapterIds: readonly string[];
    /** The list's session (see readerStripSessionKey): unchanged by crossings. */
    sessionKey: string;
    /** The arriving chapter's page list identity. */
    fetchedAt: number;
  } | null>(null);
  const chapterId =
    readerSeamlessChapter && readerSeamlessChapter.routeChapterIds.includes(routeChapterId)
      ? readerSeamlessChapter.chapterId
      : routeChapterId;
  /** The open chapter, for async work that must not write into another one. */
  const currentChapterIdRef = useRef(chapterId);
  currentChapterIdRef.current = chapterId;
  const routePage = firstParam(params.page);
  const routeMangaTitle = normalizeMobileReaderRouteLabel(
    params.mangaTitle,
    mangaId,
  );
  const routeChapterFallback = useMemo<ChapterSummary>(
    () => routeChapterId !== chapterId
      // A seamless crossing ahead of its route update: the route's labels
      // are still the previous chapter's.
      ? { id: chapterId }
      : ({
      id: chapterId,
      title:
        normalizeMobileReaderRouteLabel(params.chapterTitle, chapterId) ||
        undefined,
      chapterNumber: parseMobileReaderRouteNumber(params.chapterNumber),
      volumeNumber: parseMobileReaderRouteNumber(params.volumeNumber),
      locked: firstParam(params.chapterLocked) === "true" ? true : undefined,
    }),
    [chapterId, routeChapterId, params.chapterLocked, params.chapterNumber, params.chapterTitle, params.volumeNumber],
  );
  const { reduceMotion, scheme, tokens: readerAppTokens } = useNemuTheme();
  const readerAppBackgroundColor = readerAppTokens.background;
  const readerZoomEntry = useReaderZoomEntry();
  // The opening window (zoom landing → cover fade end): a chapter the page-list
  // cache already painted asks the source only once it has closed, so a cold
  // app's first sandbox boot (~1 s on main) cannot freeze the fade. Read
  // through a ref: the page-list effect must not re-run for it.
  const readerOpeningGateRef = useRef(readerZoomEntry.openingGate);
  readerOpeningGateRef.current = readerZoomEntry.openingGate;
  /** The open chapter was painted from the persisted page list. */
  const readerOpenPaintedFromCacheRef = useRef(false);
  const readerZoomEntryRef = useRef(readerZoomEntry);
  readerZoomEntryRef.current = readerZoomEntry;
  /**
   * QA `hold` (see `readerOpeningHold`): this open's pages wait for the
   * source's processor, so its source calls run at once and the cover waits
   * for the first screen's images instead of fading into plates.
   */
  const readerOpeningHeldRef = useRef(false);
  /** The opening's processed-source choice, logged once per open. */
  const readerOpeningProcessedLoggedRef = useRef(false);
  const holdReaderOpeningIfProcessed = useCallback(
    (
      openingPages: readonly MobileReaderPage[],
      from: "cache" | "source",
      processor: { imageProcessor: boolean | null; reason: ReaderImageProcessorReason },
    ) => {
      if (readerOpeningHeldRef.current) return;
      const gate = readerOpeningGateRef.current;
      const pagesNeedProcessing = readerPagesNeedProcessing(openingPages);
      if (!pagesNeedProcessing) return;
      const openingSettled = gate.isSettled();
      const hold = shouldHoldReaderOpeningForImages({
        imageProcessor: processor.imageProcessor,
        pagesNeedProcessing,
        openingSettled,
      });
      if (__DEV__ && !readerOpeningProcessedLoggedRef.current) {
        readerOpeningProcessedLoggedRef.current = true;
        console.info("[reader-open] processed-source opening", {
          from,
          reason: processor.reason,
          imageProcessor: processor.imageProcessor,
          openingSettled,
          hold,
        });
      }
      if (!hold) {
        return;
      }
      readerOpeningHeldRef.current = true;
      readerZoomEntryRef.current.holdForFirstScreenImages();
    },
    [],
  );
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [readerIsFocused, setReaderIsFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setReaderIsFocused(true);
    return () => setReaderIsFocused(false);
  }, []));
  useMobilePoseVeilAppearance(readerIsFocused ? READER_POSE_VEIL : null);
  const [readerStageWindowOrigin, setReaderStageWindowOrigin] = useState({ x: 0, y: 0 });
  const appObservedWindowLayout = useMobileObservedWindowLayout();
  // Until this reader's observer reports (a moment after it mounts, at the
  // zoom's landing): the last reader layout of this same window, so the first
  // frame is laid out as the settled one (peekMobileReaderWindowLayout); with
  // none (the first open after a cold launch), the reader's layout computed
  // from the app's window and the reader's own bar rules
  // (mobileReaderDerivedWindowLayout: no tab bar column where it opts out).
  const [reservedLayout, setReservedLayout] = useState<MobileWindowLayout | null>(() =>
    peekMobileReaderWindowLayout(window, appObservedWindowLayout)
      ?? mobileReaderDerivedWindowLayout(window, appObservedWindowLayout),
  );
  // The reader's own layout is known: seeded from this window's last reader
  // report (a reopen), or once this reader's observer has reported. Until
  // then (a cold first open) the layout is derived from the app's, and the
  // opening's chrome is held transparent (see readerOpeningChromePhase).
  const [readerOwnLayoutKnown, setReaderOwnLayoutKnown] = useState(
    () => peekMobileReaderWindowLayout(window, appObservedWindowLayout) != null,
  );
  const onReaderWindowLayoutChange = useCallback((layout: MobileWindowLayout) => {
    rememberMobileReaderWindowLayout(layout);
    setReservedLayout(layout);
    setReaderOwnLayoutKnown(true);
  }, []);
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const {
    mode,
    setMode,
    scrollWidthPct,
    setScrollWidthPct,
    processPageImages,
    setProcessPageImages,
  } = useReadingMode();
  const { chapterCompleteCelebration } = useMobileFeedbackSettings();
  const {
    ready: readerDisplayPrefsReady,
    keepAwake: readerKeepAwake,
    setKeepAwake: setReaderKeepAwake,
    lockPortrait: readerLockPortrait,
    setLockPortrait: setReaderLockPortrait,
    spreadMode: readerSpreadMode,
    setSpreadMode: setReaderSpreadMode,
    avoidCamera: readerAvoidCamera,
    setAvoidCamera: setReaderAvoidCamera,
    fitModes: readerFitModes,
    setFitMode: setReaderFitMode,
  } = useReaderDisplayPrefs();
  const readerConnectivity = useMobileConnectivity();
  const readerPlugins = useMobileReaderPlugins();
  const installedReaderSources = useInstalledSources({ includeLocalArchive: true });
  // The gallery's own handle (list rows and list offsets) ...
  const readerGalleryScrollRef = useRef<MobileReaderScrollHandle | null>(null);
  // ... and where the open chapter sits in that list (seamless scroll).
  const readerStripBridgeRef = useRef<MobileReaderStripBridge>(MOBILE_READER_STRIP_IDENTITY_BRIDGE);
  // The reader's handle: the open chapter's own page indexes and layout
  // offsets, translated to and from the list's through the bridge.
  const readerScrollRef = useRef<MobileReaderScrollHandle | null>(null);
  if (!readerScrollRef.current) {
    readerScrollRef.current = {
      scrollTo(options) {
        const bridge = readerStripBridgeRef.current;
        readerGalleryScrollRef.current?.scrollTo({
          ...options,
          y: options.y != null ? options.y + bridge.offsetBase : options.y,
          index:
            options.index != null
              ? mobileReaderStripBridgeGlobalIndex(bridge, options.index)
              : options.index,
        });
      },
      pageAnchor() {
        return mobileReaderStripBridgeLocalAnchor(
          readerStripBridgeRef.current,
          readerGalleryScrollRef.current?.pageAnchor() ?? null,
        );
      },
      rowsSettling() {
        return readerGalleryScrollRef.current?.rowsSettling() ?? false;
      },
      scrollViewport() {
        const viewport = readerGalleryScrollRef.current?.scrollViewport() ?? null;
        return viewport
          ? { top: viewport.top - readerStripBridgeRef.current.offsetBase, height: viewport.height }
          : null;
      },
      centrePageIndex() {
        return mobileReaderStripBridgeClampedLocalIndex(
          readerStripBridgeRef.current,
          readerGalleryScrollRef.current?.centrePageIndex() ?? null,
        );
      },
      scrollToProgress(progress, animated) {
        return readerGalleryScrollRef.current?.scrollToProgress(progress, animated) ?? false;
      },
      scrollToProgressAfterContentChange(progress) {
        readerGalleryScrollRef.current?.scrollToProgressAfterContentChange(progress);
      },
    };
  }
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
    /** The chapter the position belongs to. */
    target: MobileReaderProgressTarget;
  } | null>(null);
  const progressPersistenceClockRef = useRef(0);
  const readerProgrammaticScrollRef =
    useRef<ReaderProgrammaticScrollTarget | null>(null);
  const readerProgrammaticScrollClearTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const scrollingPageMetricsRef = useRef<ReaderScrollPageMetric[]>([]);
  const scrollingVisiblePageIndexRef = useRef(0);
  // Scroll mode: while the reader's own drag/fling is running, the visible
  // page stays out of React state (one commit when the scroll settles); only
  // the progress bar follows it live, through this store.
  const readerUserScrollingRef = useRef(false);
  /** Seamless scroll: the reader has scrolled this list itself (a prepend may then land). */
  const readerStripUserScrolledRef = useRef(false);
  /**
   * Seamless reading: a drag, swipe or turn by the reader since the open
   * chapter was opened or last re-anchored (a splice in front of it). A
   * backward crossing needs it (see mobileReaderStripCrossingGate).
   */
  const readerStripUserMovedRef = useRef(false);
  const noteReaderStripGate = useCallback((event: MobileReaderStripCrossingGateEvent) => {
    readerStripUserMovedRef.current = nextMobileReaderStripUserMoved(readerStripUserMovedRef.current, event);
  }, []);
  const readerScrollPublishTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const readerScrollDirectionRef =
    useRef<MobileReaderScrollDirection>("forward");
  const readerScrollPrefetchTopUpRef = useRef<(pageIndex: number) => void>(
    () => undefined,
  );
  // The pages around where the running fling comes to rest (iOS), warmed
  // until the scroll settles.
  const readerScrollFlingLandingRef = useRef<MobileReaderPageRange | null>(null);
  const [readerLivePageStore] = useState(createMobileReaderLivePageStore);
  const readerRelayoutPageAnchorRef = useRef<number | null>(null);
  // The spot this screen holds in the chapter (display page, and in scroll
  // reading how far into it the reading line sits): the opening target until
  // it lands, then where the reader last rested. A page-list refresh
  // re-places the list here.
  const readerHeldSpotRef = useRef<{
    chapterId: string;
    mode: string;
    pageIndex: number;
    fraction: number;
  } | null>(null);
  // How far into the anchored page the reading line sat (scroll layout).
  const readerRelayoutPageFractionRef = useRef(0);
  const readerRelayoutSeekFractionRef = useRef<{ key: string; fraction: number } | null>(null);
  // Remembers where this device stopped (local only); set further down.
  const saveReaderLocalResumeRef = useRef<() => void>(() => undefined);
  /** Scroll mode: remembers the page (and spot on it) a relayout keeps. */
  const captureReaderRelayoutAnchor = useCallback(() => {
    if (readerRelayoutPageAnchorRef.current != null) return;
    const anchor = readerScrollRef.current?.pageAnchor() ?? null;
    readerRelayoutPageAnchorRef.current =
      anchor?.pageIndex ?? scrollingVisiblePageIndexRef.current;
    readerRelayoutPageFractionRef.current = anchor?.fraction ?? 0;
    saveReaderLocalResumeRef.current();
  }, []);
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
  /** The chat voice message whose live peaks are being read (web `commitPeaks` on stop). */
  const japaneseLearningChatWaveIdRef = useRef<string | null>(null);
  const japaneseLearningLifecycleRef = useRef<ReturnType<
    typeof createMobileJapaneseLearningScreenLifecycle
  > | null>(null);
  if (!japaneseLearningLifecycleRef.current) {
    japaneseLearningLifecycleRef.current =
      createMobileJapaneseLearningScreenLifecycle();
  }
  const [showControlsState, setShowControlsState] = useState(true);
  // A first open holds the HUD back until its loading screen has left and
  // the first page shows (see readerOpeningLoading): it then comes in with
  // the usual show animation, and the usual rules (auto-hide) start there.
  // Asked for meanwhile (a tap, an unreadable chapter), the loading screen
  // leaves at once and the HUD shows: its Back is the reader's only way out.
  const readerOpeningHudHeld = useReaderOpeningHudHeld();
  const readerOpeningHudHeldRef = useRef(readerOpeningHudHeld);
  readerOpeningHudHeldRef.current = readerOpeningHudHeld;
  const setShowControls = useCallback((next: SetStateAction<boolean>) => {
    if (readerOpeningHudHeldRef.current && next !== false) {
      readerZoomEntryRef.current.releaseHud();
      setShowControlsState(true);
      return;
    }
    setShowControlsState(next);
  }, []);
  // QA builds (EXPO_PUBLIC_READER_QA_CHROME=1) keep the chrome up for screenshots.
  const showControls = MOBILE_READER_QA_CHROME || (showControlsState && !readerOpeningHudHeld);
  const [loading, setLoading] = useState(true);
  /**
   * The chapter whose saved progress `state` holds. A seamless crossing opens
   * the next chapter before its progress is read; until then nothing may
   * write (or show) progress for it from the previous chapter's record.
   */
  const [readerProgressLoadedFor, setReaderProgressLoadedFor] = useState<string | null>(null);
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
  // Scroll reading: the opening restore is placing the list on its page.
  // Until it rests there nothing the list reports (viewability, a settle,
  // a failed seek) moves the reader's page, and progress is not saved.
  const readerScrollLandingRef = useRef<{
    pageIndex: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [readerScrollLandingPending, setReaderScrollLandingPending] =
    useState(false);
  const [pagesState, setPagesState] = useState<ReaderPagesState>({
    status: "idle",
    pages: [],
    detail: strings.reader.readerPagesIdle,
  });
  // Keep-awake waits for pages: a chapter stuck loading or blocked should not
  // hold the screen on. The reader rotates like the rest of the app (an
  // ordinary iPhone is portrait everywhere); on iPad and both Duo displays
  // only its Orientation Lock holds the orientation it has.
  const deviceFormFactor = useMobileDeviceFormFactor();
  const readerOrientationLockAvailable = mobileReaderOrientationLockAvailable({
    formFactor: deviceFormFactor,
  });
  const readerOrientationRequest = mobileReaderOrientationRequest({
    userLock: readerLockPortrait && readerOrientationLockAvailable,
    sceneLockAvailable: interfaceOrientationLockAvailable,
  });
  useReaderDisplayEnvironment({
    keepAwakeEnabled: readerKeepAwake,
    keepAwakeReady: pagesState.status === "ready",
    // Only while the reader is the screen on top: a reader left mounted in
    // another tab's stack must not hold the Library or Browse portrait.
    portraitRequested: readerIsFocused && readerOrientationRequest.portrait,
    keepOrientationRequested: readerIsFocused && readerOrientationRequest.keepOrientation,
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
    "transcript" | "chat" | "signIn" | null
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
  // Web `useAuthGate` + `AuthGateDialog`: Nemu Chat's entries check sign-in
  // first (`requireAuthOrPrompt`), and signed out present the app's sign-in
  // UI instead of the chat. An iOS sheet presents from the topmost one, so
  // the sign-in sheet stacks on the open chat or sentence sheet.
  const japaneseLearningAuth = useMobileJapaneseLearningAuthState();
  const japaneseLearningAuthPendingRef = useRef(japaneseLearningAuth.pending);
  japaneseLearningAuthPendingRef.current = japaneseLearningAuth.pending;
  const japaneseLearningLauncherVisibleRef = useRef(japaneseLearningLauncherVisible);
  japaneseLearningLauncherVisibleRef.current = japaneseLearningLauncherVisible;
  const [japaneseLearningSignInHost, setJapaneseLearningSignInHost] =
    useState<MobileJapaneseLearningSignInHost | null>(null);
  const closeJapaneseLearningSignIn = useCallback(() => {
    setJapaneseLearningSignInHost(null);
  }, []);
  const promptJapaneseLearningSignIn = useCallback(() => {
    // A build without sync has no sign-in to show.
    if (!mobileSyncConfig.configured) return;
    if (japaneseLearningLauncherVisibleRef.current) {
      // The launcher finishes closing first (one native sheet at a time).
      japaneseLearningLauncherNextSurfaceRef.current = "signIn";
      setJapaneseLearningLauncherVisible(false);
      return;
    }
    setJapaneseLearningSignInHost(
      resolveMobileJapaneseLearningSignInHost({
        platform: Platform.OS,
        chatVisible: japaneseLearningChatDrawerPresenceRef.current.wanted,
        sentenceVisible: japaneseLearningOcrSheetPresenceRef.current.wanted,
      }),
    );
  }, []);
  /** Web `requireAuthOrPrompt`. */
  const requireJapaneseLearningAuthOrPrompt = useCallback((): boolean => {
    // QA fixtures answer without the server, like `runMobileJapaneseLearningChat`.
    if (getMobileJapaneseLearningQaScenario("chat")) return true;
    // A build without sync has no sign-in to ask for: the chat opens as before.
    if (!mobileSyncConfig.configured) return true;
    const gate = resolveMobileJapaneseLearningAuthGate(
      getMobileJapaneseLearningAuthGateStatus({
        signedIn: isMobileJapaneseLearningSignedIn(),
        pending: japaneseLearningAuthPendingRef.current,
      }),
    );
    if (gate.promptSignIn) promptJapaneseLearningSignIn();
    return gate.allowed;
  }, [promptJapaneseLearningSignIn]);
  // The sheet the sign-in stacked on went away: it went with it.
  useEffect(() => {
    if (
      (japaneseLearningSignInHost === "chat" && !japaneseLearningChatDrawerVisible) ||
      (japaneseLearningSignInHost === "sentence" && !japaneseLearningOcrSheetVisible)
    ) {
      setJapaneseLearningSignInHost(null);
    }
  }, [
    japaneseLearningChatDrawerVisible,
    japaneseLearningOcrSheetVisible,
    japaneseLearningSignInHost,
  ]);
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
  // Where this device stopped in the chapter (local only, read with the
  // synced progress; see mobileReaderResumePosition).
  const [readerLocalResume, setReaderLocalResume] = useState<{
    key: string;
    position: MobileReaderResumePosition | null;
    /** The synced record read with it (the opening choice compares them). */
    progress: LocalChapterProgress | null;
  } | null>(null);
  const [sourceMangaTitle, setSourceMangaTitle] = useState<string | null>(null);
  // The source's reading format for this manga (Aidoku `viewer`), as last
  // reported to this device; decides the scroll spacing before page sizes do.
  const [readerSourceViewer, setReaderSourceViewer] = useState<{
    key: string;
    viewer: MobileSourceMangaViewer | null;
  } | null>(null);
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

  const finishReaderScrollLanding = useCallback(
    (outcome: "landed" | "timeout" | "user") => {
      const landing = readerScrollLandingRef.current;
      if (!landing) return;
      clearTimeout(landing.timer);
      readerScrollLandingRef.current = null;
      if (outcome !== "user") {
        // The restored page is the reader's page — never wherever a
        // half-placed list happened to sit. (A drag instead makes the
        // reader's own position the real one.)
        scrollingVisiblePageIndexRef.current = landing.pageIndex;
        // Process from the restored page, with the list's viewport there.
        readerScrollPrefetchTopUpRef.current(landing.pageIndex);
        const target = readerProgrammaticScrollRef.current;
        if (target?.kind === "page" && target.pageIndex === landing.pageIndex) {
          clearReaderProgrammaticScroll();
        }
        // The restore puts its page's spot at the reading line, so the page
        // under the screen's centre can be the next one. The gallery already
        // knows it (and will not report it again until it changes): show it
        // in the counter like any scroll would, without committing it.
        const centre = readerScrollRef.current?.centrePageIndex() ?? null;
        readerLivePageStore.set(
          centre != null && centre !== landing.pageIndex
            ? { index: centre, baseIndex: landing.pageIndex }
            : null,
        );
      }
      setReaderScrollLandingPending(false);
    },
    [clearReaderProgrammaticScroll, readerLivePageStore],
  );
  const armReaderScrollLanding = useCallback(
    (pageIndex: number) => {
      if (readerScrollLandingRef.current) {
        clearTimeout(readerScrollLandingRef.current.timer);
      }
      readerScrollLandingRef.current = {
        pageIndex,
        timer: setTimeout(
          () => finishReaderScrollLanding("timeout"),
          READER_SCROLL_RESTORE_LANDING_MS,
        ),
      };
      setReaderScrollLandingPending(true);
    },
    [finishReaderScrollLanding],
  );
  useEffect(
    () => () => {
      // A new chapter or presentation restores (and lands) anew.
      const landing = readerScrollLandingRef.current;
      if (landing) clearTimeout(landing.timer);
      readerScrollLandingRef.current = null;
      setReaderScrollLandingPending(false);
    },
    [chapterId, mode],
  );

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
  const sourceSettings = useMobileSourceQuickSettings({
    strings,
    onSourceChanged: () => setPagesRefreshNonce((value) => value + 1),
  });

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
  // Any chapter's page identity and stable size key: seamless scroll holds
  // the chapters around the open one, keyed exactly as each will be when open.
  const readerPageIdentityForChapter = useCallback(
    (forChapterId: string, page: MobileReaderPage) =>
      getMobileReaderLogicalPageIdentity({
        registryId: routeRef.registryId,
        sourceId: routeRef.sourceId,
        mangaId,
        chapterId: forChapterId,
        pageId: page.id,
        imageUri: page.imageUri,
        headers: page.headers,
      }),
    [mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const readerStablePageSizeKeyForChapter = useCallback(
    (forChapterId: string, page: Pick<MobileReaderPage, "id">) =>
      JSON.stringify([
        "reader-page-size",
        routeRef.registryId,
        routeRef.sourceId,
        mangaId,
        forChapterId,
        page.id,
      ]),
    [mangaId, routeRef.registryId, routeRef.sourceId],
  );
  const readerPageIdentityFor = useCallback(
    (page: MobileReaderPage) => readerPageIdentityForChapter(chapterId, page),
    [chapterId, readerPageIdentityForChapter],
  );
  const readerStablePageSizeKeyFor = useCallback(
    (page: MobileReaderPage) => readerStablePageSizeKeyForChapter(chapterId, page),
    [chapterId, readerStablePageSizeKeyForChapter],
  );
  // Natural page sizes persist per chapter (see mobileReaderPageSizeCache):
  // the pages effect restores them before the chapter paints. Refs, so that
  // effect keeps its request-only dependencies.
  const readerPageSizeChapterKey = makeMobileReaderPageSizeChapterKey({
    registryId: routeRef.registryId,
    sourceId: routeRef.sourceId,
    mangaId,
    chapterId,
  });
  const readerPageSizeChapterKeyRef = useRef(readerPageSizeChapterKey);
  readerPageSizeChapterKeyRef.current = readerPageSizeChapterKey;
  const readerStablePageSizeKeyForRef = useRef(readerStablePageSizeKeyFor);
  readerStablePageSizeKeyForRef.current = readerStablePageSizeKeyFor;
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
      const localResumeKey = makeChapterProgressId(
        progressSourceRef.registryId,
        progressSourceRef.sourceId,
        progressSourceRef.sourceMangaId,
        chapterId,
      );
      const [chapterProgress, localResume] = await Promise.all([
        loadMobileChapterProgressForSourceChapter(
          store,
          progressSourceRef,
          installedSources,
          chapterId,
        ),
        loadMobileReaderResumePosition(localResumeKey).catch(() => null),
      ]);
      const progressIndex = new Map(
        mangaProgressItems.map((item) => [item.id, item]),
      );
      const mangaProgress =
        findMobileMangaProgressForSource(
          progressSourceRef,
          installedSources,
          progressIndex,
        ) ?? null;
      setReaderLocalResume((current) =>
        // One snapshot per chapter: a reload while reading (a sync, a data
        // change) must not move the opening position under the reader.
        current?.key === localResumeKey
          ? current
          : { key: localResumeKey, position: localResume, progress: chapterProgress },
      );
      // A seamless crossing may have opened another chapter meanwhile: its
      // own load owns the state (this chapter's progress must not stand in
      // for it).
      if (currentChapterIdRef.current !== chapterId) return;
      setState({ entry, sourceLink, chapterProgress, mangaProgress });
      setReaderProgressLoadedFor(chapterId);
    } catch (error) {
      // As before a failed read: the chapter opens without saved progress
      // (never with another chapter's).
      if (currentChapterIdRef.current === chapterId) {
        setState((current) =>
          current.chapterProgress && current.chapterProgress.sourceChapterId !== chapterId
            ? { ...current, chapterProgress: null }
            : current,
        );
        setReaderProgressLoadedFor(chapterId);
      }
      throw error;
    } finally {
      if (currentChapterIdRef.current === chapterId) setLoading(false);
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
  // Only the open chapter's own record (see readerProgressLoadedFor).
  const readerChapterProgress =
    readerProgressLoadedFor === chapterId ? state.chapterProgress : null;
  const completed = readerChapterProgress?.completed ?? false;
  // `null` while unknown: the chrome then leads with the chapter line.
  const mangaTitle = getMobileReaderTitle(
    state.entry,
    mangaId,
    sourceMangaTitle,
    routeMangaTitle,
  );
  const pages = pagesState.pages;
  const pageCount = pages.length;
  // The opening's loading screen without a zoom shows the library's cover.
  const readerOpeningTitleCover = useMobileExploreEntryCover(
    readerOpeningHudHeld ? state.entry : null,
    installedReaderSources.data,
  );
  useEffect(() => {
    if (readerOpeningHudHeld) readerZoomEntry.onTitleCover(readerOpeningTitleCover);
  }, [readerOpeningHudHeld, readerOpeningTitleCover, readerZoomEntry]);

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
  // Scroll reading processes from the live page (see
  // `topUpReaderScrollPrefetch`), not around the settled one.
  const readerScrollProcessing =
    mode === "scrolling" && pageProcessor?.processPages != null;
  useEffect(() => {
    if (readerScrollProcessing || !pageProcessor || pageCount <= 0) return;
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
        return { ...current, pages: keepMobileReaderResolvedPages(current.pages, result.pages) };
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
  }, [clampedPageIndex, pageCount, pageProcessor, readerScrollProcessing]);
  // Scroll reading: the wanted pages are handed over on every page crossing;
  // pages finish one by one and are published at most once a frame.
  const readerScrollProcessPagesRef = useRef<
    (indexes: readonly number[]) => void
  >(() => undefined);
  useEffect(() => {
    if (!readerScrollProcessing || !pageProcessor || pageCount <= 0) {
      readerScrollProcessPagesRef.current = () => undefined;
      return;
    }
    let active = true;
    let frame: number | null = null;
    let latestPages: MobileReaderPage[] | null = null;
    const flush = () => {
      frame = null;
      const nextPages = latestPages;
      latestPages = null;
      if (!active || !nextPages) return;
      setPagesState((current) => {
        if (
          current.status !== "ready" ||
          current.pageProcessor !== pageProcessor
        ) {
          return current;
        }
        return { ...current, pages: keepMobileReaderResolvedPages(current.pages, nextPages) };
      });
    };
    const onUpdate = (result: MobileReaderPageWindowResult) => {
      if (!active) return;
      latestPages = result.pages;
      if (frame == null) frame = requestAnimationFrame(flush);
    };
    readerScrollProcessPagesRef.current = (indexes) =>
      pageProcessor.processPages?.(indexes, { onUpdate });
    return () => {
      active = false;
      if (frame != null) cancelAnimationFrame(frame);
      readerScrollProcessPagesRef.current = () => undefined;
      pageProcessor.processPages?.([]);
    };
  }, [pageCount, pageProcessor, readerScrollProcessing]);
  // Retry on a page whose processing failed: processed again (shown pending
  // meanwhile). Stable, so the scroll cells' memo never changes with it.
  const retryReaderPageProcessingRef = useRef<(index: number) => void>(() => undefined);
  retryReaderPageProcessingRef.current = (index) => {
    if (!pageProcessor?.retryPage) return;
    const apply = (result: MobileReaderPageWindowResult) =>
      setPagesState((current) =>
        current.status === "ready" && current.pageProcessor === pageProcessor
          ? { ...current, pages: result.pages }
          : current,
      );
    void pageProcessor
      .retryPage(index, { onUpdate: apply })
      .then((result) => {
        if (result) apply(result);
      })
      .catch(() => undefined);
  };
  const retryReaderPageProcessing = useCallback(
    (index: number) => retryReaderPageProcessingRef.current(index),
    [],
  );
  // Seamless scroll: a chapter the reader crossed out of stays in the list,
  // its processor now the strip's (it disposes it when the chapter leaves).
  const readerStripRetainsProcessorRef = useRef<
    (processor: MobileReaderPageProcessor) => boolean
  >(() => false);
  useEffect(() => {
    return () => {
      if (pageProcessor && !readerStripRetainsProcessorRef.current(pageProcessor)) {
        pageProcessor.dispose();
      }
    };
  }, [pageProcessor]);
  const sourcePageNumber = pageCount
    ? readerRoutePageForDisplayIndex(clampedPageIndex, pageCount, mode)
    : 0;
  // No "Untitled" in the chrome while the chapter is known only by its id:
  // the capsule shows the manga title over the page count until it loads.
  // The title's chapter list puts volumes in headers (and its rows leave
  // them out) for a list like this one.
  const readerChapterListDropsVolume = useMemo(
    () =>
      mobileDesignExploreFlag &&
      pagesState.status === "ready" &&
      getMobileChapterVolumeHeaders(pagesState.chapters).size > 0,
    [pagesState],
  );
  // The chapter as its row in the title's chapter list says it (the same
  // call and arguments: the volume left to the list's volume header).
  const chapterTitle =
    formatChapterRowLabel(chapter, strings, { dropVolume: readerChapterListDropsVolume }) ??
    (mangaTitle ? "" : formatChapterTitle(chapter, strings));
  const sourcePageForDisplayIndex = useCallback(
    (displayIndex: number) =>
      readerRoutePageForDisplayIndex(displayIndex, pageCount, mode),
    [mode, pageCount],
  );
  const displayedPages = useMemo(() => {
    return pages;
  }, [pages]);
  // Resolving a cached page URI hashes it with a pure-JS SHA-256. Page
  // analysis asks for the same handful of pages again and again, so a
  // resolved URI is remembered per page image (id + URI: a write that lands
  // after the page changed can never answer for its new image) and thrown
  // away with the page list.
  const readerScrubPreviewUriByPageIdRef = useRef(new Map<string, string>());
  useEffect(() => {
    readerScrubPreviewUriByPageIdRef.current = new Map();
  }, [displayedPages]);
  // A page's cached file, remembered per page (the full-page cache and the
  // source's headers).
  const readerPageCachedFileUri = useCallback(
    async (index: number, signal: AbortSignal): Promise<string | null> => {
      const page = displayedPages[index];
      // A page waiting for its processing, or whose processing failed, holds
      // the source's original (raw, scrambled for Jump+): never a thumbnail.
      if (!page?.imageUri || page.imageProcessing === "pending" || page.imageProcessing === "failed") return null;
      if (page.imageUriOwnership === "app") return page.imageUri;
      const resolvedByPageId = readerScrubPreviewUriByPageIdRef.current;
      const memoKey = `${page.id}\u0001${page.imageUri}`;
      const remembered = resolvedByPageId.get(memoKey);
      if (remembered !== undefined) return remembered;
      const source = { uri: page.imageUri, headers: page.headers, cacheKind: "page" as const };
      const resolved = getCachedMobileImageUriSync(source)
        ?? await resolveCachedMobileImageUri(source, undefined, undefined, { priority: "prefetch", signal });
      if (resolved && !signal.aborted) resolvedByPageId.set(memoKey, resolved);
      return resolved ?? null;
    },
    [displayedPages],
  );
  // Kept while the page ids are unchanged: processing a page replaces the
  // page list, but must not hand every scroll cell a new render epoch.
  const readerDisplayIndexByPageIdRef = useRef<{
    signature: string;
    map: Map<string, number>;
  } | null>(null);
  const readerDisplayIndexByPageId = useMemo(() => {
    const signature = displayedPages.map((page) => page.id).join("\u0000");
    const previous = readerDisplayIndexByPageIdRef.current;
    if (previous?.signature === signature) return previous.map;
    const map = new Map<string, number>();
    displayedPages.forEach((page, index) => map.set(page.id, index));
    readerDisplayIndexByPageIdRef.current = { signature, map };
    return map;
  }, [displayedPages]);
  const currentDisplayedPage = displayedPages[clampedPageIndex] ?? null;
  const currentDisplayedPageKey = currentDisplayedPage?.id ?? "";
  const currentDisplayedPageIdentity = currentDisplayedPage
    ? readerPageIdentityFor(currentDisplayedPage)
    : "";
  const savedIntraPageState = normalizeMobileReaderIntraPageState({
    intraPageProgress: readerChapterProgress?.intraPageProgress,
    intraPageContentIdentity: readerChapterProgress?.intraPageContentIdentity,
  });
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
  // Seamless scroll: the identities of the neighbouring chapters' pages
  // (their sizes and errors are kept as well as the open chapter's).
  const readerStripNeighbourIdentitiesRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const pageIdentities = new Set(pages.map(readerPageIdentityFor));
    readerStripNeighbourIdentitiesRef.current.forEach((identity) => pageIdentities.add(identity));
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
  /** The chapter list is in: a missing neighbour is really absent (else the controls stay neutral). */
  const readerChaptersKnown = readerChapters.length > 0;
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
  // Until the reader's own observer reports, the app's (the same window):
  // the bar decision is the one the route made at the push, so the reader's
  // first options never flip the header (see the reader route's static options).
  const readerVerticalBar = mobileReaderVerticalBarPolicy(reservedLayout ?? appObservedWindowLayout ?? {});
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
  // A two-page spread across the whole window (paged, wide window, no bar
  // column): a centred fold keeps its pages in place (the pose's halves).
  const readerKeepsWindowSpread = Boolean(reservedLayout)
    && galleryPagedMode
    && pageCount > 1
    && !readerSideBar
    && (reservedLayout?.width ?? 0) > (reservedLayout?.height ?? 0)
    && resolveReaderSpreadWanted(readerSpreadMode, reservedLayout ?? { width: 0, height: 0 });
  const readerSampledWindowLayout = useMemo<MobileWindowLayout>(() => {
    if (!reservedLayout) {
      return {
        width: window.width, height: window.height, supported: false,
        divisions: [], occlusions: [],
      };
    }
    // The hinge reports before the fold region turns active: lay the fold
    // out as soon as the hinge says it is partially open (until it expires).
    // A paged spread across a centred fold keeps every page where it is, so
    // it is not anticipated (no layout pass with nothing to lay out).
    const anticipated = mobileReaderAnticipatedWindowLayout(reservedLayout, {
      hintExpired: readerHingeHintExpired,
      keepsSpread: readerKeepsWindowSpread,
    });
    if (readerSideBarInsetLeft === null || readerSideBarInsetRight === null || !anticipated.safeAreaInsets) {
      return anticipated;
    }
    return {
      ...anticipated,
      safeAreaInsets: { ...anticipated.safeAreaInsets, left: readerSideBarInsetLeft, right: readerSideBarInsetRight },
    };
  }, [readerHingeHintExpired, readerKeepsWindowSpread, readerSideBarInsetLeft, readerSideBarInsetRight, reservedLayout, window.height, window.width]);
  // The reading area's safe area never follows the status bar (it shows and
  // hides with the controls): latched per window configuration, the widest
  // inset and the status island seen (`mobileReaderNextLayoutInsetLatch`).
  // Live `insets` only place the chrome that fades with the status bar.
  const [readerLayoutInsetLatch, setReaderLayoutInsetLatch] =
    useState<MobileReaderLayoutInsetLatch | null>(null);
  // Started from this configuration's latch seen earlier this session (a
  // reopen): the island is known from the first frame, so the shown chrome
  // never moves once the status bar appears with it.
  const readerLayoutInsetKey = mobileReaderLayoutInsetLatchKey(readerSampledWindowLayout);
  const readerLayoutInsets = mobileReaderNextLayoutInsetLatch(
    mobileReaderLayoutInsetLatchBase(readerLayoutInsetLatch, readerLayoutInsetKey),
    readerLayoutInsetKey,
    readerSampledWindowLayout.safeAreaInsets ?? insets,
    readerSampledWindowLayout.occlusions,
  );
  if (readerLayoutInsets !== readerLayoutInsetLatch) setReaderLayoutInsetLatch(readerLayoutInsets);
  useEffect(() => {
    rememberMobileReaderLayoutInsetLatch(readerLayoutInsets);
  }, [readerLayoutInsets]);
  const readerFoldedWindowLayout = useMemo(
    () => mobileReaderLatchedWindowLayout(readerSampledWindowLayout, readerLayoutInsets),
    [readerLayoutInsets, readerSampledWindowLayout],
  );
  const readerLayoutSafeInsets = readerLayoutInsets.insets;
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
  // images the bar tints); only Back is the system chevron, in both chromes.
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
  const [japaneseLearningChatFromSentence, setJapaneseLearningChatFromSentence] =
    useState(false);
  const japaneseLearningSurfaceOpen =
    japaneseLearningOcrSheetVisible ||
    japaneseLearningChatDrawerVisible ||
    japaneseLearningTranscriptVisible ||
    japaneseLearningTranscriptNextSurfaceRef.current === "ocr";
  // Icon slots in the capsule chrome's actions capsule, without the bilingual
  // toggle (added below once the pose says whether it shows). Derived in the
  // same render as the pose, so the title capsule is never clamped against a
  // stale action count.
  const readerFoldedAdaptive = mobileAdaptiveLayout(readerFoldedWindowLayout);
  const readerNotebookFold = readerFoldedAdaptive.posture === "notebook";
  // Half folded like a laptop, reader sheets belong to the bottom pane: never
  // past the hinge over the page.
  const readerNotebookSheetCap = readerNotebookFold && readerFoldedAdaptive.panels.length === 2
    ? readerNotebookSheetMaxHeight({
        paneHeight: readerFoldedAdaptive.panels[1].height,
        bottomInset: readerFoldedWindowLayout.safeAreaInsets?.bottom ?? insets.bottom,
      })
    : null;
  // Half folded like a laptop the reader reads as on the open display: the
  // whole window, the fold no pane boundary.
  const readerWindowLayout = useMemo(
    () => (readerNotebookFold ? mobileReaderLayoutWithoutFold(readerFoldedWindowLayout) : readerFoldedWindowLayout),
    [readerFoldedWindowLayout, readerNotebookFold],
  );
  const readerBaseActionSlots = mobileReaderCapsuleActionSlots({
    enabledPluginIds: enabledReaderPlugins.map((plugin) => plugin.id),
    bilingualToggle: false,
  });
  const outerReaderCanvas = readerSideBar && readerWindowLayout.hinge === "closed"
    && readerWindowLayout.fillsScreen !== false;
  // Outer display: the bar's book button swaps the page for the title's cover
  // (Apple Books there). A session choice, never saved: every reader opens on
  // the page. It shows only on the outer canvas; leaving it (unfold, book
  // posture) returns to reading. The reading position is never touched.
  const readerCoverViewTitleCover = useReaderTitleCover({
    enabled: outerReaderCanvas,
    entry: state.entry,
    installedSources: installedReaderSources.data,
    routeSource: selectedInstalledSource,
    registryId,
    sourceId,
    mangaId,
  });
  const readerCoverViewImage = useMemo(
    () => resolveMobileReaderCoverViewImage({ cover: readerCoverViewTitleCover, firstPage: pages[0] ?? null }),
    [pages, readerCoverViewTitleCover],
  );
  const readerCoverViewAvailable = mobileReaderCoverViewAvailable({
    outerCanvas: outerReaderCanvas,
    image: readerCoverViewImage,
  });
  const [readerCoverViewRequested, setReaderCoverViewRequested] = useState(false);
  if (readerCoverViewRequested !== mobileReaderNextCoverViewRequest(readerCoverViewRequested, readerCoverViewAvailable)) {
    setReaderCoverViewRequested(false);
  }
  const readerCoverViewShown = readerCoverViewRequested && readerCoverViewAvailable;
  // The cover's own tap toggle for the system chrome (status bar, Back and the
  // toggle): the reading HUD's state and its auto-hide stay out of it.
  const [readerCoverChromeShown, setReaderCoverChromeShown] = useState(true);
  const readerBarChromeShown = mobileReaderCoverViewBarChromeShown({
    coverShown: readerCoverViewShown,
    coverChromeShown: readerCoverChromeShown,
    readerControlsShown: showControls,
  });
  const currentPageNaturalSize = displayedPages[clampedPageIndex]
    ? readerImageSizes.get(readerPageIdentityFor(displayedPages[clampedPageIndex])) : undefined;
  const readerPageAspectRatio = 1 / readerFitRatio(currentPageNaturalSize);
  // Book posture: a reader sheet takes one half beside the fold, so the page
  // moves to the other while it is open (one page fitted there) and returns
  // when it closes. The page stays live beside the sheet: the learning
  // sheets show the selected bubble themselves (no popout over the page), and
  // a word block tapped on the page fills the open sentence sheet.
  const readerBookPosture = readerFoldedAdaptive.posture === "book";
  const readerBookSheetOpen =
    readerDisplaySettingsOpen ||
    readerPluginSettingsOpen ||
    japaneseLearningLauncherVisible ||
    japaneseLearningOcrSheetVisible ||
    japaneseLearningTranscriptVisible ||
    japaneseLearningChatDrawerVisible;
  const readerSheetSideWanted = readerBookSheetOpen && readerBookPosture
    ? mobileReaderBookSheetSide(readerWindowLayout.layoutDirection)
    : null;
  // The page leaves the sheet's half only once the sheet has slid over it
  // (it never drops to black ahead of the sheet), and comes back the moment
  // the sheet starts to close, so it is there as the sheet slides away.
  const [readerSheetSideCovered, setReaderSheetSideCovered] = useState<typeof readerSheetSideWanted>(null);
  if (readerSheetSideCovered !== null && readerSheetSideCovered !== readerSheetSideWanted) {
    setReaderSheetSideCovered(null);
  }
  useEffect(() => {
    if (readerSheetSideWanted === null) return;
    const timer = setTimeout(() => setReaderSheetSideCovered(readerSheetSideWanted), MOBILE_READER_BOOK_SHEET_COVER_MS);
    return () => clearTimeout(timer);
  }, [readerSheetSideWanted]);
  const readerSheetSide = readerSheetSideCovered !== null && readerSheetSideCovered === readerSheetSideWanted
    ? readerSheetSideCovered
    : null;
  const buildReaderPose = useCallback(
    (actionCount: number, spreadMode: ReaderSpreadMode, sheetSide: typeof readerSheetSide = readerSheetSide) =>
      mobileReaderPoseLayout({
        layout: readerWindowLayout,
        pageAspectRatio: readerPageAspectRatio,
        avoidCamera: readerAvoidCamera,
        fallbackInsets: readerLayoutSafeInsets,
        paged: galleryPagedMode,
        pageCount,
        twoPage: spreadMode === "double",
        spreadMode,
        rtl: mode === "rtl",
        actionCount,
        sideBar: readerSideBar,
        sheetSide,
        // Book posture, scroll reading: the strip keeps its half.
        scrollReading: !pagedMode,
      }),
    [
      pagedMode,
      readerSheetSide,
      readerPageAspectRatio,
      readerAvoidCamera,
      readerSideBar,
      galleryPagedMode,
      readerLayoutSafeInsets,
      mode,
      pageCount,
      readerWindowLayout,
    ],
  );
  // The action count only moves the capsule chrome, never the stage, so the
  // pose without the bilingual toggle decides whether the toggle shows.
  const readerBasePose = useMemo(
    () => buildReaderPose(readerBaseActionSlots, readerSpreadMode),
    [buildReaderPose, readerBaseActionSlots, readerSpreadMode],
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
  // What the settings describe: the pose without a sheet beside the fold, so
  // the rows (pairing, page fit) never change under the open sheet.
  const readerPoseWithoutSheet = useMemo(
    () => (readerSheetSide ? buildReaderPose(readerActionSlots, readerSpreadMode, null) : readerPose),
    [buildReaderPose, readerActionSlots, readerPose, readerSheetSide, readerSpreadMode],
  );
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
  // Book posture (vertical hinge) spread: each half is a page, so only each
  // half's outer strip turns pages and the hinge band takes no taps. Flat,
  // notebook and the outer display keep the stage-wide bands.
  const readerBookTaps = useMemo(
    () =>
      readerPose.posture === "book"
        ? readerBookTapLayout({ stageWidth: readerPageWidth, foldGap: readerFoldGap, spreadSlots: readerSpreadSlots })
        : null,
    [readerFoldGap, readerPageWidth, readerPose.posture, readerSpreadSlots],
  );
  // The pose decides whether spreads are possible at all (drives the setting)
  // and whether one is shown right now.
  const twoPageSupported = readerPose.twoPageAvailable;
  const isTwoPageMode = !bilingualOverrides && readerPose.spread && pageCount > 1;
  // A spread that gave way to a sheet beside the fold still counts for the
  // settings (and its one page is fitted whole in the free half).
  const readerSettingsTwoPage = !bilingualOverrides && readerPoseWithoutSheet.spread && pageCount > 1;
  // Page fit is remembered per window shape (narrow, wide, large), judged by
  // the rectangle the page sits in — the pane in the notebook pose, the whole
  // window across a fold — never by orientation or idiom. Spreads, the
  // bilingual book and long strips are always fitted whole.
  const readerWindowShape = classifyReaderWindowShape(bilingualOverrides?.stage ?? readerPoseWithoutSheet.stage);
  const readerFitSetting = readerFitModeForShape(readerFitModes, readerWindowShape);
  const readerFitMode: ReaderFitMode =
    galleryPagedMode && !readerSettingsTwoPage && !bilingualOverrides ? readerFitSetting : "page";
  // A wide page alone in a portrait window fits the window's height and pans
  // (mobileReaderPageFitMode); its frame registers here so a tap turn pans it
  // a window at a time before the page turns. A page the reader has left goes
  // back to its reading-start edge once the turn has finished (see below).
  const readerPagePanControlsRef = useRef(new Map<string, MobileReaderPagePanControl>());
  const readerPageLayoutVisible = galleryPagedMode && pageCount > 0;
  const setReaderSpreadModeFromSettings = useCallback(
    (value: ReaderSpreadMode) => {
      if (value === readerSpreadMode || readerSettingsActionBusy) return;
      void runReaderSettingsAction("two-page-mode", () => setReaderSpreadMode(value));
    },
    [readerSettingsActionBusy, readerSpreadMode, runReaderSettingsAction, setReaderSpreadMode],
  );
  const setReaderAvoidCameraFromSettings = useCallback(
    (enabled: boolean) => {
      if (enabled === readerAvoidCamera || readerSettingsActionBusy) return;
      void runReaderSettingsAction("camera-mode", () => setReaderAvoidCamera(enabled));
    },
    [readerAvoidCamera, readerSettingsActionBusy, runReaderSettingsAction, setReaderAvoidCamera],
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
    twoPageEnabled: readerSettingsTwoPage,
  });
  // Spread pairing from page shape: a wide page stands alone and parity
  // restarts after it. Sizes arrive as pages decode; the spreads the reader
  // has seen stay put and only the pages ahead re-pair.
  const {
    spreadPairing: readerSpreadPairing,
    setSpreadPairing: setReaderSpreadPairing,
    pairingShifts: readerPairingShifts,
    togglePairingShift: toggleReaderPairingShift,
    pageBackground: readerPageBackground,
    setPageBackground: setReaderPageBackground,
    pageTurn: readerPageTurn,
    setPageTurn: setReaderPageTurn,
  } = useReaderPagePrefs();
  // 翻页 › 卷页: paged turns curl like a book (Reduce Motion keeps the slide).
  const readerPageCurlActive = isMobileReaderPageCurlActive({
    pageTurn: readerPageTurn,
    pagedMode: galleryPagedMode,
    reduceMotion,
    longStrip: useLongStripPresentation,
    segmented: Boolean(currentSegmentedImage),
    available: pageCurlAvailable,
  });
  // Pages near the reader are measured natively while a spread can show:
  // their size (wide pages are known before they decode) and their binding
  // margins (automatic pairing). Cached per chapter.
  const readerPageAnalysisIds = useMemo(
    () => displayedPages.map((page) => (page.imageUri ? page.id : null)),
    [displayedPages],
  );
  const readerPageFeatures = useMobileReaderPageFeatures({
    // Spreads pair from the measurements; "Match Page" reads the border colour.
    // Scroll reading reads it too: the setting applies there as well.
    enabled: (galleryPagedMode && twoPageSupported) || readerPageBackground === "page",
    chapterKey: JSON.stringify([registryId, sourceId, mangaId, chapterId]),
    pageIds: readerPageAnalysisIds,
    currentPageIndex: clampedPageIndex,
    resolveFile: readerPageCachedFileUri,
  });
  // Measured on an earlier visit (this app session). Also by the page's place
  // in the chapter: a source may sign its image URLs per fetch, which changes
  // the identity of the same page on every open.
  const readerRecalledPageSizeFor = useCallback(
    (page: MobileReaderPage): MobileReaderPageSize | undefined =>
      recallMobileReaderPageNaturalSize(readerPageIdentityFor(page)) ??
      recallMobileReaderPageNaturalSize(readerStablePageSizeKeyFor(page)),
    [readerPageIdentityFor, readerStablePageSizeKeyFor],
  );
  const readerPageSizeAt = useCallback(
    (index: number): MobileReaderPageSize | null => {
      const page = displayedPages[index];
      if (!page) return null;
      const identity = readerPageIdentityFor(page);
      return readerImageSizes.get(identity)
        ?? readerRecalledPageSizeFor(page)
        ?? readerPageFeatures.get(page.id)
        ?? page.sourceSize
        ?? null;
    },
    [displayedPages, readerImageSizes, readerPageFeatures, readerPageIdentityFor, readerRecalledPageSizeFor],
  );
  const readerIsWidePage = useCallback(
    (index: number) => isMobileReaderWidePage(readerPageSizeAt(index)),
    [readerPageSizeAt],
  );
  const readerPairingShiftKey = mobileReaderPairingShiftKey(registryId, sourceId, mangaId);
  // 错开一页 is this chapter's own; the manga's learned default (the same
  // correction on two neighbouring chapters) flips only rule-decided spreads.
  const readerPairingShift = mobileReaderPairingShifted(readerPairingShifts[readerPairingShiftKey], chapterId);
  const readerPairingShiftApplied = mobileReaderPairingShiftFor(readerPairingShifts[readerPairingShiftKey], chapterId);
  const readerPairingNeighbourIds = useMemo(
    () => [chapterNavigation.leftChapter?.id ?? null, chapterNavigation.rightChapter?.id ?? null],
    [chapterNavigation.leftChapter?.id, chapterNavigation.rightChapter?.id],
  );
  // Two fingers, double tap: 错开一页 exactly as the menu row (this chapter,
  // remembered for the manga; the page on screen leads), with a haptic and a
  // short toast. Only while the row is offered (spreads in paged reading).
  const [readerPairingShiftToast, setReaderPairingShiftToast] = useState<ReaderPairingShiftToastState | null>(null);
  const dismissReaderPairingShiftToast = useCallback(
    (id: number) => setReaderPairingShiftToast((current) => (current?.id === id ? null : current)),
    [],
  );
  const readerTwoFingerDoubleTapRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    readerTwoFingerDoubleTapRef.current = () => {
      if (!showPagePairingControls || readerSettingsActionBusy) return;
      void hapticConfirm();
      setReaderPairingShiftToast({ id: Date.now(), on: !readerPairingShift });
      void runReaderSettingsAction("page-pairing-mode", () =>
        toggleReaderPairingShift(readerPairingShiftKey, chapterId, readerPairingNeighbourIds),
      );
    };
  }, [
    chapterId,
    readerPairingNeighbourIds,
    readerPairingShift,
    readerPairingShiftKey,
    readerSettingsActionBusy,
    runReaderSettingsAction,
    showPagePairingControls,
    toggleReaderPairingShift,
  ]);
  // One gesture for the whole stage, so two fingers on either page of a
  // spread (or across the spine) count; fixed so pages never re-serialize.
  const readerTwoFingerDoubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .minPointers(2)
        .maxDuration(READER_TWO_FINGER_TAP_MAX_DURATION_MS)
        .maxDelay(MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS)
        .maxDistance(READER_TWO_FINGER_TAP_MAX_DISTANCE)
        .runOnJS(true)
        .onStart(() => readerTwoFingerDoubleTapRef.current()),
    [],
  );
  // What the user chose: changing it re-pairs the whole chapter around the
  // page they are on (that page leads, Komikku-style).
  const readerPairingChoiceKey = `${readerSpreadPairing}:${readerPairingShiftApplied.shift ? "shift" : readerPairingShiftApplied.fallbackShift ? "learned" : "base"}`;
  // A colour page inside a black-and-white chapter (cover, insert, credits)
  // stands alone and pairing restarts after it.
  const readerColourOddAt = useMemo(
    () =>
      mobileReaderColourOddPages(pageCount, (index) => {
        const page = displayedPages[index];
        return page ? readerPageFeatures.get(page.id)?.chroma ?? null : null;
      }),
    [displayedPages, pageCount, readerPageFeatures],
  );
  // Flat spreads: a page's image has loaded (its natural size is known) or
  // failed (its retry shows). Until both pages of a pair are, the pair is
  // laid out facing with its second page hidden in place (see
  // mobileReaderLoneSpreadPage), and a turn to that spread never plays the
  // half-page flip (its leaves would show the facing page before it is ready).
  /**
   * Pages once ready stay ready: a facing page shown is never hidden again
   * (a retry clearing its error, a size map pruned and refilled).
   */
  const readerPageEverReadyRef = useRef(new Set<string>());
  const readerPageImageReadyForChapter = useCallback(
    (forChapterId: string, page: MobileReaderPage) => {
      if (!page.imageUri) return true;
      const identity = readerPageIdentityForChapter(forChapterId, page);
      const everReady = readerPageEverReadyRef.current;
      const ready = mobileReaderPageReadyForSpread({
        loaded: readerImageSizes.has(identity),
        failed: readerImageErrors.has(identity),
        everReady: everReady.has(identity),
      });
      if (ready) everReady.add(identity);
      return ready;
    },
    [readerImageErrors, readerImageSizes, readerPageIdentityForChapter],
  );
  const readerPageImageReady = useCallback(
    (page: MobileReaderPage) => readerPageImageReadyForChapter(chapterId, page),
    [chapterId, readerPageImageReadyForChapter],
  );
  const readerComputedSpreads = useMemo(
    () =>
      isTwoPageMode
        ? buildMobileReaderPairedSpreads({
            pageCount,
            sizeAt: readerPageSizeAt,
            pairing: readerSpreadPairing,
            oddAt: readerColourOddAt,
            shift: readerPairingShiftApplied.shift,
            fallbackShift: readerPairingShiftApplied.fallbackShift,
            inferParity: (segment, known) =>
              inferMobileReaderCalibratedParity({
                segment,
                known,
                featuresAt: (index) => {
                  const page = displayedPages[index];
                  return page ? readerPageFeatures.get(page.id) : null;
                },
                rtl: mode === "rtl",
              }),
          })
        : [],
    [
      displayedPages,
      isTwoPageMode,
      mode,
      pageCount,
      readerColourOddAt,
      readerPageFeatures,
      readerPageSizeAt,
      readerPairingShiftApplied.fallbackShift,
      readerPairingShiftApplied.shift,
      readerSpreadPairing,
    ],
  );
  const readerSpreadTableRef = useRef<{ key: string; spreads: number[][]; generation: number } | null>(null);
  const readerSpreadTableKey = `${chapterId}:${pagesState.status === "ready" ? pagesState.fetchedAt : 0}:${pageCount}:${readerPairingChoiceKey}`;
  /**
   * Seamless paged reading: every chapter's spread table as last shown, by
   * chapter id (the open one's and its neighbours'), keyed like
   * `readerSpreadTableKey`, with the spreads that have been on screen
   * (locked: never re-paired). A chapter crossed into starts from the table
   * it was shown with, so its landing spread is the one that was drawn.
   */
  const readerSegmentSpreadTablesRef = useRef(
    new Map<string, { key: string; spreads: number[][]; locked: number[][] }>(),
  );
  /** The pager is showing the open chapter's table (its opening restore placed it). */
  const readerSpreadsOnScreenRef = useRef(false);
  // Until the reader turns a page the table may still re-pair around the
  // spread on screen (the opening pages are measured within moments); the
  // gallery re-anchors on the page the reader is on (`readerSpreadGeneration`).
  // The spread on screen itself is locked: a pairing once shown is never
  // re-paired by a later image load (a page found wide pairs anew from the
  // next turn). After that only the pages ahead re-pair.
  const readerSpreadsProvisional = pageArrival === "initial";
  /**
   * The spread is fixed as shown: a pair is laid out facing from its first
   * frame, loaded or not, so a neighbour's load never re-pairs it. It splits
   * only if its own pages prove unable to face (a page found wide). Sizes as
   * pairing reads them (`readerPageSizeAt`, `readerStripPageSize`).
   */
  const readerSpreadSettledFor = useCallback(
    (forChapterId: string, pagesOfChapter: readonly MobileReaderPage[], spread: readonly number[] | undefined) =>
      spread != null
      && mobileReaderSpreadSettledOnScreen({
        spread,
        sizeAt: (index) => {
          const page = pagesOfChapter[index];
          if (!page) return null;
          const identity = readerPageIdentityForChapter(forChapterId, page);
          return readerImageSizes.get(identity)
            ?? recallMobileReaderPageNaturalSize(identity)
            ?? recallMobileReaderPageNaturalSize(readerStablePageSizeKeyForChapter(forChapterId, page))
            ?? (forChapterId === chapterId ? readerPageFeatures.get(page.id) : undefined)
            ?? page.sourceSize
            ?? null;
        },
      }),
    [chapterId, readerImageSizes, readerPageFeatures, readerPageIdentityForChapter, readerStablePageSizeKeyForChapter],
  );
  const { spreads: readerSpreads, generation: readerSpreadGeneration } = useMemo(() => {
    const previous = readerSpreadTableRef.current;
    const sameKey = previous?.key === readerSpreadTableKey;
    const stored = readerSegmentSpreadTablesRef.current.get(chapterId);
    const seeded = !sameKey && stored?.key === readerSpreadTableKey ? stored : null;
    const base = sameKey ? previous.spreads : (seeded?.spreads ?? null);
    // Shown spreads stay as shown, except a flat pair still waiting on a page
    // (its first page alone, centred): that one may still split.
    const settled = (spread: readonly number[] | undefined) =>
      readerSpreadSettledFor(chapterId, displayedPages, spread);
    const locked = (stored?.key === readerSpreadTableKey ? stored.locked : []).filter(settled);
    const baseCurrent = base?.find((spread) => spread.includes(clampedPageIndex)) ?? base?.[base.length - 1];
    const spreads = isTwoPageMode
      ? nextMobileReaderSpreadTable({
          previous: base,
          computed: readerComputedSpreads,
          reset: base == null,
          currentPageIndex: clampedPageIndex,
          provisional: readerSpreadsProvisional,
          displayed: (seeded != null || readerSpreadsOnScreenRef.current) && settled(baseCurrent),
          locked,
        })
      : [];
    const spreadOf = (table: readonly number[][]) => table.findIndex((spread) => spread.includes(clampedPageIndex));
    const moved = base !== null && spreads !== base && spreadOf(spreads) !== spreadOf(base);
    const generation = (previous?.generation ?? 0) + (moved ? 1 : 0);
    readerSpreadTableRef.current = isTwoPageMode ? { key: readerSpreadTableKey, spreads, generation } : null;
    if (isTwoPageMode && pagesState.status === "ready") {
      // The spread the reader is on is shown: it joins the locked ones.
      const shown = readerSpreadsOnScreenRef.current || seeded != null
        ? spreads[Math.max(0, spreadOf(spreads))]
        : undefined;
      const onScreen = settled(shown) ? shown : undefined;
      const nextLocked = onScreen && !locked.some((spread) => spread.length === onScreen.length && spread.every((page, at) => page === onScreen[at]))
        ? [...locked.filter((spread) => !spread.some((page) => onScreen.includes(page))), onScreen]
        : locked;
      readerSegmentSpreadTablesRef.current.set(chapterId, { key: readerSpreadTableKey, spreads, locked: nextLocked });
    }
    return { spreads, generation };
    // The current page only matters at the moment the table changes: a page
    // turn alone must not rebuild it. Readiness does: a pair once shown
    // facing joins the locked ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTwoPageMode, readerComputedSpreads, readerSpreadSettledFor, readerSpreadTableKey, readerSpreadsProvisional]);
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
  // Each open-chapter page's frame view: where it sits, for the opening
  // stand-in (see mobileReaderOpeningStandIn). Stable callbacks per page.
  const readerPageFrameViewsRef = useRef(
    new Map<string, { view: ViewInstance; leafOffset: { x: number; y: number } | null }>(),
  );
  const readerPageFrameRefCallbacksRef = useRef(
    new Map<string, (view: ViewInstance | null, leafOffset: { x: number; y: number } | null) => void>(),
  );
  const readerPageFrameRefFor = useCallback((pageId: string) => {
    const known = readerPageFrameRefCallbacksRef.current.get(pageId);
    if (known) return known;
    let attached: ViewInstance | null = null;
    const callback = (view: ViewInstance | null, leafOffset: { x: number; y: number } | null) => {
      const views = readerPageFrameViewsRef.current;
      if (view) {
        attached = view;
        views.set(pageId, { view, leafOffset });
      } else if (attached && views.get(pageId)?.view === attached) {
        views.delete(pageId);
        attached = null;
      }
    };
    readerPageFrameRefCallbacksRef.current.set(pageId, callback);
    return callback;
  }, []);
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
  // A page on screen still loading no longer holds the tap zones: a tap
  // turns onto it like a swipe (its placeholder shows; it loads first).
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
  const edgeToEdgePage = outerReaderCanvas || (
    readerWindowLayout.fillsScreen !== false
    && readerWindowLayout.divisions.length > 0
    && readerPose.posture === "flat"
  );
  const readerSourceViewerKey = makeMobileSourceDetailCacheKey(registryId, sourceId, mangaId);
  // Book posture, scroll reading: the strip fills its half less 8pt either
  // side for ordinary manga, edge to edge for a webtoon strip.
  const readerBookScrollStripPane = readerPose.freeHalf != null;
  const readerBookScrollStripChapter = useMemo(
    () =>
      readerBookScrollStripPane && !galleryPagedMode
        ? isMobileReaderScrollStripChapter(
            displayedPages.length,
            readerPageSizeAt,
            readerSourceViewer?.key === readerSourceViewerKey
              ? readerSourceViewer.viewer
              : null,
          )
        : false,
    [
      displayedPages.length,
      galleryPagedMode,
      readerPageSizeAt,
      readerBookScrollStripPane,
      readerSourceViewer,
      readerSourceViewerKey,
    ],
  );
  const readerBookScrollStrip =
    readerBookScrollStripPane && !galleryPagedMode
      ? mobileReaderBookScrollStrip({
          paneWidth: readerStage.width,
          stripChapter: readerBookScrollStripChapter,
          widthScale: readerScrollWidthScale(activeScrollWidthPct),
        })
      : null;
  const readerImageWidth = readerBookScrollStrip
    ? readerBookScrollStrip.imageWidth
    : pagedMode
    ? isTwoPageMode
      ? Math.max(1, readerSafeContentWidth / 2)
      : // The whole page as large as fits: a regular-width window (an iPad, the
        // Duo's open display) is not held to a phone-sized column.
        Math.max(readerStageConstrained ? 1 : 240, readerSafeContentWidth - (edgeToEdgePage ? 0 : 24))
    : Math.min(readerSafeContentWidth, 720) *
      readerScrollWidthScale(activeScrollWidthPct);
  const segmentedImageFrames = useMemo(
    () =>
      currentSegmentedImage && pageCount === 1
        ? getMobileReaderSegmentFrames(currentSegmentedImage, readerImageWidth)
        : [],
    [currentSegmentedImage, pageCount, readerImageWidth],
  );
  // Vertical list spacing: webtoon strips meet edge to edge, ordinary pages
  // keep 8pt; a 100% page width has no side margin. Paged mode ignores both.
  const readerScrollPageGaps = useMemo(
    () =>
      galleryPagedMode
        ? null
        : mobileReaderScrollPageGaps(
            displayedPages.length,
            readerPageSizeAt,
            readerSourceViewer?.key === readerSourceViewerKey
              ? readerSourceViewer.viewer
              : null,
          ),
    [
      displayedPages.length,
      galleryPagedMode,
      readerPageSizeAt,
      readerSourceViewer,
      readerSourceViewerKey,
    ],
  );
  // (A paged chapter's single long page shown as a strip keeps its margin.)
  const readerScrollSideMargin = pagedMode
    ? MOBILE_READER_SCROLL_SIDE_MARGIN
    : readerBookScrollStrip
      ? readerBookScrollStrip.sideMargin
      : mobileReaderScrollSideMargin(activeScrollWidthPct);
  // Scroll reading: every page's height is known up front — its own size
  // (decoded now, earlier this session, measured, or sent by the source),
  // else the chapter's typical page — so a page index is one exact offset.
  // Only for an all-image page list (a text page sizes itself).
  const readerScrollLayoutEnabled =
    !pagedMode &&
    !galleryPagedMode &&
    !isLongStripLogicalPage &&
    !currentSegmentedImage &&
    displayedPages.length > 0 &&
    displayedPages.every((page) => Boolean(page.imageUri) || !page.text);
  // The series' typical page as last seen this session (a chapter's known
  // pages' median): a chapter opened with no page size yet — a seamless
  // crossing into the chapter below — stands in at it, not at 1:1.45, so
  // its rows do not all rescale the moment one of its pages decodes.
  const readerTypicalPageRatioRef = useRef<number | null>(null);
  // Every page with no size of its own keeps the estimate it was first laid
  // out with (by page identity) until its own size is known — open chapter
  // or neighbour, before and after a crossing: rows above the reading line
  // never move with a chapter's median (see mobileReaderScrollStablePageRatios).
  const readerRowEstimatesRef = useRef<MobileReaderScrollRowEstimates>(new Map());
  const readerScrollLayout = useMemo(() => {
    if (!readerScrollLayoutEnabled) return null;
    const ratios = mobileReaderScrollStablePageRatios(
      displayedPages.length,
      readerPageSizeAt,
      (index) => {
        const page = displayedPages[index];
        return page ? readerPageIdentityFor(page) : null;
      },
      readerRowEstimatesRef.current,
      readerTypicalPageRatioRef.current,
    );
    const layout = buildMobileReaderScrollLayout(
      ratios.map((ratio) => readerImageWidth * ratio),
      readerScrollPageGaps,
      MOBILE_READER_SCROLL_PAGE_SPACING,
      // Real heights: decoded now or earlier this session. A size the source
      // reported may still differ from the decoded picture.
      displayedPages.map(
        (page) =>
          readerImageSizes.has(readerPageIdentityFor(page)) ||
          readerRecalledPageSizeFor(page) != null,
      ),
    );
    if (readerImageWidth > 0) {
      readerTypicalPageRatioRef.current =
        mobileReaderScrollKnownMedianRatio(layout, readerImageWidth) ?? readerTypicalPageRatioRef.current;
    }
    return layout;
  }, [
    displayedPages,
    readerImageSizes,
    readerPageIdentityFor,
    readerRecalledPageSizeFor,
    readerImageWidth,
    readerPageSizeAt,
    readerScrollLayoutEnabled,
    readerScrollPageGaps,
  ]);
  const scrollingPageEstimatedHeight = readerImageWidth * 1.45;
  const scrollingPageOffsetForIndex = useCallback(
    (pageIndex: number, fraction = 0): number => {
      if (readerScrollLayout) {
        return mobileReaderScrollOffsetForAnchor(readerScrollLayout, pageIndex, fraction);
      }
      const targetIndex = clampReaderPageIndex(pageIndex, pageCount);
      let offset = 0;
      for (let index = 0; index < targetIndex; index += 1) {
        const measuredHeight = scrollingPageMetricsRef.current[index]?.height;
        offset +=
          measuredHeight && measuredHeight > 0
            ? measuredHeight
            : scrollingPageEstimatedHeight;
      }
      // Each page's gap sits above it, the target page's own gap included.
      for (let index = 1; index <= targetIndex; index += 1) {
        offset += readerScrollPageGaps?.[index] ?? MOBILE_READER_SCROLL_PAGE_SPACING;
      }
      return offset;
    },
    [pageCount, readerScrollLayout, readerScrollPageGaps, scrollingPageEstimatedHeight],
  );
  const readyFetchedAt =
    pagesState.status === "ready" ? pagesState.fetchedAt : 0;

  // ---- Seamless scroll (readerSeamlessScroll) -----------------------------
  // Scroll mode keeps reading into the next chapter in the same list: the
  // chapters before and after the open one join it (with a divider between),
  // and crossing a divider makes the chapter below (or above) the open one
  // without a remount. Paged, two-page, long-strip and segmented chapters
  // keep their own presentation (and the chapter turn as before).
  const readerSeamlessScrollEnabled =
    readerSeamlessScroll &&
    mode === "scrolling" &&
    !galleryPagedMode &&
    readerScrollLayout != null &&
    pagesState.status === "ready" &&
    pageCount > 1;
  // Paged reading (slide and curl, single pages and spreads, LTR and RTL):
  // the pager joins the chapters around the open one back to back (see
  // mobileReaderPagedStrip). Not for a bilingual pair (its own stage).
  const readerSeamlessPagedEnabled =
    readerSeamlessPaged &&
    galleryPagedMode &&
    !bilingualOverrides &&
    pagesState.status === "ready" &&
    pageCount > 1;
  const readerSeamlessEnabled = readerSeamlessScrollEnabled || readerSeamlessPagedEnabled;
  /** The crossing this chapter was opened by, while its pages are the ones shown. */
  const readerSeamlessArrived =
    readerSeamlessChapter != null &&
    readerSeamlessChapter.chapterId === chapterId &&
    pagesState.status === "ready" &&
    readerSeamlessChapter.fetchedAt === readyFetchedAt;
  const readerStripSession = readerSeamlessArrived
    ? readerSeamlessChapter.sessionKey
    : readerStripSessionKey(chapterId, readyFetchedAt);
  const readerStripCurrent = useMemo<ReaderStripSegmentData | null>(
    () =>
      pagesState.status === "ready"
        ? {
            chapter: { ...pagesState.chapter, id: chapterId },
            pages: pagesState.pages,
            pageProcessor: pagesState.pageProcessor,
            fetchedAt: pagesState.fetchedAt,
          }
        : null,
    [chapterId, pagesState],
  );
  // The open chapter's page as the strip's fetch triggers see it: only
  // whether it is near either end matters (so a page crossing does not
  // re-render the screen for it).
  const [readerStripTriggerIndex, setReaderStripTriggerIndex] = useState(0);
  const readerStripTriggerFor = useCallback(
    (localIndex: number) =>
      shouldAppendMobileReaderStripSegment(localIndex, pageCount)
        ? Math.max(0, pageCount - 1)
        : shouldPrependMobileReaderStripSegment(localIndex, true)
          ? 0
          : Math.min(Math.max(0, pageCount - 1), MOBILE_READER_STRIP_PREPEND_LEAD_PAGES),
    [pageCount],
  );
  useEffect(() => {
    setReaderStripTriggerIndex(readerStripTriggerFor(clampedPageIndex));
  }, [clampedPageIndex, readerStripTriggerFor]);
  // Set further down (they read what is declared there).
  const readerStripLoadChapterRef = useRef<
    (chapter: ChapterSummary) => Promise<MobileReaderPagesRefresh | null>
  >(async () => null);
  const readerStripCanPrependRef = useRef<() => boolean>(() => false);
  const readerStripCanSplicePreviousRef = useRef<() => boolean>(() => false);
  const readerStripHeadOffscreenRef = useRef<
    (strip: ReaderChapterStrip, count: number) => boolean
  >(() => false);
  const readerStripLoadChapter = useCallback(
    (target: ChapterSummary) => readerStripLoadChapterRef.current(target),
    [],
  );
  const readerStripCanPrepend = useCallback(() => readerStripCanPrependRef.current(), []);
  const readerStripCanSplicePrevious = useCallback(
    () => readerStripCanSplicePreviousRef.current(),
    [],
  );
  const readerStripDescribePosition = useCallback(() => {
    const anchor = mobileReaderStripBridgeOpenAnchor(
      readerStripBridgeRef.current,
      readerGalleryScrollRef.current?.pageAnchor() ?? null,
    );
    return `${anchor ? `p${anchor.pageIndex + 1}@${anchor.fraction.toFixed(2)}` : "outside"}${
      readerUserScrollingRef.current ? " scrolling" : " rest"
    }`;
  }, []);
  const readerStripHeadOffscreen = useCallback(
    (strip: ReaderChapterStrip, count: number) => readerStripHeadOffscreenRef.current(strip, count),
    [],
  );
  const readerChapterStrip = useReaderChapterStrip({
    enabled: readerSeamlessEnabled,
    current: readerStripCurrent,
    sessionKey: readerStripSession,
    chapters: readerChapters,
    currentLocalIndex: readerStripTriggerIndex,
    loadChapter: readerStripLoadChapter,
    isHeadRemovalOffscreen: readerStripHeadOffscreen,
    canPrepend: readerStripCanPrepend,
    canSplicePrevious: readerStripCanSplicePrevious,
    describePosition: readerStripDescribePosition,
    prependMode: MOBILE_READER_STRIP_PREPEND_MODE,
  });
  readerStripRetainsProcessorRef.current = readerChapterStrip.isRetainedProcessor;
  const requestReaderStripPrevious = readerChapterStrip.requestPrevious;
  const recheckReaderStripPrevious = readerChapterStrip.recheckPrevious;
  const flushReaderStripPrevious = readerChapterStrip.flushPrevious;
  const recheckReaderStripPrune = readerChapterStrip.recheckPrune;
  const retryReaderStripNext = readerChapterStrip.retryNext;
  const readerStrip =
    readerSeamlessEnabled &&
    readerChapterStrip.strip &&
    readerChapterStrip.strip.segments[readerChapterStrip.strip.currentIndex]?.chapter.id === chapterId
      ? readerChapterStrip.strip
      : null;
  // The scroll list's rows (pages and dividers); paged reading has frames
  // instead (readerPagedStrip below).
  const readerStripRows = useMemo<MobileReaderStripRow<ChapterSummary, MobileReaderPage>[] | null>(
    () => (readerStrip && !galleryPagedMode ? mobileReaderStripRows(readerStrip) : null),
    [galleryPagedMode, readerStrip],
  );
  const readerStripStarts = useMemo(
    () =>
      readerStrip && readerStripRows
        ? mobileReaderStripSegmentStarts(readerStripRows, readerStrip.segments.length)
        : null,
    [readerStrip, readerStripRows],
  );
  const readerStripViewer =
    readerSourceViewer?.key === readerSourceViewerKey ? readerSourceViewer.viewer : null;
  // A neighbouring chapter's page size, as it will be once that chapter is
  // the open one (decoded now, earlier, persisted, or sent by the source).
  const readerStripPageSize = useCallback(
    (forChapterId: string, page: MobileReaderPage): MobileReaderPageSize | null => {
      const identity = readerPageIdentityForChapter(forChapterId, page);
      return readerImageSizes.get(identity)
        ?? recallMobileReaderPageNaturalSize(identity)
        ?? recallMobileReaderPageNaturalSize(readerStablePageSizeKeyForChapter(forChapterId, page))
        ?? page.sourceSize
        ?? null;
    },
    [readerImageSizes, readerPageIdentityForChapter, readerStablePageSizeKeyForChapter],
  );
  const readerStripLayout = useMemo(() => {
    if (!readerStrip || !readerStripRows || !readerScrollLayout) return null;
    // A neighbour with no page size yet stands in at the open chapter's
    // typical page (a series keeps one format), not 1:1.45: its rows are
    // near their real heights when they join — and keep that estimate
    // (readerRowEstimatesRef) until their own size is known.
    const openRatio =
      mobileReaderScrollKnownMedianRatio(readerScrollLayout, readerImageWidth) ?? readerTypicalPageRatioRef.current;
    const layouts = readerStrip.segments.map((segment, index) => {
      if (index === readerStrip.currentIndex) return readerScrollLayout;
      const sizeAt = (pageIndex: number) => {
        const page = segment.pages[pageIndex];
        return page ? readerStripPageSize(segment.chapter.id, page) : null;
      };
      const count = segment.pages.length;
      const ratios = mobileReaderScrollStablePageRatios(
        count,
        sizeAt,
        (pageIndex) => {
          const page = segment.pages[pageIndex];
          return page ? readerPageIdentityForChapter(segment.chapter.id, page) : null;
        },
        readerRowEstimatesRef.current,
        openRatio,
      );
      return buildMobileReaderScrollLayout(
        ratios.map((ratio) => readerImageWidth * ratio),
        mobileReaderScrollPageGaps(count, sizeAt, readerStripViewer),
        MOBILE_READER_SCROLL_PAGE_SPACING,
        segment.pages.map((page) => {
          const identity = readerPageIdentityForChapter(segment.chapter.id, page);
          return readerImageSizes.has(identity) || recallMobileReaderPageNaturalSize(identity) != null;
        }),
      );
    });
    return combineMobileReaderStripLayouts(readerStripRows, layouts);
  }, [
    readerImageSizes,
    readerImageWidth,
    readerPageIdentityForChapter,
    readerScrollLayout,
    readerStrip,
    readerStripPageSize,
    readerStripRows,
    readerStripViewer,
  ]);
  const readerStripBridge = useMemo<MobileReaderStripBridge>(() => {
    if (!readerStrip || !readerStripStarts || !readerStripLayout) {
      return MOBILE_READER_STRIP_IDENTITY_BRIDGE;
    }
    return {
      indexBase: readerStripStarts[readerStrip.currentIndex] ?? 0,
      offsetBase: mobileReaderStripSegmentOffset(
        readerStripLayout,
        readerStripStarts,
        readerStrip.currentIndex,
      ),
      localCount: pageCount,
    };
  }, [pageCount, readerStrip, readerStripLayout, readerStripStarts]);
  // Read by the reader's scroll handle and the gallery callbacks: always the
  // list as rendered now.
  readerStripBridgeRef.current = readerStripBridge;
  // Neighbour pages keep their sizes (see the size prune above).
  readerStripNeighbourIdentitiesRef.current = useMemo(() => {
    const identities = new Set<string>();
    readerStrip?.segments.forEach((segment, index) => {
      if (index === readerStrip.currentIndex) return;
      for (const page of segment.pages) {
        identities.add(readerPageIdentityForChapter(segment.chapter.id, page));
      }
    });
    return identities;
  }, [readerPageIdentityForChapter, readerStrip]);
  // The list's rows as gallery pages: ids unique across chapters (the strip
  // key), objects kept while their page is (cells are memoized on them).
  const readerStripGalleryPageCacheRef = useRef(
    new Map<string, { source: MobileReaderPage | null; page: MobileReaderPage }>(),
  );
  const readerStripGalleryPages = useMemo(() => {
    if (!readerStripRows) return null;
    const previous = readerStripGalleryPageCacheRef.current;
    const next = new Map<string, { source: MobileReaderPage | null; page: MobileReaderPage }>();
    const rows = readerStripRows.map((row) => {
      const source = row.kind === "page" ? row.page : null;
      const kept = previous.get(row.key);
      const page =
        kept && kept.source === source
          ? kept.page
          : source
            ? ({ ...source, id: row.key } as MobileReaderPage)
            : ({ id: row.key, index: -1 } as MobileReaderPage);
      next.set(row.key, { source, page });
      return page;
    });
    readerStripGalleryPageCacheRef.current = next;
    return rows;
  }, [readerStripRows]);
  const readerStripRowByKey = useMemo(() => {
    const map = new Map<string, { row: MobileReaderStripRow<ChapterSummary, MobileReaderPage>; index: number }>();
    readerStripRows?.forEach((row, index) => map.set(row.key, { row, index }));
    return map;
  }, [readerStripRows]);

  // ---- Seamless paged reading (readerSeamlessPaged) ------------------------
  // The pager's frames are the chapters of the strip back to back (each
  // chapter's own spreads: no spread pairs two chapters), with one
  // placeholder frame for a neighbour still loading. The reader state stays
  // the open chapter's (local pages and spreads); only what is said to the
  // gallery is in joined frames (`frameBase`).
  /** A leaf is turning (curl): overlays wait, frames are not spliced. */
  const [readerPageTurning, setReaderPageTurning] = useState(false);
  /** A swipe is in progress (slide pager): frames are not spliced under it. */
  const [readerPagedDragging, setReaderPagedDragging] = useState(false);
  /**
   * The reader turned onto a placeholder (a neighbour still loading): the
   * pager rests there until the chapter replaces it (then the reader crosses
   * into it) or fails (then back to the open chapter's edge).
   */
  const [readerPagedEdge, setReaderPagedEdge] = useState<{
    chapterId: string;
    side: "head" | "tail";
  } | null>(null);
  const readerPagedEdgeRef = useRef(readerPagedEdge);
  readerPagedEdgeRef.current = readerPagedEdge;
  const readerPagedDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The finger lifted: at rest now, or once the glide's momentum ends (a
  // fallback in case none is reported).
  const endReaderPagedDrag = useCallback((decelerating: boolean) => {
    if (readerPagedDragTimerRef.current) clearTimeout(readerPagedDragTimerRef.current);
    readerPagedDragTimerRef.current = null;
    if (!decelerating) {
      setReaderPagedDragging(false);
      return;
    }
    readerPagedDragTimerRef.current = setTimeout(() => {
      readerPagedDragTimerRef.current = null;
      setReaderPagedDragging(false);
    }, 1200);
  }, []);
  useEffect(
    () => () => {
      if (readerPagedDragTimerRef.current) clearTimeout(readerPagedDragTimerRef.current);
    },
    [],
  );
  const readerStripEdges = readerChapterStrip.edges;
  // The strip's chapters with their fetch stamps (same order as its segments).
  const readerChapterStripSegments = readerChapterStrip.segments;
  const readerPagedOnFirstFrame = isTwoPageMode
    ? (readerSpreads[0]?.includes(clampedPageIndex) ?? clampedPageIndex === 0)
    : clampedPageIndex === 0;
  const readerPagedOnLastFrame = isTwoPageMode
    ? (readerSpreads[readerSpreads.length - 1]?.includes(clampedPageIndex) ?? false)
    : clampedPageIndex >= pageCount - 1;
  /**
   * A neighbour's spread table, kept like the open chapter's: re-paired as its
   * sizes arrive, except the spreads that have been on screen. Its edge
   * facing the open chapter is locked as soon as it can be seen (the reader
   * is on the open chapter's edge frame, so a drag shows it), so the spread
   * a backward (or forward) crossing lands on is the one that was drawn.
   */
  const readerNeighbourSpreads = useCallback(
    (segment: ReaderStripSegmentData, side: "previous" | "next", adjacent: boolean): number[][] => {
      const id = segment.chapter.id;
      const count = segment.pages.length;
      const applied = mobileReaderPairingShiftFor(readerPairingShifts[readerPairingShiftKey], id);
      const choice = `${readerSpreadPairing}:${applied.shift ? "shift" : applied.fallbackShift ? "learned" : "base"}`;
      const key = `${id}:${segment.fetchedAt}:${count}:${choice}`;
      const computed = buildMobileReaderPairedSpreads({
        pageCount: count,
        sizeAt: (index) => {
          const page = segment.pages[index];
          return page ? readerStripPageSize(id, page) : null;
        },
        pairing: readerSpreadPairing,
        shift: applied.shift,
        fallbackShift: applied.fallbackShift,
      });
      const tables = readerSegmentSpreadTablesRef.current;
      const stored = tables.get(id);
      const same = stored?.key === key;
      const edgePage = side === "previous" ? count - 1 : 0;
      // A flat pair still waiting on a page shows its first page alone: not
      // fixed yet (it may split), like the open chapter's.
      const settled = (spread: readonly number[] | undefined) =>
        readerSpreadSettledFor(id, segment.pages, spread);
      const previousEdge = same ? stored.spreads.find((spread) => spread.includes(edgePage)) : undefined;
      let locked = (same ? stored.locked : []).filter(settled);
      const spreads = nextMobileReaderSpreadTable({
        previous: same ? stored.spreads : null,
        computed,
        reset: !same,
        currentPageIndex: edgePage,
        provisional: true,
        displayed: adjacent && (previousEdge == null || settled(previousEdge)),
        locked,
      });
      const shownEdge = adjacent ? spreads.find((spread) => spread.includes(edgePage)) : undefined;
      const edge = settled(shownEdge) ? shownEdge : undefined;
      if (edge && !locked.some((spread) => spread.length === edge.length && spread.every((page, at) => page === edge[at]))) {
        locked = [...locked.filter((spread) => !spread.some((page) => edge.includes(page))), edge];
      }
      tables.set(id, { key, spreads, locked });
      return spreads;
    },
    [readerPairingShiftKey, readerPairingShifts, readerSpreadPairing, readerSpreadSettledFor, readerStripPageSize],
  );
  const readerPagedStripCandidate = useMemo<MobileReaderPagedStrip | null>(() => {
    if (!readerStrip || !readerSeamlessPagedEnabled) return null;
    const segments: MobileReaderPagedStripSegment[] = [];
    const first = readerStrip.segments[0];
    const headChapter = first
      ? getMobileReaderChapterNavigation([...readerChapters], first.chapter.id, "scrolling").previousChapter
      : null;
    const headEdge = readerStripEdges.previous;
    // The chapter before the list: a placeholder until it joins (fetched in
    // the open chapter's first pages, or when the reader turns onto it),
    // gone once it failed or is locked (a turn back then opens it the old
    // way).
    if (
      headChapter &&
      !headChapter.locked &&
      !(headEdge?.chapterId === headChapter.id && headEdge.status !== "loading")
    ) {
      segments.push({ chapterId: headChapter.id, kind: "placeholder", pageCount: 1 });
    }
    let currentIndex = 0;
    readerStrip.segments.forEach((segment, index) => {
      if (index === readerStrip.currentIndex) {
        currentIndex = segments.length;
        segments.push({
          chapterId,
          kind: "chapter",
          pageCount,
          spreads: isTwoPageMode ? readerSpreads : null,
        });
        return;
      }
      const side = index < readerStrip.currentIndex ? "previous" : "next";
      const adjacent =
        (side === "previous" && index === readerStrip.currentIndex - 1 && readerPagedOnFirstFrame) ||
        (side === "next" && index === readerStrip.currentIndex + 1 && readerPagedOnLastFrame);
      segments.push({
        chapterId: segment.chapter.id,
        kind: "chapter",
        pageCount: segment.pages.length,
        spreads: isTwoPageMode
          ? readerNeighbourSpreads(
              readerChapterStripSegments[index] ?? { ...segment, fetchedAt: 0 },
              side,
              adjacent,
            )
          : null,
      });
    });
    // The chapter after the list: a placeholder while it is (to be) fetched.
    // None at the true end (the caught-up card shows past the last page) or
    // when it failed or is locked (the end-of-chapter prompt says so).
    const tail = readerStrip.tail;
    if (tail?.kind === "next" && (tail.status === "idle" || tail.status === "loading")) {
      segments.push({ chapterId: tail.chapter.id, kind: "placeholder", pageCount: 1 });
    }
    return buildMobileReaderPagedStrip({ segments, currentIndex, twoPage: isTwoPageMode });
  }, [
    chapterId,
    isTwoPageMode,
    pageCount,
    readerChapters,
    readerNeighbourSpreads,
    readerPagedOnFirstFrame,
    readerChapterStripSegments,
    readerPagedOnLastFrame,
    readerSeamlessPagedEnabled,
    readerSpreads,
    readerStrip,
    readerStripEdges.previous,
  ]);
  // Frames are spliced only at rest: never under a swipe or a turning leaf
  // (a slot count changing mid-turn drops or flickers the turn). Until then
  // the frames as they were stay, the open chapter's own updates included
  // only when they leave the frames as they are.
  const readerPagedTurning = readerPageTurning || readerPagedDragging;
  const readerPagedTurningRef = useRef(readerPagedTurning);
  readerPagedTurningRef.current = readerPagedTurning;
  const readerPagedStripShownRef = useRef<MobileReaderPagedStrip | null>(null);
  const readerPagedStrip = useMemo(() => {
    const shown = readerPagedStripShownRef.current;
    if (
      !readerPagedTurning ||
      !shown ||
      !readerPagedStripCandidate ||
      sameMobileReaderPagedStripFrames(shown, readerPagedStripCandidate)
    ) {
      return readerPagedStripCandidate;
    }
    const open = shown.segments.findIndex((segment) => segment.chapterId === chapterId && segment.kind === "chapter");
    if (open < 0) return readerPagedStripCandidate;
    return open === shown.currentIndex ? shown : { ...shown, currentIndex: open };
  }, [chapterId, readerPagedStripCandidate, readerPagedTurning]);
  readerPagedStripShownRef.current = readerPagedStrip;
  const readerPagedStripRef = useRef(readerPagedStrip);
  readerPagedStripRef.current = readerPagedStrip;
  const readerPagedFrameBase = readerPagedStrip ? mobileReaderPagedStripFrameBase(readerPagedStrip) : 0;
  // Frames spliced in front of (or dropped before) the open chapter: its
  // frames moved under the reader, so no backward crossing until a turn.
  const readerPagedAnchorRef = useRef<MobileReaderStripAnchor | null>(null);
  useLayoutEffect(() => {
    const next = { chapterId, base: readerPagedFrameBase };
    if (isMobileReaderStripReanchor(readerPagedAnchorRef.current, next)) {
      noteReaderStripGate({ kind: "re-anchor" });
    }
    readerPagedAnchorRef.current = next;
  }, [chapterId, noteReaderStripGate, readerPagedFrameBase]);
  /** The frame the reader rests on, when it is a placeholder or a chapter that just replaced one. */
  const readerPagedEdgeFrame = useMemo(() => {
    if (!readerPagedEdge || !readerPagedStrip) return null;
    const at = readerPagedStrip.segments.findIndex((segment) => segment.chapterId === readerPagedEdge.chapterId);
    if (at < 0) return null;
    const start = readerPagedStrip.frameStarts[at]!;
    const end = readerPagedStrip.frameStarts[at + 1]!;
    if (end <= start) return null;
    return readerPagedEdge.side === "head" ? end - 1 : start;
  }, [readerPagedEdge, readerPagedStrip]);
  const routePageDisplayIndex = useMemo(
    () => readerDisplayIndexForRoutePage(routePage, pageCount, mode),
    [mode, pageCount, routePage],
  );
  const readerResumeSourceRef = state.sourceLink ?? routeSourceRef;
  const readerResumeKey = makeChapterProgressId(
    readerResumeSourceRef.registryId,
    readerResumeSourceRef.sourceId,
    readerResumeSourceRef.sourceMangaId,
    chapterId,
  );
  // This device's own last spot when nothing newer was read elsewhere, else
  // the synced (high-water) page. The page row and read state stay on the
  // synced record.
  const readerResumeChoice = useMemo(
    () =>
      chooseMobileReaderResumePosition({
        local:
          readerLocalResume?.key === readerResumeKey
            ? readerLocalResume.position
            : null,
        // The synced record as it was when the chapter opened: this
        // reader's own progress writes (a newer `lastReadAt` every page
        // turn) must not turn its opening choice into the synced page.
        progress:
          readerLocalResume?.key === readerResumeKey
            ? readerLocalResume.progress
            : readerChapterProgress,
        pageCount,
      }),
    [pageCount, readerLocalResume, readerResumeKey, readerChapterProgress],
  );
  // Opened already completed (from the snapshot taken when the chapter
  // opened): spots saved in this session are re-read spots.
  const readerOpenedCompleted =
    readerLocalResume?.key === readerResumeKey &&
    readerLocalResume.progress?.completed === true;
  // A completed chapter with no re-read spot opens at the top of page 1: the
  // saved in-page spot (left by finishing it) must not leak into the strip.
  const initialLongStripScrollProgress =
    savedIntraPageState?.intraPageContentIdentity ===
      currentDisplayedPageIdentity &&
    !(readerOpenedCompleted && readerResumeChoice == null)
      ? savedIntraPageState.intraPageProgress
      : undefined;
  // A page-list refresh (a new `fetchedAt`: the cached list first, then the
  // network's) re-places a chapter this screen already placed: it keeps the
  // spot the reader holds, never the route page — which the reader rewrites
  // to its page counter (the page at the screen's centre), whose top is not
  // where the reading line was.
  const readerRefetchHeldSpot =
    restoredReaderKey !== "" &&
    !restoredReaderKey.startsWith(`${readyFetchedAt}:${chapterId}:`) &&
    readerHeldSpotRef.current?.chapterId === chapterId &&
    readerHeldSpotRef.current.mode === mode
      ? readerHeldSpotRef.current
      : null;
  // Scroll reading resumes at the same spot on the page, not its top.
  // (A route page elsewhere — an explicit "open at page" — starts at its top;
  // the route echo of the restored page itself keeps the spot.)
  const readerRestoreSpot = useMemo(
    () =>
      resolveMobileReaderRestoreSpot({
        pageCount,
        scrollReading: !galleryPagedMode,
        heldSpot: readerRefetchHeldSpot,
        routePageIndex: routePageDisplayIndex,
        saved: readerResumeChoice
          ? {
              pageIndex: readerDisplayIndexForSourceIndex(
                readerResumeChoice.sourceIndex,
                pageCount,
                mode,
              ),
              fraction: readerResumeChoice.fraction,
            }
          : null,
      }),
    [
      galleryPagedMode,
      mode,
      pageCount,
      readerRefetchHeldSpot,
      readerResumeChoice,
      routePageDisplayIndex,
    ],
  );
  const readerRestorePageIndex = readerRestoreSpot.pageIndex;
  const readerRestorePageFraction = readerRestoreSpot.fraction;
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
  // Seamless paged reading: the pager's frames are the joined chapters'.
  const readerGalleryFrameCount = readerPagedStrip ? readerPagedStrip.frameCount : readerRestoreFrameCount;
  const readerInitialContentOffset = useMemo(
    () => ({
      x: galleryPagedMode
        ? readerScrollOffsetForLogicalFrame(
            readerRestoreFrameIndex + readerPagedFrameBase,
            readerGalleryFrameCount,
            readerPageWidth,
            mode,
          )
        : 0,
      y: galleryPagedMode
        ? 0
        : scrollingPageOffsetForIndex(readerRestorePageIndex, readerRestorePageFraction),
    }),
    [
      galleryPagedMode,
      mode,
      readerGalleryFrameCount,
      readerPageWidth,
      readerPagedFrameBase,
      readerRestoreFrameIndex,
      readerRestorePageFraction,
      readerRestorePageIndex,
      scrollingPageOffsetForIndex,
    ],
  );
  const restoreReaderKey =
    pagesState.status === "ready"
      ? // routePage must NOT be part of this key: syncRoutePage rewrites the
        // route param after every page change, and re-arming the restore effect
        // from that echo snaps the scrolling-mode viewport to the page top.
        `${readyFetchedAt}:${chapterId}:${mode}:${pageCount}:${isTwoPageMode ? `${readerPairingChoiceKey}:${readerSpreadGeneration}` : "single"}:${
          // Stage geometry is not part of the key: a fold, dock or rail keeps
          // the mounted list at its logical page (MobileReaderGallery
          // re-places the offset). Only the user's column width re-anchors.
          galleryPagedMode ? "paged" : `width-${activeScrollWidthPct}`
        }`
      : "";
  const readerScrollMountKey =
    pagesState.status === "ready"
      ? `${
          // Seamless scroll: one list for every chapter it joins (a crossing
          // must not remount it).
          readerSeamlessEnabled ? `strip:${readerStripSession}` : `${chapterId}:${readyFetchedAt}`
        }:${mode}:${
          // Presentation only (spread ⇄ single remounts under a cross-fade);
          // stage size changes never remount the gallery.
          galleryPagedMode
            ? `${isTwoPageMode ? readerPairingChoiceKey : "single"}`
            : currentSegmentedImage
              ? `segmented:${currentSegmentedImage.generation}:${activeScrollWidthPct}`
              : isLongStripLogicalPage
                ? `long-strip:single:${activeScrollWidthPct}`
                : `scrolling:${activeScrollWidthPct}`
        }`
      : "loading";
  const readerContinuousContentIdentity =
    pagesState.status === "ready" && !galleryPagedMode
      ? JSON.stringify(
          readerSeamlessEnabled
            ? [registryId, sourceId, mangaId, "strip", readerStripSession, mode]
            : [registryId, sourceId, mangaId, chapterId, readyFetchedAt, mode, pageCount],
        )
      : undefined;
  const readerScrollMetricsScopeKey = readerScrollMetricsResetKey({
    continuousContentIdentity: readerContinuousContentIdentity,
    pagedMode: galleryPagedMode,
    scrollMountKey: readerScrollMountKey,
  });
  // A chapter opened by a seamless crossing is placed already (the reader
  // scrolled into it): it never runs the opening restore.
  const readerSeamlessArrivalPending =
    readerSeamlessArrived &&
    Boolean(restoreReaderKey) &&
    !restoredReaderKey.startsWith(`${readyFetchedAt}:${chapterId}:`);
  const readerRestoreComplete =
    Boolean(restoreReaderKey) &&
    (restoredReaderKey === restoreReaderKey || readerSeamlessArrivalPending);
  const readerRestoreCompleteRef = useRef(readerRestoreComplete);
  readerRestoreCompleteRef.current = readerRestoreComplete;
  readerSpreadsOnScreenRef.current = readerRestoreComplete;
  // The cover a zoom landed on fades into the reader (at once into a chapter
  // that failed: its own state). Scroll reading opens straight into the
  // reading position: as soon as the opening seek has placed the list —
  // never waiting for the page's image to decode (pages still loading show
  // their dark plate) nor for the seek held until the pages' real heights
  // are known, which re-places the list in place. Paged reading still waits
  // for the page on screen to decode (or fail): a page there has no plate,
  // so revealing early would show an empty stage. The page is the opening's
  // target (`resolveReaderOpeningPagedTarget`): before the restore the
  // counter's page 1 is not where the pager stands.
  const readerOpeningPagedTargetIndex = resolveReaderOpeningPagedTarget({
    restoreComplete: readerRestoreComplete,
    restorePageIndex: readerRestorePageIndex,
    currentPageIndex: clampedPageIndex,
    pageCount,
  });
  const readerOpeningPagedTargetPage =
    pagesState.status === "ready" && readerOpeningPagedTargetIndex != null
      ? (displayedPages[readerOpeningPagedTargetIndex] ?? null)
      : null;
  // The target page's own load event releases the cover in the same JS task
  // (see renderReaderImage's onImageLoad): no wait for the size state, a
  // re-render, this effect and a frame, any of which a busy opening JS thread
  // stretched past the cap.
  // A spread's pages decode one after the other: the cover leaves over both,
  // so they come in as one (a slow partner is waited for only so long).
  const readerOpeningPagedTargetPages = useMemo(() => {
    if (!readerOpeningPagedTargetPage || readerOpeningPagedTargetIndex == null) return [];
    const spread = isTwoPageMode ? readerSpreads.find((indexes) => indexes.includes(readerOpeningPagedTargetIndex)) : null;
    return (spread ?? [readerOpeningPagedTargetIndex])
      .map((index) => displayedPages[index])
      .filter((page): page is MobileReaderPage => Boolean(page));
  }, [displayedPages, isTwoPageMode, readerOpeningPagedTargetIndex, readerOpeningPagedTargetPage, readerSpreads]);
  const readerOpeningPagedTargetIdsRef = useRef<readonly string[]>([]);
  readerOpeningPagedTargetIdsRef.current = galleryPagedMode ? readerOpeningPagedTargetPages.map((page) => page.id) : [];
  const readerOpeningDecodedRef = useRef(new Set<string>());
  const readerOpeningPartnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (readerOpeningPartnerTimerRef.current) clearTimeout(readerOpeningPartnerTimerRef.current);
  }, []);
  const readerOpeningReleasedRef = useRef(false);
  const releaseReaderOpeningOnDecode = useCallback((pageId: string) => {
    if (readerOpeningReleasedRef.current) return;
    if (!readerOpeningPagedTargetIdsRef.current.includes(pageId)) return;
    readerOpeningDecodedRef.current.add(pageId);
    const release = () => {
      if (readerOpeningReleasedRef.current) return;
      readerOpeningReleasedRef.current = true;
      if (__DEV__) {
        console.info("[reader-open] target-decoded", {
          ...readerOpeningSince(readerZoomEntryRef.current.openingTimes(), Date.now()),
          pageId,
        });
      }
      readerZoomEntryRef.current.onFirstPage();
    };
    if (readerOpeningPagesDecoded(readerOpeningPagedTargetIdsRef.current, readerOpeningDecodedRef.current)) {
      release();
    } else if (!readerOpeningPartnerTimerRef.current) {
      readerOpeningPartnerTimerRef.current = setTimeout(release, READER_OPENING_SPREAD_PARTNER_WAIT_MS);
    }
  }, []);
  // What this chapter resolved, for a reopen this session.
  useEffect(() => {
    if (pagesState.status !== "ready") return;
    rememberMobileReaderResolvedPages(
      makeMobileReaderPagesPrefetchKey({
        registryId,
        sourceId,
        mangaId,
        chapterId: pagesState.chapter.id,
        processPageImages,
      }),
      pagesState.pages,
    );
  }, [mangaId, pagesState, processPageImages, registryId, sourceId]);
  // What the reader shows at rest, where (the opening stand-in of a reopen
  // this session): paged reading, placed, not turning, every page on screen
  // decoded. Measured a moment after it settles (past a turn's last frames).
  const readerStandInChapterId = pagesState.status === "ready" ? pagesState.chapter.id : null;
  const readerStandInPagesDecoded =
    readerVisiblePages.length > 0 &&
    readerVisiblePages.every((page) => readerImageSizes.has(readerPageIdentityFor(page)));
  useEffect(() => {
    if (!galleryPagedMode || !readerRestoreComplete || readerPagedTurning) return;
    if (!readerStandInChapterId || !readerStandInPagesDecoded) return;
    const shown = readerVisiblePages;
    const key = mobileReaderStandInKey({ registryId, sourceId, mangaId, chapterId: readerStandInChapterId });
    const measuredWindow = { width: window.width, height: window.height };
    let active = true;
    const timer = setTimeout(() => {
      const measured: MobileReaderStandInPage[] = [];
      let pending = shown.length;
      const done = () => {
        pending -= 1;
        if (pending > 0 || !active) return;
        // Every page on screen, or nothing (a partial spread is not what reopens).
        rememberMobileReaderStandIn(key, {
          pages: measured.length === shown.length ? measured : [],
          window: measuredWindow,
        });
      };
      for (const page of shown) {
        const frame = readerPageFrameViewsRef.current.get(page.id);
        const view = frame?.view;
        const leafOffset = frame?.leafOffset ?? null;
        if (!view || !page.imageUri || page.imageProcessing === "pending" || page.imageProcessing === "failed") {
          done();
          continue;
        }
        const uri = page.imageUri;
        view.measureInWindow((x, y, width, height) => {
          measured.push({
            id: page.id,
            uri,
            headers: page.headers,
            uriOwnership: page.imageUriOwnership ?? "source",
            // In the curl, React's layout lacks the leaf's native place.
            rect: { x: x + (leafOffset?.x ?? 0), y: y + (leafOffset?.y ?? 0), width, height },
          });
          done();
        });
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    galleryPagedMode,
    mangaId,
    readerPagedTurning,
    readerRestoreComplete,
    readerStandInChapterId,
    readerStandInPagesDecoded,
    readerVisiblePages,
    registryId,
    sourceId,
    window.height,
    window.width,
  ]);
  // The pages this opening lands on (the stand-in leaves without a fade
  // only when they are the ones it showed).
  const readerOpeningPageIds = readerRestoreComplete && galleryPagedMode
    ? readerVisiblePages.map((page) => page.id).join("\u0001")
    : "";
  useEffect(() => {
    if (readerOpeningPageIds) readerZoomEntryRef.current.onOpeningPages(readerOpeningPageIds.split("\u0001"));
  }, [readerOpeningPageIds]);
  const readerZoomPageShown =
    pagesState.status === "error" ||
    pagesState.status === "blocked" ||
    (!galleryPagedMode &&
      pagesState.status === "ready" &&
      pageCount > 0 &&
      readerRestoreComplete) ||
    (galleryPagedMode &&
      readerOpeningPagedTargetPages.length > 0 &&
      readerOpeningPagedTargetPages.every((page) => {
        const identity = readerPageIdentityFor(page);
        // A text page (or one without an image) has nothing to decode.
        return !page.imageUri || readerImageSizes.has(identity) || readerImageErrors.has(identity);
      }));
  // Diagnostic (dev builds only): what the paged opening waited for.
  const readerZoomPageShownLoggedRef = useRef(false);
  useEffect(() => {
    if (!__DEV__ || !readerZoomPageShown || readerZoomPageShownLoggedRef.current) return;
    readerZoomPageShownLoggedRef.current = true;
    console.info("[reader-open] page-shown", {
      ...readerOpeningSince(readerZoomEntry.openingTimes(), Date.now()),
      mode: galleryPagedMode ? "paged" : "scroll",
      target: readerOpeningPagedTargetIndex,
      current: clampedPageIndex,
      restoreComplete: readerRestoreComplete,
      frameBase: readerPagedFrameBase,
    });
  });
  useEffect(() => {
    if (!readerZoomPageShown) return;
    // One frame on: the seek's non-animated scroll has been applied natively.
    const frame = requestAnimationFrame(() => readerZoomEntry.onFirstPage());
    return () => cancelAnimationFrame(frame);
  }, [readerZoomEntry, readerZoomPageShown]);
  // The first screen (every source): the pages in the first viewport, taken
  // once the opening has placed the reader, then `first-screen-images-ready`
  // once each has painted its real image (or failed) — how long plates show.
  // `hold` reveals the cover on it.
  const [readerFirstScreenPageIds, setReaderFirstScreenPageIds] = useState<
    readonly string[] | null
  >(null);
  const readerFirstScreenPlaced =
    pagesState.status === "ready" &&
    pageCount > 0 &&
    (galleryPagedMode || readerRestoreComplete);
  const readerFirstScreenPageIdsNowRef = useRef<() => string[]>(() => []);
  readerFirstScreenPageIdsNowRef.current = () => {
    if (galleryPagedMode) return readerVisiblePages.map((page) => page.id);
    const viewport = readerScrollRef.current?.scrollViewport() ?? null;
    const visible = viewport
      ? resolveMobileReaderScrollPageRange({
          pageCount: pages.length,
          anchorIndex: clampedPageIndex,
          direction: readerScrollDirectionRef.current,
          viewportTop: viewport.top,
          viewportHeight: viewport.height,
          layout: readerScrollLayout,
          estimatedPageHeight: scrollingPageEstimatedHeight,
          aheadViewports: 0,
          behindViewports: 0,
          minAhead: 0,
          minBehind: 0,
        })
      : null;
    // A viewport that does not hold the page the opening placed (not yet
    // reported, another coordinate space) is not trusted: the placed page and
    // the ones below it filling a screen stand in.
    const indexes = resolveReaderFirstScreenIndexes({
      pageCount: pages.length,
      currentIndex: clampedPageIndex,
      viewportRange: visible,
      viewportHeight: viewport?.height ?? window.height,
      pageHeight: (index) =>
        readerScrollLayout?.heights[index] ?? scrollingPageEstimatedHeight,
    });
    if (__DEV__) {
      console.info("[reader-open] first-screen", {
        indexes,
        current: clampedPageIndex,
        viewport: viewport
          ? { top: Math.round(viewport.top), height: Math.round(viewport.height) }
          : null,
        fromViewport: visible != null && indexes[0] === visible.first,
      });
    }
    return indexes.map((index) => pages[index]!.id);
  };
  useEffect(() => {
    if (readerFirstScreenPageIds != null || !readerFirstScreenPlaced) return;
    // One frame on, as the cover's "first page": the seek has been applied.
    const frame = requestAnimationFrame(() =>
      setReaderFirstScreenPageIds(readerFirstScreenPageIdsNowRef.current()),
    );
    return () => cancelAnimationFrame(frame);
  }, [readerFirstScreenPageIds, readerFirstScreenPlaced]);
  const readerFirstScreenLoggedRef = useRef(false);
  const readerFirstScreenRetakesRef = useRef(0);
  const readerFirstScreenCurrentIndexRef = useRef(clampedPageIndex);
  readerFirstScreenCurrentIndexRef.current = clampedPageIndex;
  /** Each first-screen page's state now (for the ready check and its diagnostic). */
  const readerFirstScreenStatesRef = useRef<() => ReturnType<typeof resolveReaderFirstScreenImages> & {
    detail: { index: number; pending: boolean; painted: boolean; failed: boolean }[];
  } | null>(() => null);
  readerFirstScreenStatesRef.current = () => {
    if (readerFirstScreenPageIds == null) return null;
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const firstScreen = readerFirstScreenPageIds.map((id) => pageById.get(id));
    if (firstScreen.length === 0 || firstScreen.some((page) => !page)) return null;
    const states = (firstScreen as MobileReaderPage[]).map((page) => {
      const identity = readerPageIdentityFor(page);
      return {
        index: readerDisplayIndexByPageId.get(page.id) ?? -1,
        hasImage: Boolean(page.imageUri),
        processingPending: page.imageProcessing === "pending",
        failed: page.imageProcessing === "failed" || readerImageErrors.has(identity),
        painted: readerImageSizes.has(identity),
      };
    });
    return {
      ...resolveReaderFirstScreenImages(states),
      detail: states.map((state) => ({
        index: state.index,
        pending: state.processingPending,
        painted: state.painted,
        failed: state.failed,
      })),
    };
  };
  useEffect(() => {
    if (readerFirstScreenLoggedRef.current || readerFirstScreenPageIds == null) return;
    const images = readerFirstScreenStatesRef.current();
    if (!images) {
      // A page list with other pages replaced the one measured: take again.
      if (pagesState.status === "ready" && pageCount > 0) setReaderFirstScreenPageIds(null);
      return;
    }
    if (!images.ready) {
      // Measured before the opening seek moved the reader (r16 ToG: page 0
      // while the reader opened at p19): the page now current is not in the
      // set, so the set is taken again.
      const currentPageId = galleryPagedMode ? null : (pages[clampedPageIndex]?.id ?? null);
      if (
        shouldRetakeReaderFirstScreen({
          currentPageId,
          firstScreenPageIds: readerFirstScreenPageIds,
          retakes: readerFirstScreenRetakesRef.current,
        })
      ) {
        readerFirstScreenRetakesRef.current += 1;
        if (__DEV__) {
          console.info("[reader-open] first-screen retake", {
            current: clampedPageIndex,
            was: images.detail.map((page) => page.index),
          });
        }
        setReaderFirstScreenPageIds(null);
      }
      return;
    }
    readerFirstScreenLoggedRef.current = true;
    if (__DEV__) {
      console.info("[reader-open] first-screen-images-ready", {
        ...readerOpeningSince(readerZoomEntry.openingTimes(), Date.now()),
        pages: images.pages,
        painted: images.painted,
        failed: images.failed,
        held: readerOpeningHeldRef.current,
        mode: galleryPagedMode ? "paged" : "scroll",
      });
    }
    readerZoomEntry.onFirstScreenImagesReady();
  }, [
    clampedPageIndex,
    galleryPagedMode,
    pageCount,
    pages,
    pagesState.status,
    readerFirstScreenPageIds,
    readerImageErrors,
    readerImageSizes,
    readerPageIdentityFor,
    readerZoomEntry,
  ]);
  // Diagnostic (dev builds only): what the first screen still waits for, if it is slow.
  useEffect(() => {
    if (!__DEV__ || readerFirstScreenPageIds == null) return;
    const timer = setTimeout(() => {
      if (readerFirstScreenLoggedRef.current) return;
      console.info("[reader-open] first-screen-images-pending", {
        afterMs: READER_FIRST_SCREEN_PENDING_LOG_MS,
        current: readerFirstScreenCurrentIndexRef.current,
        pages: readerFirstScreenStatesRef.current()?.detail ?? null,
      });
    }, READER_FIRST_SCREEN_PENDING_LOG_MS);
    return () => clearTimeout(timer);
  }, [readerFirstScreenPageIds]);
  const readerChromeChapterKey = JSON.stringify([registryId, sourceId, mangaId, chapterId]);
  const readerChromeAutoHideKey = readerRestoreComplete ? readerChromeChapterKey : "";
  // Progress is saved only once the reader rests where it was restored to.
  const readerProgressRestoreComplete =
    readerRestoreComplete && !readerScrollLandingPending;
  const silentProgressPersistenceKey =
    readerProgressRestoreComplete && readerProgressLoadedFor === chapterId
    ? mobileReaderProgressPersistenceKey(
        restoreReaderKey,
        visibleProgressPageIndex,
      )
    : "";
  const showReaderChrome = showControls;
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
  // Around the page: black, white, or the first-read visible page's border.
  // Every presentation (paged, scroll, webtoon) uses the setting.
  const readerBackgroundColor = mobileReaderPageBackgroundColor(
    readerPageBackground,
    readerVisiblePages[0] ? readerPageFeatures.get(readerVisiblePages[0].id)?.edgeColor : null,
  );
  // A light page background turns the status glyphs dark, over a light scrim.
  const readerPageIsLight = mobileReaderPageBackgroundIsLight(readerBackgroundColor);
  const readerTopScrimColors = readerPageIsLight ? READER_TOP_SCRIM_LIGHT_COLORS : READER_TOP_SCRIM_COLORS;
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
            // On the cover view, the status bar follows the cover's own toggle.
            ...mobileReaderScreenOptions({ showControls: readerBarChromeShown, lightPage: readerPageIsLight, backgroundColor: readerBackgroundColor }),
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
        : { ...mobileReaderScreenOptions({ showControls, lightPage: readerPageIsLight, backgroundColor: readerBackgroundColor }), headerShown: false },
    [readerBackgroundColor, readerBarChromeShown, readerPageIsLight, readerSideBar, showControls],
  );
  // The host screen behind the flow paints the page background too (see
  // acquireMobileReaderHostBackground): a chapter switch's card corners.
  useEffect(() => {
    const parent = navigation.getParent();
    return acquireMobileReaderHostBackground(
      parent ? (options) => parent.setOptions(options) : undefined,
      readerBackgroundColor,
      readerAppBackgroundColor,
    );
  }, [navigation, readerAppBackgroundColor, readerBackgroundColor]);
  // Paged: constant, from the latched safe area. The capsules float over the
  // page and own their own rects (tap exclusions) while shown, so the bands
  // never follow the chrome or the status bar.
  const readerChromeTopPadding = Math.max(readerLayoutSafeInsets.top + 8, 12);
  const readerCompactControlsHeight = 82;
  // Not the live inset: the Duo's status island comes and goes with the
  // status bar (chrome shown / hidden), and a list padding that followed it
  // was shifted 82pt by the native scroll anchoring on every auto-hide.
  // Island and inset from one native sample (the app-wide observer's until
  // the reader's own reports): never the live 82 at mount, then 0.
  const readerScrollTopInset =
    mobileReaderScrollStableTopInset({
      reader: reservedLayout ? readerFoldedWindowLayout : null,
      app: appObservedWindowLayout,
      window,
      insets: readerLayoutSafeInsets,
    }) + 80;
  // The segmented list's leading padding (see the gallery's chromeTopPadding).
  const readerSegmentTopInset = readerScrollTopInset;
  useLayoutEffect(() => {
    readerSegmentViewportRef.current = {
      frames: segmentedImageFrames,
      topInset: readerSegmentTopInset,
    };
    publishReaderVisibleSegments();
  }, [publishReaderVisibleSegments, readerSegmentTopInset, segmentedImageFrames]);
  // The home-indicator inset only where the strip reaches the window's
  // bottom edge (not above the laptop posture's crease).
  const readerScrollBottomInset =
    mobileReaderSafePadding(readerStage, readerPose.bounds, { ...readerPose.safeInsets, bottom: insets.bottom }).bottom
    + readerCompactControlsHeight;
  const readerBottomPadding = Math.max(readerLayoutSafeInsets.bottom + 18, 24);
  const readerStateTopPadding = Math.max(readerLayoutSafeInsets.top + 82, 118);

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
  // A spread names both of its pages, unless a scrub is previewing another.
  const readerChromeSpread =
    isTwoPageMode && readerChromePageIndex === clampedPageIndex
      ? readerSpreads[currentSpreadIndex]
      : undefined;
  // Scroll reading's opening restore: until the list rests on the restored
  // spot the reader's page is not known yet (page 1 before the seek, the
  // target before the centre page is read), so the counter stays empty
  // rather than flash a wrong number under the landing cover.
  const readerOpeningCounterHidden =
    !galleryPagedMode &&
    pagesState.status === "ready" &&
    !readerProgressRestoreComplete;
  const readerTopPageCountLabel = readerOpeningCounterHidden ? null : readerChromePageCountLabel({
    pagesStatus: pagesState.status,
    pageNumber: readerChromeSourcePageNumber,
    pageCount,
    spreadPageNumbers: readerChromeSpread?.map((index) =>
      readerRoutePageForDisplayIndex(index, pageCount, mode),
    ),
  });
  // Scroll reading: the counter follows the page under the screen's centre
  // while the strip moves (the live page store; only the label repaints),
  // unless a scrub is previewing another page.
  const readerChromeLivePageStore =
    !galleryPagedMode &&
    !isTwoPageMode &&
    readerChromePageIndex === clampedPageIndex
      ? readerLivePageStore
      : undefined;
  const readerPageCountLabelAt = (displayIndex: number): string | null =>
    displayIndex === clampedPageIndex || pageCount <= 0 || readerOpeningCounterHidden
      ? readerTopPageCountLabel
      : readerChromePageCountLabel({
          pagesStatus: pagesState.status,
          pageNumber: readerRoutePageForDisplayIndex(displayIndex, pageCount, mode),
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

  // Seamless scroll: a neighbouring chapter's page list. The warm-up the
  // reader already started for the next chapter is taken when there is one;
  // the chapter's persisted page sizes are recalled first, so its pages join
  // the list at their real heights.
  readerStripLoadChapterRef.current = async (target) => {
    const installedSource = selectedInstalledSource;
    if (!installedSource) return null;
    const sizes = loadMobileReaderPageSizes(
      makeMobileReaderPageSizeChapterKey({
        registryId: routeRef.registryId,
        sourceId: routeRef.sourceId,
        mangaId,
        chapterId: target.id,
      }),
    ).catch(() => null);
    const pageListCacheKey = makeMobileReaderPagesPrefetchKey({
      registryId,
      sourceId,
      mangaId,
      chapterId: target.id,
      processPageImages,
    });
    const prefetched = mobileReaderPagesPrefetchCache.take(pageListCacheKey);
    let result: MobileReaderPagesRefresh | null = prefetched ? await prefetched : null;
    if (!result) {
      // A source call in the opening window of a cache-painted open would boot
      // a cold sandbox under the cover's fade: it waits for the fade to end.
      await waitForReaderOpeningWindow(readerOpeningGateRef.current, {
        paintedFromCache: readerOpenPaintedFromCacheRef.current,
        what: "strip-neighbour",
      });
      result = await refreshMobileReaderPages(installedSource, mangaId, target, {
        getSourceSettings: getReaderSourceSettings,
        onSourcePackageHydrated: saveReaderSourcePackageHydration,
        processPageImages,
        // The open chapter's own page work goes first.
        priority: "normal",
      });
    }
    for (const [pageId, size] of (await sizes) ?? []) {
      const stableKey = readerStablePageSizeKeyForChapter(target.id, { id: pageId });
      if (!recallMobileReaderPageNaturalSize(stableKey)) {
        rememberMobileReaderPageNaturalSize(stableKey, size);
      }
    }
    if (result.status === "ready" && result.pages.length > 0) {
      const cacheableChapters = resolveMobileReaderChapterIndex({
        chapterIndexStatus: result.chapterIndexStatus,
        chapters: result.chapters,
      });
      if (cacheableChapters) {
        void saveMobileReaderPageListCache(pageListCacheKey, {
          pages: result.pages,
          chapters: cacheableChapters,
          chapter: result.chapter,
          fetchedAt: result.fetchedAt,
          imageProcessor: result.imageProcessor === true,
        }).catch(() => undefined);
      }
    }
    return result;
  };

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

  // The source's viewer: remembered from a details fetch; once per manga the
  // reader asks the source itself (after the pages are up, so the page list
  // never waits behind it).
  const readerSourceViewerFetchRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = readerSourceViewerKey;
    void loadMobileSourceMangaViewer(key).then((viewer) => {
      if (cancelled) return;
      setReaderSourceViewer((current) =>
        current?.key === key && current.viewer === viewer ? current : { key, viewer },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [readerSourceViewerKey]);
  useEffect(() => {
    if (pagesState.status !== "ready" || !selectedInstalledSource) return;
    if (readerSourceViewer?.key !== readerSourceViewerKey) return;
    if (readerSourceViewer.viewer != null) return;
    if (readerSourceViewerFetchRef.current === readerSourceViewerKey) return;
    readerSourceViewerFetchRef.current = readerSourceViewerKey;
    const key = readerSourceViewerKey;
    void refreshMobileSourceMetadata(selectedInstalledSource, mangaId, {
      getSourceSettings: getReaderSourceSettings,
      onSourcePackageHydrated: saveReaderSourcePackageHydration,
      priority: "background",
    })
      .then(() => loadMobileSourceMangaViewer(key))
      .then((viewer) => {
        if (viewer == null) return;
        setReaderSourceViewer((current) =>
          current?.key === key ? { key, viewer } : current,
        );
      })
      .catch(() => undefined);
  }, [
    getReaderSourceSettings,
    mangaId,
    pagesState.status,
    readerSourceViewer,
    readerSourceViewerKey,
    saveReaderSourcePackageHydration,
    selectedInstalledSource,
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
      captureReaderRelayoutAnchor();
    }
    scrollWidthDraftRef.current = scrollWidthPct;
    setScrollWidthDraft(scrollWidthPct);
  }, [captureReaderRelayoutAnchor, pagedMode, scrollWidthPct, usePhysicalScrollScrubber]);

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
    (nextPageIndex: number, animated: boolean, fraction = 0) => {
      const targetFrameIndex = isTwoPageMode
        ? findMobileReaderSpreadIndex(readerSpreads, nextPageIndex)
        : nextPageIndex;
      // Seamless paged reading: the open chapter's frames sit after the
      // chapter (or placeholder) before it.
      const paged = readerPagedStripRef.current;
      const frameCount = paged ? paged.frameCount : isTwoPageMode ? readerSpreads.length : pageCount;
      const xOffset = readerScrollOffsetForLogicalFrame(
        targetFrameIndex + (paged ? mobileReaderPagedStripFrameBase(paged) : 0),
        frameCount,
        readerPageWidth,
        mode,
      );
      readerScrollRef.current?.scrollTo({
        x: galleryPagedMode ? xOffset : 0,
        y: galleryPagedMode ? 0 : scrollingPageOffsetForIndex(nextPageIndex, fraction),
        index: galleryPagedMode ? undefined : nextPageIndex,
        fraction: galleryPagedMode ? undefined : fraction,
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
    captureReaderRelayoutAnchor();
  }, [captureReaderRelayoutAnchor, pagedMode, usePhysicalScrollScrubber]);

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
        // Preserve the page (and the spot on it) being read; the remounted
        // list's restore seek places it again.
        captureReaderRelayoutAnchor();
      }
      scrollWidthDraftRef.current = nextValue;
      setScrollWidthDraft(nextValue);
    },
    [captureReaderRelayoutAnchor, pagedMode, usePhysicalScrollScrubber],
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
          ? mobileReaderPageIndexForSettledSpread(readerSpreads, targetFrameIndex, requestedPageIndex)
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
      const landing = readerScrollLandingRef.current;
      if (landing) {
        // The opening restore is still placing the list: only its own page
        // ends it; a page passed on the way is never committed.
        scrollingVisiblePageIndexRef.current = nextPageIndex;
        if (nextPageIndex === landing.pageIndex) {
          finishReaderScrollLanding("landed");
        }
        return;
      }
      const programmaticTarget = readerProgrammaticScrollRef.current;
      const requestedPageIndex =
        programmaticTarget?.kind === "page"
          ? programmaticTarget.pageIndex
          : null;
      if (scrollingVisiblePageIndexRef.current === nextPageIndex) {
        if (requestedPageIndex === nextPageIndex) {
          clearReaderProgrammaticScroll();
          // A seek landed: process from where the list really is now.
          readerScrollPrefetchTopUpRef.current(nextPageIndex);
          recheckReaderStripPrevious();
        }
        return;
      }
      readerScrollDirectionRef.current = nextMobileReaderScrollDirection(
        scrollingVisiblePageIndexRef.current,
        nextPageIndex,
        readerScrollDirectionRef.current,
      );
      scrollingVisiblePageIndexRef.current = nextPageIndex;
      // A seek (a scrubber jump) has no settle and may commit no new page:
      // the processor takes the page the list reports, with its fresh viewport.
      if (requestedPageIndex != null) {
        readerScrollPrefetchTopUpRef.current(nextPageIndex);
      }
      if (requestedPageIndex != null && nextPageIndex !== requestedPageIndex) {
        return;
      }
      if (requestedPageIndex === nextPageIndex) {
        clearReaderProgrammaticScroll();
        recheckReaderStripPrevious();
      }
      if (readerUserScrollingRef.current && programmaticTarget == null) {
        // Mid-scroll: the progress bar, the toolbar's page counter and the
        // prefetch follow the page (the one under the screen's centre); the
        // reader state (history, learning tools) takes it when the scroll
        // settles. A scroll that never reports its settle
        // still lands after a pause.
        readerLivePageStore.set({
          index: nextPageIndex,
          baseIndex: clampedPageIndex,
        });
        readerScrollPrefetchTopUpRef.current(nextPageIndex);
        if (readerScrollPublishTimerRef.current) {
          clearTimeout(readerScrollPublishTimerRef.current);
        }
        readerScrollPublishTimerRef.current = setTimeout(() => {
          readerScrollPublishTimerRef.current = null;
          publishScrollingVisiblePageRef.current();
        }, READER_SCROLL_PAGE_PUBLISH_IDLE_MS);
        return;
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
      finishReaderScrollLanding,
      galleryPagedMode,
      mode,
      pageCount,
      readerLivePageStore,
      recheckReaderStripPrevious,
      syncRoutePage,
    ],
  );
  /** Scroll mode: the list came to rest on a page seek's exact offset. */
  const onScrollingSeekLanded = useCallback(
    (pageIndex: number) => {
      const landing = readerScrollLandingRef.current;
      if (landing && landing.pageIndex === pageIndex) {
        finishReaderScrollLanding("landed");
      }
    },
    [finishReaderScrollLanding],
  );

  /** Scroll mode: the reader state takes the page the list rests on. */
  const publishScrollingVisiblePage = useCallback(() => {
    if (readerScrollPublishTimerRef.current) {
      clearTimeout(readerScrollPublishTimerRef.current);
      readerScrollPublishTimerRef.current = null;
    }
    if (galleryPagedMode || pageCount <= 0) return;
    const nextPageIndex = clampReaderPageIndex(
      scrollingVisiblePageIndexRef.current,
      pageCount,
    );
    if (nextPageIndex === clampedPageIndex) return;
    setPageArrival(
      readerPageArrivalForStep(clampedPageIndex, nextPageIndex, pageCount, mode),
    );
    setCurrentPageIndex(nextPageIndex);
    syncRoutePage(nextPageIndex);
  }, [clampedPageIndex, galleryPagedMode, mode, pageCount, syncRoutePage]);
  const publishScrollingVisiblePageRef = useRef(publishScrollingVisiblePage);
  useLayoutEffect(() => {
    publishScrollingVisiblePageRef.current = publishScrollingVisiblePage;
  }, [publishScrollingVisiblePage]);
  const settleReaderUserScroll = useCallback(() => {
    readerScrollFlingLandingRef.current = null;
    if (readerUserScrollingRef.current) {
      readerUserScrollingRef.current = false;
      publishScrollingVisiblePage();
      saveReaderLocalResumeRef.current();
    }
    // At rest: a previous chapter fetched mid-scroll joins the list now (if
    // the reader is still in the first pages and no seek owns the list).
    flushReaderStripPrevious();
  }, [flushReaderStripPrevious, publishScrollingVisiblePage]);
  const beginReaderUserScroll = useCallback(() => {
    clearReaderProgrammaticScroll();
    // A drag or swipe: the reader may now cross back into the chapter before.
    noteReaderStripGate({ kind: "user-gesture" });
    readerScrollFlingLandingRef.current = null;
    // A drag during the opening restore cancels it: where the reader takes
    // the list is the real position.
    finishReaderScrollLanding("user");
    if (galleryPagedMode) {
      // Seamless paged reading: no frames spliced under the finger.
      if (readerPagedDragTimerRef.current) clearTimeout(readerPagedDragTimerRef.current);
      readerPagedDragTimerRef.current = null;
      setReaderPagedDragging(true);
    }
    if (!galleryPagedMode) {
      readerUserScrollingRef.current = true;
      readerStripUserScrolledRef.current = true;
      // A prepend held back by a seek (a jump to p1) may land now.
      recheckReaderStripPrevious();
    }
  }, [
    clearReaderProgrammaticScroll,
    finishReaderScrollLanding,
    galleryPagedMode,
    noteReaderStripGate,
    recheckReaderStripPrevious,
  ]);
  /** Seamless scroll: the chapter just opened was scrolled into (mid-scroll). */
  const readerStripCrossedIntoRef = useRef<string | null>(null);
  useEffect(() => {
    // A new chapter or presentation starts outside any user scroll — but a
    // chapter scrolled into is still in the scroll that crossed into it.
    if (readerStripCrossedIntoRef.current !== chapterId) {
      readerUserScrollingRef.current = false;
    }
    readerStripCrossedIntoRef.current = null;
    readerLivePageStore.set(null);
    return () => {
      if (readerScrollPublishTimerRef.current) {
        clearTimeout(readerScrollPublishTimerRef.current);
        readerScrollPublishTimerRef.current = null;
      }
    };
  }, [chapterId, galleryPagedMode, readerLivePageStore]);

  const onScrollingSeekFailed = useCallback(
    (requestedPageIndex: number) => {
      // The opening restore keeps its page; its timeout settles it there.
      if (readerScrollLandingRef.current?.pageIndex === requestedPageIndex) return;
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
          // The chapter comes in from the side it reads on (RTL: the next
          // one from the left), as a page turn does.
          enterFrom: mode !== "scrolling" && targetChapter.id === leftChapter?.id ? "left" : undefined,
        }),
      );
    },
    [leftChapter?.id, mangaId, mode, routeRef.registryId, routeRef.sourceId, mangaTitle],
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

  const persistEndOfChapterCompletion = useCallback(async (
    /** The chapter completed; defaults to the open one. */
    target?: MobileReaderProgressTarget,
  ) => {
    setEndOfChapterProgressSaving(true);
    setEndOfChapterProgressError(null);
    try {
      return await persistMobileReaderCompletionBeforeNavigation({
        persist: () =>
          persistProgressRef.current(true, visibleProgressPageIndex, {
            silent: true,
            throwOnError: true,
            target,
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

  const showEndOfChapterPrompt = useCallback((reason = "past-last-page") => {
    if (
      readerDisplaySettingsOpen ||
      readerPluginSettingsOpen ||
      japaneseLearningLauncherVisible ||
      japaneseLearningOcrSheetVisible ||
      japaneseLearningChatDrawerVisible ||
      japaneseLearningTranscriptVisible
    ) {
      logReaderEndOfChapter(`skipped (a sheet is open) reason=${reason} chapter=${chapterId}`);
      return;
    }
    // What brought the reader here (no native os_log bridge for JS: a dev log).
    logReaderEndOfChapter(
      `show reason=${reason} chapter=${chapterId} next=${nextChapterInReadingOrder?.id ?? "none"} mode=${mode}${
        galleryPagedMode ? (isTwoPageMode ? " paged:spreads" : " paged:single") : ""
      }`,
    );
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
    chapterId,
    galleryPagedMode,
    goToChapter,
    isTwoPageMode,
    mode,
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

  // Seamless paged reading: a turn past the open chapter's edge (or off a
  // placeholder). Set further down, with the crossing; true when handled.
  const readerPagedStepRef = useRef<(direction: "previous" | "next") => boolean>(() => false);
  // Tap turns that land while a tap-started crossing is still in flight: the
  // reader still reads the chapter left, so a step would re-target the frame
  // the crossing is heading to (a dropped tap). Held, replayed once landed.
  const [readerCrossingTaps] = useState(createReaderCrossingTapQueue);
  const readerCrossingTapReplayingRef = useRef(false);
  const readerCrossingTapRenderRef = useRef(0);
  const readerCrossingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerCrossingTapReplayedRef = useRef<{ render: number; at: number } | null>(null);
  const stepReaderPageRef = useRef<(direction: "previous" | "next", options?: { pan?: boolean }) => void>(
    () => undefined,
  );
  // A swipe on a page fitted larger than its window: a turn, never a pan step.
  const turnReaderPageBySwipe = useCallback((direction: "previous" | "next") => {
    stepReaderPageRef.current(direction, { pan: false });
  }, []);
  const drainReaderCrossingTapsRef = useRef<() => void>(() => undefined);
  const stepReaderPage = useCallback(
    (direction: "previous" | "next", options?: { pan?: boolean }) => {
      if (pageCount <= 0) return;
      noteReaderStripGate({ kind: "user-gesture" });
      if (!readerCrossingTapReplayingRef.current && readerCrossingTaps.hold(direction, chapterId, Date.now())) {
        drainReaderCrossingTapsRef.current();
        return;
      }
      // Resting on a placeholder: the turn is the strip's.
      if (readerPagedEdgeRef.current && readerPagedStepRef.current(direction)) return;
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
      if (
        options?.pan !== false &&
        !isTwoPageMode &&
        readerPagePanControlsRef.current.get(currentDisplayedPageKey)?.step(direction)
      ) {
        return;
      }
      if (targetPageIndex == null) {
        // Seamless paged reading: the chapter (or placeholder) next to this
        // one is the next frame — a plain turn, never a dead tap.
        if (readerPagedStepRef.current(direction)) return;
        // Neither edge is a dead wall: the last page offers the next chapter
        // and the first page steps back into the previous one.
        if (direction === "next") showEndOfChapterPrompt("step-past-last-page");
        else showPreviousChapterFromEnd();
        return;
      }
      const arrival = direction === "next" ? "forward" : "backward";
      if (startReaderPageFlipRef.current(targetPageIndex, direction, arrival)) return;
      goToPage(targetPageIndex, arrival);
    },
    [
      chapterId,
      clampedPageIndex,
      currentDisplayedPageKey,
      goToPage,
      isTwoPageMode,
      mode,
      noteReaderStripGate,
      pageCount,
      readerPageFlip,
      readerSpreads,
      showEndOfChapterPrompt,
      readerCrossingTaps,
      showPreviousChapterFromEnd,
    ],
  );
  stepReaderPageRef.current = stepReaderPage;

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

  // Seamless scroll, past the end of the last chapter there is: the list's
  // "Caught up" divider says it, so no end-of-chapter card — the chapter is
  // only marked complete (once), as the card would. False: not that end.
  const readerStripCaughtUpCompletedRef = useRef<string | null>(null);
  const completeReaderStripCaughtUp = useCallback((): boolean => {
    if (
      // Paged reading has no divider: the caught-up card says it.
      galleryPagedMode ||
      !readerStrip ||
      readerStrip.currentIndex !== readerStrip.segments.length - 1 ||
      readerStrip.tail?.kind !== "end"
    ) {
      return false;
    }
    if (readerStripCaughtUpCompletedRef.current === chapterId) return true;
    readerStripCaughtUpCompletedRef.current = chapterId;
    if (chapterCompleteCelebration) void hapticConfirm();
    void persistProgressRef.current(true, visibleProgressPageIndex, {
      silent: true,
    }).catch(() => {
      // Not saved: the next try past the end saves it again.
      if (readerStripCaughtUpCompletedRef.current === chapterId) {
        readerStripCaughtUpCompletedRef.current = null;
      }
    });
    return true;
  }, [chapterCompleteCelebration, chapterId, galleryPagedMode, readerStrip, visibleProgressPageIndex]);

  const stepContinuousReaderAccessibility = useCallback(
    (direction: "previous" | "next") => {
      noteReaderStripGate({ kind: "user-gesture" });
      const metrics = readerScrollMetricsRef.current;
      if (!metrics.scrollable || metrics.maximumOffset <= 0) return;
      const action = readerContinuousAccessibilityAction(metrics, direction);
      if (action.kind === "end") {
        if (direction === "next" && !completeReaderStripCaughtUp()) showEndOfChapterPrompt();
        return;
      }
      readerScrollRef.current?.scrollToProgress(
        action.offset / metrics.maximumOffset,
        true,
      );
    },
    [completeReaderStripCaughtUp, noteReaderStripGate, showEndOfChapterPrompt],
  );

  // One screen of the strip (the outer display's scroll tap zones): the
  // viewport less the safe areas it reaches, 12% kept on screen, animated by
  // the list itself.
  const readerStageSafePadding = mobileReaderSafePadding(readerStage, readerPose.bounds, readerPose.safeInsets);
  const readerSafeInsetTop = readerStageSafePadding.top;
  const readerSafeInsetBottom = readerStageSafePadding.bottom;
  const stepReaderScrollScreen = useCallback(
    (direction: "previous" | "next") => {
      noteReaderStripGate({ kind: "user-gesture" });
      const metrics = readerScrollMetricsRef.current;
      if (!metrics.scrollable || metrics.maximumOffset <= 0) return;
      const action = readerContinuousScreenStep(metrics, direction, {
        top: readerSafeInsetTop,
        bottom: readerSafeInsetBottom,
      });
      // The steps before reach the list's end (the "Caught up" divider on
      // screen); one more stays there.
      if (action.kind === "end") {
        if (direction === "next" && !completeReaderStripCaughtUp()) showEndOfChapterPrompt();
        return;
      }
      readerScrollRef.current?.scrollToProgress(
        action.offset / metrics.maximumOffset,
        true,
      );
    },
    [completeReaderStripCaughtUp, noteReaderStripGate, readerSafeInsetBottom, readerSafeInsetTop, showEndOfChapterPrompt],
  );

  // Book posture, scroll reading: the half beside the strip. The reader's
  // system sheets (settings, plugins, Japanese Learning) go over it, never
  // the strip's half.
  const readerBookFreeHalf = !galleryPagedMode ? (readerPose.freeHalf ?? null) : null;
  const readerSheetPlacement = mobileReaderBookSheetPlacement({
    posture: readerPose.posture,
    freeHalf: readerBookFreeHalf,
    bounds: readerPose.bounds,
    layoutDirection: readerWindowLayout.layoutDirection,
  });
  const toggleReaderControls = useCallback(() => {
    setShowControls((value) => !value);
  }, []);
  // The bar's book / pages button: the cover comes in with its chrome shown
  // (the button was just pressed), and the page comes back with the HUD shown
  // for the same reason. Asking for the cover settles the chapter-open
  // auto-hide, so it never hides the HUD on the way back.
  const toggleReaderCoverView = useCallback(() => {
    if (readerCoverViewShown) {
      setReaderCoverViewRequested(false);
      setShowControls(true);
      return;
    }
    readerChromeAutoHideKeyRef.current = readerChromeAutoHideKey;
    setReaderCoverChromeShown(true);
    setReaderCoverViewRequested(true);
  }, [readerChromeAutoHideKey, readerCoverViewShown, setShowControls]);
  const toggleReaderCoverChrome = useCallback(() => {
    setReaderCoverChromeShown((value) => !value);
  }, []);

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
    (pageId: string, size: MobileImageSize, stableKey?: string) => {
      rememberMobileReaderPageNaturalSize(pageId, size);
      if (stableKey) rememberMobileReaderPageNaturalSize(stableKey, size);
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
          if (!isMobileJapaneseLearningSignInRequiredError(error)) {
            controller.onError("");
            return;
          }
          // Web `streamChat` 401: the bubble, and sign-in unless the session
          // is still loading.
          const failure = resolveMobileJapaneseLearningChatSignInFailure(
            japaneseLearningAuthPendingRef.current,
            MOBILE_JAPANESE_LEARNING_CHAT_SIGN_IN_ERROR,
          );
          controller.onError(failure.message);
          if (failure.promptSignIn) promptJapaneseLearningSignIn();
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
      promptJapaneseLearningSignIn,
    ],
  );

  const askJapaneseLearningGrammarSelection = useCallback(
    (text: string, kind: "sentence" | "word" | "words") => {
      const selectedText = text.trim();
      if (!selectedText) return;
      if (!requireJapaneseLearningAuthOrPrompt()) return;

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
      requireJapaneseLearningAuthOrPrompt,
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
    } else if (nextSurface === "signIn") {
      setJapaneseLearningSignInHost("reader");
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
    if (!requireJapaneseLearningAuthOrPrompt()) return;
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
    requireJapaneseLearningAuthOrPrompt,
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
    // Web `openChatAndSend`: sign-in first, before the page is even read.
    if (!requireJapaneseLearningAuthOrPrompt()) return;

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
    requireJapaneseLearningAuthOrPrompt,
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
    if (japaneseLearningChatWaveIdRef.current) {
      commitJapaneseLearningWave(japaneseLearningChatWaveIdRef.current);
      japaneseLearningChatWaveIdRef.current = null;
    }
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
  // chat opens over it. iOS stacks the chat sheet on the sentence sheet
  // (hosted in its content: only the topmost sheet can present), and closing
  // the chat leaves the sentence sheet where it was. Elsewhere the
  // conversation replaces it, sheet after sheet, and closing the chat brings
  // the same sentence back, as uncovering it does on web.
  const japaneseLearningOcrNextSurfaceRef = useRef<"chat" | null>(null);
  const japaneseLearningChatNextSurfaceRef = useRef<"ocr" | null>(null);
  const [japaneseLearningChatReturnsToSentence, setJapaneseLearningChatReturnsToSentence] = useState(false);
  // The open chat is the one stacked on the sentence sheet (iOS).
  const [japaneseLearningChatStackedOnSentence, setJapaneseLearningChatStackedOnSentence] =
    useState(false);
  const japaneseLearningChatStackedOnSentenceRef = useRef(false);
  japaneseLearningChatStackedOnSentenceRef.current = japaneseLearningChatStackedOnSentence;
  const japaneseLearningChatHandledRequestSeqRef = useRef(japaneseLearningChatRequestSeq);
  useEffect(() => {
    const started =
      japaneseLearningChatRequestSeq !== japaneseLearningChatHandledRequestSeqRef.current;
    japaneseLearningChatHandledRequestSeqRef.current = japaneseLearningChatRequestSeq;
    if (!started) return;
    if (!japaneseLearningOcrSheetVisible || japaneseLearningChatDrawerVisible) return;
    setJapaneseLearningChatReturnsToSentence(true);
    if (JAPANESE_LEARNING_CHAT_STACKS_ON_SENTENCE) {
      setJapaneseLearningChatStackedOnSentence(true);
      setJapaneseLearningChatDrawerVisible(true);
      return;
    }
    japaneseLearningOcrNextSurfaceRef.current = "chat";
    setJapaneseLearningOcrSheetVisible(false);
  }, [
    setJapaneseLearningChatDrawerVisible,
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
    !readerBarChromeShown ||
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
    // A chat stacked on this sheet left with it (e.g. the reader lost focus);
    // its own dismissal may not be reported, so the overlay stops following it.
    if (
      japaneseLearningChatStackedOnSentenceRef.current &&
      !japaneseLearningChatDrawerPresenceRef.current.wanted
    ) {
      japaneseLearningChatDrawerPresenceRef.current = JAPANESE_LEARNING_SHEET_GONE;
      japaneseLearningChatProgress.value = 0;
      setJapaneseLearningChatStackedOnSentence(false);
    }
    if (!dismissal.presentChat) return;
    japaneseLearningOcrNextSurfaceRef.current = null;
    setJapaneseLearningChatDrawerVisible(true);
  }, [
    japaneseLearningChatProgress,
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
    if (!dismissal.presence.onScreen) setJapaneseLearningChatStackedOnSentence(false);
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
  // the sentence sheet when the chat was opened from it (still in place
  // under a stacked chat, presented again otherwise), else the reader.
  const closeJapaneseLearningChatDrawer = useCallback(() => {
    japaneseLearningChatNextSurfaceRef.current =
      japaneseLearningChatReturnsToSentence && !japaneseLearningChatStackedOnSentenceRef.current
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
        // Web `AudioWaveform`: the bars are this audio's amplitude, read
        // while it plays (an AnalyserNode there, expo-audio's samples here),
        // redrawn every 80ms and kept once playback stops.
        if (japaneseLearningChatWaveIdRef.current) {
          commitJapaneseLearningWave(japaneseLearningChatWaveIdRef.current);
        }
        japaneseLearningChatWaveIdRef.current = message.id;
        beginJapaneseLearningWave(message.id, estimateJapaneseLearningWaveDuration(text));
        let sampleSubscription: { remove: () => void } | null = null;
        let lastWaveFlush = 0;
        try {
          player.setAudioSamplingEnabled(true);
          sampleSubscription = player.addListener("audioSampleUpdate", (sample) => {
            if (japaneseLearningTtsRunRef.current !== ttsRun) return;
            const frames = sample.channels[0]?.frames;
            if (!frames || frames.length === 0) return;
            addJapaneseLearningWaveSample(
              message.id,
              player.currentTime,
              japaneseLearningWaveAmplitude(frames),
            );
            const now = Date.now();
            if (now - lastWaveFlush > JAPANESE_LEARNING_WAVE_RENDER_THROTTLE_MS) {
              lastWaveFlush = now;
              flushJapaneseLearningWave(message.id);
            }
          });
        } catch {
          // No sample stream: the bars stay flat, as web's do without an analyser.
        }
        const subscription = player.addListener(
          "playbackStatusUpdate",
          (status) => {
            if (japaneseLearningTtsRunRef.current !== ttsRun) return;
            if (!status.didJustFinish) {
              const duration = Number.isFinite(status.duration) ? status.duration : 0;
              setJapaneseLearningWaveDuration(message.id, duration);
              setJapaneseLearningTtsState((current) => {
                if (
                  current.status !== "playing" ||
                  current.source !== "chat" ||
                  current.messageId !== message.id
                ) {
                  return current;
                }
                const currentTime = Number.isFinite(status.currentTime)
                  ? status.currentTime
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
              sampleSubscription?.remove();
              player.remove();
              if (japaneseLearningTtsPlayerRef.current === player) {
                japaneseLearningTtsPlayerRef.current = null;
              }
              if (japaneseLearningChatWaveIdRef.current === message.id) {
                commitJapaneseLearningWave(message.id);
                japaneseLearningChatWaveIdRef.current = null;
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
          currentTime: 0,
          duration: 0,
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

  /** Web waveform scrub (`seekFromPointer` → `seek`): the playing voice message. */
  const seekJapaneseLearningChatTts = useCallback((seconds: number) => {
    const player = japaneseLearningTtsPlayerRef.current;
    if (!player || !Number.isFinite(seconds)) return;
    void player.seekTo(Math.max(0, seconds)).catch(() => undefined);
  }, []);

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

        const pageSizeChapterKey = readerPageSizeChapterKeyRef.current;
        const stablePageSizeKeyFor = readerStablePageSizeKeyForRef.current;
        const sourceImageProcessorKey = `${registryId}:${sourceId}`;
        const [persisted, persistedPageSizes, sourceImageProcessor] = await Promise.all([
          loadMobileReaderPageListCache(pageListCacheKey),
          loadMobileReaderPageSizes(pageSizeChapterKey),
          loadMobileReaderSourceImageProcessor(sourceImageProcessorKey).catch(() => null),
        ]);
        // The source's own answer about processing its images: remembered
        // for the source, for page lists saved before it was recorded.
        const noteSourceImageProcessor = (imageProcessor: boolean | undefined) => {
          const value = imageProcessor === true;
          if (sourceImageProcessor === value) return;
          void saveMobileReaderSourceImageProcessor(sourceImageProcessorKey, value).catch(() => undefined);
        };
        // A cold start knows the pages' real heights before any decodes, so
        // the opening seek lands on the saved spot instead of an estimate.
        for (const [pageId, size] of persistedPageSizes) {
          const stableKey = stablePageSizeKeyFor({ id: pageId } as MobileReaderPage);
          if (!recallMobileReaderPageNaturalSize(stableKey)) {
            rememberMobileReaderPageNaturalSize(stableKey, size);
          }
        }
        // The source's answer, when it is the very list already painted from
        // the cache, keeps the cache's `fetchedAt`: no second remount.
        const fetchedAtFor = (fetched: {
          pages: MobileReaderPage[];
          fetchedAt: number;
        }) =>
          resolveMobileReaderPageListFetchedAt({
            shown: restoredPersistedPageList ? persisted : null,
            fetched,
          });
        // A chapter reopened this session: the pages resolved last time paint
        // at once instead of plates waiting for the source's page list.
        const restoredPages = persisted ? withMobileReaderResolvedPages(pageListCacheKey, persisted.pages) : [];
        if (persisted && readerPagesRequestRunRef.current === requestRun) {
          restoredPersistedPageList = true;
          readerOpenPaintedFromCacheRef.current = true;
          // Before the paint: `hold` must reach the cover ahead of its cap.
          holdReaderOpeningIfProcessed(
            restoredPages,
            "cache",
            resolveReaderImageProcessor({
              listed: persisted.imageProcessor,
              sourceRecord: sourceImageProcessor,
            }),
          );
          readerPagesLoadedKeyRef.current = pagesRequestKey;
          setPagesState({
            status: "ready",
            pages: restoredPages,
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
        let refreshed: MobileReaderPagesRefresh | null = null;
        if (prefetched) {
          // The title / source page starts this prefetch at the tap, so it
          // lands in the opening window: applying it re-renders the reader
          // and starts page processing under the cover's fade. A chapter the
          // cache already painted takes it once the fade has ended (QA
          // `hold`: at once, the cover waiting for its images instead).
          await waitForReaderOpeningWindow(readerOpeningGateRef.current, {
            paintedFromCache: restoredPersistedPageList && !readerOpeningHeldRef.current,
            pagesNeedSource: Boolean(persisted && readerPagesNeedProcessing(restoredPages)),
            what: "prefetched-page-list",
          });
          refreshed = await prefetched;
        }
        if (!refreshed) {
          // The cache already painted the chapter: its live refresh starts
          // once the cover has faded in (the opening window), so a cold
          // sandbox boot cannot hold the fade. Without a cache it asks at once.
          await waitForReaderOpeningWindow(readerOpeningGateRef.current, {
            paintedFromCache: restoredPersistedPageList && !readerOpeningHeldRef.current,
            pagesNeedSource: Boolean(persisted && readerPagesNeedProcessing(restoredPages)),
            what: "page-list",
          });
          if (readerPagesRequestRunRef.current !== requestRun) return;
          refreshed = await refreshMobileReaderPages(
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
                noteSourceImageProcessor(firstPaint.imageProcessor);
                holdReaderOpeningIfProcessed(firstPaint.pages, "source", {
                  imageProcessor: firstPaint.imageProcessor === true,
                  reason: "source",
                });
                setPagesState({
                  status: "ready",
                  pages: firstPaint.pages,
                  pageProcessor: firstPaint.pageProcessor,
                  chapters: [],
                  detail: formatReaderLoadedPages(
                    firstPaint.pages.length,
                    effectStrings,
                  ),
                  fetchedAt: fetchedAtFor(firstPaint),
                  chapter: firstPaint.chapter,
                });
              },
            },
          );
        }

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
            imageProcessor: refreshed.imageProcessor === true,
          }).catch(() => undefined);
        }
        noteSourceImageProcessor(refreshed.imageProcessor);
        holdReaderOpeningIfProcessed(refreshed.pages, "source", {
          imageProcessor: refreshed.imageProcessor === true,
          reason: "source",
        });
        setPagesState((previous) => ({
          status: "ready",
          // The pages already showing stay (the live list resolves them again).
          pages:
            previous.status === "ready"
              ? keepMobileReaderResolvedPages(previous.pages, refreshed.pages)
              : refreshed.pages,
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
          fetchedAt: fetchedAtFor(refreshed),
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
    holdReaderOpeningIfProcessed,
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
  // Seamless paged reading, in the open chapter's first two pages: the
  // previous chapter's last pages (its page list joins the strip from p1-p3),
  // so a turn back from p1 lands on a drawn page.
  const readerPreviousChapterSegment =
    readerStrip && readerStrip.currentIndex > 0 && galleryPagedMode
      ? readerStrip.segments[readerStrip.currentIndex - 1] ?? null
      : null;
  const readerWarmPreviousChapter =
    readerPreviousChapterSegment != null && shouldWarmMobileReaderPagedStripPrevious(clampedPageIndex);
  const readerPreviousChapterPrefetchImages = useMemo(
    () =>
      readerWarmPreviousChapter && readerPreviousChapterSegment
        ? planMobileReaderNextChapterPrefetch(
            [...readerPreviousChapterSegment.pages].reverse(),
            isTwoPageMode ? 4 : 3,
          )
        : [],
    [isTwoPageMode, readerPreviousChapterSegment, readerWarmPreviousChapter],
  );
  const readerNextChapterPrefetchImages = useMemo(
    () =>
      nearChapterEnd &&
      nextChapterPrefetchPages &&
      nextChapterPrefetchPages.key === nextChapterPrefetchKey
        ? planMobileReaderNextChapterPrefetch(nextChapterPrefetchPages.pages)
        : [],
    [nearChapterEnd, nextChapterPrefetchKey, nextChapterPrefetchPages],
  );
  // Scroll mode: the pages covering three screens ahead in the scroll
  // direction (one behind) are warmed as soon as the chapter is ready and
  // topped up on every page crossing (live, from the visible page), plus the
  // screen a fling will rest on. Nothing waits for the page on screen to
  // load — the mounted page's own request outranks prefetches in the image
  // cache queue anyway.
  const topUpReaderScrollPrefetch = useCallback(
    (pageIndex: number) => {
      if (pagesState.status !== "ready") return;
      const viewport = readerScrollRef.current?.scrollViewport() ?? null;
      const range = resolveMobileReaderScrollPageRange({
        pageCount: pages.length,
        anchorIndex: pageIndex,
        direction: readerScrollDirectionRef.current,
        viewportTop: viewport?.top ?? null,
        viewportHeight: viewport?.height ?? 0,
        layout: readerScrollLayout,
        estimatedPageHeight: scrollingPageEstimatedHeight,
        minAhead: MOBILE_READER_SCROLL_PREFETCH_MIN_AHEAD,
        minBehind: MOBILE_READER_SCROLL_PREFETCH_MIN_BEHIND,
      });
      if (!range) return;
      // Pages that still need their request resolved (or descrambling) are
      // worked on in the same reach, the pages on screen first, so nothing
      // ahead of the reader is still a grey plate when it arrives.
      const visible = resolveMobileReaderScrollPageRange({
        pageCount: pages.length,
        anchorIndex: pageIndex,
        direction: readerScrollDirectionRef.current,
        viewportTop: viewport?.top ?? null,
        viewportHeight: viewport?.height ?? 0,
        layout: readerScrollLayout,
        estimatedPageHeight: scrollingPageEstimatedHeight,
        aheadViewports: 0,
        behindViewports: 0,
        minAhead: 0,
        minBehind: 0,
      });
      readerScrollProcessPagesRef.current(
        orderMobileReaderScrollProcessing({
          currentIndex: pageIndex,
          pageCount: pages.length,
          range,
          visible,
          landing: readerScrollFlingLandingRef.current,
          direction: readerScrollDirectionRef.current,
        }),
      );
      readerImagePrefetcher.update([
        ...planMobileReaderScrollPrefetch({
          pages,
          currentIndex: pageIndex,
          range,
          direction: readerScrollDirectionRef.current,
          landing: readerScrollFlingLandingRef.current,
        }),
        ...readerNextChapterPrefetchImages,
      ]);
    },
    [
      pages,
      pagesState.status,
      readerImagePrefetcher,
      readerNextChapterPrefetchImages,
      readerScrollLayout,
      scrollingPageEstimatedHeight,
    ],
  );
  const onScrollingFlingTarget = useCallback(
    (viewport: MobileReaderScrollViewport) => {
      if (galleryPagedMode || pages.length <= 1) return;
      const direction: MobileReaderScrollDirection =
        viewport.top >= (readerScrollRef.current?.scrollViewport()?.top ?? 0)
          ? "forward"
          : "backward";
      // The resting screen and one more past it, from the page at its top.
      const restingTop = readerScrollLayout
        ? (mobileReaderScrollAnchorForOffset(readerScrollLayout, Math.max(0, viewport.top))
            ?.pageIndex ?? 0)
        : Math.floor(Math.max(0, viewport.top) / Math.max(1, scrollingPageEstimatedHeight));
      readerScrollFlingLandingRef.current = resolveMobileReaderScrollPageRange({
        pageCount: pages.length,
        anchorIndex: restingTop,
        direction,
        viewportTop: viewport.top,
        viewportHeight: viewport.height,
        layout: readerScrollLayout,
        estimatedPageHeight: scrollingPageEstimatedHeight,
        aheadViewports: 1,
        behindViewports: 0,
        minAhead: 1,
        maxAhead: MOBILE_READER_SCROLL_PREFETCH_LANDING_MAX,
        minBehind: 0,
        maxBehind: MOBILE_READER_SCROLL_PREFETCH_LANDING_MAX,
      });
      readerScrollDirectionRef.current = direction;
      topUpReaderScrollPrefetch(
        clampReaderPageIndex(scrollingVisiblePageIndexRef.current, pageCount),
      );
    },
    [
      galleryPagedMode,
      pageCount,
      pages.length,
      readerScrollLayout,
      scrollingPageEstimatedHeight,
      topUpReaderScrollPrefetch,
    ],
  );
  useLayoutEffect(() => {
    readerScrollPrefetchTopUpRef.current = galleryPagedMode
      ? () => undefined
      : topUpReaderScrollPrefetch;
  }, [galleryPagedMode, topUpReaderScrollPrefetch]);
  useEffect(() => {
    if (galleryPagedMode || pagesState.status !== "ready") return;
    // A page seek in flight (a scrubber jump, a restore) has not moved the
    // live page yet: process from where it is going.
    const programmaticTarget = readerProgrammaticScrollRef.current;
    topUpReaderScrollPrefetch(
      clampReaderPageIndex(
        programmaticTarget?.kind === "page"
          ? programmaticTarget.pageIndex
          : scrollingVisiblePageIndexRef.current,
        pageCount,
      ),
    );
  }, [
    clampedPageIndex,
    galleryPagedMode,
    pageCount,
    pagesState.status,
    topUpReaderScrollPrefetch,
  ]);
  useEffect(() => {
    if (pagesState.status !== "ready") {
      readerImagePrefetcher.cancelAll();
      return;
    }
    // Scroll mode prefetches above, never gated on the current page.
    if (!galleryPagedMode) return;
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
      const nextChapterPages = readerNextChapterPrefetchImages;
      readerImagePrefetcher.update([
        ...planMobileReaderPagePrefetch({
          pages,
          currentIndex: clampedPageIndex,
          // A spread turn back needs the whole previous spread warm.
          behind: mobileReaderPrefetchPagesBehind(isTwoPageMode, MOBILE_READER_PREFETCH_PAGES_BEHIND),
        }),
        ...readerPreviousChapterPrefetchImages,
        ...nextChapterPages,
      ]);
    }, 250);
    return () => clearTimeout(timer);
  }, [
    clampedPageIndex,
    galleryPagedMode,
    isTwoPageMode,
    pages,
    pagesState.status,
    readerImageErrors,
    readerImagePrefetcher,
    readerImageSizes,
    readerNextChapterPrefetchImages,
    readerPageIdentityFor,
    readerPreviousChapterPrefetchImages,
  ]);

  useEffect(() => {
    if (readerSeamlessArrivalPending) {
      // Scrolled into from the chapter before (or after): the list is already
      // on the page the crossing set. Only mark this chapter as placed.
      readerHeldSpotRef.current = {
        chapterId,
        mode,
        pageIndex: clampedPageIndex,
        fraction: 0,
      };
      setRestoredReaderKey(restoreReaderKey);
      return;
    }
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
    if (readerRelayoutPageAnchorRef.current != null) {
      // Kept for this restore key: the effect may re-run before its seek.
      readerRelayoutSeekFractionRef.current = {
        key: restoreReaderKey,
        fraction:
          !galleryPagedMode &&
          clampReaderPageIndex(readerRelayoutPageAnchorRef.current, pageCount) === targetPageIndex
            ? readerRelayoutPageFractionRef.current
            : 0,
      };
    }
    const relayoutFraction =
      readerRelayoutSeekFractionRef.current?.key === restoreReaderKey
        ? readerRelayoutSeekFractionRef.current.fraction
        : 0;
    if (!readerRelayoutInteractionActiveRef.current) {
      readerRelayoutPageAnchorRef.current = null;
    }
    const targetFrameIndex = isTwoPageMode
      ? findMobileReaderSpreadIndex(readerSpreads, targetPageIndex)
      : targetPageIndex;
    // The spread that shows the anchored page; that page stays the current
    // one, so turning back to single pages returns to it.
    const nextPageIndex = isTwoPageMode
      ? mobileReaderPageIndexForSettledSpread(readerSpreads, targetFrameIndex, targetPageIndex)
      : targetPageIndex;
    // Scroll reading, opening the chapter (not a re-anchor after a width
    // change): the list must come to rest on the page before it counts.
    const scrollOpeningRestore =
      !galleryPagedMode &&
      !restoredReaderKey.startsWith(`${readyFetchedAt}:${chapterId}:`);
    // Where on the page: this device's own spot when opening, the kept
    // spot when re-anchoring.
    const seekFraction = scrollOpeningRestore
      ? nextPageIndex === readerRestorePageIndex
        ? readerRestorePageFraction
        : 0
      : relayoutFraction;
    if (scrollOpeningRestore && nextPageIndex === 0 && seekFraction <= 0) {
      // A fresh chapter (or one saved on its first page) already opens at
      // its very top, title area below the chrome: no seek at all.
      setPageArrival("initial");
      setCurrentPageIndex(0);
      readerHeldSpotRef.current = { chapterId, mode, pageIndex: 0, fraction: 0 };
      setRestoredReaderKey(restoreReaderKey);
      syncRoutePage(0);
      return;
    }
    armReaderProgrammaticScroll(
      galleryPagedMode
        ? { kind: "frame", frameIndex: targetFrameIndex }
        : { kind: "page", pageIndex: nextPageIndex },
      scrollOpeningRestore ? READER_SCROLL_RESTORE_LANDING_MS + 500 : undefined,
    );
    if (scrollOpeningRestore) armReaderScrollLanding(nextPageIndex);
    // Restoring saved progress (or a route page) places the reader; it never
    // counts as having read forward onto that page.
    setPageArrival("initial");
    setCurrentPageIndex(nextPageIndex);
    readerHeldSpotRef.current = {
      chapterId,
      mode,
      pageIndex: nextPageIndex,
      fraction: galleryPagedMode ? 0 : seekFraction,
    };
    const timeout = setTimeout(() => {
      scrollToPageIndex(nextPageIndex, false, seekFraction);
      setRestoredReaderKey(restoreReaderKey);
    }, 0);
    syncRoutePage(nextPageIndex);
    return () => clearTimeout(timeout);
  }, [
    armReaderProgrammaticScroll,
    armReaderScrollLanding,
    chapterId,
    clampedPageIndex,
    galleryPagedMode,
    isTwoPageMode,
    loading,
    readerSeamlessArrivalPending,
    mode,
    pageCount,
    pagesState.status,
    readyFetchedAt,
    readerRestorePageFraction,
    readerRestorePageIndex,
    readerSpreads,
    restoreReaderKey,
    restoredReaderKey,
    scrollToPageIndex,
    syncRoutePage,
  ]);

  // The open chapter as a progress write target. Writes queued for it (the
  // debounce, a completion) carry this snapshot, so they land on this chapter
  // even if another one is open by the time they run.
  const readerProgressTarget = useMemo<MobileReaderProgressTarget>(
    () => ({
      chapterId,
      chapter: {
        chapterNumber: chapter.chapterNumber,
        volumeNumber: chapter.volumeNumber,
        title: chapter.title,
      },
      pageCount,
      savedProgress: readerChapterProgress
        ? {
            completed: readerChapterProgress.completed,
            intraPageProgress: readerChapterProgress.intraPageProgress,
            intraPageContentIdentity: readerChapterProgress.intraPageContentIdentity,
            updatedAt: readerChapterProgress.updatedAt,
          }
        : null,
    }),
    [
      chapter.chapterNumber,
      chapter.title,
      chapter.volumeNumber,
      chapterId,
      pageCount,
      readerChapterProgress,
    ],
  );
  const readerProgressTargetRef = useRef(readerProgressTarget);
  readerProgressTargetRef.current = readerProgressTarget;

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
        // The chapter this write is for: named by the caller (a chapter the
        // reader has just left), else the open one. Every field below comes
        // from the target, never from whichever chapter is on screen.
        const target: MobileReaderProgressTarget =
          options?.target ?? readerProgressTarget;
        const updatedAt = nextSyncTimestamp(
          target.savedProgress?.updatedAt,
          state.mangaProgress?.updatedAt,
          progressPersistenceClockRef.current,
        );
        progressPersistenceClockRef.current = updatedAt;
        const progressSourceRef = state.sourceLink ?? routeSourceRef;
        const { chapterProgress, mangaProgress } = buildMobileReaderProgressRecords({
          target,
          sourceRef: progressSourceRef,
          libraryItemId: state.entry?.item.libraryItemId,
          complete,
          displayIndex: nextDisplayIndex,
          mode,
          updatedAt,
          intraPageProgress: options?.intraPageProgress,
          intraPageContentIdentity: options?.intraPageContentIdentity,
        });
        const lastReadAt = chapterProgress.lastReadAt;

        try {
          await store.saveChapterProgress(chapterProgress);
          // This device's own write: not "read elsewhere since".
          noteMobileReaderResumeProgressWrite(chapterProgress.id, lastReadAt);
          // Finished (the end prompt, auto-complete, a seamless crossing —
          // each with its own target): the chapter reopens at page 1.
          if (complete) markMobileReaderResumeFinished(chapterProgress.id);
          await store.saveMangaProgress(mangaProgress);
          if (
            shouldApplyMobileReaderProgressToScreen(
              target.chapterId,
              currentChapterIdRef.current,
              options?.updateState,
            )
          ) {
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
            setState((current) =>
              // The open chapter may have changed during the read-back.
              currentChapterIdRef.current === target.chapterId
                ? {
                    ...current,
                    chapterProgress: savedChapterProgress ?? chapterProgress,
                    mangaProgress: savedMangaProgress ?? mangaProgress,
                  }
                : current,
            );
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
      clampedPageIndex,
      mode,
      readerProgressTarget,
      routeSourceRef,
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
    // The chapter this position belongs to, fixed now: the write must not
    // follow the reader into another chapter before it runs.
    const target = readerProgressTargetRef.current;
    const timeout = setTimeout(() => {
      pendingSilentProgressRef.current = null;
      // persistProgress captures the saved timestamps that this write advances.
      // Calling the latest implementation through a ref prevents that
      // timestamp-only state update from re-arming this debounce forever.
      void persistProgressRef.current(false, visibleProgressPageIndex, {
        silent: true,
        target: readerProgressTargetRef.current.chapterId === target.chapterId
          ? readerProgressTargetRef.current
          : target,
      });
    }, 500);
    pendingSilentProgressRef.current = {
      timeout,
      displayIndex: visibleProgressPageIndex,
      target,
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
          target:
            readerProgressTargetRef.current.chapterId === pending.target.chapterId
              ? readerProgressTargetRef.current
              : pending.target,
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
      saveReaderLocalResumeRef.current();
      flushMobileReaderResumePositions();
    });
    return () => subscription.remove();
  }, [flushPendingReaderProgress]);

  // This session saw the chapter's last page (its resume key): finished.
  const readerResumeFinishedKeyRef = useRef<string | null>(null);
  // Read when saving (a layout change alone does not save).
  const readerResumeLayoutRef = useRef(readerScrollLayout);
  readerResumeLayoutRef.current = readerScrollLayout;
  // Where this device stopped (local only, never synced): the page — and in
  // scroll reading the spot on it — the reader rests on. Saved once the
  // opening restore has landed, on page changes, when a scroll settles,
  // before a relayout, on backgrounding and on leaving.
  const saveReaderLocalResume = useCallback(() => {
    if (!readerProgressRestoreComplete) return;
    if (pagesState.status !== "ready" || pageCount <= 0) return;
    let displayIndex = clampedPageIndex;
    let fraction = 0;
    if (!galleryPagedMode) {
      // A relayout in flight keeps the spot it captured before the geometry
      // changed; the live anchor is stale until its seek lands.
      let anchor: MobileReaderScrollPageAnchor | null =
        readerRelayoutPageAnchorRef.current != null
          ? {
              pageIndex: readerRelayoutPageAnchorRef.current,
              fraction: readerRelayoutPageFractionRef.current,
            }
          : null;
      if (!anchor) {
        const listAnchor = readerGalleryScrollRef.current?.pageAnchor() ?? null;
        if (listAnchor) {
          // Never a clamped spot: a list anchor outside the open chapter
          // (another chapter, a divider, rows that just moved) saves nothing.
          anchor = mobileReaderStripBridgeOpenAnchor(readerStripBridgeRef.current, listAnchor);
          if (!anchor) return;
        }
      }
      if (anchor) {
        displayIndex = anchor.pageIndex;
        fraction = anchor.fraction;
      }
      // The last page on screen: read to the end (the reading line may rest
      // a few short slices before it). Latched for the session.
      const layout = readerResumeLayoutRef.current;
      if (
        layout?.heights.length === pageCount &&
        isMobileReaderLastPageVisible(layout, readerScrollRef.current?.scrollViewport() ?? null)
      ) {
        readerResumeFinishedKeyRef.current = readerResumeKey;
      }
    }
    readerHeldSpotRef.current = {
      chapterId,
      mode,
      pageIndex: clampReaderPageIndex(displayIndex, pageCount),
      fraction,
    };
    // The page the toolbar counter shows (what MobileReaderLivePageView
    // renders): in scroll reading the page under the screen's centre (the
    // live page store over the committed page), paged the current page. The
    // rows and Continue card name it; the restore seeks to the anchor above.
    const counterDisplayIndex =
      !galleryPagedMode && !isTwoPageMode
        ? mobileReaderLivePageIndex(readerLivePageStore.get(), clampedPageIndex)
        : clampedPageIndex;
    saveMobileReaderResumePosition(readerResumeKey, {
      sourceIndex: readerSourceIndexForDisplayIndex(
        clampReaderPageIndex(displayIndex, pageCount),
        pageCount,
        mode,
      ),
      fraction,
      counterSourceIndex: readerSourceIndexForDisplayIndex(
        clampReaderPageIndex(counterDisplayIndex, pageCount),
        pageCount,
        mode,
      ),
      total: pageCount,
      savedAt: Date.now(),
      // Saved while reading here: at least as new as the synced record this
      // reader holds (whose sync clock may run ahead of the wall clock).
      progressAt: Math.max(
        readerChapterProgress?.lastReadAt ?? 0,
        readerChapterProgress?.resetAt ?? 0,
      ),
      reread: mobileReaderResumeReread(
        readerOpenedCompleted,
        readerResumeFinishedKeyRef.current === readerResumeKey,
      ),
    });
  }, [
    chapterId,
    clampedPageIndex,
    galleryPagedMode,
    isTwoPageMode,
    mode,
    pageCount,
    pagesState.status,
    readerLivePageStore,
    readerProgressRestoreComplete,
    readerResumeKey,
    readerOpenedCompleted,
    readerChapterProgress?.lastReadAt,
    readerChapterProgress?.resetAt,
  ]);
  useEffect(() => {
    saveReaderLocalResumeRef.current = saveReaderLocalResume;
    // Also the page-change save (its deps include the current page).
    saveReaderLocalResume();
  }, [saveReaderLocalResume]);
  // A layout cleanup runs before the gallery's handle detaches, so leaving
  // still reads the live scroll anchor.
  useLayoutEffect(
    () => () => {
      saveReaderLocalResumeRef.current();
      flushMobileReaderResumePositions();
    },
    [],
  );

  useEffect(() => {
    if (pagesState.status !== "ready") return;
    if (!readerProgressRestoreComplete) return;
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
    readerProgressRestoreComplete,
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
    // The cover view has its own tap toggle: the chapter-open auto-hide never
    // runs under it (it was settled when the cover was asked for).
    if (readerCoverViewShown) return;
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
    readerCoverViewShown,
    showControls,
    continuousReaderScrubActive,
  ]);

  const onReaderMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const programmaticTarget = readerProgrammaticScrollRef.current;
    if (galleryPagedMode) {
      // Seamless paged reading: the pager's frames are the joined chapters'.
      const paged = readerPagedStripRef.current;
      endReaderPagedDrag(false);
      const frameCount = paged ? paged.frameCount : isTwoPageMode ? readerSpreads.length : pageCount;
      const visualFrameIndex = readerDisplayIndexFromOffset(
        event.nativeEvent.contentOffset.x,
        readerPageWidth,
        frameCount,
      );
      const settledFrameIndex = readerLogicalFrameIndexForVisualFrame(
        visualFrameIndex,
        frameCount,
        mode,
      );
      if (paged) {
        // Settled in the chapter before or after (or on a placeholder):
        // a crossing, not a page of the open chapter.
        const crossing = mobileReaderPagedStripCrossing(paged, settledFrameIndex);
        if (
          crossing &&
          !shouldTakeMobileReaderStripCrossing(crossing.direction, readerStripUserMovedRef.current)
        ) {
          // No swipe or turn since the frames were spliced in front: the
          // settle is the re-base, not the reader going back. Stay put.
          logReaderEndOfChapter(`paged backward crossing ignored (no gesture since anchor) chapter=${crossing.chapterId}`);
          clearReaderProgrammaticScroll();
          scrollToPageIndex(clampedPageIndex, false);
          return;
        }
        if (crossing) {
          landOnReaderPagedFrameRef.current(crossing, programmaticTarget == null);
          return;
        }
        if (readerPagedEdge) setReaderPagedEdge(null);
      }
      const nextFrameIndex = settledFrameIndex - (paged ? mobileReaderPagedStripFrameBase(paged) : 0);
      // A spread that still shows the page the reader was on keeps it (a
      // rotation or unfold into spreads and back lands on the same page).
      const nextPageIndex = isTwoPageMode
        ? mobileReaderPageIndexForSettledSpread(readerSpreads, nextFrameIndex, clampedPageIndex)
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

    if (readerUserScrollingRef.current) {
      // The reader's own fling came to rest: one commit, no page-turn haptic
      // (scrolling past pages never played one).
      settleReaderUserScroll();
      return;
    }
    // The opening restore decides the page until it lands.
    if (readerScrollLandingRef.current) return;
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
  const readerPageFitModeFor = useCallback(
    (page: MobileReaderPage, naturalSize?: MobileReaderPageSize | null): ReaderFitMode =>
      galleryPagedMode
        ? mobileReaderPageFitMode({
            mode: readerFitMode,
            single: !isTwoPageMode && !bilingualOverrides,
            viewport: readerFitViewport,
            naturalSize: naturalSize !== undefined ? (naturalSize ?? undefined) : readerImageSizes.get(readerPageIdentityFor(page)),
          })
        : readerFitMode,
    [bilingualOverrides, galleryPagedMode, isTwoPageMode, readerFitMode, readerFitViewport, readerImageSizes, readerPageIdentityFor],
  );
  // Clip each page to its window whenever one may be larger than it.
  const readerFitClip =
    readerFitMode !== "page" ||
    (galleryPagedMode && !isTwoPageMode && !bilingualOverrides && readerFitViewport.height > readerFitViewport.width);
  const getReaderImageFrameSize = useCallback(
    (
      page: MobileReaderPage,
      /**
       * Seamless paged reading: a page of the chapter before or after the
       * open one, fitted like that chapter's own (its sizes and spreads).
       */
      neighbour?: {
        index: number;
        spreads: readonly (readonly number[])[];
        sizeAt: (index: number) => MobileReaderPageSize | null;
      },
    ): MobileImageSize => {
      const sizeAt = neighbour?.sizeAt ?? readerPageSizeAt;
      const naturalSize = neighbour
        ? (neighbour.sizeAt(neighbour.index) ?? undefined)
        : readerImageSizes.get(readerPageIdentityFor(page));
      const pageFitMode = readerPageFitModeFor(page, neighbour ? (naturalSize ?? null) : undefined);
      if (galleryPagedMode && pageFitMode !== "page") {
        const fitted = mobileReaderFitFrame({
          mode: pageFitMode,
          viewport: readerFitViewport,
          ratio: readerFitRatio(naturalSize),
        });
        return { width: fitted.width, height: fitted.height };
      }
      if (galleryPagedMode && isTwoPageMode) {
        // Facing pages are fitted as one sheet in their slots (the stage
        // halves, or the panes beside a fold); a page alone (a cover, a wide
        // page) gets the whole stage, or its reading-start pane.
        const index = neighbour ? neighbour.index : (readerDisplayIndexByPageId.get(page.id) ?? -1);
        const spreads = neighbour?.spreads ?? readerSpreads;
        const spread = spreads[findMobileReaderSpreadIndex(spreads as number[][], index)] ?? [index];
        const half = { width: Math.max(1, readerSafeContentWidth / 2), height: readerMaxPagedImageHeight };
        if (spread.length === 2 && spread.includes(index)) {
          const visual = visualPageIndexesForMobileReaderSpread([...spread], mode);
          const slots: [{ width: number; height: number }, { width: number; height: number }] =
            readerSpreadSlots && readerSpreadSlots.length === 2
              ? [readerSpreadSlots[0]!, readerSpreadSlots[1]!]
              : [half, half];
          const frames = getMobileReaderSpreadSheetFrames({
            slots,
            sizes: [sizeAt(visual[0]!), sizeAt(visual[1]!)],
          });
          return frames[visual.indexOf(index)] ?? frames[0];
        }
        // Book posture: a wide page reads as a printed spread, split at its
        // centre across the two panes.
        if (readerSpreadSlots && readerSpreadSlots.length === 2 && isMobileReaderWidePage(sizeAt(index))) {
          return getMobileReaderSplitWidePageFrame({
            slots: [readerSpreadSlots[0]!, readerSpreadSlots[1]!],
            size: sizeAt(index),
          });
        }
        // A flat spread centres a lone page on the whole stage, the slide
        // pager and the curl alike (the curl lays it across the spine, its
        // halves on the two leaves, as a wide page).
        const lone = readerSpreadSlots && readerSpreadSlots.length === 2
          ? readerSpreadSlots[mode === "rtl" ? 1 : 0]!
          : { width: readerSafeContentWidth, height: readerMaxPagedImageHeight };
        return getMobileReaderSpreadImageFrameSize({
          availableWidth: lone.width,
          availableHeight: Math.min(lone.height, readerMaxPagedImageHeight),
          naturalSize: sizeAt(index) ?? naturalSize,
        });
      }
      // Scroll reading: the frame is the page's cell in the scroll layout,
      // placeholder or loaded, so cells never change size under the reader
      // except when a page's real size replaces its estimate.
      const scrollLayoutHeight = readerScrollLayout && !neighbour
        ? readerScrollLayout.heights[readerDisplayIndexByPageId.get(page.id) ?? -1]
        : undefined;
      if (scrollLayoutHeight != null && scrollLayoutHeight > 0) {
        return { width: readerImageWidth, height: scrollLayoutHeight };
      }
      return getMobileReaderImageFrameSize({
        imageWidth: readerImageWidth,
        naturalSize,
        clampHeightToPagedViewport: galleryPagedMode,
        maximumPagedHeight: readerMaxPagedImageHeight,
      });
    },
    [
      galleryPagedMode,
      isTwoPageMode,
      mode,
      readerDisplayIndexByPageId,
      readerFitViewport,
      readerImageSizes,
      readerImageWidth,
      readerMaxPagedImageHeight,
      readerPageFitModeFor,
      readerPageIdentityFor,
      readerPageSizeAt,
      readerSafeContentWidth,
      readerScrollLayout,
      readerSpreadSlots,
      readerSpreads,
    ],
  );
  // The detections flow into `renderReaderImage`, which every mounted page
  // cell is memoized against, so a fresh array identity per render would undo
  // that memoization for the whole gallery.
  const japaneseLearningDetections = useMemo(
    () =>
      japaneseLearningOcrState.status === "ready"
        ? sortedMobileOcrLines(japaneseLearningOcrState.result)
        : japaneseLearningOcrState.status === "loading" && japaneseLearningOcrState.partial
          ? sortedMobileOcrLines(japaneseLearningOcrState.partial)
          : [],
    [japaneseLearningOcrState],
  );
  // The curl turns the page views themselves: the bubbles leave as a leaf
  // lifts and mount again on the settled page.
  // A wide page the reader has left goes back to its reading-start edge, but
  // only once it is off screen: a tap turn changes the page at once, and a
  // reset then snapped the page that was still sliding (or curling) away
  // to its other edge for the whole turn.
  useEffect(() => {
    if (readerPageTurning) return;
    const timer = setTimeout(() => {
      for (const [pageId, control] of readerPagePanControlsRef.current) {
        if (pageId !== currentDisplayedPageKey) control.reset();
      }
    }, READER_PAN_RESET_AFTER_TURN_MS);
    return () => clearTimeout(timer);
  }, [currentDisplayedPageKey, readerPageTurning]);
  const japaneseLearningOverlayDetections =
    readerPageTurning && japaneseLearningDetections.length > 0
      ? MOBILE_READER_NO_DETECTIONS
      : japaneseLearningDetections;
  const activeJapaneseLearningTranscriptOrder =
    japaneseLearningTtsState.status === "playing" &&
    japaneseLearningTtsState.source === "transcript"
      ? findMobileTranscriptPlaybackLineOrder(
          japaneseLearningDetections,
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
        ? mobileWindowAbsoluteBand(
            readerBookTaps ? readerBookCentreTapBand(readerBookTaps) : readerCentreTapBand({ width: readerPageWidth }),
            readerStageWindowOrigin.x,
          )
        : null,
    [galleryPagedMode, readerBookTaps, readerPageWidth, readerStageTapOwned, readerStageWindowOrigin.x],
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
      // In the book posture the pages lean on the fold edge of their panes.
      const spineSlot = (slot: WindowLayoutRect, side: "left" | "right", width: number): WindowLayoutRect => {
        const leafWidth = Math.max(1, Math.min(slot.width, width || slot.width));
        return { ...slot, x: side === "left" ? slot.x + slot.width - leafWidth : slot.x, width: leafWidth };
      };
      const panes = readerSpreadSlots && readerSpreadSlots.length === 2
        ? {
            left: spineSlot(readerSpreadSlots[0], "left", Math.max(
              frameWidth(displayedPages[oldVisual[0]]), frameWidth(displayedPages[newVisual[0]]),
            )),
            right: spineSlot(readerSpreadSlots[1], "right", Math.max(
              frameWidth(displayedPages[oldVisual[1]]), frameWidth(displayedPages[newVisual[1]]),
            )),
          }
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
      const flatPairPending = (spread: number[] | undefined) =>
        mobileReaderCentresLonePages({ spreadMode: isTwoPageMode, panes: Boolean(readerSpreadSlots) })
        && spread?.length === 2
        && mobileReaderFlatSpreadState({
          spread,
          mode,
          ready: (index) => {
            const page = displayedPages[index];
            return !page?.imageUri || readerPageImageReady(page);
          },
        }).pendingSlot !== null;
      const decision = mobileReaderPageFlipDecision({
        paged: galleryPagedMode && !readerPageCurlActive,
        spreadMode: isTwoPageMode,
        reduceMotion: readerPageFlip.reduceMotion,
        zoomed: zoomedReaderPageId != null,
        step: 1,
        fromSpreadLength: oldSpread?.length ?? null,
        toSpreadLength: newSpread?.length ?? null,
        sameSpread: oldSpread === newSpread,
        hasPanes: panes !== null,
        onScreenPagesReady: Boolean(outgoingPage?.imageUri && underPage?.imageUri),
        // A flat spread whose second page is not ready keeps it hidden in its
        // slot: the leaves must not show that facing page, so a turn to (or
        // from) it slides plainly.
        arrivingPairPending: flatPairPending(newSpread) || flatPairPending(oldSpread),
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
      readerBackgroundColor,
      currentSpreadIndex,
      displayedPages,
      galleryPagedMode,
      readerPageCurlActive,
      readerPageImageReady,
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

  // A chapter switch that had to wait for its pages: the first page replaces a
  // spinner, so it fades in even when the chapter's end already drew it as a
  // neighbour (a page shown this session otherwise paints at once).
  const [readerSwitchMountedAt] = useState(() => Date.now());
  const [readerSwitchPageFade, setReaderSwitchPageFade] = useState<"waiting" | "fade" | "off">(() =>
    readerOpeningHudHeld ? "off" : "waiting",
  );
  if (readerSwitchPageFade === "waiting" && pagesState.status === "ready") {
    setReaderSwitchPageFade(Date.now() - readerSwitchMountedAt > MOBILE_READER_SWITCH_PAGE_FADE_AFTER_MS ? "fade" : "off");
  }
  const renderReaderImage = useCallback(
    (
      page: MobileReaderPage,
      placement?: MobileReaderImagePlacement,
      /**
       * Seamless scroll: a page of the chapter before or after the open one.
       * Keyed (identity, sizes) as that chapter's own, framed by its row in
       * the list, without the open chapter's reading tools.
       */
      neighbour?: { chapterId: string; frameSize: MobileImageSize },
    ) => {
      const pageIdentity = neighbour
        ? readerPageIdentityForChapter(neighbour.chapterId, page)
        : readerPageIdentityFor(page);
      // The vertical list: the gallery's directional window (following the
      // live visible page) decides which pages decode; the paged gallery
      // keeps the symmetric window around the committed page.
      const renderPolicy = getMobileReaderPageRenderPolicy({
        // Paged, before the opening restore: around the restore target, where
        // the pager stands (the counter still says page 1).
        currentPageIndex: galleryPagedMode ? (readerOpeningPagedTargetIndex ?? clampedPageIndex) : clampedPageIndex,
        displayIndex: neighbour ? undefined : readerDisplayIndexByPageId.get(page.id),
        hasImageUri: Boolean(page.imageUri),
        processingPending: page.imageProcessing === "pending",
        processingFailed: page.imageProcessing === "failed",
        // A neighbour's page in the pager: the caller's window (frames
        // around the reader's, in the joined list).
        inRenderWindow: galleryPagedMode && !neighbour
          ? undefined
          : placement?.inRenderWindow,
      });
      // Scroll reading: quiet placeholders and no fade for cached pages.
      // (A paged chapter shown as a long strip keeps the paged look.)
      const scrollPresentation = !pagedMode;
      if (renderPolicy === "none" || !page.imageUri) return null;
      const imageUri = page.imageUri;

      const readerImageFrameSize = neighbour?.frameSize ?? getReaderImageFrameSize(page);
      const stablePageSizeKey = neighbour
        ? readerStablePageSizeKeyForChapter(neighbour.chapterId, page)
        : readerStablePageSizeKeyFor(page);
      const pageSizeChapterKey = neighbour
        ? makeMobileReaderPageSizeChapterKey({
            registryId: routeRef.registryId,
            sourceId: routeRef.sourceId,
            mangaId,
            chapterId: neighbour.chapterId,
          })
        : readerPageSizeChapterKey;
      // The gallery mounts every page in a plain ScrollView; the far-page
      // placeholder comes before the pending one. In scroll reading both are
      // the reader background with a spinner that mounts only while the page
      // is on screen (MobileReaderPageSpinner follows its cell), so a long
      // chapter never holds an ActivityIndicator per waiting page.
      if (renderPolicy === "far-placeholder") {
        return (
          <View
            accessibilityLabel={
              scrollPresentation ? strings.reader.pageImageLoading : undefined
            }
            style={{
              width: readerImageFrameSize.width,
              height: readerImageFrameSize.height,
              backgroundColor: scrollPresentation
                ? readerBackgroundColor
                : undefined,
            }}
          >
            {scrollPresentation ? (
              <MobileReaderPageSpinner color={mobileReaderPageStatusColor(readerBackgroundColor)} />
            ) : null}
          </View>
        );
      }
      if (renderPolicy === "processing-placeholder") {
        return (
          <View
            accessibilityLabel={strings.reader.pageImageLoading}
            style={[
              styles.readerImageProcessingPlaceholder,
              {
                width: readerImageFrameSize.width,
                height: readerImageFrameSize.height,
                backgroundColor: readerBackgroundColor,
              },
            ]}
          >
            <MobileReaderPageSpinner color={mobileReaderPageStatusColor(readerBackgroundColor)} />
          </View>
        );
      }
      if (renderPolicy === "processing-failed") {
        // Processing a page that needs it (descrambling) failed: the load
        // failure (its copy and Retry, which processes the page again), never
        // the scrambled original.
        return (
          <MobileReaderPageFrame
            withholdImage
            backgroundColor={readerBackgroundColor}
            frameSize={readerImageFrameSize}
            imageUri={imageUri}
            imageUriOwnership={page.imageUriOwnership ?? "source"}
            loading={false}
            quietLoading={scrollPresentation}
            error="processing-failed"
            strings={strings}
            onImageError={() => undefined}
            onImageLoad={() => undefined}
            onImageLoadStart={() => undefined}
            onRetry={
              neighbour
                ? undefined
                : () => {
                    // The processor's index: the page's place in the list.
                    const index = readerDisplayIndexByPageId.get(page.id);
                    if (index !== undefined) retryReaderPageProcessing(index);
                  }
            }
          />
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
          frameRef={neighbour ? undefined : readerPageFrameRefFor(page.id)}
          allowLongStripSegments={pageCount === 1}
          backgroundColor={readerBackgroundColor}
          cacheKey={pageCount === 1 ? segmentedCacheKey : undefined}
          frameSize={readerImageFrameSize}
          headers={page.headers}
          imageUri={imageUri}
          imageUriOwnership={page.imageUriOwnership ?? "source"}
          // Scroll reading sizes a loaded page's frame to its own aspect, so
          // stretch only absorbs sub-point rounding: "contain" there left a
          // hairline of plate between strips that should meet seamlessly.
          imageResizeMode={
            scrollPresentation && readerImageSizes.has(pageIdentity)
              ? "stretch"
              : undefined
          }
          loading={imageLoading}
          quietLoading={scrollPresentation}
          // A paged page near the current one: kept decoded (bounded, native)
          // for a reopen's stand-in; the page on screen as the most recent.
          retainDecoded={
            scrollPresentation
              ? false
              : !neighbour && readerDisplayIndexByPageId.get(page.id) === clampedPageIndex
                ? "current"
                : true
          }
          fadeShownSource={readerSwitchPageFade === "fade"}
          // The opening's overlay fades as one over what is under it; a fade
          // per page would bring a spread's halves in apart.
          fadeSuppressed={readerOpeningHudHeld}
          offline={readerConnectivity.offline}
          error={imageError}
          strings={strings}
          onImageLoadStart={() => {
            clearReaderImageError(pageIdentity);
          }}
          onImageLoad={({ width, height }) => {
            clearReaderImageError(pageIdentity);
            setReaderImageNaturalSize(
              pageIdentity,
              { width, height },
              stablePageSizeKey,
            );
            saveMobileReaderPageSize(pageSizeChapterKey, page.id, { width, height });
            if (!neighbour) releaseReaderOpeningOnDecode(page.id);
            if (!neighbour) setReaderSwitchPageFade((current) => (current === "fade" ? "off" : current));
            if (!neighbour) measureReaderFirstContent(page);
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
            setReaderImageNaturalSize(
              pageIdentity,
              { width: asset.width, height: asset.height },
              stablePageSizeKey,
            );
            saveMobileReaderPageSize(pageSizeChapterKey, page.id, {
              width: asset.width,
              height: asset.height,
            });
          }}
          onRetry={() => {
            retryReaderImage(pageIdentity);
          }}
        >
          {!neighbour && japaneseLearningOverlayDetections.some((detection) => detection.pageId === page.id) ? (
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
          {!neighbour &&
          dualReadEnabled &&
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
      // A neighbour's page is fitted (and rests, and pans) by its own size, as
      // its frame is (getReaderImageFrameSize): looked up under the open
      // chapter's identity it went unfound, so a wide page joined height-fitted
      // but centred, and jumped to its reading-start edge once crossed into.
      const pageFitMode = neighbour
        ? readerPageFitModeFor(page, readerStripPageSize(neighbour.chapterId, page))
        : readerPageFitModeFor(page);
      return (
        <ZoomableReaderImageFrame
          // Remounting on retry is what re-issues the image request.
          key={`${pageIdentity}:${retryNonce}`}
          frameSize={readerImageFrameSize}
          viewport={pageFitMode === "page" ? undefined : readerFitViewport}
          panControls={pageFitMode === readerFitMode ? undefined : readerPagePanControlsRef.current}
          onSwipeTurn={pageFitMode === "page" ? undefined : turnReaderPageBySwipe}
          rtl={mode === "rtl"}
          onZoomActiveChange={handleReaderPageZoomActiveChange}
          pageId={page.id}
          stageTwoFingerTap={readerTwoFingerDoubleTap}
          zoomTapBand={readerZoomTapBand}
        >
          {pageFrame}
        </ZoomableReaderImageFrame>
      );
    },
    [
      readerBackgroundColor,
      readerOpeningHudHeld,
      readerSwitchPageFade,
      turnReaderPageBySwipe,
      activeJapaneseLearningTranscriptOrder,
      chapter?.id,
      clampedPageIndex,
      readerOpeningPagedTargetIndex,
      clearReaderImageError,
      currentDisplayedPageKey,
      dualReadEnabled,
      bilingualSideBySide,
      galleryPagedMode,
      getReaderImageFrameSize,
      handleReaderPageZoomActiveChange,
      pagedMode,
      readerFitMode,
      readerFitViewport,
      readerPageFitModeFor,
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
      readerTwoFingerDoubleTap,
      releaseReaderOpeningOnDecode,
      retryReaderImage,
      retryReaderPageProcessing,
      selectJapaneseLearningDetection,
      setReaderImageLoadError,
      setReaderImageNaturalSize,
      readerPageSizeChapterKey,
      readerStablePageSizeKeyFor,
      readerPageIdentityForChapter,
      readerStablePageSizeKeyForChapter,
      readerStripPageSize,
      routeRef.registryId,
      routeRef.sourceId,
      mangaId,
      strings,
    ],
  );
  // Scroll mode: `renderReaderImage` changes identity whenever any page
  // loads (its size, error and nonce maps), which re-rendered every mounted
  // page cell. The vertical list's cells are memoized on these instead: a
  // per-page key for what is page-scoped, and an epoch for what every page
  // shares. Anything new `renderReaderImage` reads for the vertical list
  // must land in one of the two.
  const readerScrollPageRenderEpoch = useMemo(
    () => ({
      readerBackgroundColor,
      activeJapaneseLearningTranscriptOrder,
      chapterId: chapter?.id,
      dualReadEnabled,
      bilingualSideBySide,
      galleryPagedMode,
      japaneseLearningOverlayDetections,
      japaneseLearningSelectedDetectionOrder,
      mode,
      pageCount,
      pagedMode,
      offline: readerConnectivity.offline,
      readerDisplayIndexByPageId,
      readerPageIdentityFor,
      readerSegmentedCacheKeyFor,
      selectJapaneseLearningDetection,
      strings,
    }),
    [
      readerBackgroundColor,
      activeJapaneseLearningTranscriptOrder,
      chapter?.id,
      dualReadEnabled,
      bilingualSideBySide,
      galleryPagedMode,
      japaneseLearningOverlayDetections,
      japaneseLearningSelectedDetectionOrder,
      mode,
      pageCount,
      pagedMode,
      readerConnectivity.offline,
      readerDisplayIndexByPageId,
      readerPageIdentityFor,
      readerSegmentedCacheKeyFor,
      selectJapaneseLearningDetection,
      strings,
    ],
  );
  const readerScrollPageRenderKeys = useMemo(() => {
    if (galleryPagedMode) return null;
    const keys = new Map<string, string>();
    for (const page of displayedPages) {
      const identity = readerPageIdentityFor(page);
      const naturalSize = readerImageSizes.get(identity);
      const frame = getReaderImageFrameSize(page);
      keys.set(
        page.id,
        [
          frame.width,
          frame.height,
          naturalSize ? `${naturalSize.width}x${naturalSize.height}` : "",
          readerImageErrors.get(identity) ?? "",
          readerImageRetryNonces.get(identity) ?? 0,
          dualReadEnabled && page.id === currentDisplayedPageKey ? "current" : "",
        ].join("|"),
      );
    }
    return keys;
  }, [
    currentDisplayedPageKey,
    displayedPages,
    dualReadEnabled,
    galleryPagedMode,
    getReaderImageFrameSize,
    readerImageErrors,
    readerImageRetryNonces,
    readerImageSizes,
    readerPageIdentityFor,
  ]);
  // ---- Seamless scroll: the list's rows, crossings, gallery callbacks ------
  const readerStripRef = useRef({ strip: readerStrip, rows: readerStripRows });
  /** Rows just moved above the open chapter (a prepend, a head drop): no crossing yet. */
  const readerStripBridgeMovingRef = useRef(false);
  readerStripRef.current = { strip: readerStrip, rows: readerStripRows };
  useEffect(() => {
    readerStripUserScrolledRef.current = false;
    noteReaderStripGate({ kind: "open" });
  }, [noteReaderStripGate, readerScrollMountKey]);
  readerStripCanPrependRef.current = () =>
    galleryPagedMode
      ? // Paged reading: once the opening restore has placed the pager (the
        // previous chapter warms in the first pages, before any turn).
        readerRestoreCompleteRef.current
      : readerStripUserScrolledRef.current &&
        readerRestoreCompleteRef.current &&
        readerScrollLandingRef.current == null &&
        readerProgrammaticScrollRef.current == null;
  // The fetched previous chapter joins only at rest, with the gate still
  // open and the reading line still in the open chapter's first pages.
  // Paged reading: no swipe or leaf turning (frames are spliced in front of
  // the reader's), on the open chapter's first pages or on the placeholder.
  readerStripCanSplicePreviousRef.current = () =>
    galleryPagedMode
      ? !readerPagedTurningRef.current &&
        readerRestoreCompleteRef.current &&
        (readerPagedEdgeRef.current?.side === "head" ||
          shouldPrependMobileReaderStripSegment(clampedPageIndex, true))
      : shouldSpliceMobileReaderStripPrevious({
      atRest: !readerUserScrollingRef.current,
      canPrepend: readerStripCanPrependRef.current(),
      localIndex:
        mobileReaderStripBridgeOpenAnchor(
          readerStripBridgeRef.current,
          readerGalleryScrollRef.current?.pageAnchor() ?? null,
        )?.pageIndex ?? null,
    });
  /**
   * Rows were just inserted, removed or resized above: until the list has
   * reported its new offset (checked by the gallery), a report may still be
   * in the old rows' terms — no crossing, no head prune.
   */
  const readerStripRowsSettling = () =>
    readerStripBridgeMovingRef.current || readerGalleryScrollRef.current?.rowsSettling() === true;
  readerStripHeadOffscreenRef.current = (_strip, count) => {
    // Paged reading: the chapters dropped are behind the open one, off
    // screen whenever no swipe or leaf turn shows the frame beside it.
    if (galleryPagedMode) return count > 0 && !readerPagedTurningRef.current;
    if (!readerStripLayout || !readerStripStarts) return false;
    if (readerStripRowsSettling()) return false;
    const viewport = readerGalleryScrollRef.current?.scrollViewport() ?? null;
    if (!viewport) return false;
    return isMobileReaderStripHeadRemovalOffscreen(
      mobileReaderStripHeadRemoval(readerStripLayout, readerStripStarts, count),
      viewport.top,
    );
  };
  /**
   * The screen's centre crossed a divider into another chapter of the list:
   * that chapter becomes the open one, in place (no remount, no loading
   * state, no animation). The chapter left keeps its own progress: its
   * pending position is written to it, and leaving it forward marks it read.
   */
  const crossIntoReaderStripSegment = (crossing: {
    segmentIndex: number;
    localIndex: number;
    direction: "forward" | "backward";
  }): boolean => {
    if (!readerStrip || pagesState.status !== "ready") return false;
    // The opening restore (or a seek) owns the list until it lands.
    if (!readerRestoreCompleteRef.current || readerScrollLandingRef.current) return false;
    // Rows were just inserted, removed or resized above: a report may still
    // be in the old rows' terms. (Paged reading settles on whole frames.)
    if (!galleryPagedMode && readerStripRowsSettling()) return false;
    const leavingTarget = readerProgressTargetRef.current;
    if (leavingTarget.chapterId !== chapterId) return false;
    const leaving: ReaderStripSegmentData = {
      chapter: { ...pagesState.chapter, id: chapterId },
      pages: pagesState.pages,
      pageProcessor: pagesState.pageProcessor,
      fetchedAt: pagesState.fetchedAt,
    };
    // Writes for the chapter left are queued before it stops being open,
    // each naming it explicitly.
    flushPendingReaderProgress({ updateState: false });
    flushPendingIntraPageProgress(false);
    if (crossing.direction === "forward") {
      void persistProgressRef.current(true, Math.max(0, leavingTarget.pageCount - 1), {
        silent: true,
        target: leavingTarget,
        updateState: false,
      }).catch(() => undefined);
    }
    const arriving = readerChapterStrip.rebase(crossing.segmentIndex, leaving);
    if (!arriving) return false;
    const arrivingId = arriving.chapter.id;
    const arrivingCount = arriving.pages.length;
    const localIndex = clampReaderPageIndex(crossing.localIndex, arrivingCount);
    // The pages effect must find this chapter loaded (not reset it to a
    // loading state), and a request still in flight for the chapter left
    // must not land on top of it.
    readerPagesLoadedKeyRef.current = `${makeMobileReaderPagesPrefetchKey({
      registryId,
      sourceId,
      mangaId,
      chapterId: arrivingId,
      processPageImages,
    })}:${pagesRefreshNonce}:${appLanguage}`;
    readerPagesRequestRunRef.current += 1;
    readerPagesInFlightKeyRef.current = null;
    currentChapterIdRef.current = arrivingId;
    readerStripCrossedIntoRef.current = arrivingId;
    const sessionKey = readerStripSession;
    setReaderSeamlessChapter((current) => ({
      chapterId: arrivingId,
      routeChapterIds: [
        ...new Set([...(current?.routeChapterIds ?? []), routeChapterId, arrivingId]),
      ],
      sessionKey,
      fetchedAt: arriving.fetchedAt,
    }));
    setPagesState((previous) => ({
      status: "ready",
      pages: arriving.pages,
      pageProcessor: arriving.pageProcessor,
      chapters: previous.status === "ready" ? previous.chapters : [...readerChapters],
      detail: formatReaderLoadedPages(arrivingCount, strings),
      fetchedAt: arriving.fetchedAt,
      chapter: arriving.chapter,
    }));
    setEndOfChapterPromptVisible(false);
    clearReaderProgrammaticScroll();
    scrollingVisiblePageIndexRef.current = localIndex;
    readerLivePageStore.set(null);
    setPageArrival("initial");
    setCurrentPageIndex(localIndex);
    setReaderStripTriggerIndex(
      shouldAppendMobileReaderStripSegment(localIndex, arrivingCount)
        ? Math.max(0, arrivingCount - 1)
        : shouldPrependMobileReaderStripSegment(localIndex, true)
          ? 0
          : Math.min(Math.max(0, arrivingCount - 1), MOBILE_READER_STRIP_PREPEND_LEAD_PAGES),
    );
    const chapterTitleParam = normalizeMobileReaderRouteLabel(arriving.chapter.title, arrivingId);
    router.setParams({
      chapterId: arrivingId,
      page: String(readerRoutePageForDisplayIndex(localIndex, arrivingCount, mode)),
      chapterTitle: chapterTitleParam || undefined,
      chapterNumber:
        arriving.chapter.chapterNumber != null ? String(arriving.chapter.chapterNumber) : undefined,
      volumeNumber:
        arriving.chapter.volumeNumber != null ? String(arriving.chapter.volumeNumber) : undefined,
      chapterLocked: arriving.chapter.locked === true ? "true" : undefined,
    });
    if (galleryPagedMode) {
      // Paged reading has no divider: a capsule names the chapter turned into.
      setReaderChapterCrossingCapsule({
        id: Date.now(),
        // As the chapter's row in the chapter list says it.
        title: formatChapterRowTitle(arriving.chapter, strings, { dropVolume: readerChapterListDropsVolume }),
      });
      logReaderEndOfChapter(
        `paged crossing ${crossing.direction} ${chapterId} -> ${arrivingId} p${localIndex + 1}/${arrivingCount}`,
      );
    }
    return true;
  };
  const crossIntoReaderStripSegmentRef = useRef(crossIntoReaderStripSegment);
  crossIntoReaderStripSegmentRef.current = crossIntoReaderStripSegment;

  // ---- Seamless paged reading: landing on another chapter's frame ---------
  const [readerChapterCrossingCapsule, setReaderChapterCrossingCapsule] =
    useState<ReaderChapterCrossingCapsuleState | null>(null);
  const dismissReaderChapterCrossingCapsule = useCallback(
    (id: number) => setReaderChapterCrossingCapsule((current) => (current?.id === id ? null : current)),
    [],
  );
  /** Moves the pager to a joined frame (any chapter's, or a placeholder). */
  const scrollToReaderPagedFrame = (frame: number, animated: boolean) => {
    const paged = readerPagedStripRef.current;
    if (!paged) return;
    readerScrollRef.current?.scrollTo({
      x: readerScrollOffsetForLogicalFrame(frame, paged.frameCount, readerPageWidth, mode),
      y: 0,
      animated,
    });
  };
  /**
   * The chapter's page (or spread) the reader lands on from the frame it
   * settled on: a backward crossing stands on the spread's last page, a
   * forward one on its first.
   */
  const readerPagedLandingPage = (
    localPages: readonly number[],
    direction: "forward" | "backward",
  ): number => (direction === "backward" ? localPages[localPages.length - 1] : localPages[0]) ?? 0;
  /**
   * The pager settled outside the open chapter (a swipe, a tap turn, a curl):
   * into the chapter before or after it (it becomes the open one, in place),
   * or onto a placeholder (it rests there; the chapter is fetched first and
   * replaces it).
   */
  const landOnReaderPagedFrame = (
    crossing: NonNullable<ReturnType<typeof mobileReaderPagedStripCrossing>>,
    userTurn: boolean,
  ) => {
    if (userTurn) notifyReaderPageTurn(crossing.direction);
    clearReaderProgrammaticScroll();
    if (crossing.placeholder) {
      setReaderPagedEdge({ chapterId: crossing.chapterId, side: crossing.direction === "backward" ? "head" : "tail" });
      // The chapter goes first: fetched now if it was not on its way.
      if (crossing.direction === "backward") requestReaderStripPrevious();
      logReaderEndOfChapter(`paged placeholder ${crossing.direction} chapter=${crossing.chapterId} (loading)`);
      return;
    }
    setReaderPagedEdge(null);
    const segmentIndex = readerStrip?.segments.findIndex((segment) => segment.chapter.id === crossing.chapterId) ?? -1;
    const localIndex = readerPagedLandingPage(crossing.localPages, crossing.direction);
    // Its pages not ready yet go first in its processing queue.
    readerChapterStrip.prioritise(crossing.chapterId, crossing.localPages);
    if (
      segmentIndex < 0 ||
      !crossIntoReaderStripSegment({ segmentIndex, localIndex, direction: crossing.direction })
    ) {
      // Not now (a restore owns the pager): back to the open chapter's page.
      logReaderEndOfChapter(`paged crossing refused chapter=${crossing.chapterId}`);
      readerCrossingTaps.cancelCrossing();
      scrollToPageIndex(clampedPageIndex, true);
    }
  };
  const landOnReaderPagedFrameRef = useRef(landOnReaderPagedFrame);
  landOnReaderPagedFrameRef.current = landOnReaderPagedFrame;
  // A turn past the open chapter's edge: the next frame is the chapter (or
  // placeholder) beside it, so the turn always happens. Off a placeholder:
  // back to the open chapter, or (further out) nothing more to turn to yet.
  readerPagedStepRef.current = (direction) => {
    const paged = readerPagedStripRef.current;
    if (!paged || !galleryPagedMode) return false;
    if (readerPagedEdge) {
      const backToOpen = (readerPagedEdge.side === "tail") === (direction === "previous");
      if (backToOpen) {
        setReaderPagedEdge(null);
        notifyReaderPageTurn(direction === "next" ? "forward" : "backward");
        scrollToPageIndex(clampedPageIndex, true);
      } else {
        if (readerPagedEdge.side === "head") requestReaderStripPrevious();
        logReaderEndOfChapter(`paged turn past placeholder chapter=${readerPagedEdge.chapterId} (still loading)`);
      }
      return true;
    }
    const base = mobileReaderPagedStripFrameBase(paged);
    const localFrame = isTwoPageMode ? currentSpreadIndex : clampedPageIndex;
    const target = base + localFrame + (direction === "next" ? 1 : -1);
    if (target < 0 || target >= paged.frameCount) return false;
    const located = mobileReaderPagedStripLocate(paged, target);
    if (!located || located.segmentIndex === paged.currentIndex) return false;
    notifyReaderPageTurn(direction === "next" ? "forward" : "backward");
    if (located.placeholder) {
      if (direction === "previous") requestReaderStripPrevious();
    } else {
      readerChapterStrip.prioritise(located.chapterId, located.localPages);
      // Taps until it lands are held for it, not turned from this chapter.
      readerCrossingTaps.beginCrossing(chapterId, Date.now());
    }
    // The settle that follows is the crossing (no second haptic).
    armReaderProgrammaticScroll({ kind: "frame", frameIndex: target - base });
    scrollToReaderPagedFrame(target, true);
    return true;
  };
  // Held tap turns replay one per render, as the chapter they landed for.
  // A replayed turn only takes effect in the next render: the one after it
  // waits for that render (else it would step from the same page again).
  readerCrossingTapRenderRef.current += 1;
  const scheduleDrain = () => {
    if (readerCrossingTapTimerRef.current) return;
    readerCrossingTapTimerRef.current = setTimeout(() => {
      readerCrossingTapTimerRef.current = null;
      drainReaderCrossingTapsRef.current();
    }, 120);
  };
  drainReaderCrossingTapsRef.current = () => {
    if (readerCrossingTaps.pending <= 0) return;
    const now = Date.now();
    const replayed = readerCrossingTapReplayedRef.current;
    const waitingForRender =
      replayed != null && replayed.render === readerCrossingTapRenderRef.current && now - replayed.at < 250;
    const direction = waitingForRender ? null : readerCrossingTaps.next(chapterId, now);
    if (!direction) {
      // Still in flight (the hold has a cap) or not re-rendered yet.
      scheduleDrain();
      return;
    }
    readerCrossingTapReplayedRef.current = { render: readerCrossingTapRenderRef.current, at: now };
    readerCrossingTapReplayingRef.current = true;
    try {
      stepReaderPageRef.current(direction);
    } finally {
      readerCrossingTapReplayingRef.current = false;
    }
    if (readerCrossingTaps.pending > 0) scheduleDrain();
  };
  useEffect(() => {
    if (readerCrossingTaps.pending > 0) drainReaderCrossingTapsRef.current();
  });
  useEffect(
    () => () => {
      if (readerCrossingTapTimerRef.current) clearTimeout(readerCrossingTapTimerRef.current);
    },
    [],
  );
  // Seamless paged reading, at rest again (no swipe, no leaf turning): a
  // previous chapter fetched meanwhile joins in front now, and a head prune
  // that waited for the frames to settle runs.
  const readerPagedStripActive = readerPagedStrip != null;
  useEffect(() => {
    if (!readerPagedStripActive || readerPagedTurning) return;
    flushReaderStripPrevious();
    recheckReaderStripPrune();
  }, [flushReaderStripPrevious, readerPagedStripActive, readerPagedTurning, recheckReaderStripPrune]);
  // The opening restore placed the pager (or a crossing re-based it): the
  // previous chapter may be fetched now if the reader is in its first pages.
  useEffect(() => {
    if (!galleryPagedMode || !readerSeamlessPagedEnabled || !readerRestoreComplete) return;
    recheckReaderStripPrevious();
  }, [chapterId, galleryPagedMode, readerRestoreComplete, readerSeamlessPagedEnabled, recheckReaderStripPrevious]);
  // Resting on a placeholder: its chapter arrived (cross into it, on its
  // edge next to the chapter the reader came from — the pager is already
  // there), or failed / is locked (back to the open chapter's edge, with the
  // end-of-chapter prompt or the old way into the previous chapter).
  useEffect(() => {
    if (!readerPagedEdge || !readerPagedStrip || readerPagedTurning) return;
    const at = readerPagedStrip.segments.findIndex((segment) => segment.chapterId === readerPagedEdge.chapterId);
    const segment = at >= 0 ? readerPagedStrip.segments[at] : undefined;
    if (segment?.kind === "placeholder") return;
    if (segment && readerPagedEdgeFrame != null) {
      const located = mobileReaderPagedStripLocate(readerPagedStrip, readerPagedEdgeFrame);
      const direction = readerPagedEdge.side === "head" ? "backward" : "forward";
      const segmentIndex = readerStrip?.segments.findIndex((entry) => entry.chapter.id === readerPagedEdge.chapterId) ?? -1;
      if (
        located &&
        segmentIndex >= 0 &&
        crossIntoReaderStripSegmentRef.current({
          segmentIndex,
          localIndex: readerPagedLandingPage(located.localPages, direction),
          direction,
        })
      ) {
        setReaderPagedEdge(null);
      }
      return;
    }
    setReaderPagedEdge(null);
    if (readerPagedEdge.side === "tail") showEndOfChapterPrompt("next-chapter-unavailable");
    else showPreviousChapterFromEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the strip changing under the placeholder is the trigger.
  }, [readerPagedEdge, readerPagedEdgeFrame, readerPagedStrip, readerPagedTurning]);
  // The gallery speaks in list rows; the reader in the open chapter's pages.
  const onGalleryScrollingVisiblePageChange = useCallback(
    (globalIndex: number) => {
      const { strip, rows } = readerStripRef.current;
      const bridge = readerStripBridgeRef.current;
      // Rows above changed and the list has not been checked yet: the
      // centre may be read against rows the native offset did not follow
      // (r12: p270 of 306 for a moment) — neither a crossing nor a page of
      // the open chapter. The settle reports the centre again.
      if (strip && readerGalleryScrollRef.current?.rowsSettling() === true) return;
      if (strip && rows) {
        const crossing = mobileReaderStripCrossing(rows, strip, globalIndex);
        // Back into the chapter before only by the reader's own scroll: a
        // splice or re-anchor under a still reader (an open at p1) is read
        // in the old rows' terms — neither a crossing nor a page.
        if (
          crossing &&
          !shouldTakeMobileReaderStripCrossing(crossing.direction, readerStripUserMovedRef.current)
        ) {
          logReaderEndOfChapter(`strip backward crossing ignored (no gesture since anchor) chapter=${crossing.segmentIndex}`);
          return;
        }
        if (crossing && crossIntoReaderStripSegmentRef.current(crossing)) return;
        // Not crossed while the rows settle: the report is not the open
        // chapter's page either (never clamped onto its edge).
        if (
          crossing &&
          (readerStripBridgeMovingRef.current || readerGalleryScrollRef.current?.rowsSettling() === true)
        ) {
          return;
        }
      }
      const local = mobileReaderStripBridgeClampedLocalIndex(bridge, globalIndex);
      if (local == null) return;
      if (strip) setReaderStripTriggerIndex(readerStripTriggerFor(local));
      onScrollingVisiblePageChange(local);
    },
    [onScrollingVisiblePageChange, readerStripTriggerFor],
  );
  const onGalleryScrollingPageLayout = useCallback(
    (globalIndex: number, metric: ReaderScrollPageMetric) => {
      const local = mobileReaderStripBridgeLocalIndex(readerStripBridgeRef.current, globalIndex);
      if (local != null) onScrollingPageLayout(local, metric);
    },
    [onScrollingPageLayout],
  );
  const onGalleryScrollingSeekLanded = useCallback(
    (globalIndex: number) => {
      const local = mobileReaderStripBridgeLocalIndex(readerStripBridgeRef.current, globalIndex);
      if (local != null) onScrollingSeekLanded(local);
    },
    [onScrollingSeekLanded],
  );
  const onGalleryScrollingSeekFailed = useCallback(
    (globalIndex: number) => {
      const local = mobileReaderStripBridgeClampedLocalIndex(readerStripBridgeRef.current, globalIndex);
      if (local != null) onScrollingSeekFailed(local);
    },
    [onScrollingSeekFailed],
  );
  const onGalleryScrollingFlingTarget = useCallback(
    (viewport: MobileReaderScrollViewport) => {
      onScrollingFlingTarget({
        top: viewport.top - readerStripBridgeRef.current.offsetBase,
        height: viewport.height,
      });
    },
    [onScrollingFlingTarget],
  );
  // Past the list's end: the end-of-chapter prompt only when the next
  // chapter failed or is locked; while it is joining the list, nothing. At
  // the true end (nothing follows) the list's "Caught up" divider says it:
  // no card (see `completeReaderStripCaughtUp`).
  const onGalleryRequestAdvancePastEnd = useCallback(() => {
    const strip = readerStripRef.current.strip;
    const paged = readerPagedStripRef.current;
    if (paged) {
      // Paged reading: past the joined frames' end. A placeholder there is
      // the next chapter on its way (the reader turns onto it, not past it);
      // otherwise this is the true end (the caught-up card) or the next
      // chapter failed or is locked (the prompt says so).
      if (paged.segments[paged.segments.length - 1]?.kind === "placeholder") {
        logReaderEndOfChapter("paged drag past the end: next chapter still loading");
        return;
      }
      // A chapter after the open one in the pager: not past the end yet.
      if (paged.currentIndex !== paged.segments.length - 1) return;
      const tail = strip?.tail;
      showEndOfChapterPrompt(
        tail?.kind === "end" ? "paged-caught-up" : tail?.kind === "next" ? `paged-next-${tail.status}` : "paged-past-end",
      );
      return;
    }
    if (strip) {
      if (strip.currentIndex !== strip.segments.length - 1) return;
      const tail = strip.tail;
      if (tail?.kind === "next" && (tail.status === "idle" || tail.status === "loading")) return;
    }
    if (completeReaderStripCaughtUp()) return;
    showEndOfChapterPrompt("drag-past-end");
  }, [completeReaderStripCaughtUp, showEndOfChapterPrompt]);
  const onGalleryRequestRetreatPastStart = useCallback(() => {
    const strip = readerStripRef.current.strip;
    const paged = readerPagedStripRef.current;
    if (paged && paged.segments[0]?.kind === "placeholder") {
      // The previous chapter is on its way: it goes first.
      requestReaderStripPrevious();
      return;
    }
    // A chapter before the open one in the pager: not past the start yet.
    if (paged && paged.currentIndex !== 0) return;
    if (strip && !paged) {
      if (strip.currentIndex !== 0) return;
      if (requestReaderStripPrevious()) return;
    }
    showPreviousChapterFromEnd();
  }, [requestReaderStripPrevious, showPreviousChapterFromEnd]);
  // A prepend (or a chapter dropped above) moves the open chapter's rows:
  // maintainVisibleContentPosition keeps the screen on the same picture.
  // Should it not have (a jump of more than half a screen), the reading spot
  // is put back — never under the reader's own scroll. Until that check, no
  // crossing (see crossIntoReaderStripSegment).
  const readerStripPlacementRef = useRef<{ chapterId: string; bridge: MobileReaderStripBridge } | null>(null);
  useLayoutEffect(() => {
    const previous = readerStripPlacementRef.current;
    readerStripPlacementRef.current = { chapterId, bridge: readerStripBridge };
    if (
      !readerStrip ||
      !previous ||
      previous.chapterId !== chapterId ||
      previous.bridge.indexBase === readerStripBridge.indexBase
    ) {
      return;
    }
    // The open chapter's rows moved under it: no backward crossing until the
    // reader moves it again.
    noteReaderStripGate({ kind: "re-anchor" });
    readerStripBridgeMovingRef.current = true;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        readerStripBridgeMovingRef.current = false;
      });
    });
    const release = () => {
      cancelAnimationFrame(frame);
      readerStripBridgeMovingRef.current = false;
    };
    // The gallery has already moved its anchor with its rows (same commit).
    const before = readerGalleryScrollRef.current?.pageAnchor() ?? null;
    if (!before || !readerStripLayout) return release;
    const local = mobileReaderStripBridgeOpenAnchor(readerStripBridge, before);
    if (!local) return release;
    const expected = mobileReaderStripBridgeGlobalIndex(readerStripBridge, local.pageIndex);
    const fraction = local.fraction;
    const expectedOffset = mobileReaderScrollOffsetForAnchor(readerStripLayout, expected, fraction);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        readerStripBridgeMovingRef.current = false;
        if (readerUserScrollingRef.current) return;
        const gallery = readerGalleryScrollRef.current;
        const viewport = gallery?.scrollViewport() ?? null;
        if (
          !gallery ||
          !viewport ||
          !isMobileReaderStripPlacementOff({
            currentOffset: gallery.contentOffset?.() ?? null,
            expectedOffset,
            viewportHeight: viewport.height,
          })
        ) {
          return;
        }
        gallery.scrollTo({ index: expected, fraction, y: expectedOffset, animated: false });
      });
    });
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the bridge moving is the trigger.
  }, [readerStripBridge]);
  const readerStripSourceName = selectedInstalledSource?.name ?? null;
  // The rows settled (see readerStripRowsSettling): a crossing or a head
  // prune held back meanwhile is judged again now.
  const onGalleryRowsSettled = useCallback((corrected: boolean) => {
    recheckReaderStripPrune();
    // Put back: the list's next scroll event reports the centre.
    if (corrected) return;
    const centre = readerGalleryScrollRef.current?.centrePageIndex() ?? null;
    if (centre == null || !readerStripRef.current.strip) return;
    onGalleryScrollingVisiblePageChange(centre);
  }, [onGalleryScrollingVisiblePageChange, recheckReaderStripPrune]);
  // Pull prepend mode: the chapter above the list's first one, shown while
  // the list is pulled past its top (and fetched when let go past 72pt).
  const readerStripPullChapter = useMemo(() => {
    if (MOBILE_READER_STRIP_PREPEND_MODE !== "pull" || !readerStrip) return null;
    const first = readerStrip.segments[0];
    if (!first) return null;
    const previous = getMobileReaderChapterNavigation([...readerChapters], first.chapter.id, "scrolling")
      .previousChapter;
    return previous && !previous.locked ? previous : null;
  }, [readerChapters, readerStrip]);
  const readerStripPullHeader = useMemo(
    () =>
      MOBILE_READER_STRIP_PREPEND_MODE === "pull" && readerSeamlessEnabled ? (
        <ReaderChapterDivider
          variant="previous"
          chapter={readerStripPullChapter}
          status="ready"
          sourceName={readerStripSourceName}
          strings={strings}
          lightBackground={readerPageIsLight}
        />
      ) : null,
    [readerPageIsLight, readerSeamlessEnabled, readerStripPullChapter, readerStripSourceName, strings],
  );
  const readerStripPullEnabled =
    readerStripPullChapter != null && readerStrip != null && readerStrip.currentIndex === 0;
  const renderReaderStripImage = useCallback(
    (galleryPage: MobileReaderPage, placement?: MobileReaderImagePlacement) => {
      const entry = readerStripRowByKey.get(galleryPage.id);
      if (!entry || entry.row.kind !== "page" || !readerStrip) return null;
      const { row, index } = entry;
      if (row.segmentIndex === readerStrip.currentIndex) {
        return renderReaderImage(row.page, placement);
      }
      const segment = readerStrip.segments[row.segmentIndex];
      if (!segment) return null;
      return renderReaderImage(row.page, placement, {
        chapterId: segment.chapter.id,
        frameSize: {
          width: readerImageWidth,
          height: readerStripLayout?.heights[index] ?? readerImageWidth * 1.45,
        },
      });
    },
    [readerImageWidth, readerStrip, readerStripLayout, readerStripRowByKey, renderReaderImage],
  );
  const renderReaderStripRow = useCallback(
    (galleryPage: MobileReaderPage) => {
      const entry = readerStripRowByKey.get(galleryPage.id);
      if (!entry || entry.row.kind !== "divider") return undefined;
      const { row } = entry;
      const target = row.chapter;
      return (
        <ReaderChapterDivider
          variant={row.variant}
          chapter={row.chapter}
          status={row.status}
          sourceName={readerStripSourceName}
          strings={strings}
          lightBackground={readerPageIsLight}
          onRetry={
            row.status === "failed"
              ? retryReaderStripNext
              : row.status === "locked" && target
                ? () => goToChapter(target, { startAt: "start" })
                : undefined
          }
        />
      );
    },
    [goToChapter, readerPageIsLight, retryReaderStripNext, readerStripRowByKey, readerStripSourceName, strings],
  );
  // Render identity per list row (see readerScrollPageRenderKeys).
  const readerStripRenderKeys = useMemo(() => {
    if (!readerStrip || !readerStripRows) return null;
    const keys = new Map<string, string>();
    readerStripRows.forEach((row, index) => {
      if (row.kind === "divider") {
        keys.set(
          row.key,
          ["divider", row.variant, row.status, row.chapter?.id ?? "", readerStripSourceName ?? ""].join("|"),
        );
        return;
      }
      if (row.segmentIndex === readerStrip.currentIndex) {
        keys.set(row.key, `${chapterId}|open|${readerScrollPageRenderKeys?.get(row.page.id) ?? ""}`);
        return;
      }
      const segmentChapterId = readerStrip.segments[row.segmentIndex]?.chapter.id ?? "";
      const identity = readerPageIdentityForChapter(segmentChapterId, row.page);
      const size = readerImageSizes.get(identity);
      keys.set(
        row.key,
        [
          segmentChapterId,
          "neighbour",
          readerStripLayout?.heights[index] ?? 0,
          size ? `${size.width}x${size.height}` : "",
          readerImageErrors.get(identity) ?? "",
          readerImageRetryNonces.get(identity) ?? 0,
          row.page.imageProcessing ?? "",
          row.page.imageUri ?? "",
        ].join("|"),
      );
    });
    return keys;
  }, [
    chapterId,
    readerImageErrors,
    readerImageRetryNonces,
    readerImageSizes,
    readerPageIdentityForChapter,
    readerScrollPageRenderKeys,
    readerStrip,
    readerStripLayout,
    readerStripRows,
    readerStripSourceName,
  ]);
  const readerGallerySourcePageForDisplayIndex = useCallback(
    (displayIndex: number) =>
      sourcePageForDisplayIndex(
        mobileReaderStripBridgeClampedLocalIndex(readerStripBridge, displayIndex) ?? displayIndex,
      ),
    [readerStripBridge, sourcePageForDisplayIndex],
  );
  const readerGalleryInitialContentOffset = useMemo(
    () =>
      readerStripBridge.offsetBase === 0 || galleryPagedMode
        ? readerInitialContentOffset
        : { x: readerInitialContentOffset.x, y: readerInitialContentOffset.y + readerStripBridge.offsetBase },
    [galleryPagedMode, readerInitialContentOffset, readerStripBridge.offsetBase],
  );
  // ---- Seamless paged reading: the pager's pages --------------------------
  // The joined frames' pages (ids unique across chapters, the strip key, so a
  // crossing or a chapter joining keeps every cell), each with the chapter
  // and the page of it it shows. The open chapter's pages render as before;
  // a neighbour's as that chapter's own (sizes, spreads, fit).
  const readerPagedGalleryCacheRef = useRef(
    new Map<string, { source: MobileReaderPage | null; page: MobileReaderPage }>(),
  );
  const readerPagedGallery = useMemo(() => {
    if (!readerPagedStrip || !readerStrip) return null;
    type Entry = {
      chapterId: string;
      /** The page of its chapter (null: a placeholder). */
      source: MobileReaderPage | null;
      localIndex: number;
      /** The paged strip's segment. */
      segmentIndex: number;
    };
    const previous = readerPagedGalleryCacheRef.current;
    const cache = new Map<string, { source: MobileReaderPage | null; page: MobileReaderPage }>();
    const pages: MobileReaderPage[] = [];
    const byKey = new Map<string, Entry>();
    const chapterPages = new Map<string, readonly MobileReaderPage[]>();
    readerStrip.segments.forEach((segment) => chapterPages.set(segment.chapter.id, segment.pages));
    chapterPages.set(chapterId, displayedPages);
    const add = (key: string, source: MobileReaderPage | null, entry: Entry) => {
      const kept = previous.get(key);
      const page =
        kept && kept.source === source
          ? kept.page
          : source
            ? ({ ...source, id: key } as MobileReaderPage)
            : ({ id: key, index: -1 } as MobileReaderPage);
      cache.set(key, { source, page });
      byKey.set(key, entry);
      pages.push(page);
    };
    readerPagedStrip.segments.forEach((segment, segmentIndex) => {
      const count = readerPagedStrip.pageStarts[segmentIndex + 1]! - readerPagedStrip.pageStarts[segmentIndex]!;
      if (segment.kind === "placeholder") {
        add(mobileReaderPagedStripPlaceholderKey(segment.chapterId), null, {
          chapterId: segment.chapterId,
          source: null,
          localIndex: 0,
          segmentIndex,
        });
        return;
      }
      const sources = chapterPages.get(segment.chapterId) ?? [];
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const source = sources[localIndex] ?? null;
        add(
          source
            ? mobileReaderStripPageKey(segment.chapterId, source.id)
            : `${mobileReaderStripPageKey(segment.chapterId, "#")}${localIndex}`,
          source,
          { chapterId: segment.chapterId, source, localIndex, segmentIndex },
        );
      }
    });
    readerPagedGalleryCacheRef.current = cache;
    return { pages, byKey, entries: pages.map((page) => byKey.get(page.id)!) };
  }, [chapterId, displayedPages, readerPagedStrip, readerStrip]);
  /** A neighbour chapter's own spreads (local page indexes), from the joined frames. */
  const readerPagedSegmentSpreads = useCallback(
    (segmentIndex: number): number[][] => {
      if (!readerPagedStrip) return [];
      const start = readerPagedStrip.frameStarts[segmentIndex] ?? 0;
      const end = readerPagedStrip.frameStarts[segmentIndex + 1] ?? start;
      const pageBase = readerPagedStrip.pageStarts[segmentIndex] ?? 0;
      return readerPagedStrip.spreads.slice(start, end).map((spread) => spread.map((page) => page - pageBase));
    },
    [readerPagedStrip],
  );
  const readerPagedNeighbourSizeAt = useCallback(
    (forChapterId: string) => (index: number) => {
      const page = readerPagedGallery?.entries.find(
        (entry) => entry.chapterId === forChapterId && entry.localIndex === index,
      )?.source;
      return page ? readerStripPageSize(forChapterId, page) : null;
    },
    [readerPagedGallery, readerStripPageSize],
  );
  /** The joined frame the reader is on (open chapter's frame plus the frames before it). */
  const readerPagedReaderFrame = readerPagedStrip
    ? readerPagedFrameBase + (isTwoPageMode ? currentSpreadIndex : clampedPageIndex)
    : 0;
  const readerPagedNeighbourFrameSize = useCallback(
    (entry: { chapterId: string; source: MobileReaderPage | null; localIndex: number; segmentIndex: number }) =>
      entry.source
        ? getReaderImageFrameSize(entry.source, {
            index: entry.localIndex,
            spreads: isTwoPageMode ? readerPagedSegmentSpreads(entry.segmentIndex) : [],
            sizeAt: readerPagedNeighbourSizeAt(entry.chapterId),
          })
        : getReaderImageFrameSize({ id: "", index: -1 } as MobileReaderPage),
    [getReaderImageFrameSize, isTwoPageMode, readerPagedNeighbourSizeAt, readerPagedSegmentSpreads],
  );
  const renderReaderPagedImage = useCallback(
    (galleryPage: MobileReaderPage, placement?: MobileReaderImagePlacement) => {
      const entry = readerPagedGallery?.byKey.get(galleryPage.id);
      if (!entry?.source || !readerPagedStrip) return null;
      if (entry.chapterId === chapterId) return renderReaderImage(entry.source, placement);
      // A neighbour's page decodes when its frame is within the render
      // window of the reader's (the chapter's edge pages, while the reader is
      // near the open chapter's edge).
      const pageBase = readerPagedStrip.pageStarts[entry.segmentIndex] ?? 0;
      const frame = readerPagedStrip.spreads.findIndex((spread) => spread.includes(pageBase + entry.localIndex));
      const inRenderWindow = frame >= 0 && Math.abs(frame - readerPagedReaderFrame) <= MOBILE_READER_PAGE_RENDER_WINDOW;
      return renderReaderImage(entry.source, { inRenderWindow }, {
        chapterId: entry.chapterId,
        frameSize: readerPagedNeighbourFrameSize(entry),
      });
    },
    [chapterId, readerPagedGallery, readerPagedNeighbourFrameSize, readerPagedReaderFrame, readerPagedStrip, renderReaderImage],
  );
  const readerPagedIsWidePage = useCallback(
    (joinedIndex: number) => {
      const entry = readerPagedGallery?.entries[joinedIndex];
      if (!entry?.source) return false;
      if (entry.chapterId === chapterId) return readerIsWidePage(entry.localIndex);
      return isMobileReaderWidePage(readerStripPageSize(entry.chapterId, entry.source));
    },
    [chapterId, readerIsWidePage, readerPagedGallery, readerStripPageSize],
  );
  const readerPagedPageFrameSize = useCallback(
    (galleryPage: MobileReaderPage) => {
      const entry = readerPagedGallery?.byKey.get(galleryPage.id);
      if (!entry?.source) return getReaderImageFrameSize(galleryPage);
      if (entry.chapterId === chapterId) return getReaderImageFrameSize(entry.source);
      return readerPagedNeighbourFrameSize(entry);
    },
    [chapterId, getReaderImageFrameSize, readerPagedGallery, readerPagedNeighbourFrameSize],
  );
  const readerPagedPageNaturalSize = useCallback(
    (galleryPage: MobileReaderPage) => {
      const entry = readerPagedGallery?.byKey.get(galleryPage.id);
      if (!entry?.source) return null;
      if (entry.chapterId === chapterId) return readerImageSizes.get(readerPageIdentityFor(entry.source)) ?? null;
      return readerImageSizes.get(readerPageIdentityForChapter(entry.chapterId, entry.source)) ?? null;
    },
    [chapterId, readerImageSizes, readerPageIdentityFor, readerPageIdentityForChapter, readerPagedGallery],
  );
  /** A page's number on its placeholder card: its own chapter's. */
  const readerPagedSourcePageForDisplayIndex = useCallback(
    (joinedIndex: number) => {
      const entry = readerPagedGallery?.entries[joinedIndex];
      if (!entry) return sourcePageForDisplayIndex(joinedIndex);
      if (entry.chapterId === chapterId) return sourcePageForDisplayIndex(entry.localIndex);
      return entry.localIndex + 1;
    },
    [chapterId, readerPagedGallery, sourcePageForDisplayIndex],
  );
  const retryReaderSegmentedPage = useCallback(
    (page: MobileReaderPage, errorKeys: readonly string[]) => {
      const pageIdentity = readerPageIdentityFor(page);
      void invalidateCachedMobileImage(
        { uri: page.imageUri, headers: page.headers, cacheKind: "page" },
        readerSegmentedCacheKeyFor(page),
      )
        .catch(() => undefined)
        .finally(() => {
          setReaderSegmentedImages((current) => {
            const next = new Map(current);
            next.delete(pageIdentity);
            return next;
          });
          errorKeys.forEach(clearReaderImageError);
          retryReaderImage(pageIdentity);
        });
    },
    [clearReaderImageError, readerPageIdentityFor, readerSegmentedCacheKeyFor, retryReaderImage],
  );
  const renderReaderImageSegment = useCallback(
    (frame: MobileReaderSegmentFrame) => {
      const page = currentDisplayedPage;
      const asset = currentSegmentedImage;
      if (!page || !asset) return null;
      const segmentKey = `${asset.generation}:${frame.index}`;
      const pageIdentity = readerPageIdentityFor(page);
      const errorKey = readerSegmentErrorKey(pageIdentity, frame.index);
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
          onRetry={() => retryReaderSegmentedPage(page, [errorKey])}
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
      readerBackgroundColor,
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
      retryReaderSegmentedPage,
      setReaderImageLoadError,
      strings,
    ],
  );

  const readerVisibleFailures = useMemo(
    () => readerVisiblePageFailures(readerVisiblePages, readerPageIdentityFor, readerImageErrors.keys()),
    [readerImageErrors, readerPageIdentityFor, readerVisiblePages],
  );
  const retryReaderVisibleFailures = useCallback(() => {
    for (const failure of readerVisibleFailures) {
      if (failure.kind === "image") {
        retryReaderImage(failure.identity);
      } else if (failure.kind === "segments") {
        retryReaderSegmentedPage(failure.page, failure.errorKeys);
      } else {
        const index = readerDisplayIndexByPageId.get(failure.page.id);
        if (index !== undefined) retryReaderPageProcessing(index);
      }
    }
  }, [
    readerDisplayIndexByPageId,
    readerVisibleFailures,
    retryReaderImage,
    retryReaderPageProcessing,
    retryReaderSegmentedPage,
  ]);
  const stageControlsLabel = showControls
    ? strings.reader.hideControls
    : strings.reader.showControls;
  const stageActionLabel = readerVisibleFailures.length > 0
    ? `${strings.reader.pageImageFailed}. ${stageControlsLabel}`
    : stageControlsLabel;
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
  // Shared by the Plugins sheet and the plugin pages pushed inside the iOS
  // native reader settings (one set of React Native plugin pages).
  const dismissReaderPluginSettingsError = useCallback(() => {
    setReaderSettingsError(null);
    if (readerPlugins.error) {
      setDismissedReaderPluginSettingsError(readerPlugins.error);
    }
  }, [readerPlugins.error]);
  const dismissReaderPluginSettingsLoadError = useCallback(() => {
    if (readerPlugins.error) {
      setDismissedReaderPluginSettingsError(readerPlugins.error);
    }
  }, [readerPlugins.error]);

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
    setJapaneseLearningSignInHost(null);
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
    // (the window) but moves the halves into the panes. Compared as geometry:
    // a flat spread's implicit halves and a centred fold's halves are the
    // same slots, so that posture change re-arms no stage motion.
    pages: galleryPagedMode
      ? JSON.stringify([
          (readerSpreadSlots
            ?? (isTwoPageMode && !readerStageConstrained ? mobileReaderSpreadHalves(readerStage) : null)
          )?.map((slot) => [slot.x, slot.y, slot.width, slot.height].map((value) => Math.round(value * 2) / 2)) ?? null,
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

  // The opening's chrome (build 9 round 3 designer boundary): a geometry
  // correction may jump into place only while the chrome is still fully
  // transparent; once its fade has started, the title, capsules and ⋯ never
  // move. So the fade is held (the chrome transparent) until the layout that
  // places it has settled — the reader's own window layout known (cold: the
  // derived one is corrected by the reader's first report), the system
  // vertical bar's column in it (outer display), the plugins (the action
  // count) and display preferences (camera avoidance) loaded, and the
  // chrome's geometry and title unchanged for READER_OPENING_CHROME_QUIET_MS
  // (resolveReaderOpeningChromeRelease) — capped at the landing +
  // READER_OPENING_CHROME_SETTLE_CAP_MS. Released before the landing, the
  // fade still starts at it (the glass's own delay); released after, at once.
  // Phases: "held" (transparent, not released) → "waiting" (released, before
  // the landing: still transparent) → "fading" → null (an ordinary chrome).
  const readerZoomLandsAt = useMobileExploreZoomLandsAt();
  const [readerOpeningChromePhase, setReaderOpeningChromePhase] = useState<
    { phase: "held" } | { phase: "waiting" | "fading"; fadeStartsAt: number } | null
  >(() => (readerZoomLandsAt != null ? { phase: "held" } : null));
  const readerOpeningChromeHeld = readerOpeningChromePhase?.phase === "held";
  // Pieces may jump (never glide) only while nothing of the chrome shows.
  const readerOpeningChromeTransparent =
    readerOpeningChromePhase != null && readerOpeningChromePhase.phase !== "fading";
  const readerOpeningSideBarColumnKnown =
    !readerSideBar ||
    (readerSideBarInsets != null && Math.abs(readerSideBarInsets.left - readerSideBarInsets.right) >= 20);
  const readerOpeningLayoutReady =
    readerOwnLayoutKnown &&
    readerOpeningSideBarColumnKnown &&
    !readerPlugins.loading &&
    readerDisplayPrefsReady;
  // What a late correction would move: the pieces' frames and the title's text.
  const readerOpeningSettleKey = [
    readerPose.chrome.kind,
    readerPose.chrome.kind === "capsules"
      ? mobileReaderChromeGeometryKey([
          readerPose.chrome.back,
          readerPose.chrome.title,
          readerPose.chrome.more,
          readerPose.chrome.actions,
          readerPose.chrome.scrubber,
        ])
      : "",
    mangaTitle ?? "",
    chapterTitle ?? "",
  ].join("\n");
  const [readerOpeningSettle, setReaderOpeningSettle] = useState(() => ({
    key: readerOpeningSettleKey,
    changedAt: Date.now(),
  }));
  if (readerOpeningChromeHeld && readerOpeningSettle.key !== readerOpeningSettleKey) {
    setReaderOpeningSettle({ key: readerOpeningSettleKey, changedAt: Date.now() });
  }
  const readerOpeningSettleChangedAt = readerOpeningSettle.changedAt;
  useEffect(() => {
    if (!readerOpeningChromeHeld) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const now = Date.now();
      const decision = resolveReaderOpeningChromeRelease({
        landsAtMs: readerZoomLandsAt,
        nowMs: now,
        layoutReady: readerOpeningLayoutReady,
        lastChangeMs: readerOpeningSettleChangedAt,
      });
      if (decision.release) {
        const fadeStartsAt = readerOpeningChromeFadeStartsAt({ landsAtMs: readerZoomLandsAt, releasedAtMs: now });
        setReaderOpeningChromePhase({ phase: fadeStartsAt > now ? "waiting" : "fading", fadeStartsAt });
        return;
      }
      if (decision.recheckInMs != null) timer = setTimeout(check, Math.max(0, decision.recheckInMs));
    };
    check();
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the landing is read once, with the opening
  }, [readerOpeningChromeHeld, readerOpeningLayoutReady, readerOpeningSettleChangedAt]);
  const readerOpeningFadeStartsAt =
    readerOpeningChromePhase && readerOpeningChromePhase.phase !== "held" ? readerOpeningChromePhase.fadeStartsAt : null;
  useEffect(() => {
    if (readerOpeningChromePhase?.phase !== "waiting") return;
    const timer = setTimeout(
      () => setReaderOpeningChromePhase((current) => (current?.phase === "waiting" ? { ...current, phase: "fading" } : current)),
      Math.max(0, readerOpeningChromePhase.fadeStartsAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [readerOpeningChromePhase]);
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
    const from = previous.visible;
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
      !readerOpeningChromeTransparent &&
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
  const readerPagedPageImageReady = useCallback(
    (galleryPage: MobileReaderPage) => {
      const entry = readerPagedGallery?.byKey.get(galleryPage.id);
      return entry?.source ? readerPageImageReadyForChapter(entry.chapterId, entry.source) : true;
    },
    [readerPageImageReadyForChapter, readerPagedGallery],
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
    (readerPose.chrome.kind === "capsules"
      ? {
          x: readerPose.chrome.actions.x + readerPose.chrome.actions.width - 46,
          y: readerPose.chrome.actions.y,
          width: READER_CAPSULE_ACTION_WIDTH,
          height: READER_CAPSULE_HEIGHT,
        }
      : null);

  // Capsule chrome stays mounted for its dismiss animation (the glass
  // dematerializes with its content) instead of relying on exiting fades.
  // With the vertical bar the settings sheet rises over the whole reader
  // (its own bar replaces the reader's): the chrome fades out under it
  // instead of being cut off by the sheet's edge, and back in after.
  const readerChromeUnderSheet = readerSideBar && useNativeReaderSettings && readerDisplaySettingsOpen;
  // The cover view (outer display) puts the capsule pieces (title, scrubber) away; only the bar's items stay.
  const readerChromePresent =
    showReaderChrome && !endOfChapterPromptVisible && !readerChromeUnderSheet && !readerCoverViewShown;
  const { durationMs: readerChromeBaseMs, slide: readerChromeSlide } = readerChromeMaterialTiming(reduceMotion);
  // The opening's fade (the chrome shown as the reader mounts) is done by the
  // zoom's visible landing + 230 ms when it starts at the landing: the usual
  // 200 ms. A fade the layout held past the landing is shortened to catch up
  // (resolveReaderOpeningChromeMs, never below READER_OPENING_CHROME_MIN_MS),
  // decided when it is released.
  const [readerChromeOpeningMs, setReaderChromeOpeningMs] = useState<number | null>(() =>
    readerChromePresent ? readerChromeBaseMs : null,
  );
  const [readerChromeOpeningTimedFor, setReaderChromeOpeningTimedFor] = useState<number | null>(null);
  if (
    readerChromeOpeningMs != null &&
    readerOpeningFadeStartsAt != null &&
    readerChromeOpeningTimedFor !== readerOpeningFadeStartsAt
  ) {
    setReaderChromeOpeningTimedFor(readerOpeningFadeStartsAt);
    setReaderChromeOpeningMs(
      resolveReaderOpeningChromeMs({ landsAtMs: readerZoomLandsAt, nowMs: readerOpeningFadeStartsAt, durationMs: readerChromeBaseMs }),
    );
  }
  // No zoom (no landing known): an ordinary fade, at once.
  if (readerChromeOpeningMs != null && readerOpeningChromePhase == null && readerChromeOpeningTimedFor == null) {
    setReaderChromeOpeningTimedFor(Date.now());
  }
  useEffect(() => {
    if (readerChromeOpeningMs == null || readerChromeOpeningTimedFor == null) return;
    // Counted from the fade's start (the landing, or the layout's release).
    const startsIn = Math.max(0, readerChromeOpeningTimedFor - Date.now());
    const timer = setTimeout(() => {
      setReaderChromeOpeningMs(null);
      setReaderOpeningChromePhase(null);
    }, startsIn + readerChromeOpeningMs + 40);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timed once per release
  }, [readerChromeOpeningTimedFor]);
  // A chrome that was not shown at the mount has no opening fade: the
  // opening's phase ends once released.
  useEffect(() => {
    if (readerChromeOpeningMs != null || readerOpeningFadeStartsAt == null) return;
    const timer = setTimeout(
      () => setReaderOpeningChromePhase(null),
      Math.max(0, readerOpeningFadeStartsAt - Date.now()) + readerChromeBaseMs + 40,
    );
    return () => clearTimeout(timer);
  }, [readerChromeBaseMs, readerChromeOpeningMs, readerOpeningFadeStartsAt]);
  // Shown = present and, during the opening, released from its hold: until
  // then the glass stays dematerialized and the scrim at 0.
  const readerChromeShown = readerChromePresent && !readerOpeningChromeHeld;
  // The title capsule resizes and cross-fades only on screen; held, waiting
  // for the landing or hidden, a new width is set at once.
  const readerTitleCapsuleVisible = readerChromeShown && !readerOpeningChromeTransparent;
  // The title's labels: this chapter's remembered ones until its own are
  // final (pages in, spot restored), then its own, remembered for a reopen.
  const readerTitleLabelsFinal = mobileReaderTitleLabelsFinal({
    pagesStatus: pagesState.status,
    pageCount,
    restoreComplete: readerProgressRestoreComplete && !readerOpeningCounterHidden,
  });
  const [readerTitleSeed] = useState(() => ({
    key: readerChromeChapterKey,
    labels: peekMobileReaderTitleLabels(readerChromeChapterKey),
  }));
  const readerTitleSeedLabels = readerTitleSeed.key === readerChromeChapterKey ? readerTitleSeed.labels : null;
  const readerTitleSettledRef = useRef<MobileReaderTitleLabels | null>(null);
  useEffect(() => {
    const settled = readerTitleSettledRef.current;
    if (settled) rememberMobileReaderTitleLabels(readerChromeChapterKey, settled);
  });
  // The opening's materialize starts at the zoom's visible landing, not when
  // this render commits: the glass waits for it in its own Core Animation
  // (materializeNotBeforeMs), the scrim with a UI-thread delay.
  const readerChromeNotBeforeMs =
    readerOpeningChromePhase != null && readerChromeOpeningMs != null && readerZoomLandsAt != null ? readerZoomLandsAt : 0;
  // Native glass slides itself with its material (one Core Animation the
  // main thread cannot skip); the rows only slide where it cannot.
  const readerChromeRowSlide = glassMaterializeMotionAvailable ? 0 : readerChromeSlide;
  const readerChromeGlassSlide = glassMaterializeMotionAvailable ? readerChromeSlide : 0;
  const readerChromeMaterialMs = readerChromeOpeningMs ?? readerChromeBaseMs;
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
    const timing = withTiming(readerChromeShown ? 1 : 0, {
      duration: readerChromeMaterialMs,
      easing: Easing.bezier(...READER_CHROME_MATERIAL_CURVE),
      // The scrim fades with the glass, whose duration already answers Reduce
      // Motion: by default Reanimated would skip this one to its end.
      reduceMotion: ReduceMotion.Never,
    });
    const wait = readerChromeShown && readerChromeNotBeforeMs > 0 ? Math.max(0, readerChromeNotBeforeMs - Date.now()) : 0;
    readerChromeFade.value = wait > 0 ? withDelay(wait, timing) : timing;
  }, [readerChromeFade, readerChromeMaterialMs, readerChromeNotBeforeMs, readerChromeShown]);
  const readerChromeFadeStyle = useAnimatedStyle(() => ({ opacity: readerChromeFade.value }));
  const readerChromeTopSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - readerChromeFade.value) * -readerChromeRowSlide }],
  }));
  const readerChromeBottomSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - readerChromeFade.value) * readerChromeRowSlide }],
  }));
  const readerScrubPreviewThumbnails = useReaderScrubPreviewThumbnails({
    pages: displayedPages,
    previewPageIndex: readerScrubPreviewPageIndex,
    spreads: isTwoPageMode ? readerSpreads : null,
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
    // The capsule chrome is always dark: the reader is a black immersive
    // surface, whatever the app theme.
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
    // Keep the glass outside ancestor opacity animations: UIKit drops its
    // effects there. The capsules animate the material itself.
    const chromeLayer = (children: ReactNode) => (
      <Animated.View
        key={mobileReaderChromeArrangementKey(readerChromeArrangement)}
        entering={arrangementMotion ? mobileReaderChromeArrangementEntering(arrangementMotion) : undefined}
        pointerEvents={layerPointerEvents}
        style={styles.readerChromeLayer}
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
        style={styles.readerBackButton}
      >
        <ReaderBackGlyph color={readerChromeColors.primaryText} />
      </NemuPressable>
    );
    // Capsule chrome: one centred two-line label, like Safari's URL capsule.
    const capsuleLabelsAt = (displayIndex: number) =>
      readerCapsuleTitleLabels({
        mangaTitle,
        chapterTitle,
        pageCountLabel: readerPageCountLabelAt(displayIndex),
        pagesPending: readerChromePagesPending,
        fetchingPagesLabel: strings.reader.fetchingPages,
      });
    const capsuleLabels = capsuleLabelsAt(clampedPageIndex);
    // A narrow title capsule (a crowded row) keeps only the position, which
    // is what a glance at the chrome is for.
    const compactCapsuleTitle =
      chrome.kind === "capsules" &&
      chrome.title !== null &&
      mobileReaderTitleCapsuleWidthRange(chrome.title.width, boundsWidth).maxWidth < READER_CAPSULE_TITLE_FULL_MIN_WIDTH &&
      readerTopPageCountLabel !== null &&
      !readerChromePagesPending;
    // A reopen shows the labels this chapter's capsule settled on last time
    // until its own are final (the same spot is restored, so they match):
    // never "Fetching pages" then a swap (mobileReaderTitleMemory).
    const liveTitleLabels: MobileReaderTitleLabels = {
      title: capsuleLabels.title,
      subtitle: capsuleLabels.subtitle,
      compact: compactCapsuleTitle,
      pageCountLabel: readerTopPageCountLabel,
    };
    const { labels: titleLabels, seeded: titleSeeded } = resolveMobileReaderTitleLabels({
      live: liveTitleLabels,
      final: readerTitleLabelsFinal,
      remembered: readerTitleSeedLabels,
    });
    readerTitleSettledRef.current = readerTitleLabelsFinal && chrome.kind === "capsules" ? liveTitleLabels : null;
    const titleContentKey = mobileReaderTitleContentKey(titleLabels);
    const capsuleTitleBlock = titleSeeded ? (
      <View style={styles.readerCapsuleTitleBlock}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={READER_CAPSULE_TITLE_MAX_FONT_SCALE}
          style={[
            styles.readerCapsuleTitle,
            { color: READER_CAPSULE_COLORS.primaryText },
            titleLabels.compact ? { fontVariant: ["tabular-nums"] } : null,
          ]}
        >
          {titleLabels.compact ? titleLabels.pageCountLabel : titleLabels.title}
        </Text>
        {titleLabels.compact ? null : (
          <View style={styles.readerCapsuleSubtitleRow}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={READER_CAPSULE_TITLE_MAX_FONT_SCALE}
              style={[styles.readerCapsuleSubtitle, { color: READER_CAPSULE_COLORS.primaryText }]}
            >
              {titleLabels.subtitle}
            </Text>
          </View>
        )}
      </View>
    ) : compactCapsuleTitle ? (
      <View style={styles.readerCapsuleTitleBlock}>
        <MobileReaderLivePageView
          liveStore={readerChromeLivePageStore}
          committedIndex={clampedPageIndex}
        >
          {(displayIndex) => {
            const pageCountLabel = readerPageCountLabelAt(displayIndex);
            return (
              <Text
                accessibilityLabel={[mangaTitle, chapterTitle, pageCountLabel].filter(Boolean).join(", ")}
                numberOfLines={1}
                maxFontSizeMultiplier={READER_CAPSULE_TITLE_MAX_FONT_SCALE}
                style={[styles.readerCapsuleTitle, { color: READER_CAPSULE_COLORS.primaryText, fontVariant: ["tabular-nums"] }]}
              >
                {pageCountLabel}
              </Text>
            );
          }}
        </MobileReaderLivePageView>
      </View>
    ) : (
      <View style={styles.readerCapsuleTitleBlock}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={READER_CAPSULE_TITLE_MAX_FONT_SCALE}
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
          <MobileReaderLivePageView
            liveStore={readerChromeLivePageStore}
            committedIndex={clampedPageIndex}
          >
            {(displayIndex) => (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={READER_CAPSULE_TITLE_MAX_FONT_SCALE}
                // Both lines in the primary colour, as a system photo viewer's
                // title: size and weight carry the hierarchy.
                style={[styles.readerCapsuleSubtitle, { color: READER_CAPSULE_COLORS.primaryText }]}
              >
                {capsuleLabelsAt(displayIndex).subtitle}
              </Text>
            )}
          </MobileReaderLivePageView>
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
        accessibilityLabel={mobileReaderChapterNeighbourLabel(
          mode === "rtl" ? "next" : "previous",
          leftChapter,
          readerChaptersKnown,
          strings,
        )}
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
          <MobileReaderLiveScrubber
            liveStore={
              galleryPagedMode || isTwoPageMode
                ? undefined
                : readerLivePageStore
            }
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
        accessibilityLabel={mobileReaderChapterNeighbourLabel(
          mode === "rtl" ? "previous" : "next",
          rightChapter,
          readerChaptersKnown,
          strings,
        )}
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
            // No fill while the settings are open: like the other chrome
            // buttons, only the glyph brightens.
            backgroundColor: "transparent",
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
      // the rows slide 6pt and the non-glass bits (scrim) fade on the same
      // clock. Glass is never alpha-faded, so it can't lag behind its content.
      // The top row comes in from above, the bottom row from below.
      const glass = {
        materialized: readerChromeShown,
        animateAppearance: true,
        materializeDurationMs: readerChromeMaterialMs,
        materializeNotBeforeMs: readerChromeNotBeforeMs,
        materializeOffsetY: -readerChromeGlassSlide,
      };
      const glassBottom = { ...glass, materializeOffsetY: readerChromeGlassSlide };
      const actionsCapsule = (
        <ReaderCapsule
          layout={readerCapsuleLayout}
          {...(chrome.actionsRow === "bottom" && !readerSideBar ? glassBottom : glass)}
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
      const piecesPointerEvents = readerChromeShown ? "box-none" : "none";
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
              chaptersKnown: readerChaptersKnown,
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
                colors={readerTopScrimColors}
                locations={READER_TOP_SCRIM_LOCATIONS}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* Under the status column at the top of the vertical bar only:
                the bar's own items are glass, and a scrim down its length
                greyed the page that runs beneath it. */}
            {readerSideBar ? (
              <Animated.View pointerEvents="none" style={[
                {
                  position: "absolute", top: 0, height: READER_RAIL_STATUS_SCRIM_HEIGHT,
                  ...(readerPose.safeInsets.left > readerPose.safeInsets.right ? { left: 0 } : { right: 0 }),
                  width: Math.max(readerPose.safeInsets.left, readerPose.safeInsets.right),
                },
                readerChromeFadeStyle,
              ]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={readerTopScrimColors}
                  locations={READER_TOP_SCRIM_LOCATIONS}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            ) : null}
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
              <Animated.View
                layout={readerCapsuleLayout}
                pointerEvents="box-none"
                style={[mobileReaderAbsoluteRect(titleRect), styles.readerTitleSlot]}
              >
                <ReaderTitleCapsule
                  {...glass}
                  pointerEvents="auto"
                  style={styles.readerTitleCapsule}
                  {...mobileReaderTitleCapsuleWidthRange(titleRect.width, boundsWidth)}
                  contentKey={titleContentKey}
                  visible={readerTitleCapsuleVisible}
                  reduceMotion={reduceMotion === true}
                >
                  {capsuleTitleBlock}
                </ReaderTitleCapsule>
              </Animated.View>
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
                <ReaderCapsule {...glassBottom} interactive={false} style={styles.readerScrubberCapsule}>
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
  // App toasts (sync, errors) go where the reader's own notices do: over the
  // page's pane, below the top chrome, never behind the bottom HUD.
  useReportMobileToastRegion({
    x: readerNoticeRect.x,
    width: readerNoticeRect.width,
    top: insets.top + 76,
  });

  // Web `AuthGateDialog`, mounted on every surface it can stack on (iOS) and
  // presented from the one `promptJapaneseLearningSignIn` chose.
  const renderJapaneseLearningSignInSheet = (host: MobileJapaneseLearningSignInHost) => (
    <JapaneseLearningSignInSheet
      visible={japaneseLearningSignInHost === host}
      strings={strings}
      onClose={closeJapaneseLearningSignIn}
    />
  );

  // The chat at the reader, and the one stacked on the sentence sheet (iOS);
  // only the one `japaneseLearningChatStackedOnSentence` names is shown.
  const renderJapaneseLearningChatDrawer = (stacked: boolean) => (
    <JapaneseLearningNemuChatDrawer
      visible={
        japaneseLearningChatDrawerVisible &&
        japaneseLearningChatStackedOnSentence === stacked
      }
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
      onSeekChatTts={seekJapaneseLearningChatTts}
      stackedSurface={
        Platform.OS === "ios" && japaneseLearningChatStackedOnSentence === stacked
          ? renderJapaneseLearningSignInSheet("chat")
          : null
      }
    />
  );

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
        stackedSurface={
          Platform.OS === "ios" ? (
            <>
              {JAPANESE_LEARNING_CHAT_STACKS_ON_SENTENCE
                ? renderJapaneseLearningChatDrawer(true)
                : null}
              {renderJapaneseLearningSignInSheet("sentence")}
            </>
          ) : null
        }
      />

      {renderJapaneseLearningChatDrawer(false)}

      {renderJapaneseLearningSignInSheet("reader")}

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
      <WindowLayoutObserver style={StyleSheet.absoluteFill} enabled={readerIsFocused} onLayoutChange={onReaderWindowLayoutChange} />
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
              icon={MOBILE_READER_BACK_SYMBOL.name}
              iconRenderingMode="template"
              tintColor={READER_CAPSULE_COLORS.primaryText}
              accessibilityLabel={strings.common.back}
              hidden={readerBarItemsHidden}
              onPress={() => navigateBack()}
            />
            {/* Outer display only: under Back, the cover (a closed book) and
                back to the page (pages), as Apple Books there. */}
            {readerCoverViewAvailable ? (
              <Stack.Toolbar.Button
                icon={readerCoverViewShown
                  ? MOBILE_READER_COVER_VIEW_SYMBOLS.showPages
                  : MOBILE_READER_COVER_VIEW_SYMBOLS.showCover}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={readerCoverViewShown
                  ? strings.reader.coverViewShowPages
                  : strings.reader.coverViewShowCover}
                hidden={readerBarItemsHidden}
                onPress={toggleReaderCoverView}
              />
            ) : null}
          </Stack.Toolbar>
          {/* On the cover only Back and the toggle stay (the actions act on the page). */}
          <Stack.Toolbar placement="right" tintColor={READER_CAPSULE_COLORS.primaryText}>
            {japaneseLearningReaderPlugin ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.detectText ?? "text.viewfinder"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginJapaneseLearningDetectText}
                hidden={readerBarItemsHidden || readerCoverViewShown}
                onPress={openJapaneseLearningDetectionTool}
              />
            ) : null}
            {japaneseLearningReaderPlugin ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.nemuChat ?? "bubble.left.and.text.bubble.right"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginJapaneseLearningNemuChat}
                hidden={readerBarItemsHidden || readerCoverViewShown}
                onPress={openJapaneseLearningChatTool}
              />
            ) : null}
            {enabledReaderPlugins.some((plugin) => plugin.id === "dual-reader") ? (
              <Stack.Toolbar.Button
                icon={readerBarIconImages?.dualRead ?? "square.on.square"}
                iconRenderingMode="template"
                tintColor={READER_CAPSULE_COLORS.primaryText}
                accessibilityLabel={strings.reader.pluginDualReadName}
                hidden={readerBarItemsHidden || readerCoverViewShown}
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
              hidden={readerBarItemsHidden || readerCoverViewShown}
              onPress={openReaderDisplaySettings}
            />
          </Stack.Toolbar>
        </>
      ) : null}
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
        pageNaturalSize={readerPagedGallery ? readerPagedPageNaturalSize : readerPageNaturalSize}
        pageImageReady={readerPagedGallery ? readerPagedPageImageReady : readerPageImageReady}
        stateInsets={readerStateInsets}
        onStageOriginChange={setReaderStageWindowOrigin}
        accessibilityHidden={endOfChapterPromptVisible}
        onAccessibilityRetry={readerVisibleFailures.length > 0 ? retryReaderVisibleFailures : undefined}
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
          galleryPagedMode ? readerBottomPadding : readerScrollBottomInset
        }
        chapter={chapter}
        chromeTopPadding={
          galleryPagedMode ? readerChromeTopPadding : readerScrollTopInset
        }
        completed={completed}
        displayedPages={readerPagedGallery?.pages ?? readerStripGalleryPages ?? displayedPages}
        initialContentOffset={readerGalleryInitialContentOffset}
        scrollMountKey={readerScrollMountKey}
        isTwoPageMode={isTwoPageMode}
        // A chapter scrolled into reads its saved progress in the background:
        // the list it is already in never goes back to a loading state.
        loading={loading && !readerSeamlessArrived}
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
        onUserScrollBegin={beginReaderUserScroll}
        onUserScrollSettle={settleReaderUserScroll}
        onPagedDragEnd={endReaderPagedDrag}
        onScrollingPageLayout={onGalleryScrollingPageLayout}
        onScrollingSeekFailed={onGalleryScrollingSeekFailed}
        onScrollingSeekLanded={onGalleryScrollingSeekLanded}
        onScrollingFlingTarget={onGalleryScrollingFlingTarget}
        scrollPageLayout={readerStripLayout ?? readerScrollLayout}
        onScrollingVisiblePageChange={onGalleryScrollingVisiblePageChange}
        onRetry={() => {
          setPagesRefreshNonce((value) => value + 1);
        }}
        onPageStep={stepReaderPage}
        // Duo outer display, scroll reading: §4b screen tap zones (top quarter
        // back one screen, bottom quarter forward, middle half the toolbar).
        scrollScreenTapZones={outerReaderCanvas && !galleryPagedMode}
        onScrollScreenStep={stepReaderScrollScreen}
        onRequestAdvancePastEnd={onGalleryRequestAdvancePastEnd}
        onRequestRetreatPastStart={onGalleryRequestRetreatPastStart}
        scrollPullHeader={readerStripPullHeader}
        scrollPullEnabled={readerStripPullEnabled}
        onRowsSettled={onGalleryRowsSettled}
        pagedDisplayIndex={
          // Until the opening position is restored the list sits at the
          // restore frame (its initial offset), not at the placeholder page
          // 0: a stage relayout in that window (the Duo outer display
          // settling its vertical bar) re-placed the list on page 1 and the
          // reader then reported 1/53 instead of the requested 8/53.
          // (Scroll mode: as a list row — seamless scroll puts the open
          // chapter after the one before it.)
          (!readerRestoreComplete
            ? readerRestoreFrameIndex
            : isTwoPageMode
              ? currentSpreadIndex
              : clampedPageIndex) + (galleryPagedMode ? readerPagedFrameBase : readerStripBridge.indexBase)
        }
        pagedDisplayCount={
          // Seamless paged reading: the joined chapters' frames.
          readerPagedStrip
            ? readerPagedStrip.frameCount
            : isTwoPageMode
            ? readerSpreads.length
            : galleryPagedMode
              ? pageCount
              : (readerStripGalleryPages?.length ?? pageCount)
        }
        onSegmentedLogicalEndReached={() => {
          if (currentLogicalEndIdentity) {
            setSegmentedLogicalEndReachedIdentity(currentLogicalEndIdentity);
          }
        }}
        onLongStripScrollProgressChange={persistLongStripScrollProgress}
        onOpenSourceSettings={() => {
          if (selectedInstalledSource) sourceSettings.open(selectedInstalledSource);
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
        tapGesturesEnabled={!readerStageTapOwned && !readerCoverViewShown}
        stageGesture={readerTwoFingerDoubleTap}
        pagedMode={galleryPagedMode}
        fitClip={readerFitClip}
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
        readerScrollRef={readerGalleryScrollRef}
        renderImage={readerPagedGallery ? renderReaderPagedImage : readerStrip ? renderReaderStripImage : renderReaderImage}
        renderScrollRow={readerStrip ? renderReaderStripRow : undefined}
        renderImageSegment={renderReaderImageSegment}
        scrollPageGaps={readerStripLayout?.gaps ?? readerScrollPageGaps}
        scrollPageRenderEpoch={readerScrollPageRenderEpoch}
        scrollPageRenderKeys={readerStripRenderKeys ?? readerScrollPageRenderKeys}
        scrollSideMargin={readerScrollSideMargin}
        segmentedImageFrames={segmentedImageFrames}
        sourcePageForDisplayIndex={readerPagedGallery ? readerPagedSourcePageForDisplayIndex : readerGallerySourcePageForDisplayIndex}
        spreads={readerPagedStrip && isTwoPageMode ? (readerPagedStrip.spreads as number[][]) : readerSpreads}
        stateTopPadding={readerStateTopPadding}
        strings={strings}
        title={mangaTitle}
        windowHeight={readerStageHeight}
        spreadSlots={readerSpreadSlots}
        // Capsule pieces own their rects for as long as they are on screen:
        // while they dematerialize they no longer hit-test, so a tap on one
        // would otherwise reach the page-turn bands under it.
        tapExclusions={
          showReaderChrome || readerChromeLingering
            ? readerChromeLingering && readerPose.chrome.kind === "capsules"
              // Reserve the 6pt dismiss path as well as the pose rect:
              // hit-testing reads the stage coordinates, not its native slide.
              ? readerTapExclusions.map((rect) =>
                  readerChromeDismissSweep(rect, { slide: readerChromeSlide, stageHeight: readerStageHeight }))
              : readerTapExclusions
            : undefined
        }
        chromeDismissing={readerChromeLingering && !readerChromePresent}
        onRevealChrome={() => setShowControls(true)}
        foldGap={readerFoldGap}
        bookTapLayout={readerBookTaps}
        pageCurl={readerPageCurlActive}
        onPageTurningChange={setReaderPageTurning}
        pageOverlaysMounted={japaneseLearningDetections.length > 0}
        isWidePage={readerPagedGallery ? readerPagedIsWidePage : readerIsWidePage}
        pageFrameSize={readerPagedGallery ? readerPagedPageFrameSize : getReaderImageFrameSize}
      />
      <DuoPageFlipOverlay
        flip={readerPageFlip.flip}
        paused={!readerPageFlipReady}
        onStart={handleReaderPageFlipStart}
        onFinished={readerPageFlip.finish}
      />
      </Animated.View>

      {readerBookFreeHalf ? (
        // Book posture, scroll reading: the half beside the strip is plain
        // reader black; a tap there shows or hides the toolbar.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showControls ? strings.reader.hideControls : strings.reader.showControls}
          onPress={toggleReaderControls}
          style={[mobileReaderAbsoluteRect(readerBookFreeHalf), { backgroundColor: readerBackgroundColor }]}
        />
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

      <MobileSheetPlacementProvider value={readerSheetPlacement}>
      {japaneseLearningPresentationPlugin ? (
        // Half folded like a laptop, these sheets belong to the bottom pane
        // like the reader's own: never past the hinge.
        <MobileSheetMaxHeightProvider value={readerNotebookSheetCap}>
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
        </MobileSheetMaxHeightProvider>
      ) : null}

      <ReaderDarkThemeScope>
        <ReaderPluginSettingsSheet
          visible={readerPluginSettingsOpen && !endOfChapterPromptVisible}
          pageInteractive={readerBookPosture}
          maxSheetHeight={readerNotebookSheetCap}
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
          onDismissError={dismissReaderPluginSettingsError}
          onDismissLoadError={dismissReaderPluginSettingsLoadError}
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
          isTwoPageMode={readerSettingsTwoPage}
          twoPageSupported={readerPageLayoutVisible}
          showPagePairingControls={showPagePairingControls}
          spreadPairing={readerSpreadPairing}
          pairingShifted={readerPairingShift}
          processPageImages={processPageImages}
          busy={readerSettingsActionBusy}
          saving={saving}
          completed={completed}
          strings={strings}
          onClose={closeReaderDisplaySettings}
          // Plugins pushes inside this sheet / popover (no hand-off to the
          // Plugins sheet): the same React Native plugin pages.
          showReaderPluginSettings={showReaderPluginSettingsEntry}
          readerPlugins={{
            plugins: readerPlugins.data,
            loading: readerPlugins.loading,
            error: readerSettingsError,
            loadError: showReaderPluginSettingsLoadError ? readerPlugins.error : null,
            busy: readerPluginSettingsBusy,
            retryingLoad: retryingReaderPluginSettingsLoad,
            canRetryLoadError: canRetryReaderPluginSettingsLoadError,
            onDismissError: dismissReaderPluginSettingsError,
            onDismissLoadError: dismissReaderPluginSettingsLoadError,
            onRetryLoad: retryReaderPluginSettingsLoad,
            onTogglePlugin: toggleReaderPluginSetting,
            onResetPlugin: resetReaderPluginSettings,
            onChangePluginValue: changeReaderPluginSetting,
          }}
          anchor={readerSettingsAnchorRect}
          // Popover only on a regular-width window; compact (phones, Duo
          // outer display) presents the sheet.
          regularWidth={mobileAdaptiveLayout(readerWindowLayout).regularWidth}
          maxSheetHeight={readerNotebookSheetCap}
          pageInteractive={readerBookPosture}
          availableHeight={
            readerSettingsAnchorRect
              ? readerSettingsPopoverAvailableHeight({
                  anchor: readerSettingsAnchorRect,
                  bounds: readerPose.bounds,
                  safeInsets: readerPose.safeInsets,
                })
              : 0
          }
          keepAwake={readerKeepAwake}
          onToggleKeepAwake={() => {
            void runReaderSettingsAction("keep-awake", () =>
              setReaderKeepAwake(!readerKeepAwake),
            );
          }}
          showOrientationLock={readerOrientationLockAvailable}
          lockPortrait={readerLockPortrait}
          onToggleLockPortrait={() => {
            void runReaderSettingsAction("lock-portrait", () =>
              setReaderLockPortrait(!readerLockPortrait),
            );
          }}
          onSetMode={(nextMode) => {
            if (nextMode === mode || readerSettingsActionBusy) return;
            void runReaderSettingsAction("reading-mode", () => setMode(nextMode));
          }}
          spreadMode={readerSpreadMode}
          onSetSpreadMode={setReaderSpreadModeFromSettings}
          showCameraMode={outerReaderCanvas}
          avoidCamera={readerAvoidCamera}
          onSetAvoidCamera={setReaderAvoidCameraFromSettings}
          fitMode={readerFitSetting}
          windowShape={readerWindowShape}
          onSetFitMode={setReaderFitModeFromSettings}
          onSetSpreadPairing={(value) => {
            if (readerSettingsActionBusy || value === readerSpreadPairing) return;
            void runReaderSettingsAction("page-pairing-mode", () => setReaderSpreadPairing(value));
          }}
          pageBackground={readerPageBackground}
          onSetPageBackground={(value) => {
            if (readerSettingsActionBusy || value === readerPageBackground) return;
            void runReaderSettingsAction("page-background", () => setReaderPageBackground(value));
          }}
          showPageTurn={pageCurlAvailable && galleryPagedMode}
          pageTurn={readerPageTurn}
          onSetPageTurn={(value) => {
            if (readerSettingsActionBusy || value === readerPageTurn) return;
            void runReaderSettingsAction("page-turn", () => setReaderPageTurn(value));
          }}
          onShiftPairing={() => {
            if (readerSettingsActionBusy) return;
            void runReaderSettingsAction("page-pairing-mode", () =>
              toggleReaderPairingShift(readerPairingShiftKey, chapterId, readerPairingNeighbourIds),
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
          isTwoPageMode={readerSettingsTwoPage}
          twoPageSupported={readerPageLayoutVisible}
          showPagePairingControls={showPagePairingControls}
          spreadPairing={readerSpreadPairing}
          pairingShifted={readerPairingShift}
          processPageImages={processPageImages}
          busy={readerSettingsActionBusy}
          saving={saving}
          completed={completed}
          strings={strings}
          onClose={closeReaderDisplaySettings}
          onDismissComplete={handleReaderDisplaySettingsDismissed}
          showReaderPluginSettings={showReaderPluginSettingsEntry}
          onOpenReaderPluginSettings={openReaderPluginSettingsFromDisplaySettings}
          // Confined between the capsule rows or to the chrome pane.
          anchor={readerPose.popover}
          keepAwake={readerKeepAwake}
          onToggleKeepAwake={() => {
            void runReaderSettingsAction("keep-awake", () =>
              setReaderKeepAwake(!readerKeepAwake),
            );
          }}
          showOrientationLock={readerOrientationLockAvailable}
          lockPortrait={readerLockPortrait}
          onToggleLockPortrait={() => {
            void runReaderSettingsAction("lock-portrait", () =>
              setReaderLockPortrait(!readerLockPortrait),
            );
          }}
          onSetMode={(nextMode) => {
            if (nextMode === mode || readerSettingsActionBusy) return;
            void runReaderSettingsAction("reading-mode", () => setMode(nextMode));
          }}
          spreadMode={readerSpreadMode}
          onSetSpreadMode={setReaderSpreadModeFromSettings}
          showCameraMode={outerReaderCanvas}
          avoidCamera={readerAvoidCamera}
          onSetAvoidCamera={setReaderAvoidCameraFromSettings}
          fitMode={readerFitSetting}
          windowShape={readerWindowShape}
          onSetFitMode={setReaderFitModeFromSettings}
          onSetSpreadPairing={(value) => {
            if (readerSettingsActionBusy || value === readerSpreadPairing) return;
            void runReaderSettingsAction("page-pairing-mode", () => setReaderSpreadPairing(value));
          }}
          pageBackground={readerPageBackground}
          onSetPageBackground={(value) => {
            if (readerSettingsActionBusy || value === readerPageBackground) return;
            void runReaderSettingsAction("page-background", () => setReaderPageBackground(value));
          }}
          onShiftPairing={() => {
            if (readerSettingsActionBusy) return;
            void runReaderSettingsAction("page-pairing-mode", () =>
              toggleReaderPairingShift(readerPairingShiftKey, chapterId, readerPairingNeighbourIds),
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
      </MobileSheetPlacementProvider>

      {readerChromeMounted ? renderReaderChrome() : null}
      {readerCoverViewShown && readerCoverViewImage ? (
        <ReaderCoverView
          image={readerCoverViewImage}
          fadeMs={mobileReaderCoverViewFadeMs(reduceMotion)}
          accessibilityLabel={mangaTitle
            ? formatMobileString(strings.reader.coverViewAccessibility, { title: mangaTitle })
            : strings.reader.coverViewAccessibilityUntitled}
          accessibilityHint={readerCoverChromeShown ? strings.reader.hideControls : strings.reader.showControls}
          onToggleChrome={toggleReaderCoverChrome}
        />
      ) : null}
      {/* Web drawer overlay + text popout: over a compact sentence / chat
          sheet the reader and its chrome are dimmed and blurred, and the
          selected bubble floats above everything (kept over a chat opened
          from its sentence, never over one opened from the capsule). Above the chrome layer (zIndex 20); the native sheet itself
          presents above this whole screen. */}
      {/* Not in the book posture: the sheet sits beside the page, which stays
          undimmed and live, and the sheet shows the bubble itself. */}
      {readerBookPosture ? null : (
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
      )}
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
      {sourceSettings.sheet}
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
      {/* Seamless paged reading: the chapter a page turn crossed into. */}
      <ReaderChapterCrossingCapsule
        capsule={readerChapterCrossingCapsule}
        onDone={dismissReaderChapterCrossingCapsule}
        topOffset={insets.top + 76}
        insets={
          readerNoticeFrame
            ? { left: readerNoticeFrame.left + 12, right: readerNoticeFrame.right + 12 }
            : undefined
        }
      />
      <ReaderPairingShiftToast
        toast={readerPairingShiftToast}
        onDone={dismissReaderPairingShiftToast}
        topOffset={insets.top + 76}
        insets={
          readerNoticeFrame
            ? { left: readerNoticeFrame.left + 12, right: readerNoticeFrame.right + 12 }
            : undefined
        }
        strings={strings}
      />
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

/** The title lines grow with Dynamic Type only so far (about 19pt at AX5), so both fit the 48pt capsule. */
const READER_CAPSULE_TITLE_MAX_FONT_SCALE = 1.25;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  readerImageProcessingPlaceholder: {
    position: "relative",
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
  // --- Capsule chrome (regular width, book) --------------------------------
  // Safari on iPhone Duo, measured at 3x: 44pt circles and capsules, icon
  // slots 44pt wide, the title centred on two lines.
  readerCapsuleCircle: {
    width: READER_CAPSULE_HEIGHT,
    height: READER_CAPSULE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  // Back fills its circle, like a native bar's back button.
  readerBackButton: {
    width: READER_CAPSULE_HEIGHT,
    height: READER_CAPSULE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: READER_CAPSULE_HEIGHT / 2,
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
    height: READER_CAPSULE_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  readerTitleSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  readerTitleCapsule: {
    height: READER_CAPSULE_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  readerCapsuleTitleBlock: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  readerCapsuleTitle: {
    maxWidth: "100%",
    fontSize: 15,
    lineHeight: 18,
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
});
