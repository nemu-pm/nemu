import { create } from 'zustand'
import type { TextDetection, TextDetectorSettings, OcrResult, OcrTranscriptLine } from './types'
import type { GrammarToken } from './ichiran-types'
import { DEFAULT_SETTINGS } from './types'
import { createPluginStorage } from '../../types'
import type { WorkerRequest, WorkerResponse, OcrDetectionWithText } from './ocr.worker'
import { getCachedOcrPageV3, setCachedOcrPageV3, type OcrPageCacheKeyV3 } from './ocr-page-cache'
import { tokenize } from './ichiran-service'
import { convertIchiranToGrammarTokens } from './grammar-analysis'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { jlDebugLog } from './debug'

const storage = createPluginStorage('japanese-learning')

// ============================================================================
// Text normalization + proper nouns (Gemini via Convex) → Ichiran
// ============================================================================

interface NormalizeResult {
  normalized: string
  properNouns: string[]
}

let convexHttp: ConvexHttpClient | null = null
function getConvexHttp(): ConvexHttpClient | null {
  const url = (import.meta as any)?.env?.VITE_CONVEX_URL as string | undefined
  if (!url) return null
  if (!convexHttp) convexHttp = new ConvexHttpClient(url)
  return convexHttp
}

const normalizeCache = new Map<string, NormalizeResult>()
let didWarnConvexMissing = false

async function normalizeText(text: string): Promise<NormalizeResult> {
  const clean = (text ?? '').trim()
  if (!clean) return { normalized: clean, properNouns: [] }
  const cached = normalizeCache.get(clean)
  if (cached) return cached

  const client = getConvexHttp()
  if (!client) {
    if (!didWarnConvexMissing) {
      didWarnConvexMissing = true
      console.warn('[JapaneseLearning] normalization disabled: missing VITE_CONVEX_URL')
    }
    return { normalized: clean, properNouns: [] }
  }

  try {
    const fn = api.japanese_learning.normalize
    if (import.meta.env.DEV) console.debug('[JapaneseLearning] normalize → convex', { len: clean.length })
    const res = (await client.action(fn, { text: clean })) as {
      normalized?: string
      proper_nouns?: string[]
    } | null
    const normalized = typeof res?.normalized === 'string' ? res.normalized : clean
    const properNouns = Array.isArray(res?.proper_nouns)
      ? res!.proper_nouns.filter((s) => typeof s === 'string')
      : []
    const result: NormalizeResult = { normalized, properNouns }
    normalizeCache.set(clean, result)
    if (import.meta.env.DEV)
      console.debug('[JapaneseLearning] normalize ← convex', {
        normalizedLen: normalized.length,
        properNounCount: properNouns.length,
      })
    return result
  } catch (err) {
    // Convex / OpenRouter not configured → just fall back to original text.
    console.warn('[JapaneseLearning] normalization prepass failed; using original text', err)
    const fallback: NormalizeResult = { normalized: clean, properNouns: [] }
    normalizeCache.set(clean, fallback)
    return fallback
  }
}

function getInitialSettings(): TextDetectorSettings {
  const raw = (storage.get<Record<string, unknown>>('settings') ?? {}) as Record<string, unknown>
  const nemuResponseMode =
    raw.nemuResponseMode === 'app' || raw.nemuResponseMode === 'jlpt'
      ? raw.nemuResponseMode
      : DEFAULT_SETTINGS.nemuResponseMode
  return {
    autoDetect: typeof raw.autoDetect === 'boolean' ? raw.autoDetect : DEFAULT_SETTINGS.autoDetect,
    enableForAllLanguages:
      typeof raw.enableForAllLanguages === 'boolean'
        ? raw.enableForAllLanguages
        : DEFAULT_SETTINGS.enableForAllLanguages,
    minConfidence: typeof raw.minConfidence === 'number' ? raw.minConfidence : DEFAULT_SETTINGS.minConfidence,
    nemuResponseMode,
  }
}

const initialSettings = getInitialSettings()

