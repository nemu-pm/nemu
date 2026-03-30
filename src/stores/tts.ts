import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { getAuthHeaders } from '@/lib/auth-client'
import { getAuthGateStatus, useAuthGate } from '@/lib/auth-gate'

type TtsSource = 'sentence' | 'transcript' | 'voice'

interface TtsRequestOptions {
  skipTagging?: boolean
  source?: TtsSource
}

interface TtsAlignment {
  characters: string[]
  startTimes: number[]
  endTimes: number[]
  normalizedText?: string
  isFinal?: boolean
  timeBase?: 'absolute' | 'relative'
}

interface TTSState {
  isPlaying: boolean
  isLoading: boolean
  currentAudioId: string | null
  currentTime: number
  duration: number
  audioElement: HTMLAudioElement | null
  audioAnalyser: AnalyserNode | null
  audioCache: Map<string, Blob>
  loadingIds: Set<string>
  alignments: Map<string, TtsAlignment>
  wavePeaks: Map<string, number[]>
  waveDurations: Map<string, number>
  playedIds: Set<string>
  lastEndedId: string | null
  lastEndedAt: number

  play: (id: string, text: string, options?: TtsRequestOptions) => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  prefetch: (id: string, text: string, options?: TtsRequestOptions) => Promise<void>
  ensureAlignment: (id: string, text: string, options?: TtsRequestOptions) => Promise<TtsAlignment | null>
  stop: (options?: { fade?: boolean }) => void
  fadeOut: (durationMs?: number) => void
  seek: (time: number) => void
  setWavePeaks: (id: string, peaks: number[]) => void
  markPlayed: (id: string) => void
}

type SetState = (fn: (state: TTSState) => Partial<TTSState>) => void

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string
const EVENT_STREAM_MIME = 'text/event-stream'
const DEFAULT_AUDIO_MIME = 'audio/mpeg'
const WAV_MIME_TYPE = 'audio/wav'
const PCM_SAMPLE_RATE = 24000
const PCM_CHANNELS = 1
const PCM_BITS_PER_SAMPLE = 16
const PCM_PEAK_INTERVAL_SECONDS = 0.08
const PCM_PEAK_SAMPLES = Math.max(1, Math.round(PCM_SAMPLE_RATE * PCM_PEAK_INTERVAL_SECONDS))
const PCM_PEAK_COMMIT_MS = 160

let audioEl: HTMLAudioElement | null = null
let objectUrl: string | null = null
let abortController: AbortController | null = null
let activeRequestId = 0
let progressRaf: number | null = null
let alignmentInFlightId: string | null = null
let alignmentInFlight: Promise<TtsAlignment | null> | null = null
const alignmentWaiters = new Map<
  string,
  { resolve: (alignment: TtsAlignment | null) => void; timeoutId: number }
>()
let webAudioContext: AudioContext | null = null
let webAudioAnalyser: AnalyserNode | null = null
let webAudioGain: GainNode | null = null
let webAudioStartTime = 0
let webAudioScheduledTime = 0
let webAudioStreamDone = false
let webAudioActiveId: string | null = null
let webAudioTicker: number | null = null
let webAudioBuffer: AudioBuffer | null = null
const webAudioSources = new Set<AudioBufferSourceNode>()
const webAudioPcmChunks: Uint8Array[] = []
type PcmPeakState = { bins: number[]; sampleOffset: number; lastCommit: number }
const pcmPeakState = new Map<string, PcmPeakState>()

function primeWebAudioContext() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  
  if (!webAudioContext || webAudioContext.state === 'closed') {
    try {
      webAudioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
      console.log('[TTS] AudioContext created', { 
        state: webAudioContext.state, 
        sampleRate: webAudioContext.sampleRate,
        isIOS 
      })
    } catch (err) {
      console.error('[TTS] Failed to create AudioContext', err)
      return
    }
  }
  if (webAudioContext.state === 'suspended') {
    console.log('[TTS] Resuming suspended AudioContext')
    webAudioContext.resume().catch((err) => {
      console.warn('[TTS] AudioContext resume failed', err)
    })
  }
}

type PrefetchTask = { id: string; text: string; options?: TtsRequestOptions }
const prefetchQueue: PrefetchTask[] = []
let prefetchActive = false
const prefetchControllers = new Map<string, AbortController>()

function isAbortError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err instanceof Error) return err.name === 'AbortError'
  return (err as { name?: string })?.name === 'AbortError'
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  let cleaned = raw.trim().replace(/\s+/g, '')
  if (!cleaned) return new Uint8Array()
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/')
  const pad = cleaned.length % 4
  if (pad) {
    cleaned += '='.repeat(4 - pad)
  }
  try {
    const binary = atob(cleaned)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return new Uint8Array()
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function toBlobParts(chunks: Uint8Array[]): BlobPart[] {
  return chunks.map((chunk) => toArrayBuffer(chunk))
}

function buildWavHeader(dataLength: number): Uint8Array {
  const bytesPerSample = PCM_BITS_PER_SAMPLE / 8
  const blockAlign = PCM_CHANNELS * bytesPerSample
  const byteRate = PCM_SAMPLE_RATE * blockAlign
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, PCM_CHANNELS, true)
  view.setUint32(24, PCM_SAMPLE_RATE, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)
  return new Uint8Array(buffer)
}

function pcmChunksToWavBlob(chunks: Uint8Array[]): Blob {
  const dataLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const header = buildWavHeader(dataLength)
  return new Blob([toArrayBuffer(header), ...toBlobParts(chunks)], { type: WAV_MIME_TYPE })
}

function decodePcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.length / 2)
  const out = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const lo = bytes[i * 2] ?? 0
    const hi = bytes[i * 2 + 1] ?? 0
    let sample = (hi << 8) | lo
    if (sample & 0x8000) {
      sample = sample - 0x10000
    }
    out[i] = sample / 32768
  }
  return out
}

function getPcmPeakState(id: string): PcmPeakState {
  const existing = pcmPeakState.get(id)
  if (existing) return existing
  const next: PcmPeakState = { bins: [], sampleOffset: 0, lastCommit: 0 }
  pcmPeakState.set(id, next)
  return next
}

function commitPcmWaveData(id: string, bins: number[], sampleOffset: number, setState: SetState) {
  if (bins.length === 0) return
  const peaks = bins.slice()
  const duration = sampleOffset / PCM_SAMPLE_RATE
  setState((state) => {
    const nextPeaks = new Map(state.wavePeaks)
    nextPeaks.set(id, peaks)
    const nextDurations = new Map(state.waveDurations)
    if (Number.isFinite(duration) && duration > 0) {
      nextDurations.set(id, duration)
    }
    return { wavePeaks: nextPeaks, waveDurations: nextDurations }
  })
}

function updatePcmPeaksFromFloat(id: string, floatChunk: Float32Array, setState: SetState) {
  if (!floatChunk.length) return
  const state = getPcmPeakState(id)
  const baseIndex = state.sampleOffset
  for (let i = 0; i < floatChunk.length; i++) {
    const abs = Math.abs(floatChunk[i])
    const binIndex = Math.floor((baseIndex + i) / PCM_PEAK_SAMPLES)
    const current = state.bins[binIndex] ?? 0
    if (abs > current) {
      state.bins[binIndex] = abs
    }
  }
  state.sampleOffset += floatChunk.length
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - state.lastCommit < PCM_PEAK_COMMIT_MS) return
  state.lastCommit = now
  commitPcmWaveData(id, state.bins, state.sampleOffset, setState)
}

function flushPcmPeaks(id: string, setState: SetState) {
  const state = pcmPeakState.get(id)
  if (!state) return
  state.lastCommit = typeof performance !== 'undefined' ? performance.now() : Date.now()
  commitPcmWaveData(id, state.bins, state.sampleOffset, setState)
}

function clearPcmPeakState(id: string | null) {
  if (!id) return
  pcmPeakState.delete(id)
}

function buildAudioBufferFromPcmChunks(
  context: AudioContext,
  chunks: Uint8Array[]
): AudioBuffer | null {
  const totalSamples = chunks.reduce((sum, chunk) => sum + Math.floor(chunk.byteLength / 2), 0)
  if (totalSamples <= 0) return null
  const buffer = context.createBuffer(PCM_CHANNELS, totalSamples, PCM_SAMPLE_RATE)
  const channel = buffer.getChannelData(0)
  let offset = 0
  for (const chunk of chunks) {
    const floatChunk = decodePcm16ToFloat32(chunk)
    channel.set(floatChunk, offset)
    offset += floatChunk.length
  }
  return buffer
}

type AlignmentChunk = {
  characters: string[]
  startTimes: number[]
  endTimes: number[]
}

function pickAlignmentChunk(payload: unknown): AlignmentChunk | null {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as {
    alignment?: {
      characters?: string[] | string
      character_start_times_seconds?: number[]
      character_end_times_seconds?: number[]
    }
    normalized_alignment?: {
      characters?: string[] | string
      character_start_times_seconds?: number[]
      character_end_times_seconds?: number[]
    }
    normalizedAlignment?: {
      characters?: string[] | string
      character_start_times_seconds?: number[]
      character_end_times_seconds?: number[]
    }
  }
  const alignment = data.alignment ?? data.normalized_alignment ?? data.normalizedAlignment
  if (!alignment) return null
  const characters = Array.isArray(alignment.characters)
    ? alignment.characters
    : typeof alignment.characters === 'string'
      ? alignment.characters.split('')
      : []
  const startTimes = Array.isArray(alignment.character_start_times_seconds)
    ? alignment.character_start_times_seconds
    : []
  const endTimes = Array.isArray(alignment.character_end_times_seconds)
    ? alignment.character_end_times_seconds
    : startTimes
  if (!characters.length || !startTimes.length) return null
  return { characters, startTimes, endTimes }
}

function appendAlignmentChunk(target: TtsAlignment, chunk: AlignmentChunk) {
  const count = Math.min(chunk.characters.length, chunk.startTimes.length, chunk.endTimes.length)
  if (count === 0) return
  const lastEnd =
    target.endTimes[target.endTimes.length - 1] ?? target.startTimes[target.startTimes.length - 1] ?? 0
  const firstStart = chunk.startTimes[0] ?? 0
  if (!target.timeBase && target.startTimes.length > 0) {
    const looksRelative = lastEnd > 0.2 && firstStart <= 0.05
    const looksAbsolute = firstStart >= lastEnd - 0.1
    if (looksRelative && !looksAbsolute) {
      target.timeBase = 'relative'
    } else if (looksAbsolute) {
      target.timeBase = 'absolute'
    }
  }
  const offset = target.timeBase === 'relative' ? lastEnd : 0
  let previousEnd = lastEnd
  for (let i = 0; i < count; i++) {
    const rawStart = (chunk.startTimes[i] ?? 0) + offset
    const rawEnd = (chunk.endTimes[i] ?? chunk.startTimes[i] ?? 0) + offset
    const start = target.timeBase === 'relative' ? rawStart : Math.max(rawStart, previousEnd)
    const end = Math.max(rawEnd, start)
    target.characters.push(chunk.characters[i] ?? '')
    target.startTimes.push(start)
    target.endTimes.push(end)
    previousEnd = end
  }
}

