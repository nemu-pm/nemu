import { create } from 'zustand'
import type { TextDetection, TextDetectorSettings, GrammarBreakdown, OcrSelection, OcrResult } from './types'
import type { GrammarToken, GrammarData } from './ichiran-types'
import { DEFAULT_SETTINGS } from './types'
import { createPluginStorage } from '../../types'
import type {
  WorkerRequest,
  WorkerResponse,
  Detection,
} from './text-detector.worker'
import { getCachedDetections, setCachedDetections, type DetectionCacheKey } from './detection-cache'

const storage = createPluginStorage('japanese-learning')

const initialSettings = storage.get<TextDetectorSettings>('settings') ?? DEFAULT_SETTINGS

// ============================================================================
// Worker Management
// ============================================================================

let worker: Worker | null = null
let webgpuAvailable: boolean | null = null
let currentDetectionAbortController: AbortController | null = null

function getWorker(): Worker {
  if (!worker) {
    try {
      worker = new Worker(
        new URL('./text-detector.worker.ts', import.meta.url),
        { type: 'module' }
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[TextDetector] Failed to create worker:', errMsg)
      alert(`[OCR Debug] Failed to create worker: ${errMsg}`)
      throw err
    }
  }
  return worker
}

export function disposeWorker() {
  if (worker) {
    const w = worker
    worker = null
    // Best-effort cleanup, then terminate immediately.
    // If a detection is in-flight, aborting result handling is not enough; we
    // must terminate the worker to stop ONNX runtime from continuing to run.
    try {
      w.postMessage({ type: 'dispose' } satisfies WorkerRequest)
    } catch {
      // ignore
    }
    w.terminate()
  }
  currentDetectionAbortController = null
}

async function checkWebGPU(): Promise<boolean> {
  if (webgpuAvailable !== null) return webgpuAvailable

  return new Promise((resolve) => {
    const w = getWorker()
    const handler = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'webgpu-result') {
        w.removeEventListener('message', handler)
        webgpuAvailable = e.data.available
        resolve(e.data.available)
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'check-webgpu' } satisfies WorkerRequest)
  })
}

// ============================================================================
// Store
// ============================================================================

export type ModelLoadingStage = 'downloading' | 'initializing' | null

/** Grammar analysis state from ichiran */
interface GrammarAnalysisState {
  tokens: GrammarToken[]
  grammars: Record<string, GrammarData>
  loading: boolean
  error: string | null
}

interface TextDetectorState {
  // Settings
  settings: TextDetectorSettings

  // Detection results per page (keyed by pageIndex)
  detections: Map<number, TextDetection[]>

  // Currently loading pages
  loadingPages: Set<number>

  // Pages that just completed fresh detection (not from cache) - for flash animation
  freshlyDetectedPages: Set<number>

  // Model loading state
  modelLoadingStage: ModelLoadingStage
  modelLoaded: boolean

  // WebGPU availability (checked once)
  webgpuAvailable: boolean | null

  // Selected block for grammar breakdown
  selectedDetection: TextDetection | null

  // Grammar breakdown result (legacy)
  grammarBreakdown: GrammarBreakdown | null
  grammarLoading: boolean

  // OCR selection state (for click-to-OCR flow)
  ocrSelection: OcrSelection | null
  ocrResult: OcrResult
  ocrSheetOpen: boolean
  
  // Ichiran-based grammar analysis
  grammarAnalysis: GrammarAnalysisState
  
  // Selected token index for details view
  selectedTokenIndex: number | null

  // Actions
  setSettings: (settings: Partial<TextDetectorSettings>) => void
  getSettings: () => TextDetectorSettings
  setDetections: (pageIndex: number, dets: TextDetection[]) => void
  clearDetections: (pageIndex?: number) => void
  setLoadingPage: (pageIndex: number, loading: boolean) => void
  clearFreshlyDetected: (pageIndex: number) => void
  selectDetection: (det: TextDetection | null) => void
  setGrammarBreakdown: (breakdown: GrammarBreakdown | null) => void
  setGrammarLoading: (loading: boolean) => void
  checkWebGPU: () => Promise<boolean>
  setModelLoadingStage: (stage: ModelLoadingStage) => void
  cancelModelLoading: () => void