// ============================================================================
// Worker Management
// ============================================================================

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function disposeWorker() {
  if (!worker) return
  const w = worker
  worker = null
  try {
    w.postMessage({ type: 'dispose' } satisfies WorkerRequest)
  } catch {
    // ignore
  }
  w.terminate()
}

// ============================================================================
// Store
// ============================================================================

interface GrammarAnalysisState {
  tokens: GrammarToken[]
  loading: boolean
  stage: 'idle' | 'normalizing' | 'tokenizing' | 'done' | 'error'
  normalizedText: string | null
  error: string | null
  requestId: number
}

export interface TranscriptSelection {
  pageKey: string
  line: OcrTranscriptLine
}

export interface BoxSelection {
  pageKey: string
  box: TextDetection
}

export interface BoxPopout {
  pageKey: string
  box: TextDetection
  clickPosition: { x: number; y: number }
  croppedImageUrl: string | null
  croppedDimensions: { width: number; height: number } | null
}

interface TextDetectorState {
  settings: TextDetectorSettings

  detections: Map<string, TextDetection[]>
  transcripts: Map<string, OcrTranscriptLine[]>

  loadingPages: Set<string>
  ocrLoadingPages: Set<string>
  freshlyDetectedPages: Set<string>
  /** Open popover when current OCR batch completes (manual trigger) */
  pendingPopoverOpen: boolean

  transcriptPopoverOpen: boolean
  /** Currently hovered transcript line (for box highlighting) */
  hoveredLine: { pageKey: string; x1: number; y1: number; x2: number; y2: number } | null
  /** Currently playing transcript line (for box highlighting) */
  playingLine: { pageKey: string; x1: number; y1: number; x2: number; y2: number } | null

  ocrSheetOpen: boolean
  ocrResult: OcrResult
  transcriptSelection: TranscriptSelection | null
  boxSelection: BoxSelection | null
  /** Floating cropped-image preview shown when opening the sheet from a box click. */
  boxPopout: BoxPopout | null

  grammarAnalysis: GrammarAnalysisState

  setSettings: (settings: Partial<TextDetectorSettings>) => void
  clearDetections: () => void
  setLoadingPage: (pageKey: string, loading: boolean) => void
  setOcrLoadingPage: (pageKey: string, loading: boolean) => void
  clearFreshlyDetected: (pageKey: string) => void

  toggleTranscriptPopover: (open?: boolean) => void
  setHoveredLine: (line: { pageKey: string; x1: number; y1: number; x2: number; y2: number } | null) => void
  setPlayingLine: (line: { pageKey: string; x1: number; y1: number; x2: number; y2: number } | null) => void

  openOcrSheetFromTranscript: (
    pageKey: string,
    line: OcrTranscriptLine,
    opts?: { preserveBoxPopout?: boolean }
  ) => void
  openOcrSheetFromBox: (pageKey: string, box: TextDetection, clickPosition?: { x: number; y: number }) => void
  closeOcrSheet: () => void
  setBoxPopout: (popout: BoxPopout | null) => void

  loadFromCache: (pageKey: string, cacheKey: OcrPageCacheKeyV3) => Promise<boolean>

  /** Set pendingPopoverOpen before calling runOcr if manual trigger */
  setPendingPopoverOpen: (pending: boolean) => void
  runOcr: (pageKey: string, image: Blob, cacheKey?: OcrPageCacheKeyV3) => void
}