async function parseEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (data: string) => void,
  shouldStop?: () => boolean
) {
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const flushEvent = () => {
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    dataLines = []
    onEvent(data)
  }

  while (true) {
    if (shouldStop?.()) {
      await reader.cancel().catch(() => undefined)
      break
    }
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) {
        flushEvent()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
        continue
      }
      if (line.startsWith('{') || line.startsWith('[')) {
        if (dataLines.length) {
          flushEvent()
        }
        onEvent(line)
      }
    }
  }

  buffer += decoder.decode()
  if (buffer) {
    const line = buffer.replace(/\r$/, '')
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    } else if (line.startsWith('{') || line.startsWith('[')) {
      if (dataLines.length) {
        flushEvent()
      }
      onEvent(line)
    }
  }
  flushEvent()
}

function resolveAlignmentWaiter(id: string, alignment: TtsAlignment | null) {
  const waiter = alignmentWaiters.get(id)
  if (!waiter) return
  clearTimeout(waiter.timeoutId)
  alignmentWaiters.delete(id)
  waiter.resolve(alignment)
}

function stopProgressTicker() {
  if (progressRaf !== null) {
    cancelAnimationFrame(progressRaf)
    progressRaf = null
  }
}

function stopWebAudioTicker() {
  if (webAudioTicker !== null) {
    cancelAnimationFrame(webAudioTicker)
    webAudioTicker = null
  }
}

function startProgressTicker(
  audio: HTMLAudioElement,
  playbackId: string,
  getState: () => TTSState,
  setState: (partial: Partial<TTSState> | ((state: TTSState) => Partial<TTSState>)) => void
) {
  stopProgressTicker()
  let lastTime = -1
  let lastTick = 0

  const tick = (now: number) => {
    const state = getState()
    if (state.currentAudioId !== playbackId || audio.paused || audio.ended) {
      stopProgressTicker()
      return
    }

    const time = audio.currentTime
    if (Number.isFinite(time) && time !== lastTime && now - lastTick > 80) {
      lastTime = time
      lastTick = now
      if (state.currentTime !== time) {
        setState({ currentTime: time })
      }
    }

    const duration = audio.duration
    if (Number.isFinite(duration) && duration > 0 && state.duration !== duration) {
      setState((prev) => {
        const nextDurations = new Map(prev.waveDurations)
        nextDurations.set(playbackId, duration)
        return { duration, waveDurations: nextDurations }
      })
    }

    progressRaf = requestAnimationFrame(tick)
  }

  progressRaf = requestAnimationFrame(tick)
}

function cancelAlignmentRequest() {
  if (alignmentInFlightId) {
    resolveAlignmentWaiter(alignmentInFlightId, null)
  }
  alignmentInFlightId = null
  alignmentInFlight = null
}

function cleanupWebAudio(options?: { close?: boolean }) {
  stopWebAudioTicker()
  webAudioSources.forEach((source) => {
    try {
      source.stop()
    } catch {
      // ignore
    }
    source.disconnect()
  })
  webAudioSources.clear()
  webAudioStreamDone = false
  webAudioActiveId = null
  webAudioStartTime = 0
  webAudioScheduledTime = 0
  webAudioPcmChunks.splice(0, webAudioPcmChunks.length)
  webAudioBuffer = null

  if (webAudioGain) {
    webAudioGain.disconnect()
  }
  if (webAudioAnalyser) {
    webAudioAnalyser.disconnect()
  }
  webAudioGain = null
  webAudioAnalyser = null
  if (webAudioContext && webAudioContext.state === 'closed') {
    webAudioContext = null
  }
  if (options?.close && webAudioContext && webAudioContext.state !== 'closed') {
    webAudioContext.close().catch(() => undefined)
    webAudioContext = null
  }
}

function cleanupAudio() {
  stopProgressTicker()
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  cleanupWebAudio()
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl.load()
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  audioEl = null
}

async function requestTtsAudio(text: string, options?: TtsRequestOptions, signal?: AbortSignal): Promise<Response> {
  const authStatus = getAuthGateStatus()
  if (authStatus !== 'authenticated') {
    if (authStatus === 'unauthenticated') {
      useAuthGate.getState().promptSignIn()
    }
    throw new Error('Authentication required')
  }
  console.log('[TTS] Requesting audio', {
    url: `${CONVEX_SITE_URL}/tts`,
    textLength: text.length,
    source: options?.source ?? 'sentence'
  })
  
  let response: Response
  try {
    response = await fetch(`${CONVEX_SITE_URL}/tts`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: EVENT_STREAM_MIME, ...getAuthHeaders() },
      body: JSON.stringify({
        text,
        skipTagging: options?.skipTagging ?? false,
        source: options?.source ?? 'sentence',
      }),
      signal,
    })
  } catch (err) {
    console.error('[TTS] Fetch failed', err)
    throw err
  }
  
  console.log('[TTS] Response received', { 
    status: response.status,
    contentType: response.headers.get('Content-Type'),
    ttsFormat: response.headers.get('X-TTS-Format')
  })
  
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // Defense-in-depth: auth is checked before fetch, but the session token
    // can expire mid-flight, so handle server-side 401 too.
    if (response.status === 401) {
      useAuthGate.getState().promptSignIn()
      throw new Error(detail || 'Authentication required')
    }
    console.error('[TTS] Request failed', { status: response.status, detail })
    throw new Error(detail || `TTS request failed (${response.status})`)
  }
  return response
}

