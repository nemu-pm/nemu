/// <reference lib="webworker" />

/**
 * Web Worker for text detection using ONNX runtime
 * Adapted from komu comic_text_detector_app
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope

const MODEL_PATH =
  import.meta.env.VITE_TEXT_DETECTOR_MODEL_URL ??
  `${import.meta.env.VITE_R2_ASSET_BASE_URL ?? 'https://assets.nemu.pm'}/models/comictextdetector.pt.onnx`
const INPUT_SIZE = 1024

const IS_IOS =
  /iPad|iPhone|iPod/.test(self.navigator?.userAgent || '') ||
  ((self.navigator?.userAgent || '').includes('Mac') && (self.navigator as any)?.maxTouchPoints > 1)

type Backend = 'webgpu' | 'wasm'
type OrtModule = typeof import('onnxruntime-web/wasm')
const ortModuleCache: Partial<Record<Backend, Promise<OrtModule>>> = {}

async function getOrtModule(backend: Backend): Promise<OrtModule> {
  const key: Backend = backend === 'webgpu' ? 'webgpu' : 'wasm'
  if (!ortModuleCache[key]) {
    ortModuleCache[key] =
      key === 'webgpu'
        ? (import('onnxruntime-web/webgpu') as unknown as Promise<OrtModule>)
        : (import('onnxruntime-web/wasm') as unknown as Promise<OrtModule>)
  }
  return ortModuleCache[key]!
}

// ============================================================================
// Types
// ============================================================================

export interface Detection {
  x1: number
  y1: number
  x2: number
  y2: number
  conf: number
  cls: number
  label: 'eng' | 'ja' | 'unknown'
}

export interface DetectRequest {
  type: 'detect'
  requestId: string
  imageData: ImageData
  preferWebGPU: boolean
}

export interface DisposeRequest {
  type: 'dispose'
}

export interface CheckWebGPURequest {
  type: 'check-webgpu'
}

export type WorkerRequest = DetectRequest | DisposeRequest | CheckWebGPURequest

export interface DetectResponse {
  type: 'detect-done'
  requestId: string
  detections: Detection[]
  loadTimeMs: number
  inferenceTimeMs: number
  backend: string
}

export interface ErrorResponse {
  type: 'error'
  requestId?: string
  message: string
}

export interface DisposeResponse {
  type: 'dispose-done'
}

export interface WebGPUResponse {
  type: 'webgpu-result'
  available: boolean
}

export interface ModelLoadingResponse {
  type: 'model-loading'
  requestId: string
  stage: 'downloading' | 'initializing'
}

export type WorkerResponse = DetectResponse | ErrorResponse | DisposeResponse | WebGPUResponse | ModelLoadingResponse

// ============================================================================
// Session Management
// ============================================================================

type SessionKey = string
let keptSession: { key: SessionKey; session: any; ort: OrtModule } | null = null

function makeSessionKey(backend: Backend): SessionKey {
  return `${backend}|${INPUT_SIZE}|${MODEL_PATH}`
}

async function releaseSession() {
  const cur = keptSession
  keptSession = null
  if (!cur) return
  try {
    await cur.session.release()
  } catch {}
}

// ============================================================================
// Detection Logic
// ============================================================================

const CLASS_LABELS: Detection['label'][] = ['eng', 'ja', 'unknown']

function computeIoU(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)
  if (x2 <= x1 || y2 <= y1) return 0
  const intersection = (x2 - x1) * (y2 - y1)
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  const union = areaA + areaB - intersection
  return intersection / union
}

function nms(boxes: Detection[], iouThresh: number): Detection[] {
  if (boxes.length === 0) return []
  boxes.sort((a, b) => b.conf - a.conf)
  const kept: Detection[] = []
  while (boxes.length > 0) {
    const best = boxes.shift()!
    kept.push(best)
    boxes = boxes.filter((box) => computeIoU(best, box) < iouThresh)
  }
  return kept
}

function xywh2xyxy(x: number, y: number, w: number, h: number): [number, number, number, number] {
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2]
}

function processYoloOutput(
  blks: Float32Array,
  shape: number[],
  confThresh: number,
  nmsThresh: number,
  imgW: number,
  imgH: number,
  dw: number,
  dh: number
): Detection[] {
  const numBoxes = shape[1]
  const numClasses = shape[2] - 5

  const detections: Detection[] = []

  const resizeRatioX = imgW / (INPUT_SIZE - dw)
  const resizeRatioY = imgH / (INPUT_SIZE - dh)

  for (let i = 0; i < numBoxes; i++) {
    const offset = i * shape[2]
    const objConf = blks[offset + 4]
    if (objConf < confThresh) continue

    let bestCls = 0
    let bestClsConf = 0
    for (let c = 0; c < numClasses; c++) {
      const clsConf = blks[offset + 5 + c]
      if (clsConf > bestClsConf) {
        bestClsConf = clsConf
        bestCls = c
      }
    }

    const conf = objConf * bestClsConf
    if (conf < confThresh) continue

    const [bx, by, bw, bh] = [blks[offset], blks[offset + 1], blks[offset + 2], blks[offset + 3]]
    const [x1, y1, x2, y2] = xywh2xyxy(bx, by, bw, bh)

    detections.push({
      x1: Math.round(x1 * resizeRatioX),
      y1: Math.round(y1 * resizeRatioY),
      x2: Math.round(x2 * resizeRatioX),
      y2: Math.round(y2 * resizeRatioY),
      conf: Math.round(conf * 1000) / 1000,
      cls: bestCls,
      label: CLASS_LABELS[bestCls] || 'unknown',
    })
  }

  return nms(detections, nmsThresh)
}

// ============================================================================
// Image Preprocessing
// ============================================================================

function letterbox(imageData: ImageData): { tensor: Float32Array; dw: number; dh: number } {
  const { width: srcW, height: srcH } = imageData

  // Scale ratio
  const r = Math.min(INPUT_SIZE / srcH, INPUT_SIZE / srcW)

  // New unpadded dimensions
  const newW = Math.round(srcW * r)
  const newH = Math.round(srcH * r)

  // Padding
  const dw = INPUT_SIZE - newW
  const dh = INPUT_SIZE - newH

  // Create offscreen canvas for resizing
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
  const ctx2d = canvas.getContext('2d')!
  ctx2d.fillStyle = 'black'
  ctx2d.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)

  // Draw source to temp canvas first
  const srcCanvas = new OffscreenCanvas(srcW, srcH)
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  // Draw resized to final canvas (top-left aligned)
  ctx2d.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, newW, newH)

  const finalData = ctx2d.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)

  // Convert to CHW float32 normalized tensor (RGB)
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
  const p = finalData.data

  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const srcIdx = (y * INPUT_SIZE + x) * 4
        const dstIdx = c * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x
        tensor[dstIdx] = p[srcIdx + c] / 255.0
      }
    }
  }

  return { tensor, dw, dh }
}

// ============================================================================
// Inference
// ============================================================================

async function runDetection(
  requestId: string,
  imageData: ImageData,
  preferWebGPU: boolean
): Promise<DetectResponse> {
  let session: any = null
  let ort: OrtModule | null = null
  let inputTensor: any = null
  let results: Record<string, any> = {}

  const confThresh = 0.25
  const nmsThresh = 0.45

  try {
    // Determine backend
    const actualBackend: Backend = IS_IOS ? 'wasm' : preferWebGPU ? 'webgpu' : 'wasm'
    const key = makeSessionKey(actualBackend)

    const loadStart = performance.now()

    // Reuse session if possible
    if (keptSession?.key === key) {
      session = keptSession.session
      ort = keptSession.ort
    } else {
      // Notify that we're downloading/loading the model
      ctx.postMessage({ type: 'model-loading', requestId, stage: 'downloading' } satisfies ModelLoadingResponse)
      
      await releaseSession()
      
      try {
        ort = await getOrtModule(actualBackend)
      } catch (err) {
        throw new Error(`Failed to load ORT module (${actualBackend}): ${err instanceof Error ? err.message : String(err)}`)
      }

      if (IS_IOS) {
        ort.env.wasm.numThreads = 1
        ort.env.wasm.proxy = false
      }

      ctx.postMessage({ type: 'model-loading', requestId, stage: 'initializing' } satisfies ModelLoadingResponse)

      try {
        session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: [actualBackend],
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.warn(`Failed to load with ${actualBackend}, falling back to wasm:`, errMsg)
        if (actualBackend !== 'wasm') {
          try {
            const ortWasm = await getOrtModule('wasm')
            if (IS_IOS) {
              ortWasm.env.wasm.numThreads = 1
              ortWasm.env.wasm.proxy = false
            }
            session = await ortWasm.InferenceSession.create(MODEL_PATH, {
              executionProviders: ['wasm'],
            })
            ort = ortWasm
          } catch (fallbackErr) {
            throw new Error(`Failed to create session: primary=${errMsg}, fallback=${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`)
          }
        } else {
          throw new Error(`Failed to create WASM session: ${errMsg}`)
        }
      }

      keptSession = { key, session, ort }
    }

    const loadTimeMs = performance.now() - loadStart

    // Preprocess
    const { tensor, dw, dh } = letterbox(imageData)

    // Run inference
    const inferStart = performance.now()
    inputTensor = new ort!.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE])
    
    const outputNames = session.outputNames || []
    const blksName = outputNames.includes('blk') ? 'blk' : outputNames[0] || 'output0'
    
    results = (await session.run({ images: inputTensor }, [blksName])) as Record<string, any>
    const inferenceTimeMs = performance.now() - inferStart

    // Get outputs
    const resultKeys = Object.keys(results)
    const blks = results['output0'] || (resultKeys.length > 0 ? results[resultKeys[0]] : null)

    if (!blks) {
      throw new Error('ORT returned no outputs')
    }

    const blksShape = [...blks.dims]

    // Process detections
    const detections = processYoloOutput(
      blks.data as Float32Array,
      blksShape,
      confThresh,
      nmsThresh,
      imageData.width,
      imageData.height,
      dw,
      dh
    )

    // Cleanup
    inputTensor.dispose()
    inputTensor = null

    for (const k of Object.keys(results)) {
      const t = results[k]
      if (t && typeof t.dispose === 'function') t.dispose()
    }
    results = {}

    return {
      type: 'detect-done',
      requestId,
      detections,
      loadTimeMs,
      inferenceTimeMs,
      backend: actualBackend.toUpperCase(),
    }
  } catch (err) {
    // Cleanup on error
    try { inputTensor?.dispose() } catch {}
    try {
      for (const k of Object.keys(results)) {
        results[k]?.dispose?.()
      }
    } catch {}

    throw err
  }
}

async function checkWebGPUAvailable(): Promise<boolean> {
  if (IS_IOS) return false
  if (typeof navigator === 'undefined') return false
  if (!('gpu' in navigator)) return false

  try {
    const adapter = await (navigator as any).gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

// ============================================================================
// Message Handler with Queue (serialize detection requests)
// ============================================================================

type QueuedRequest = { req: DetectRequest; resolve: (r: DetectResponse) => void; reject: (e: Error) => void }
const detectQueue: QueuedRequest[] = []
let isProcessing = false

async function processQueue() {
  if (isProcessing || detectQueue.length === 0) return
  isProcessing = true
  
  while (detectQueue.length > 0) {
    const item = detectQueue.shift()!
    try {
      const result = await runDetection(item.req.requestId, item.req.imageData, item.req.preferWebGPU)
      item.resolve(result)
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
  
  isProcessing = false
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data
  const requestId = type === 'detect' ? (e.data as DetectRequest).requestId : undefined

  try {
    if (type === 'detect') {
      const req = e.data as DetectRequest
      
      // Queue the request and process serially to avoid concurrent session.run() calls
      const result = await new Promise<DetectResponse>((resolve, reject) => {
        detectQueue.push({ req, resolve, reject })
        processQueue()
      })
      
      ctx.postMessage(result)
    } else if (type === 'dispose') {
      await releaseSession()
      ctx.postMessage({ type: 'dispose-done' } satisfies DisposeResponse)
    } else if (type === 'check-webgpu') {
      const available = await checkWebGPUAvailable()
      ctx.postMessage({ type: 'webgpu-result', available } satisfies WebGPUResponse)
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('[TextDetector Worker] Error:', errorMsg, err)
    ctx.postMessage({
      type: 'error',
      requestId,
      message: errorMsg,
    } satisfies ErrorResponse)
  }
}

export {}