export const useTextDetectorStore = create<TextDetectorState>((set, get) => ({
  // NOTE: grammar analysis is async + cancellable; see startGrammarAnalysis() below.
  settings: initialSettings,
  detections: new Map(),
  transcripts: new Map(),
  loadingPages: new Set(),
  ocrLoadingPages: new Set(),
  freshlyDetectedPages: new Set(),
  pendingPopoverOpen: false,
  transcriptPopoverOpen: false,
  hoveredLine: null,
  playingLine: null,
  ocrSheetOpen: false,
  ocrResult: { text: '', loading: false, error: null },
  transcriptSelection: null,
  boxSelection: null,
  boxPopout: null,
  grammarAnalysis: { tokens: [], loading: false, stage: 'idle', normalizedText: null, error: null, requestId: 0 },

  setSettings: (partial) => {
    const settings = { ...get().settings, ...partial }
    storage.set('settings', settings)
    set({ settings })
  },

  clearDetections: () => {
    // Cancel any in-flight grammar analysis.
    grammarAbortController?.abort()
    grammarAbortController = null

    const prev = get().boxPopout?.croppedImageUrl
    if (prev && typeof window !== 'undefined') URL.revokeObjectURL(prev)
    set({
      detections: new Map(),
      transcripts: new Map(),
      loadingPages: new Set(),
      ocrLoadingPages: new Set(),
      freshlyDetectedPages: new Set(),
      pendingPopoverOpen: false,
      transcriptPopoverOpen: false,
      ocrSheetOpen: false,
      ocrResult: { text: '', loading: false, error: null },
      transcriptSelection: null,
      boxSelection: null,
      boxPopout: null,
      grammarAnalysis: { tokens: [], loading: false, stage: 'idle', normalizedText: null, error: null, requestId: 0 },
    })
  },

  setLoadingPage: (pageKey, loading) => {
    const loadingPages = new Set(get().loadingPages)
    if (loading) loadingPages.add(pageKey)
    else loadingPages.delete(pageKey)
    set({ loadingPages })
  },

  setOcrLoadingPage: (pageKey, loading) => {
    const ocrLoadingPages = new Set(get().ocrLoadingPages)
    if (loading) ocrLoadingPages.add(pageKey)
    else ocrLoadingPages.delete(pageKey)
    set({ ocrLoadingPages })
  },

  clearFreshlyDetected: (pageKey) => {
    const freshlyDetectedPages = new Set(get().freshlyDetectedPages)
    freshlyDetectedPages.delete(pageKey)
    set({ freshlyDetectedPages })
  },

  toggleTranscriptPopover: (open) => {
    const next = open ?? !get().transcriptPopoverOpen
    set({ transcriptPopoverOpen: next, hoveredLine: null })
  },

  setHoveredLine: (line) => set({ hoveredLine: line }),
  setPlayingLine: (line) => set({ playingLine: line }),

  // --------------------------------------------------------------------------
  // Grammar analysis: normalize (Convex) → tokenize (Ichiran) → GrammarTokens
  // --------------------------------------------------------------------------

  openOcrSheetFromTranscript: (pageKey, line, opts) => {
    const preserve = !!opts?.preserveBoxPopout
    if (!preserve) {
      const prev = get().boxPopout?.croppedImageUrl
      if (prev && typeof window !== 'undefined') URL.revokeObjectURL(prev)
    }

    set({
      ocrSheetOpen: true,
      transcriptSelection: { pageKey, line },
      boxSelection: null,
      ...(preserve ? {} : { boxPopout: null }),
      ocrResult: { text: line.text, loading: false, error: null },
      // Clear any previous analysis results immediately; async analysis starts below.
      grammarAnalysis: { tokens: [], loading: false, stage: 'idle', normalizedText: null, error: null, requestId: get().grammarAnalysis.requestId },
    })

    startGrammarAnalysis(line.text)
  },

  openOcrSheetFromBox: (pageKey, box, clickPosition) => {
    const transcript = get().transcripts.get(pageKey) ?? null
    const hit = transcript?.find(
      (l) => l.x1 === box.x1 && l.y1 === box.y1 && l.x2 === box.x2 && l.y2 === box.y2
    )

    set({
      ocrSheetOpen: true,
      transcriptSelection: hit ? { pageKey, line: hit } : null,
      boxSelection: { pageKey, box },
      boxPopout: clickPosition
        ? { pageKey, box, clickPosition, croppedImageUrl: null, croppedDimensions: null }
        : null,
      ocrResult: hit
        ? { text: hit.text, loading: false, error: null }
        : { text: '', loading: true, error: null },
      grammarAnalysis: { tokens: [], loading: false, stage: 'idle', normalizedText: null, error: null, requestId: get().grammarAnalysis.requestId },
    })

    startGrammarAnalysis(hit?.text)
  },

  closeOcrSheet: () => {
    // Cancel any in-flight grammar analysis.
    grammarAbortController?.abort()
    grammarAbortController = null

    const prev = get().boxPopout?.croppedImageUrl
    if (prev && typeof window !== 'undefined') URL.revokeObjectURL(prev)
    set({
      ocrSheetOpen: false,
      ocrResult: { text: '', loading: false, error: null },
      transcriptSelection: null,
      boxSelection: null,
      boxPopout: null,
      grammarAnalysis: { tokens: [], loading: false, stage: 'idle', normalizedText: null, error: null, requestId: get().grammarAnalysis.requestId },
    })
  },

  setBoxPopout: (popout) => {
    const prev = get().boxPopout?.croppedImageUrl
    const next = popout?.croppedImageUrl ?? null
    if (prev && prev !== next && typeof window !== 'undefined') {
      URL.revokeObjectURL(prev)
    }
    set({ boxPopout: popout })
  },

  loadFromCache: async (pageKey, cacheKey) => {
    if (get().detections.has(pageKey) && get().transcripts.has(pageKey)) return true
    const cached = await getCachedOcrPageV3(cacheKey)
    if (!cached || cached.version !== 3) return false
    jlDebugLog('cache hit', { pageKey, chapterId: cacheKey.chapterId, localIndex: cacheKey.localIndex })
    const detections = new Map(get().detections)
    detections.set(pageKey, cached.detections ?? [])
    const transcripts = new Map(get().transcripts)
    transcripts.set(pageKey, cached.transcript ?? [])
    set({ detections, transcripts })
    return true
  },

  setPendingPopoverOpen: (pending) => set({ pendingPopoverOpen: pending }),

  runOcr: (pageKey, image, cacheKey) => {
    if (get().ocrLoadingPages.has(pageKey)) return
    if (get().transcripts.has(pageKey)) return

    get().setOcrLoadingPage(pageKey, true)
    jlDebugLog('ocr start', { pageKey, cacheKey })

    ;(async () => {
      const requestId = `ocr-${pageKey}-${Date.now()}`
      try {
        const w = getWorker()

        const handler = (e: MessageEvent<WorkerResponse>) => {
          if (!('requestId' in e.data) || e.data.requestId !== requestId) return

          // Fast path: show boxes ASAP from /ocr detections event
          if (e.data.type === 'ocr-detections') {
            const dets: TextDetection[] = e.data.detections
              .filter((d) => d.label === 'ja' && d.conf >= get().settings.minConfidence)
              .map((d) => ({
                x1: d.x1,
                y1: d.y1,
                x2: d.x2,
                y2: d.y2,
                confidence: d.conf,
                class: d.cls,
                label: d.label,
              }))

            const detections = new Map(get().detections)
            detections.set(pageKey, dets)
            set({ detections })

            // Trigger flash only when autoDetect is off.
            // (If autoDetect is on, overlay won't clear, so we'd leak entries forever.)
            if (!get().settings.autoDetect) {
              const freshlyDetectedPages = new Set(get().freshlyDetectedPages)
              freshlyDetectedPages.add(pageKey)
              set({ freshlyDetectedPages })
            }
            return
          }

          if (e.data.type === 'ocr-done') {
            w.removeEventListener('message', handler)

            const lines: OcrTranscriptLine[] = e.data.detections
              .filter((d: OcrDetectionWithText) => d.label === 'ja')
              .map((d: OcrDetectionWithText) => ({
                order: d.order,
                x1: d.x1,
                y1: d.y1,
                x2: d.x2,
                y2: d.y2,
                confidence: d.conf,
                class: d.cls,
                label: d.label,
                text: d.text,
              }))
              .filter((d) => d.text && d.text.trim().length > 0)
              .sort((a, b) => a.order - b.order)

            const transcripts = new Map(get().transcripts)
            transcripts.set(pageKey, lines)
            set({ transcripts })
            jlDebugLog('ocr done', { pageKey, lineCount: lines.length })

            // Persist v2 page cache (detections + transcript together).
            if (cacheKey) {
              const dets = get().detections.get(pageKey) ?? []
              setCachedOcrPageV3(cacheKey, { version: 3, detections: dets, transcript: lines }).catch(() => {})
            }

            // If user clicked a box and is waiting, resolve it now.
            const sel = get().boxSelection
            if (sel && sel.pageKey === pageKey) {
              const hit = lines.find(
                (l) =>
                  l.x1 === sel.box.x1 &&
                  l.y1 === sel.box.y1 &&
                  l.x2 === sel.box.x2 &&
                  l.y2 === sel.box.y2
              )

              if (hit) {
                // Reuse transcript flow to populate text + trigger analysis
                get().openOcrSheetFromTranscript(pageKey, hit, { preserveBoxPopout: true })
              } else {
                set({ ocrResult: { text: '', loading: false, error: 'No text detected' } })
              }
            }

            get().setOcrLoadingPage(pageKey, false)

            // Open popover if manual trigger and all pages done
            const state = get()
            if (state.pendingPopoverOpen && state.ocrLoadingPages.size === 0) {
              set({ pendingPopoverOpen: false, transcriptPopoverOpen: true })
            }
            return
          }

          if (e.data.type === 'error') {
            w.removeEventListener('message', handler)
            console.error('[JapaneseLearning] ocr failed:', e.data.message)
            jlDebugLog('ocr error', { pageKey, message: e.data.message })
            get().setOcrLoadingPage(pageKey, false)
            alert(`[OCR] ${e.data.message}`)
          }
        }

        w.addEventListener('message', handler)
        w.postMessage({ type: 'ocr', requestId, image } satisfies WorkerRequest)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[JapaneseLearning] ocr failed:', msg)
        alert(`[OCR] ${msg}`)
      } finally {
        // handled via messages
      }
    })()
  },
}))

