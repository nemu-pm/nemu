import { create } from 'zustand'
import { toast } from 'sonner'

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
}

interface TTSState {
  isPlaying: boolean
  isLoading: boolean
  currentAudioId: string | null
  currentTime: number
  duration: number
  audioElement: HTMLAudioElement | null
  audioCache: Map<string, Blob>
  loadingIds: Set<string>
  alignments: Map<string, TtsAlignment>
  wavePeaks: Map<string, number[]>
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
}

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string

let audioEl: HTMLAudioElement | null = null
let mediaSource: MediaSource | null = null
let sourceBuffer: SourceBuffer | null = null
let objectUrl: string | null = null
let abortController: AbortController | null = null
let activeRequestId = 0
let progressRaf: number | null = null

function isAbortError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err instanceof Error) return err.name === 'AbortError'
  return (err as { name?: string })?.name === 'AbortError'
}

function stopProgressTicker() {
  if (progressRaf !== null) {
    cancelAnimationFrame(progressRaf)
    progressRaf = null
  }
}

function startProgressTicker(
  audio: HTMLAudioElement,
  playbackId: string,
  getState: () => TTSState,
  setState: (partial: Partial<TTSState>) => void
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
      setState({ duration })
    }

    progressRaf = requestAnimationFrame(tick)
  }

  progressRaf = requestAnimationFrame(tick)
}

function cleanupAudio() {
  stopProgressTicker()
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl.load()
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  mediaSource = null
  sourceBuffer = null
  audioEl = null
}

