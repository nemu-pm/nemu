import { HugeiconsIcon } from '@hugeicons/react'
import { TextSquareIcon } from '@hugeicons/core-free-icons'
import i18n from '@/lib/i18n'
import type { ReaderPlugin, ReaderPluginContext } from '../../types'
import type { Setting } from '@/lib/settings'
import { useTextDetectorStore, disposeWorker } from './store'
import { DetectionOverlay, ModelLoadingContent, JapaneseLearningGlobalUI } from './components'
import { isJapaneseEnabled, isJapaneseChapter as isJapaneseChapterLang } from './language'
import iconImage from './icon.png'

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
        requiresFeature: 'webgpu',
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
      id: 'run-detection',
      label: t('detectText'),
      icon: <HugeiconsIcon icon={TextSquareIcon} className="size-5" />,
      // Show loading when detecting on any page or model is loading
      useIsLoading: () => {
        const loadingPages = useTextDetectorStore((s) => s.loadingPages)
        const modelLoadingStage = useTextDetectorStore((s) => s.modelLoadingStage)
        return loadingPages.size > 0 || modelLoadingStage !== null
      },
      onClick: async (ctx: ReaderPluginContext) => {
        try {
          const store = useTextDetectorStore.getState()
          const { settings, loadingPages, detections, runDetection } = store

          // Don't run if autoDetect is on
          if (settings.autoDetect) return

          // Get visible pages that haven't been detected yet
          const pagesToDetect = ctx.visiblePageIndices.filter(
            (idx) => !detections.has(idx) && !loadingPages.has(idx)
          )

          if (pagesToDetect.length === 0) {
            return // All visible pages already detected
          }

          // Run detection on all visible pages
          let totalDetected = 0
          for (const pageIndex of pagesToDetect) {
            const imageUrl = ctx.getPageImageUrl(pageIndex)
            if (!imageUrl) {
              console.warn(`[TextDetector] No image URL for page ${pageIndex}`)
              continue
            }

            try {
              const imageData = await loadImageData(imageUrl)
              const cacheKey = {
                registryId: ctx.registryId,
                sourceId: ctx.sourceId,
                mangaId: ctx.mangaId,
                chapterId: ctx.chapterId,
                pageIndex,
              }
              runDetection(pageIndex, imageData, cacheKey, () => {
                const dets = useTextDetectorStore.getState().detections.get(pageIndex)
                totalDetected += dets?.length ?? 0
              })
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err)
              console.error(`[TextDetector] Failed to load image for page ${pageIndex}:`, errMsg)
              alert(`[OCR Debug] Failed to load image: ${errMsg}`)
            }
          }

          // Show toast after all pages are queued
          if (pagesToDetect.length === 1) {
            // Single page - show toast after detection completes (handled in callback)
          } else {
            ctx.showToast(i18n.t('plugin.japaneseLearning.runningDetection', { count: pagesToDetect.length }))
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[TextDetector] onClick error:', errMsg)
          alert(`[OCR Debug] Initialization error: ${errMsg}`)
        }
      },
      // Disable if all visible pages are already detected (or loading)
      isDisabled: (ctx: ReaderPluginContext) => {
        const { detections, loadingPages } = useTextDetectorStore.getState()
        // Disabled if every visible page is either already detected or currently loading
        return ctx.visiblePageIndices.every(
          (idx) => detections.has(idx) || loadingPages.has(idx)
        )
      },
      // Only show when autoDetect is off AND source is Japanese (or enableForAllLanguages)
      isVisible: (ctx: ReaderPluginContext) => {
        const s = useTextDetectorStore.getState().settings
        const visible = !s.autoDetect && isJapaneseSource(ctx)
        return visible
      },
      // Show popover when model is loading (hook for reactivity)
      usePopoverOpen: () => useTextDetectorStore((s) => s.modelLoadingStage) !== null,
      popoverContent: () => <ModelLoadingContent />,
    },
  ],

  // Page overlays - render detection boxes
  pageOverlays: [
    {
      id: 'detection-overlay',
      render: (pageIndex: number, ctx: ReaderPluginContext) => (
        <>
          <DetectionOverlay pageIndex={pageIndex} ctx={ctx} />
          {/* Only render global UI once - on the first visible page */}
          {pageIndex === ctx.visiblePageIndices[0] && <JapaneseLearningGlobalUI />}
        </>
      ),
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
      // Clear detection results and dispose worker on reader close
      const { clearDetections } = useTextDetectorStore.getState()
      clearDetections()
      disposeWorker()
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

/** True only when the current chapter language is Japanese (ignores enableForAllLanguages). */
function isJapaneseChapter(ctx: ReaderPluginContext): boolean {
  return isJapaneseChapterLang(ctx)
}

/**
 * Load cached detections for all visible pages, and optionally run model detection
 */
async function loadCachedForVisiblePages(ctx: ReaderPluginContext) {
  // Hard guard: never load/run detections when plugin isn't enabled for this chapter.
  // (Prevents any accidental calls from starting auto-detect on non-JP sessions.)
  const enabled = isJapaneseSource(ctx)
  if (!enabled) return

  const store = useTextDetectorStore.getState()
  const { settings, detections, loadingPages, runDetection, loadFromCache, checkWebGPU } = store
  const autoDetectAllowed = settings.autoDetect && isJapaneseChapter(ctx)

  for (const pageIndex of ctx.visiblePageIndices) {
    // Skip if already have results or currently loading
    if (detections.has(pageIndex) || loadingPages.has(pageIndex)) continue

    const cacheKey = {
      registryId: ctx.registryId,
      sourceId: ctx.sourceId,
      mangaId: ctx.mangaId,
      chapterId: ctx.chapterId,
      pageIndex,
    }

    // Always try to load from cache first
    const fromCache = await loadFromCache(pageIndex, cacheKey)
    if (fromCache) continue

    // Only auto-run model detection for Japanese chapters.
    // (Even if enableForAllLanguages is true, we don't want background inference on non-JP.)
    if (!autoDetectAllowed) continue

    // Check WebGPU on first use
    await checkWebGPU()

    // Get image URL
    const imageUrl = ctx.getPageImageUrl(pageIndex)
    if (!imageUrl) continue

    try {
      const imageData = await loadImageData(imageUrl)
      runDetection(pageIndex, imageData, cacheKey)
    } catch (err) {
      console.error('[TextDetector] Auto-detection failed:', err)
    }
  }
}

/**
 * Load an image URL and convert to ImageData
 */
async function loadImageData(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx2d = canvas.getContext('2d')!
      ctx2d.drawImage(img, 0, 0)
      const imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height)
      // Clean up
      canvas.width = 0
      canvas.height = 0
      resolve(imageData)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

export default japaneseLearningPlugin