// ============================================================================
// Grammar analysis (module-level cancellable state)
// ============================================================================

let grammarAbortController: AbortController | null = null
let grammarRequestSeq = 0

function startGrammarAnalysis(text: string | undefined | null) {
  const clean = (text ?? '').trim()
  if (!clean) return

  // Cancel previous request (best effort). We ignore late arrivals via requestId too.
  grammarAbortController?.abort()
  const controller = new AbortController()
  grammarAbortController = controller

  const store = useTextDetectorStore.getState()
  const requestId = ++grammarRequestSeq

  store.setHoveredLine(null)
  ;(async () => {
    // Stage 1: normalization (Convex)
    useTextDetectorStore.setState({
      grammarAnalysis: {
        tokens: [],
        loading: true,
        stage: 'normalizing',
        normalizedText: null,
        error: null,
        requestId,
      },
    })

    try {
      const { normalized, properNouns } = await normalizeText(clean)

      // Ignore stale results.
      if (useTextDetectorStore.getState().grammarAnalysis.requestId !== requestId) return

      useTextDetectorStore.setState({
        grammarAnalysis: {
          ...useTextDetectorStore.getState().grammarAnalysis,
          stage: 'tokenizing',
          normalizedText: normalized,
          error: null,
        },
      })

      // Stage 2: Ichiran tokenization
      if (controller.signal.aborted) return
      const resp = await tokenize(normalized, 5, controller.signal, properNouns)

      if (useTextDetectorStore.getState().grammarAnalysis.requestId !== requestId) return

      const tokens = convertIchiranToGrammarTokens(resp.tokens)
      useTextDetectorStore.setState({
        grammarAnalysis: {
          tokens,
          loading: false,
          stage: 'done',
          normalizedText: normalized,
          error: null,
          requestId,
        },
      })
    } catch (err) {
      // If aborted, do nothing (a newer request started).
      if (err instanceof Error && err.name === 'AbortError') return
      if (useTextDetectorStore.getState().grammarAnalysis.requestId !== requestId) return
      console.error('[JapaneseLearning] ichiran analysis failed:', err)
      useTextDetectorStore.setState({
        grammarAnalysis: {
          ...useTextDetectorStore.getState().grammarAnalysis,
          loading: false,
          stage: 'error',
          error: 'Analysis failed',
        },
      })
    }
  })()
}