  // OCR actions
  openOcrSheet: (selection: OcrSelection) => void
  closeOcrSheet: () => void
  setOcrResult: (result: Partial<OcrResult>) => void
  setGrammarAnalysis: (analysis: Partial<GrammarAnalysisState>) => void
  setSelectedTokenIndex: (index: number | null) => void
  setCroppedImage: (url: string | null, dimensions: { width: number; height: number } | null) => void

  // Load cached detections (without running model)
  loadFromCache: (pageIndex: number, cacheKey: DetectionCacheKey) => Promise<boolean>

  // Run detection on an image (with optional caching)
  runDetection: (
    pageIndex: number,
    imageData: ImageData,
    cacheKey?: DetectionCacheKey,
    onComplete?: () => void
  ) => void
}

export const useTextDetectorStore = create<TextDetectorState>((set, get) => ({
  settings: initialSettings,
  detections: new Map(),
  loadingPages: new Set(),
  freshlyDetectedPages: new Set(),
  modelLoadingStage: null,
  modelLoaded: false,
  webgpuAvailable: null,
  selectedDetection: null,
  grammarBreakdown: null,
  grammarLoading: false,
  ocrSelection: null,
  ocrResult: { text: '', loading: false, error: null },
  ocrSheetOpen: false,
  grammarAnalysis: { tokens: [], grammars: {}, loading: false, error: null },
  selectedTokenIndex: null,

  setSettings: (partial) => {
    const settings = { ...get().settings, ...partial }
    storage.set('settings', settings)
    set({ settings })
  },

  getSettings: () => get().settings,

  setDetections: (pageIndex, dets) => {
    const detections = new Map(get().detections)
    detections.set(pageIndex, dets)
    set({ detections })
  },

  clearDetections: (pageIndex) => {
    if (pageIndex === undefined) {
      set({ detections: new Map() })
    } else {
      const detections = new Map(get().detections)
      detections.delete(pageIndex)
      set({ detections })
    }
  },

  setLoadingPage: (pageIndex, loading) => {
    const loadingPages = new Set(get().loadingPages)
    if (loading) {
      loadingPages.add(pageIndex)
    } else {
      loadingPages.delete(pageIndex)
    }
    set({ loadingPages })
  },

  clearFreshlyDetected: (pageIndex) => {
    const freshlyDetectedPages = new Set(get().freshlyDetectedPages)
    freshlyDetectedPages.delete(pageIndex)
    set({ freshlyDetectedPages })
  },

  selectDetection: (det) => {
    set({ selectedDetection: det, grammarBreakdown: null })
  },

  setGrammarBreakdown: (breakdown) => {
    set({ grammarBreakdown: breakdown })
  },

  setGrammarLoading: (loading) => {
    set({ grammarLoading: loading })
  },

  checkWebGPU: async () => {
    const available = await checkWebGPU()
    set({ webgpuAvailable: available })
    return available
  },

  setModelLoadingStage: (stage) => {
    set({ modelLoadingStage: stage, modelLoaded: stage === null && get().modelLoaded ? true : get().modelLoaded })
  },

  cancelModelLoading: () => {
    // Abort current detection and dispose worker
    if (currentDetectionAbortController) {
      currentDetectionAbortController.abort()
      currentDetectionAbortController = null
    }
    disposeWorker()
    set({ 
      modelLoadingStage: null, 
      loadingPages: new Set(),
    })
  },

  openOcrSheet: (selection) => {
    set({
      ocrSelection: selection,
      ocrSheetOpen: true,
      ocrResult: { text: '', loading: true, error: null },
      grammarAnalysis: { tokens: [], grammars: {}, loading: false, error: null },
      selectedTokenIndex: null,
    })
  },

  closeOcrSheet: () => {
    const { ocrSelection } = get()
    // Revoke blob URL if exists
    if (ocrSelection?.croppedImageUrl) {
      URL.revokeObjectURL(ocrSelection.croppedImageUrl)
    }
    set({
      ocrSelection: null,
      ocrSheetOpen: false,
      ocrResult: { text: '', loading: false, error: null },
      grammarAnalysis: { tokens: [], grammars: {}, loading: false, error: null },
      selectedTokenIndex: null,
    })
  },

  setOcrResult: (result) => {
    set({ ocrResult: { ...get().ocrResult, ...result } })
  },

  setGrammarAnalysis: (analysis) => {
    set({ grammarAnalysis: { ...get().grammarAnalysis, ...analysis } })
  },

  setSelectedTokenIndex: (index) => {
    set({ selectedTokenIndex: index })
  },

  setCroppedImage: (url, dimensions) => {
    const { ocrSelection } = get()
    if (!ocrSelection) return
    // Revoke old URL if exists
    if (ocrSelection.croppedImageUrl) {
      URL.revokeObjectURL(ocrSelection.croppedImageUrl)
    }
    set({
      ocrSelection: {
        ...ocrSelection,
        croppedImageUrl: url,
        croppedDimensions: dimensions,
      },
    })
  },

  loadFromCache: async (pageIndex, cacheKey) => {
    const { detections } = get()
    
    // Already have detections
    if (detections.has(pageIndex)) return true
    
    try {
      const cached = await getCachedDetections(cacheKey)
      if (cached) {
        get().setDetections(pageIndex, cached)
        return true
      }
    } catch {
      // Cache error - ignore
    }
    return false
  },

  runDetection: (pageIndex, imageData, cacheKey, onComplete) => {
    const { loadingPages, settings, webgpuAvailable, detections } = get()

    // Already have detections for this page
    if (detections.has(pageIndex)) {
      onComplete?.()
      return
    }

    // Already loading this page
    if (loadingPages.has(pageIndex)) return

    get().setLoadingPage(pageIndex, true)

    const runModelDetection = () => {
      const requestId = `page-${pageIndex}-${Date.now()}`
      const abortController = new AbortController()
      const { signal } = abortController
      currentDetectionAbortController = abortController

      const w = getWorker()

      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (signal.aborted) {
          w.removeEventListener('message', handler)
          return
        }

        if ('requestId' in e.data && e.data.requestId !== requestId) {
          return
        }

        if (e.data.type === 'model-loading') {
          get().setModelLoadingStage(e.data.stage)
        } else if (e.data.type === 'detect-done') {
          w.removeEventListener('message', handler)
          set({ modelLoadingStage: null, modelLoaded: true })

          const { detections: rawDets } = e.data
          const dets: TextDetection[] = rawDets
            .filter((d: Detection) => d.conf >= settings.minConfidence)
            .map((d: Detection) => ({
              x1: d.x1,
              y1: d.y1,
              x2: d.x2,
              y2: d.y2,
              confidence: d.conf,
              class: d.cls,
              label: d.label,
            }))

          get().setDetections(pageIndex, dets)
          get().setLoadingPage(pageIndex, false)

          // Mark as freshly detected (for flash animation)
          const freshlyDetectedPages = new Set(get().freshlyDetectedPages)
          freshlyDetectedPages.add(pageIndex)
          set({ freshlyDetectedPages })

          // Cache results
          if (cacheKey) {
            setCachedDetections(cacheKey, dets).catch(() => {})
          }

          onComplete?.()
        } else if (e.data.type === 'error') {
          w.removeEventListener('message', handler)
          console.error('[TextDetector] Detection error:', e.data.message)
          alert(`[OCR Debug] Detection error: ${e.data.message}`)
          set({ modelLoadingStage: null })
          get().setLoadingPage(pageIndex, false)
          onComplete?.()
        }
      }

      w.addEventListener('message', handler)
      w.addEventListener('error', (e) => {
        console.error('[TextDetector] Worker error:', e)
        alert(`[OCR Debug] Worker error: ${e.message || 'Unknown error'}`)
        set({ modelLoadingStage: null })
        get().setLoadingPage(pageIndex, false)
      })
      w.postMessage({
        type: 'detect',
        requestId,
        imageData,
        preferWebGPU: webgpuAvailable ?? false,
      } satisfies WorkerRequest)
    }

    // Check cache first
    if (cacheKey) {
      getCachedDetections(cacheKey)
        .then((cached) => {
          if (cached) {
            get().setDetections(pageIndex, cached)
            get().setLoadingPage(pageIndex, false)
            onComplete?.()
          } else {
            runModelDetection()
          }
        })
        .catch(() => runModelDetection())
    } else {
      runModelDetection()
    }
  },
}))