export function createTtsId(prefix: string, text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return `tts:${prefix}:${Math.abs(hash).toString(36)}`
}

export const useTtsStore = create<TTSState>((set, get) => {
  const setLoadingIds = (updater: (prev: Set<string>) => Set<string>) => {
    set((state) => ({ loadingIds: updater(state.loadingIds) }))
  }

  const commitAlignment = (id: string, alignment: TtsAlignment) => {
    set((state) => ({ alignments: new Map(state.alignments).set(id, alignment) }))
    resolveAlignmentWaiter(id, alignment)
    if (alignmentInFlightId === id) {
      alignmentInFlightId = null
      alignmentInFlight = null
    }
  }

  const clearPrefetchQueue = () => {
    const pendingIds = new Set<string>()
    prefetchQueue.splice(0, prefetchQueue.length)
    prefetchControllers.forEach((controller, id) => {
      pendingIds.add(id)
      controller.abort()
    })
    prefetchControllers.clear()
    prefetchActive = false
    if (pendingIds.size > 0) {
      setLoadingIds((prev) => {
        const next = new Set(prev)
        pendingIds.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  const drainPrefetchQueue = async () => {
    if (prefetchActive) return
    const task = prefetchQueue.shift()
    if (!task) return
    if (get().audioCache.has(task.id) || get().loadingIds.has(task.id)) {
      drainPrefetchQueue()
      return
    }

    prefetchActive = true
    setLoadingIds((prev) => new Set(prev).add(task.id))

    const controller = new AbortController()
    prefetchControllers.set(task.id, controller)
    try {
      const response = await requestTtsAudio(task.text, task.options, controller.signal)
      const contentType = response.headers.get('Content-Type') || ''
      const ttsFormat = response.headers.get('X-TTS-Format') || ''
      const isPcm = ttsFormat ? ttsFormat.startsWith('pcm_') : true
      const expectsEventStream =
        contentType.includes(EVENT_STREAM_MIME) ||
        (ttsFormat ? ttsFormat.startsWith('pcm_') : contentType.length === 0)
      if (expectsEventStream) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Missing audio stream')
        const chunks: Uint8Array[] = []
        const alignmentAcc: TtsAlignment = { characters: [], startTimes: [], endTimes: [] }
        await parseEventStream(
          reader,
          (data) => {
            if (!data || data === '[DONE]') return
            let payload: unknown = null
            try {
              payload = JSON.parse(data)
            } catch {
              return
            }
            const audioBase64 = (payload as { audio_base64?: string }).audio_base64
            if (audioBase64) {
              const bytes = decodeBase64ToBytes(audioBase64)
              if (bytes.length) {
                chunks.push(bytes)
                if (isPcm) {
                  const floatChunk = decodePcm16ToFloat32(bytes)
                  updatePcmPeaksFromFloat(task.id, floatChunk, set)
                }
              }
            }
            const alignmentChunk = pickAlignmentChunk(payload)
            if (alignmentChunk) {
              appendAlignmentChunk(alignmentAcc, alignmentChunk)
            }
          },
          () => controller.signal.aborted
        )
        if (controller.signal.aborted) return
        if (isPcm) {
          flushPcmPeaks(task.id, set)
        }
        if (chunks.length) {
          const blob = isPcm
            ? pcmChunksToWavBlob(chunks)
            : new Blob(toBlobParts(chunks), { type: DEFAULT_AUDIO_MIME })
          set((state) => ({ audioCache: new Map(state.audioCache).set(task.id, blob) }))
        }
        if (alignmentAcc.characters.length) {
          commitAlignment(task.id, {
            characters: [...alignmentAcc.characters],
            startTimes: [...alignmentAcc.startTimes],
            endTimes: [...alignmentAcc.endTimes],
            isFinal: true,
          })
        }
      } else {
        const mimeType = contentType.split(';')[0]?.trim() || DEFAULT_AUDIO_MIME
        const buffer = await response.arrayBuffer()
        const blob = new Blob([buffer], { type: mimeType })
        set((state) => ({ audioCache: new Map(state.audioCache).set(task.id, blob) }))
      }
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn('[TTS] Prefetch failed', err)
      }
    } finally {
      prefetchControllers.delete(task.id)
      setLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
      prefetchActive = false
      drainPrefetchQueue()
      if (get().currentAudioId !== task.id) {
        clearPcmPeakState(task.id)
      }
    }
  }

  const attachAudioEvents = (audio: HTMLAudioElement, playbackId: string) => {
  const handleLoaded = () => {
    if (get().currentAudioId !== playbackId) return
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    set((state) => {
      if (!Number.isFinite(duration) || duration <= 0) return { duration }
      const nextDurations = new Map(state.waveDurations)
      nextDurations.set(playbackId, duration)
      return { duration, waveDurations: nextDurations }
    })
  }
    const handleTimeUpdate = () => {
      if (get().currentAudioId !== playbackId) return
      set({ currentTime: audio.currentTime })
    }
    const handlePlay = () => {
      if (get().currentAudioId !== playbackId) return
      set((state) => {
        const nextPlayed = new Set(state.playedIds)
        nextPlayed.add(playbackId)
        return { isPlaying: true, isLoading: false, playedIds: nextPlayed }
      })
      startProgressTicker(audio, playbackId, get, set)
    }
    const handlePause = () => {
      if (get().currentAudioId !== playbackId) return
      set({ isPlaying: false })
      stopProgressTicker()
    }
    const handleEnded = () => {
      if (get().currentAudioId !== playbackId) return
      set({
        isPlaying: false,
        currentAudioId: null,
        currentTime: 0,
        duration: 0,
        audioElement: null,
        audioAnalyser: null,
        lastEndedId: playbackId,
        lastEndedAt: Date.now(),
      })
      stopProgressTicker()
      cleanupAudio()
    }

    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
    }
  }

  const finalizeWebAudioPlayback = (playbackId: string) => {
    if (get().currentAudioId !== playbackId) return
    stopWebAudioTicker()
    cleanupWebAudio()
    clearPcmPeakState(playbackId)
    set({
      isPlaying: false,
      currentAudioId: null,
      currentTime: 0,
      duration: 0,
      audioElement: null,
      audioAnalyser: null,
      lastEndedId: playbackId,
      lastEndedAt: Date.now(),
    })
  }

  const playWebAudioBuffer = async (buffer: AudioBuffer, playbackId: string, offset = 0) => {
    if (!webAudioContext || webAudioContext.state === 'closed') {
      webAudioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
    }
    const context = webAudioContext
    if (!context) throw new Error('Audio context unavailable')

    if (webAudioAnalyser) {
      webAudioAnalyser.disconnect()
    }
    if (webAudioGain) {
      webAudioGain.disconnect()
    }
    webAudioGain = context.createGain()
    webAudioAnalyser = context.createAnalyser()
    webAudioAnalyser.fftSize = 1024
    webAudioAnalyser.smoothingTimeConstant = 0.85
    webAudioAnalyser.connect(webAudioGain)
    webAudioGain.connect(context.destination)

    webAudioActiveId = playbackId
    webAudioStreamDone = true
    webAudioBuffer = buffer
    webAudioSources.clear()

    await context.resume().catch(() => undefined)
    const now = context.currentTime
    const clamped = Math.max(0, Math.min(offset, buffer.duration))
    webAudioStartTime = now - clamped
    webAudioScheduledTime = now + Math.max(0, buffer.duration - clamped)

    set((state) => {
      const nextDurations = new Map(state.waveDurations)
      if (Number.isFinite(buffer.duration) && buffer.duration > 0) {
        nextDurations.set(playbackId, buffer.duration)
      }
      return {
        audioElement: null,
        audioAnalyser: webAudioAnalyser,
        currentTime: clamped,
        duration: buffer.duration,
        isPlaying: true,
        isLoading: false,
        waveDurations: nextDurations,
      }
    })
    startWebAudioTicker(playbackId)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(webAudioAnalyser)
    source.start(0, clamped)
    webAudioSources.add(source)
    source.onended = () => {
      webAudioSources.delete(source)
      if (webAudioStreamDone && webAudioSources.size === 0) {
        finalizeWebAudioPlayback(playbackId)
      }
    }
  }

  const playWebAudioFromBlob = async (blob: Blob, playbackId: string) => {
    const buffer = await blob.arrayBuffer()
    if (!webAudioContext || webAudioContext.state === 'closed') {
      webAudioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
    }
    const context = webAudioContext
    if (!context) throw new Error('Audio context unavailable')
    const decoded = await context.decodeAudioData(buffer.slice(0))
    await playWebAudioBuffer(decoded, playbackId, 0)
  }

  const startWebAudioTicker = (playbackId: string) => {
    stopWebAudioTicker()
    let lastTime = -1
    let lastTick = 0

    const tick = (now: number) => {
      if (get().currentAudioId !== playbackId || webAudioActiveId !== playbackId) {
        stopWebAudioTicker()
        return
      }
      if (!webAudioContext || webAudioContext.state !== 'running') {
        webAudioTicker = requestAnimationFrame(tick)
        return
      }
      const time = Math.max(0, webAudioContext.currentTime - webAudioStartTime)
      if (Number.isFinite(time) && time !== lastTime && now - lastTick > 80) {
        lastTime = time
        lastTick = now
        if (get().currentTime !== time) {
          set({ currentTime: time })
        }
      }

      const nextDuration = Math.max(0, webAudioScheduledTime - webAudioStartTime)
      if (nextDuration > 0 && get().duration !== nextDuration) {
        set((state) => {
          const nextDurations = new Map(state.waveDurations)
          nextDurations.set(playbackId, nextDuration)
          return { duration: nextDuration, waveDurations: nextDurations }
        })
      }

      if (webAudioStreamDone && webAudioSources.size === 0) {
        finalizeWebAudioPlayback(playbackId)
        return
      }

      webAudioTicker = requestAnimationFrame(tick)
    }

    webAudioTicker = requestAnimationFrame(tick)
  }

  const playBlob = async (blob: Blob, id: string) => {
    const audio = new Audio()
    const url = URL.createObjectURL(blob)
    objectUrl = url
    audio.src = url
    audio.preload = 'auto'
    audioEl = audio
    set({ audioElement: audio, audioAnalyser: null })

    attachAudioEvents(audio, id)
    try {
      await audio.play()
    } catch (err) {
      console.warn('[TTS] Playback failed', err)
    }
  }

  const playEventStream = async (response: Response, id: string, requestId: number) => {
    console.log('[TTS] playEventStream starting', { id, hasBody: !!response.body })
    
    let reader: ReadableStreamDefaultReader<Uint8Array>
    try {
      const body = response.body
      if (!body) throw new Error('Response body is null')
      reader = body.getReader()
    } catch (err) {
      console.error('[TTS] Failed to get stream reader', { 
        error: err instanceof Error ? err.message : String(err)
      })
      throw new Error('Missing audio stream')
    }

    const ttsFormat = response.headers.get('X-TTS-Format') || ''
    const isPcm = ttsFormat ? ttsFormat.startsWith('pcm_') : true
    const debugTts =
      typeof window !== 'undefined' && Boolean((window as { __TTS_DEBUG__?: boolean }).__TTS_DEBUG__)

    console.log('[TTS] Format detection', { isPcm, ttsFormat })
    
    // Only PCM via Web Audio API is supported (works on all browsers including iOS Safari)
    if (!isPcm) {
      console.error('[TTS] Non-PCM format not supported', { ttsFormat })
      throw new Error('Only PCM audio format is supported')
    }
    
    const alignmentAcc: TtsAlignment = { characters: [], startTimes: [], endTimes: [] }
    let lastAlignmentCommit = 0

    const commitAlignmentIfReady = (force = false) => {
      if (alignmentAcc.characters.length === 0) return
      const now = performance.now()
      if (!force && now - lastAlignmentCommit < 240) return
      lastAlignmentCommit = now
      commitAlignment(id, {
        characters: [...alignmentAcc.characters],
        startTimes: [...alignmentAcc.startTimes],
        endTimes: [...alignmentAcc.endTimes],
        isFinal: force,
      })
    }

    let loggedChunk = false
    let loggedPayload = false
    let chunkCount = 0
    let totalBytes = 0
    
    console.log('[TTS] Starting PCM stream playback', { id, ttsFormat })
    
    if (!webAudioContext || webAudioContext.state === 'closed') {
      try {
        webAudioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
        console.log('[TTS] Created new AudioContext for stream', { 
          state: webAudioContext.state, 
          sampleRate: webAudioContext.sampleRate 
        })
      } catch (err) {
        console.error('[TTS] Failed to create AudioContext', err)
        throw new Error('Audio context unavailable')
      }
    }
    const context = webAudioContext
    if (!context) throw new Error('Audio context unavailable')
    
    console.log('[TTS] AudioContext state before stream', { state: context.state })
    
    // Listen for iOS Safari suspending the context
    context.addEventListener('statechange', () => {
      console.log('[TTS] AudioContext state changed', { 
        state: context.state,
        currentTime: context.currentTime 
      })
    })
    if (webAudioAnalyser) {
      webAudioAnalyser.disconnect()
    }
    if (webAudioGain) {
      webAudioGain.disconnect()
    }
    webAudioGain = context.createGain()
    webAudioAnalyser = context.createAnalyser()
    webAudioAnalyser.fftSize = 1024
    webAudioAnalyser.smoothingTimeConstant = 0.85
    webAudioAnalyser.connect(webAudioGain)
    webAudioGain.connect(context.destination)

    webAudioActiveId = id
    webAudioStreamDone = false
    webAudioStartTime = 0
    webAudioScheduledTime = 0
    webAudioBuffer = null
    webAudioPcmChunks.splice(0, webAudioPcmChunks.length)
    webAudioSources.clear()

    set({ audioElement: null, audioAnalyser: webAudioAnalyser })
    
    try {
      await context.resume()
      console.log('[TTS] AudioContext resumed', { state: context.state })
    } catch (resumeErr) {
      console.error('[TTS] AudioContext resume failed', { 
        error: resumeErr instanceof Error ? resumeErr.message : String(resumeErr),
        state: context.state 
      })
      // On iOS Safari, if resume fails it's usually because there was no user gesture
      throw new Error('AudioContext resume failed - user gesture required on iOS')
    }

    const scheduleChunk = (bytes: Uint8Array) => {
      const floatChunk = decodePcm16ToFloat32(bytes)
      if (!floatChunk.length) return
      updatePcmPeaksFromFloat(id, floatChunk, set)
      if (debugTts && !loggedChunk) {
        loggedChunk = true
        console.debug('[TTS] PCM chunk', {
          bytes: bytes.length,
          contextState: context.state,
          contextRate: context.sampleRate,
          format: ttsFormat,
        })
      }
      const buffer = context.createBuffer(PCM_CHANNELS, floatChunk.length, PCM_SAMPLE_RATE)
      buffer.getChannelData(0).set(floatChunk)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(webAudioAnalyser!)

      if (webAudioScheduledTime <= 0) {
        webAudioScheduledTime = Math.max(context.currentTime + 0.05, context.currentTime)
        webAudioStartTime = webAudioScheduledTime
        set((state) => {
          const nextPlayed = new Set(state.playedIds)
          nextPlayed.add(id)
          return { isPlaying: true, isLoading: false, playedIds: nextPlayed }
        })
        startWebAudioTicker(id)
      } else {
        const minLead = 0.02
        const desiredStart = Math.max(webAudioScheduledTime, context.currentTime + minLead)
        if (desiredStart > webAudioScheduledTime) {
          const audioTime = Math.max(0, webAudioScheduledTime - webAudioStartTime)
          webAudioScheduledTime = desiredStart
          webAudioStartTime = webAudioScheduledTime - audioTime
        }
      }

      source.start(webAudioScheduledTime)
      webAudioScheduledTime += buffer.duration
      const nextDuration = Math.max(0, webAudioScheduledTime - webAudioStartTime)
      if (nextDuration > 0 && get().duration !== nextDuration) {
        set({ duration: nextDuration })
      }

      webAudioSources.add(source)
      source.onended = () => {
        webAudioSources.delete(source)
        if (webAudioStreamDone && webAudioSources.size === 0) {
          finalizeWebAudioPlayback(id)
        }
      }
    }

    try {
      await parseEventStream(
        reader,
        (data) => {
          if (requestId !== activeRequestId) return
          if (!data || data === '[DONE]') return
          let payload: unknown = null
          try {
            payload = JSON.parse(data)
          } catch {
            return
          }
          if (debugTts && !loggedPayload) {
            loggedPayload = true
            console.debug('[TTS] First SSE payload keys', Object.keys(payload as Record<string, unknown>))
          }
          const audioBase64 = (payload as { audio_base64?: string }).audio_base64
          if (audioBase64) {
            const bytes = decodeBase64ToBytes(audioBase64)
            if (bytes.length) {
              chunkCount++
              totalBytes += bytes.length
              webAudioPcmChunks.push(bytes)
              scheduleChunk(bytes)
              if (chunkCount === 1) {
                console.log('[TTS] First PCM chunk received', { bytes: bytes.length })
              }
            } else if (!loggedChunk) {
              loggedChunk = true
              console.warn('[TTS] PCM chunk empty after decode', { format: ttsFormat, base64Len: audioBase64.length })
            }
          }
          const alignmentChunk = pickAlignmentChunk(payload)
          if (alignmentChunk) {
            appendAlignmentChunk(alignmentAcc, alignmentChunk)
            commitAlignmentIfReady()
          }
        },
        () => requestId !== activeRequestId
      )
    } catch (streamErr) {
      console.error('[TTS] Stream parsing error', { 
        error: streamErr instanceof Error ? streamErr.message : String(streamErr),
        chunksSoFar: chunkCount,
        bytesSoFar: totalBytes
      })
      // On iOS Safari, streams can disconnect - try to play what we have
      if (webAudioPcmChunks.length > 0) {
        console.log('[TTS] Attempting to play partial audio', { chunks: webAudioPcmChunks.length })
      }
    }

    if (requestId !== activeRequestId) {
      return
    }

    webAudioStreamDone = true
    commitAlignmentIfReady(true)
    flushPcmPeaks(id, set)
    
    console.log('[TTS] Stream complete', { 
      chunkCount, 
      totalBytes, 
      contextState: context.state,
      sourcesActive: webAudioSources.size
    })

    if (webAudioPcmChunks.length > 0) {
      const blob = pcmChunksToWavBlob(webAudioPcmChunks)
      set((state) => ({ audioCache: new Map(state.audioCache).set(id, blob) }))
      webAudioBuffer = buildAudioBufferFromPcmChunks(context, webAudioPcmChunks)
      console.log('[TTS] Audio cached', { blobSize: blob.size })
    } else {
      console.warn('[TTS] No PCM chunks received', { format: ttsFormat })
    }

    if (webAudioSources.size === 0) {
      finalizeWebAudioPlayback(id)
    }
  }

  const playStream = async (response: Response, id: string, requestId: number) => {
    const contentType = response.headers.get('Content-Type') || ''
    const ttsFormat = response.headers.get('X-TTS-Format') || ''
    console.log('[TTS] playStream starting', { contentType, ttsFormat })
    
    // PCM event stream - use Web Audio API
    const expectsEventStream =
      contentType.includes(EVENT_STREAM_MIME) ||
      (ttsFormat ? ttsFormat.startsWith('pcm_') : contentType.length === 0)
    if (expectsEventStream) {
      try {
        await playEventStream(response, id, requestId)
      } catch (err) {
        const errInfo = err instanceof Error 
          ? { name: err.name, message: err.message }
          : String(err)
        console.error('[TTS] playEventStream failed', errInfo)
        throw err
      }
      return
    }
    
    // Non-streaming response - just play as blob (works on all browsers including iOS Safari)
    const mimeType = contentType.split(';')[0]?.trim() || DEFAULT_AUDIO_MIME
    console.log('[TTS] Playing as blob', { mimeType })
    const buffer = await response.arrayBuffer()
    const blob = new Blob([buffer], { type: mimeType })
    set((state) => ({ audioCache: new Map(state.audioCache).set(id, blob) }))
    await playBlob(blob, id)
  }

  const stopImmediate = () => {
    clearPcmPeakState(get().currentAudioId)
    cleanupAudio()
    clearPrefetchQueue()
    cancelAlignmentRequest()
    set({
      isPlaying: false,
      isLoading: false,
      currentAudioId: null,
      currentTime: 0,
      duration: 0,
      audioElement: null,
      audioAnalyser: null,
    })
  }

  const fadeOut = (durationMs: number = 1000) => {
    if (!audioEl) {
      stopImmediate()
      return
    }
    const audio = audioEl
    const startVolume = audio.volume
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      audio.volume = Math.max(0, startVolume * (1 - progress))
      if (progress < 1) {
        requestAnimationFrame(tick)
        return
      }
      audio.volume = startVolume
      stopImmediate()
    }

    requestAnimationFrame(tick)
  }

  return {
    isPlaying: false,
    isLoading: false,
    currentAudioId: null,
    currentTime: 0,
    duration: 0,
    audioElement: null,
    audioAnalyser: null,
    audioCache: new Map(),
    loadingIds: new Set(),
    alignments: new Map(),
    wavePeaks: new Map(),
    waveDurations: new Map(),
    playedIds: new Set(),
    lastEndedId: null,
    lastEndedAt: 0,

    play: async (id, text, options) => {
      const trimmed = text.trim()
      if (!trimmed || !id) return
      const requestId = ++activeRequestId
      stopImmediate()
      primeWebAudioContext()
      set((state) => {
        const nextPlayed = new Set(state.playedIds)
        nextPlayed.add(id)
        return { currentAudioId: id, isLoading: true, currentTime: 0, duration: 0, playedIds: nextPlayed }
      })

      const cached = get().audioCache.get(id)
      if (cached) {
        try {
          await playWebAudioFromBlob(cached, id)
        } catch (err) {
          console.warn('[TTS] Playback failed', err)
          toast.error('TTS playback failed. Please try again.')
          stopImmediate()
        }
        return
      }

      try {
        abortController = new AbortController()
        const response = await requestTtsAudio(trimmed, options, abortController.signal)
        if (requestId !== activeRequestId) return
        await playStream(response, id, requestId)
      } catch (err) {
        if (requestId !== activeRequestId || isAbortError(err)) return
        const errInfo = err instanceof Error 
          ? { name: err.name, message: err.message, stack: err.stack?.slice(0, 200) }
          : err instanceof DOMException
            ? { name: err.name, message: err.message, code: err.code }
            : String(err)
        console.error('[TTS] Playback request failed', errInfo)
        toast.error(i18n.t('plugin.japaneseLearning.tts.generationFailed'))
        stopImmediate()
      }
    },

    pause: () => {
      if (audioEl) {
        audioEl.pause()
        set({ isPlaying: false })
        return
      }
      if (webAudioContext && webAudioActiveId && webAudioActiveId === get().currentAudioId) {
        webAudioContext.suspend().catch(() => undefined)
        stopWebAudioTicker()
        set({ isPlaying: false })
      }
    },

    resume: async () => {
      if (audioEl) {
        try {
          await audioEl.play()
        } catch (err) {
          console.warn('[TTS] Resume failed', err)
        }
        return
      }
      if (webAudioContext && webAudioActiveId && webAudioActiveId === get().currentAudioId) {
        try {
          await webAudioContext.resume()
          set((state) => {
            const nextPlayed = new Set(state.playedIds)
            if (webAudioActiveId) {
              nextPlayed.add(webAudioActiveId)
            }
            return { isPlaying: true, isLoading: false, playedIds: nextPlayed }
          })
          startWebAudioTicker(webAudioActiveId)
        } catch (err) {
          console.warn('[TTS] Resume failed', err)
        }
      }
    },

    prefetch: async (id, text, options) => {
      const trimmed = text.trim()
      if (!trimmed || !id) return
      if (get().audioCache.has(id) || get().loadingIds.has(id)) return
      if (prefetchQueue.some((task) => task.id === id)) return
      prefetchQueue.push({ id, text: trimmed, options })
      drainPrefetchQueue()
    },

    ensureAlignment: async (id, text, options) => {
      if (!id || !text.trim()) return null
      void options
      const existing = get().alignments.get(id)
      if (existing) return existing
      if (alignmentInFlightId === id && alignmentInFlight) return alignmentInFlight
      if (alignmentInFlightId && alignmentInFlightId !== id) {
        cancelAlignmentRequest()
      }

      alignmentInFlightId = id
      alignmentInFlight = new Promise<TtsAlignment | null>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          alignmentWaiters.delete(id)
          resolve(null)
        }, 8000)
        alignmentWaiters.set(id, { resolve, timeoutId })
      }).finally(() => {
        if (alignmentInFlightId === id) {
          alignmentInFlightId = null
          alignmentInFlight = null
        }
      })

      return alignmentInFlight
    },

    stop: (options) => {
      if (options?.fade) {
        fadeOut()
        return
      }
      stopImmediate()
    },

    fadeOut: (durationMs) => {
      fadeOut(durationMs)
    },

    seek: (time) => {
      if (audioEl) {
        audioEl.currentTime = time
        set({ currentTime: time })
        return
      }
      if (!webAudioContext || !webAudioBuffer || !webAudioActiveId || webAudioActiveId !== get().currentAudioId)
        return
      const clamped = Math.max(0, Math.min(time, webAudioBuffer.duration))
      webAudioSources.forEach((source) => {
        try {
          source.stop()
        } catch {
          // ignore
        }
        source.disconnect()
      })
      webAudioSources.clear()
      webAudioStreamDone = true

      const source = webAudioContext.createBufferSource()
      source.buffer = webAudioBuffer
      if (webAudioAnalyser) {
        source.connect(webAudioAnalyser)
      } else if (webAudioGain) {
        source.connect(webAudioGain)
      } else {
        source.connect(webAudioContext.destination)
      }
      webAudioStartTime = webAudioContext.currentTime - clamped
      webAudioScheduledTime = webAudioContext.currentTime + (webAudioBuffer.duration - clamped)
      set({ currentTime: clamped, duration: webAudioBuffer.duration, isPlaying: true, isLoading: false })
      startWebAudioTicker(webAudioActiveId)
      source.start(0, clamped)
      webAudioSources.add(source)
      source.onended = () => {
        webAudioSources.delete(source)
        if (webAudioStreamDone && webAudioSources.size === 0) {
          if (webAudioActiveId) {
            finalizeWebAudioPlayback(webAudioActiveId)
          }
        }
      }
    },

    setWavePeaks: (id, peaks) => {
      if (!id || peaks.length === 0) return
      set((state) => {
        const next = new Map(state.wavePeaks)
        next.set(id, peaks)
        return { wavePeaks: next }
      })
    },
    markPlayed: (id) => {
      if (!id) return
      set((state) => {
        const next = new Set(state.playedIds)
        next.add(id)
        return { playedIds: next }
      })
    },
  }
})
