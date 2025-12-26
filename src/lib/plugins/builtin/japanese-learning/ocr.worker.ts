/// <reference lib="webworker" />

/**
 * OCR Worker
 *
 * Clean client-side worker that only:
 * - uploads image blob to OCR service
 * - parses /ocr SSE
 *
 * No local models, no ONNX.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope

export interface Detection {
  x1: number
  y1: number
  x2: number
  y2: number
  conf: number
  cls: number
  label: 'eng' | 'ja' | 'unknown'
}

export interface OcrDetectionWithText extends Detection {
  order: number
  text: string
}

export interface OcrRequest {
  type: 'ocr'
  requestId: string
  image: Blob
}

export interface DisposeRequest {
  type: 'dispose'
}

export type WorkerRequest = OcrRequest | DisposeRequest

export interface OcrDetectionsResponse {
  type: 'ocr-detections'
  requestId: string
  detections: (Detection & { order: number })[]
}

export interface OcrDoneResponse {
  type: 'ocr-done'
  requestId: string
  detections: OcrDetectionWithText[]
}

export interface ErrorResponse {
  type: 'error'
  requestId: string
  message: string
}

export type WorkerResponse = OcrDetectionsResponse | OcrDoneResponse | ErrorResponse

const OCR_API_BASE: string =
  ((import.meta as any).env?.VITE_OCR_API_BASE as string | undefined)?.replace(/\/+$/, '') ||
  'https://ocr.nemu.pm'

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

async function runOcr(requestId: string, image: Blob): Promise<OcrDetectionWithText[]> {
  const base64 = await blobToBase64(image)
  const res = await fetch(`${OCR_API_BASE}/ocr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, requestId }),
  })
  if (!res.ok) throw new Error(`OCR /ocr failed: ${res.status} ${res.statusText}`)
  if (!res.body) throw new Error('OCR /ocr response has no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  type OcrSseEvent =
    | { type: 'detections'; detections: Detection[] }
    | { type: 'ocr'; order: number; text: string }
    | { type: 'result'; detections: OcrDetectionWithText[] }
    | { type: 'error'; message: string }
    | { type: string; [k: string]: unknown }

  let final: OcrDetectionWithText[] | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (!payload) continue
        const ev = JSON.parse(payload) as OcrSseEvent
        if (ev.type === 'error') throw new Error((ev as any).message || 'OCR error')
        if (ev.type === 'detections') {
          // This includes order (pre-filter) and is fast: use it to draw boxes ASAP.
          // We forward it upstream as a dedicated message.
          const dets = ((ev as any).detections ?? []) as (Detection & { order: number })[]
          ctx.postMessage({ type: 'ocr-detections', requestId, detections: dets } satisfies OcrDetectionsResponse)
        }
        if (ev.type === 'result') {
          final = (ev as any).detections ?? []
        }
      }
    }
  }

  if (!final) throw new Error('OCR stream ended without a result event')
  return final
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'dispose') {
      return
    }
    if (msg.type === 'ocr') {
      const detections = await runOcr(msg.requestId, msg.image)
      ctx.postMessage({ type: 'ocr-done', requestId: msg.requestId, detections } satisfies OcrDoneResponse)
      return
    }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    const requestId = msg && msg.type === 'ocr' ? (msg as OcrRequest).requestId : 'unknown'
    ctx.postMessage({ type: 'error', requestId, message } satisfies ErrorResponse)
  }
}

export {}
