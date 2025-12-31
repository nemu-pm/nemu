import i18n from '@/lib/i18n'
import type { ReaderPlugin, ReaderPluginContext } from '../../types'
import type { Setting } from '@/lib/settings'
import { useTextDetectorStore, disposeWorker } from './store'
import { DetectionOverlay, JapaneseLearningGlobalUI, OcrNavbarIcon, OcrTranscriptPopoverContent } from './ui'
import { NemuChatNavbarIcon } from './chat/ui'
import { useNemuChatStore, buildHiddenContextFromReader, createChatStreamCallbacks, sendChatGreeting } from './chat'
import { isJapaneseEnabled } from './language'
import iconImage from './icon.png'
import { getOcrPageRef } from './page-ref'
import { jlDebugLog } from './debug'

const t = (key: string) => i18n.t(`plugin.japaneseLearning.${key}`)

/**
 * Japanese Learning Plugin Icon
 */

const JapaneseLearningIcon = (
  <img src={iconImage} alt="" className="size-10 rounded-md object-cover" />
)

/**
 * Settings schema - auto-rendered in app settings
 * Note: We use a getter function to ensure translations are evaluated at render time
 */
const getSettingsSchema = (): Setting[] => [
  {
    type: 'group',
    title: t('detection'),
    items: [
      {
        type: 'switch',
        key: 'autoDetect',
        title: t('autoDetect'),
        subtitle: t('autoDetectSubtitle'),
        default: false,
      },
      {
        type: 'switch',
        key: 'enableForAllLanguages',
        title: t('enableForAllLanguages'),
        subtitle: t('enableForAllLanguagesSubtitle'),
        default: false,
      },
      {
        type: 'slider',
        key: 'minConfidence',
        title: t('minConfidence'),
        subtitle: t('minConfidenceSubtitle'),
        min: 10,
        max: 90,
        step: 5,
        default: 25,
        formatValue: (v) => `${v}%`,
      },
    ],
  },
  {
    type: 'group',
    title: t('chat.settingsTitle'),
    items: [
      {
        type: 'select',
        key: 'nemuResponseMode',
        title: t('chat.responseModeTitle'),
        subtitle: t('chat.responseModeSubtitle'),
        values: ['app', 'jlpt'],
        titles: [
          t('chat.responseModeApp'),
          t('chat.responseModeJlpt'),
        ],
        default: 'app',
      },
    ],
  },
]

/**
 * Japanese Learning Plugin
 */