async function requestTtsAudio(text: string, options?: TtsRequestOptions, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(`${CONVEX_SITE_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      skipTagging: options?.skipTagging ?? false,
      source: options?.source ?? 'sentence',
    }),
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `TTS request failed (${response.status})`)
  }
  return response
}

async function requestTtsAlignment(text: string, options?: TtsRequestOptions, signal?: AbortSignal): Promise<TtsAlignment | null> {
  const response = await fetch(`${CONVEX_SITE_URL}/tts-alignment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      skipTagging: options?.skipTagging ?? false,
      source: options?.source ?? 'sentence',
    }),
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `TTS alignment failed (${response.status})`)
  }
  const payload = (await response.json()) as {
    alignment?: {
      characters?: string[] | string
      character_start_times_seconds?: number[]
      character_end_times_seconds?: number[]
    }
    normalized_text?: string
    normalizedText?: string
  }
  const alignment = payload.alignment
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
    : []
  if (!characters.length || !startTimes.length || !endTimes.length) return null
  return {
    characters,
    startTimes,
    endTimes,
    normalizedText: payload.normalized_text ?? payload.normalizedText,
  }
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

  const attachAudioEvents = (audio: HTMLAudioElement, playbackId: string) => {
    const handleLoaded = () => {
      if (get().currentAudioId !== playbackId) return
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      set({ duration })
    }
    const handleTimeUpdate = () => {
      if (get().currentAudioId !== playbackId) return
      set({ currentTime: audio.currentTime })
    }
    const handlePlay = () => {
      if (get().currentAudioId !== playbackId) return
      set({ isPlaying: true, isLoading: false })
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

  const playBlob = async (blob: Blob, id: string) => {
    const audio = new Audio()
    const url = URL.createObjectURL(blob)
    objectUrl = url
    audio.src = url
    audio.preload = 'auto'
    audioEl = audio
    set({ audioElement: audio })

    attachAudioEvents(audio, id)
    try {
      await audio.play()
    } catch (err) {
      console.warn('[TTS] Playback failed', err)
    }
  }

  const playStream = async (response: Response, id: string, requestId: number) => {
    const contentType = response.headers.get('Content-Type') || 'audio/mpeg'
    const audio = new Audio()
    const detach = attachAudioEvents(audio, id)
    audio.preload = 'auto'
    audioEl = audio
    set({ audioElement: audio })

    const supportsMediaSource = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(contentType)
    if (!supportsMediaSource) {
      const buffer = await response.arrayBuffer()
      const blob = new Blob([buffer], { type: contentType })
      set((state) => ({ audioCache: new Map(state.audioCache).set(id, blob) }))
      await playBlob(blob, id)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Missing audio stream')

    mediaSource = new MediaSource()
    objectUrl = URL.createObjectURL(mediaSource)
    audio.src = objectUrl

    const chunks: Uint8Array[] = []
    const queue: Uint8Array[] = []
    let streamDone = false

    const appendNext = () => {
      if (!sourceBuffer || sourceBuffer.updating) return
      const next = queue.shift()
      if (next) {
        sourceBuffer.appendBuffer(next)
      } else if (streamDone && mediaSource?.readyState === 'open') {
        mediaSource.endOfStream()
      }
    }

    const startReader = async () => {
      while (true) {
        const { value, done } = await reader.read()
        if (requestId !== activeRequestId) {
          detach()
          return
        }
        if (done) {
          streamDone = true
          appendNext()
          break
        }
        if (value) {
          chunks.push(value)
          queue.push(value)
          appendNext()
        }
      }

      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: contentType })
        set((state) => ({ audioCache: new Map(state.audioCache).set(id, blob) }))
      }
    }

    mediaSource.addEventListener('sourceopen', () => {
      if (!mediaSource) return
      try {
        sourceBuffer = mediaSource.addSourceBuffer(contentType)
      } catch (err) {
        console.warn('[TTS] Failed to create source buffer, falling back', err)
        reader.cancel().catch(() => undefined)
        return
      }

      if (!sourceBuffer) return
      sourceBuffer.addEventListener('updateend', appendNext)

      audio
        .play()
        .then(() => {
          if (get().currentAudioId === id) {
            set({ isLoading: false })
          }
        })
        .catch((err) => {
          console.warn('[TTS] Playback failed', err)
        })

      startReader().catch((err) => {
        if (requestId !== activeRequestId || isAbortError(err)) return
        console.warn('[TTS] Stream read failed', err)
      })
    })
  }

  const stopImmediate = () => {
    cleanupAudio()
    set({
      isPlaying: false,
      isLoading: false,
      currentAudioId: null,
      currentTime: 0,
      duration: 0,
      audioElement: null,
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
    audioCache: new Map(),
    loadingIds: new Set(),
    alignments: new Map(),
    wavePeaks: new Map(),
    lastEndedId: null,
    lastEndedAt: 0,

    play: async (id, text, options) => {
      const trimmed = text.trim()
      if (!trimmed || !id) return
      const requestId = ++activeRequestId
      stopImmediate()
      set({ currentAudioId: id, isLoading: true, currentTime: 0, duration: 0 })

      const cached = get().audioCache.get(id)
      if (cached) {
        set({ isLoading: false })
        await playBlob(cached, id)
        return
      }

      try {
        abortController = new AbortController()
        const response = await requestTtsAudio(trimmed, options, abortController.signal)
        if (requestId !== activeRequestId) return
        await playStream(response, id, requestId)
      } catch (err) {
        if (requestId !== activeRequestId || isAbortError(err)) return
        console.warn('[TTS] Playback request failed', err)
        toast.error('TTS generation failed. Please try again.')
        stopImmediate()
      }
    },

    pause: () => {
      if (!audioEl) return
      audioEl.pause()
      set({ isPlaying: false })
    },

    resume: async () => {
      if (!audioEl) return
      try {
        await audioEl.play()
      } catch (err) {
        console.warn('[TTS] Resume failed', err)
      }
    },

    prefetch: async (id, text, options) => {
      const trimmed = text.trim()
      if (!trimmed || !id) return
      if (get().audioCache.has(id) || get().loadingIds.has(id)) return

      setLoadingIds((prev) => new Set(prev).add(id))
      try {
        const response = await requestTtsAudio(trimmed, options)
        const contentType = response.headers.get('Content-Type') || 'audio/mpeg'
        const buffer = await response.arrayBuffer()
        const blob = new Blob([buffer], { type: contentType })
        set((state) => ({ audioCache: new Map(state.audioCache).set(id, blob) }))
      } catch (err) {
        console.warn('[TTS] Prefetch failed', err)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },

    ensureAlignment: async (id, text, options) => {
      if (!id || !text.trim()) return null
      const existing = get().alignments.get(id)
      if (existing) return existing
      try {
        const alignment = await requestTtsAlignment(text, options)
        if (!alignment) return null
        set((state) => ({ alignments: new Map(state.alignments).set(id, alignment) }))
        return alignment
      } catch (err) {
        console.warn('[TTS] Alignment fetch failed', err)
        return null
      }
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
      if (!audioEl) return
      audioEl.currentTime = time
      set({ currentTime: time })
    },

    setWavePeaks: (id, peaks) => {
      if (!id || peaks.length === 0) return
      set((state) => {
        const next = new Map(state.wavePeaks)
        next.set(id, peaks)
        return { wavePeaks: next }
      })
    },
  }
})