export const japaneseLearningPlugin: ReaderPlugin = {
  get manifest() {
    return {
      id: 'japanese-learning',
      name: t('name'),
      description: t('description'),
      icon: JapaneseLearningIcon,
      defaultEnabled: true,
      builtin: true,
    }
  },

  get settingsSchema() {
    return getSettingsSchema()
  },

  getSettings: () => {
    const { settings } = useTextDetectorStore.getState()
    // Convert internal format (0-1) to schema format (percentage)
    return {
      ...settings,
      minConfidence: Math.round(settings.minConfidence * 100),
    }
  },

  setSettings: (values: Record<string, unknown>) => {
    const { setSettings } = useTextDetectorStore.getState()
    // Convert schema format (percentage) to internal format (0-1)
    const mapped: Record<string, unknown> = { ...values }
    if (typeof values.minConfidence === 'number') {
      mapped.minConfidence = values.minConfidence / 100
    }
    setSettings(mapped as any)
  },

  // Navbar actions - show "Run Detection" button if autoDetect is off
  navbarActions: [
    {
      id: 'ocr',
      label: t('detectText'),
      icon: <OcrNavbarIcon />,
      // Show loading when detecting on any page or model is loading
      useIsLoading: () => {
        const loadingPages = useTextDetectorStore((s) => s.loadingPages)
        const ocrLoadingPages = useTextDetectorStore((s) => s.ocrLoadingPages)
        return loadingPages.size > 0 || ocrLoadingPages.size > 0
      },
      onClick: async (ctx: ReaderPluginContext) => {
        try {
          const store = useTextDetectorStore.getState()
          const { transcripts, ocrLoadingPages, transcriptPopoverOpen, toggleTranscriptPopover, setPendingPopoverOpen } = store

          // If popover is open, close it
          if (transcriptPopoverOpen) {
            toggleTranscriptPopover(false)
            return
          }

          // Check if all visible pages already have transcripts
          const visibleRefs = ctx.visiblePageIndices
            .map((idx) => getOcrPageRef(ctx, idx))
            .filter(Boolean)
          const allHaveTranscripts = visibleRefs.length > 0 && visibleRefs.every((ref) => transcripts.has(ref!.pageKey))
          if (allHaveTranscripts) {
            toggleTranscriptPopover(true)
            return
          }

          // Start OCR for pages that need it, popover opens when done
          setPendingPopoverOpen(true)

          for (const pageIndex of ctx.visiblePageIndices) {
            const ref = getOcrPageRef(ctx, pageIndex)
            if (!ref) continue
            const imageUrl = ctx.getPageImageUrl(pageIndex)
            if (!imageUrl) continue

            // Skip if already has transcript or currently loading
            if (transcripts.has(ref.pageKey) || ocrLoadingPages.has(ref.pageKey)) continue

              try {
                const imageBlob = await loadImageBlob(imageUrl)
                store.runOcr(ref.pageKey, imageBlob, ref.cacheKey)
              } catch (err) {
              console.error(`[TextDetector] Failed to load image for page ${pageIndex}:`, err)
              }
          }
        } catch (err) {
          console.error('[TextDetector] onClick error:', err)
        }
      },
      // Disable if all visible pages are already detected (or loading)
      isDisabled: (_ctx: ReaderPluginContext) => {
        // Never disable: button is both "open transcript" and "detect if missing".
        // (Popover content will guide what's available.)
        return false
      },
      // Always show for JP-enabled sources (regardless of autoDetect)
      isVisible: (ctx: ReaderPluginContext) => {
        return isJapaneseSource(ctx)
      },
      // Transcript popover (controlled by store)
      usePopoverOpen: () => useTextDetectorStore((s) => s.transcriptPopoverOpen),
      popoverContent: () => <OcrTranscriptPopoverContent />,
      onPopoverClose: () => {
        useTextDetectorStore.getState().toggleTranscriptPopover(false)
      },
    },
    {
      id: 'nemu-chat',
      label: t('chat.title'),
      icon: <NemuChatNavbarIcon />,
      onClick: async (ctx: ReaderPluginContext) => {
        const store = useNemuChatStore.getState()
        const hiddenContext = store.getContextForRequest() ?? buildHiddenContextFromReader(ctx)
        if (hiddenContext) {
          store.open(hiddenContext)
        }

        const { messages, isStreaming } = useNemuChatStore.getState()
        if (!hiddenContext || isStreaming || messages.length > 0) return

        try {
          await sendChatGreeting({
            hiddenContext,
            appLanguage: i18n.language,
            toolContext: store.getToolContextForRequest(),
            callbacks: createChatStreamCallbacks(),
          })
        } catch (err) {
          console.error('[NemuChat] Greeting error:', err)
          const chatState = useNemuChatStore.getState()
          chatState.setShowTypingIndicator(false)
          chatState.setStreaming(false)
        }
      },
      isVisible: (ctx: ReaderPluginContext) => {
        return isJapaneseSource(ctx)
      },
    },
  ],

  // Page overlays - render detection boxes
  pageOverlays: [
    {
      id: 'detection-overlay',
      render: (pageIndex: number, ctx: ReaderPluginContext) => (
        <>
          <DetectionOverlay pageIndex={pageIndex} ctx={ctx} />
        </>
      ),
    },
  ],

  // Reader overlays - mount global UI once per reader session (instead of piggybacking on a page overlay)
  readerOverlays: [
    {
      id: 'japanese-learning-global-ui',
      render: (ctx: ReaderPluginContext) => (isJapaneseSource(ctx) ? <JapaneseLearningGlobalUI /> : null),
    },
  ],

  // No settings sections in reader popover anymore
  settingsSections: [],

  // Lifecycle hooks
  hooks: {
    onMount: (ctx: ReaderPluginContext) => {
      // Skip if not Japanese source
      if (!isJapaneseSource(ctx)) return
      // Load cached detections for all visible pages on mount
      loadCachedForVisiblePages(ctx)
    },

    onPageChange: (_pageIndex: number, ctx: ReaderPluginContext) => {
      // Close transcript popover on page change
      useTextDetectorStore.getState().toggleTranscriptPopover(false)
      // Skip if not Japanese source
      if (!isJapaneseSource(ctx)) return
      // Load cached detections for all visible pages on page change
      loadCachedForVisiblePages(ctx)
    },

    onChapterChange: (_chapterId: string, ctx: ReaderPluginContext) => {
      // If we moved into a non-JP chapter (and not enabled for all languages),
      // ensure we stop any in-flight detection and drop stale results.
      if (!isJapaneseSource(ctx)) {
        const { clearDetections } = useTextDetectorStore.getState()
        clearDetections()
        disposeWorker()
        return
      }

      // JP chapter: load cache / maybe auto-detect for visible pages
      loadCachedForVisiblePages(ctx)
    },

    onUnmount: () => {
      // Clear debounce timer
      if (autoDetectDebounceTimer) {
        clearTimeout(autoDetectDebounceTimer)
        autoDetectDebounceTimer = null
      }
      // Clear detection results and dispose worker on reader close
      const { clearDetections } = useTextDetectorStore.getState()
      clearDetections()
      disposeWorker()
      // Clear chat session when exiting reader
      const { reset } = useNemuChatStore.getState()
      reset()
    },
  },

  setup: () => {
    // No eager WebGPU check here.
    // We only spin up the detector worker when we actually need to run detection
    // (JP chapter + autoDetect/manual detection).
  },

  teardown: () => {
    // Cleanup on plugin disable
    const { clearDetections } = useTextDetectorStore.getState()
    clearDetections()
    disposeWorker()
  },
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if plugin features should be enabled for the given context.
 * Returns true if enableForAllLanguages is true OR current chapter language is Japanese.
 */
export function isJapaneseSource(ctx: ReaderPluginContext): boolean {
  const { settings } = useTextDetectorStore.getState()
  return isJapaneseEnabled(ctx, settings.enableForAllLanguages)
}

// (Unused now) Previously: chapter-only Japanese gate for auto-detect.
// We now gate by isJapaneseSource(ctx) so auto-detect works when enableForAllLanguages is set
// or when chapterLanguage is missing/stale in scrolling windows.

/**
 * Global debounce for auto-detection to avoid spamming the server
 */
let autoDetectDebounceTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoDetectTime = 0
const AUTO_DETECT_DEBOUNCE_MS = 5000

/**
 * Load cached detections for visible pages + prefetch next pages, with debounced auto-detection
 */
async function loadCachedForVisiblePages(ctx: ReaderPluginContext) {
  // Hard guard: never load/run detections when plugin isn't enabled for this chapter.
  // (Prevents any accidental calls from starting auto-detect on non-JP sessions.)
  const enabled = isJapaneseSource(ctx)
  if (!enabled) return

  const store = useTextDetectorStore.getState()
  const { settings, transcripts, ocrLoadingPages, loadingPages, runOcr, loadFromCache } = store
  // Auto-detect should run whenever the plugin is enabled for this context.
  // (This includes enableForAllLanguages + Japanese-only sources; chapterLanguage can be null/stale in scrolling windows.)
  const autoDetectAllowed = settings.autoDetect && isJapaneseSource(ctx)

  // Calculate pages to process: visible pages + prefetch next pages
  // In two-page mode, prefetch 2 pages; in single page mode, prefetch 1 page
  const isTwoPageMode = ctx.visiblePageIndices.length >= 2
  const prefetchCount = isTwoPageMode ? 2 : 1
  if (ctx.visiblePageIndices.length === 0) return
  const maxVisibleIndex = Math.max(...ctx.visiblePageIndices)

  const pagesToProcess = new Set<number>(ctx.visiblePageIndices)
  // Prefetch: walk forward and skip spacers so we actually hit real pages.
  let cursor = maxVisibleIndex + 1
  let added = 0
  while (cursor < ctx.pageCount && added < prefetchCount) {
    const meta = ctx.getPageMeta(cursor)
    if (meta && meta.kind === 'page') {
      pagesToProcess.add(cursor)
      added += 1
    }
    cursor += 1
  }

  // Track pages that need detection (not cached)
  const pagesToDetect: Array<NonNullable<ReturnType<typeof getOcrPageRef>>> = []

  for (const pageIndex of pagesToProcess) {
    const ref = getOcrPageRef(ctx, pageIndex)
    if (!ref) continue

    // Skip if already have transcript or currently loading
    if (transcripts.has(ref.pageKey) || ocrLoadingPages.has(ref.pageKey) || loadingPages.has(ref.pageKey)) continue

    // Always try to load from cache first
    const fromCache = await loadFromCache(ref.pageKey, ref.cacheKey)
    if (fromCache) continue

    // Only auto-run model detection for Japanese chapters.
    if (!autoDetectAllowed) continue

    pagesToDetect.push(ref)
  }

  // If no pages need detection, we're done
  if (pagesToDetect.length === 0) return

  // Debounce: check if we should run detection now or schedule it
  const now = Date.now()
  const timeSinceLastDetect = now - lastAutoDetectTime

  // Clear any pending debounce
  if (autoDetectDebounceTimer) {
    clearTimeout(autoDetectDebounceTimer)
    autoDetectDebounceTimer = null
  }

  const runDetections = async () => {
    lastAutoDetectTime = Date.now()
    jlDebugLog('auto-detect start', { count: pagesToDetect.length, chapterId: ctx.chapterId })

    for (const ref of pagesToDetect) {
      // Re-check in case state changed during debounce
      const currentState = useTextDetectorStore.getState()
      if (currentState.transcripts.has(ref.pageKey) || currentState.ocrLoadingPages.has(ref.pageKey)) continue

      // Guard: page indices can shift (spacers/window changes). Only run if pageIndex still refers to the same stable pageKey.
      const metaNow = ctx.getPageMeta(ref.pageIndex)
      const keyNow =
        metaNow && metaNow.kind === 'page' && metaNow.chapterId && typeof metaNow.localIndex === 'number'
          ? metaNow.key ?? `${metaNow.chapterId}:${metaNow.localIndex}`
          : null
      if (keyNow !== ref.pageKey) {
        jlDebugLog('auto-detect skip: page moved', { pageIndex: ref.pageIndex, expected: ref.pageKey, got: keyNow })
        continue
      }

      const imageUrl = ctx.getPageImageUrl(ref.pageIndex)
      if (!imageUrl) {
        jlDebugLog('auto-detect skip: image not loaded yet', { pageKey: ref.pageKey, pageIndex: ref.pageIndex })
        continue
      }

      try {
        const imageBlob = await loadImageBlob(imageUrl)
        runOcr(ref.pageKey, imageBlob, ref.cacheKey)
      } catch (err) {
        console.error('[TextDetector] Auto-detection failed:', err)
      }
    }
  }

  if (timeSinceLastDetect >= AUTO_DETECT_DEBOUNCE_MS) {
    // Enough time has passed, run immediately
    runDetections()
  } else {
    // Schedule for later
    const delay = AUTO_DETECT_DEBOUNCE_MS - timeSinceLastDetect
    autoDetectDebounceTimer = setTimeout(runDetections, delay)
  }
}

/**
 * Load a page image URL as a Blob (preferred).
 * This matches the "upload image blob to OCR service" flow and avoids re-encoding via canvas.
 */
async function loadImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`)
  return await res.blob()
}

export default japaneseLearningPlugin
