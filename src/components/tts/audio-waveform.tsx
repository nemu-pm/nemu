import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { useTtsStore } from '@/stores/tts'

type TtsSource = 'sentence' | 'transcript' | 'voice'

interface AudioWaveformProps {
  ttsId: string
  text: string
  source?: TtsSource
  skipTagging?: boolean
  className?: string
  waveformClassName?: string
  showWaveform?: boolean
  onBeforePlay?: () => boolean | void
  onUserAction?: (action: 'play' | 'pause' | 'stop', ttsId: string) => void
}

const DEFAULT_WAVE_BARS = 96
const WAVEFORM_HEIGHT = 28
const BAR_WIDTH = 3
const BAR_GAP = 2
const BAR_RADIUS = 2
const BAR_MIN_HEIGHT = 3
const SAMPLE_INTERVAL = 0.08
const RENDER_THROTTLE_MS = 80

let sharedAudioContext: AudioContext | null = null
let sharedAnalyser: AnalyserNode | null = null
let sharedSource: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
let sharedAudioElement: HTMLAudioElement | null = null
let sharedStream: MediaStream | null = null

function resumeSharedAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext()
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => undefined)
  }
}

function ensureSharedAnalyser(audio: HTMLAudioElement) {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext()
  }

  if (sharedAudioElement !== audio) {
    if (sharedSource) {
      sharedSource.disconnect()
    }
    if (sharedAnalyser) {
      sharedAnalyser.disconnect()
    }
    if (sharedStream) {
      sharedStream.getTracks().forEach((track) => track.stop())
      sharedStream = null
    }

    const analyser = sharedAudioContext.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.85
    const audioWithCapture = audio as HTMLAudioElement & {
      captureStream?: () => MediaStream
      mozCaptureStream?: () => MediaStream
    }
    let captureStream =
      typeof audioWithCapture.captureStream === 'function'
        ? audioWithCapture.captureStream()
        : typeof audioWithCapture.mozCaptureStream === 'function'
          ? audioWithCapture.mozCaptureStream()
          : null

    if (captureStream && captureStream.getAudioTracks().length === 0) {
      captureStream = null
    }

    const source = captureStream
      ? sharedAudioContext.createMediaStreamSource(captureStream)
      : sharedAudioContext.createMediaElementSource(audio)

    source.connect(analyser)
    if (!captureStream) {
      analyser.connect(sharedAudioContext.destination)
    } else {
      sharedStream = captureStream
    }

    sharedAnalyser = analyser
    sharedSource = source
    sharedAudioElement = audio
  }

  return { context: sharedAudioContext, analyser: sharedAnalyser }
}

function buildEmptyPeaks(count: number): number[] {
  return new Array(count).fill(0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function estimateDurationSeconds(text: string): number {
  const base = Math.max(2.5, text.length * 0.07)
  return Math.min(base, 45)
}

// Wave colors - LINE/iMessage style (works on white bubble)
const WAVE_COLORS = {
  light: {
    wave: '#c8c8c8',      // Light gray for unplayed
    progress: '#5ac463',  // LINE green for played
    cursor: 'transparent',
  },
  dark: {
    wave: '#6b6b6b',      // Darker gray for unplayed
    progress: '#5ac463',  // LINE green for played
    cursor: 'transparent',
  },
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getBarCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return DEFAULT_WAVE_BARS
  }
  const count = Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP))
  return Math.max(8, count)
}

function computeRms(samples: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

function updateSampleBuffer(samples: number[], time: number, amplitude: number) {
  if (!Number.isFinite(time) || time < 0) return
  const index = Math.floor(time / SAMPLE_INTERVAL)
  if (index < 0) return
  if (samples.length <= index) {
    samples.length = index + 1
  }
  const current = samples[index] ?? 0
  if (amplitude > current) {
    samples[index] = amplitude
  }
}

function resamplePeaks(peaks: number[], targetCount: number): number[] {
  if (targetCount <= 0) return []
  if (peaks.length === 0) return buildEmptyPeaks(targetCount)
  if (peaks.length === targetCount) return [...peaks]
  const result = new Array(targetCount).fill(0)
  const ratio = peaks.length / targetCount
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio))
    let max = 0
    for (let j = start; j < end && j < peaks.length; j++) {
      if (peaks[j] > max) max = peaks[j]
    }
    result[i] = max
  }
  return result
}

function samplesToPeaks(samples: number[], duration: number, barCount: number): number[] {
  if (barCount <= 0) return []
  if (samples.length === 0 || duration <= 0) return buildEmptyPeaks(barCount)
  const peaks = new Array(barCount).fill(0)
  const sampleCount = Math.max(samples.length, Math.ceil(duration / SAMPLE_INTERVAL))
  for (let bar = 0; bar < barCount; bar++) {
    const startIndex = Math.floor((bar / barCount) * sampleCount)
    const endIndex = Math.max(startIndex + 1, Math.ceil(((bar + 1) / barCount) * sampleCount))
    let max = 0
    for (let i = startIndex; i < endIndex && i < samples.length; i++) {
      if (samples[i] > max) max = samples[i]
    }
    peaks[bar] = max
  }
  return peaks
}

function mergePeaks(primary: number[], fallback: number[]): number[] {
  if (primary.length === 0) return fallback
  if (fallback.length === 0) return primary
  const result = new Array(primary.length).fill(0)
  for (let i = 0; i < primary.length; i++) {
    result[i] = Math.max(primary[i] ?? 0, fallback[i] ?? 0)
  }
  return result
}

function getRenderPeaks(
  samples: number[],
  cached: number[] | null,
  duration: number,
  barCount: number
): number[] {
  const fromSamples = samples.length ? samplesToPeaks(samples, duration, barCount) : []
  const fromCache = cached ? resamplePeaks(cached, barCount) : []
  if (fromSamples.length && fromCache.length) {
    return mergePeaks(fromSamples, fromCache)
  }
  if (fromSamples.length) return fromSamples
  if (fromCache.length) return fromCache
  return buildEmptyPeaks(barCount)
}

function drawRoundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (width <= 0 || height <= 0) return
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, BAR_RADIUS)
    ctx.fill()
    return
  }
  ctx.fillRect(x, y, width, height)
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  progress: number,
  width: number,
  height: number,
  colors: { wave: string; progress: string }
) {
  if (peaks.length === 0 || width <= 0 || height <= 0) return
  const drawHeight = Math.min(height, WAVEFORM_HEIGHT)
  const offsetY = (height - drawHeight) / 2
  const totalWidth = peaks.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP
  const offsetX = Math.max(0, (width - totalWidth) / 2)
  const progressWidth = clamp(progress, 0, 1) * totalWidth

  for (let i = 0; i < peaks.length; i++) {
    const x = offsetX + i * (BAR_WIDTH + BAR_GAP)
    const barHeight = Math.max(BAR_MIN_HEIGHT, peaks[i] * drawHeight)
    const y = offsetY + (drawHeight - barHeight) / 2
    ctx.fillStyle = x + BAR_WIDTH <= offsetX + progressWidth + 0.5 ? colors.progress : colors.wave
    drawRoundedBar(ctx, x, y, BAR_WIDTH, barHeight)
  }
}

export function AudioWaveform({
  ttsId,
  text,
  source = 'sentence',
  skipTagging,
  className,
  waveformClassName,
  showWaveform = true,
  onBeforePlay,
  onUserAction,
}: AudioWaveformProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const colors = isDark ? WAVE_COLORS.dark : WAVE_COLORS.light

  const play = useTtsStore((s) => s.play)
  const pause = useTtsStore((s) => s.pause)
  const resume = useTtsStore((s) => s.resume)
  const stop = useTtsStore((s) => s.stop)
  const seek = useTtsStore((s) => s.seek)
  const currentAudioId = useTtsStore((s) => s.currentAudioId)
  const isPlaying = useTtsStore((s) => s.isPlaying)
  const isLoading = useTtsStore((s) => s.isLoading)
  const currentTime = useTtsStore((s) => s.currentTime)
  const duration = useTtsStore((s) => s.duration)
  const audioElement = useTtsStore((s) => s.audioElement)
  const audioAnalyser = useTtsStore((s) => s.audioAnalyser)
  const isPrefetching = useTtsStore((s) => s.loadingIds.has(ttsId))
  const cachedPeaks = useTtsStore((s) => s.wavePeaks.get(ttsId))
  const cachedDuration = useTtsStore((s) => s.waveDurations.get(ttsId) ?? 0)
  const setWavePeaks = useTtsStore((s) => s.setWavePeaks)

  const isCurrent = currentAudioId === ttsId
  const isPlayingNow =
    isCurrent && (audioElement ? !audioElement.paused && !audioElement.ended : isPlaying)
  const isActive = isPlayingNow
  const isGenerating = (isCurrent && isLoading) || isPrefetching

  const trimmedText = useMemo(() => text.trim(), [text])
  const fallbackDuration = useMemo(() => estimateDurationSeconds(trimmedText), [trimmedText])
  const shouldShowWaveform = showWaveform

  const waveformRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const barCountRef = useRef(DEFAULT_WAVE_BARS)
  const samplesRef = useRef<number[]>([])
  const cachedPeaksRef = useRef<number[] | null>(null)
  const visualDurationRef = useRef(fallbackDuration)
  const currentTimeRef = useRef(currentTime)
  const isActiveRef = useRef(isActive)
  const lastRenderRef = useRef(0)
  const lastActiveRef = useRef(false)
  const isScrubbingRef = useRef(false)

  const renderWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height, dpr } = sizeRef.current
    if (!width || !height) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!shouldShowWaveform) return
    const durationForRender = Math.max(visualDurationRef.current, 0.2)
    const progress = isCurrent
      ? clamp(currentTimeRef.current / durationForRender, 0, 1)
      : 0
    const peaks = getRenderPeaks(
      samplesRef.current,
      cachedPeaksRef.current,
      durationForRender,
      barCountRef.current
    )
    drawWaveform(ctx, peaks, progress, width, height, colors)
  }, [colors, isCurrent, shouldShowWaveform])

  useLayoutEffect(() => {
    const node = waveformRef.current
    if (!node) return

    const updateSize = () => {
      const rect = node.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      sizeRef.current = { width, height, dpr }
      barCountRef.current = getBarCount(width)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      renderWaveform()
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [renderWaveform])

  useEffect(() => {
    samplesRef.current = []
    visualDurationRef.current = fallbackDuration
  }, [ttsId, fallbackDuration])

  useEffect(() => {
    cachedPeaksRef.current = cachedPeaks ? [...cachedPeaks] : null
    renderWaveform()
  }, [cachedPeaks, ttsId, renderWaveform])

  useEffect(() => {
    currentTimeRef.current = currentTime
    if (isCurrent) {
      renderWaveform()
    }
  }, [currentTime, isCurrent, renderWaveform])

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    if (isCurrent && duration > 0) {
      visualDurationRef.current = Math.max(duration, fallbackDuration)
    } else {
      visualDurationRef.current = fallbackDuration
    }
    if (isCurrent) {
      renderWaveform()
    }
  }, [duration, fallbackDuration, isCurrent, renderWaveform])

  useEffect(() => {
    if (!shouldShowWaveform || !isCurrent) return undefined
    if (!audioElement && !audioAnalyser) return undefined

    let cancelled = false
    const { context, analyser } = audioAnalyser
      ? { context: audioAnalyser.context, analyser: audioAnalyser }
      : ensureSharedAnalyser(audioElement!)
    if (!analyser || !context) return undefined

    const samples = new Uint8Array(analyser.fftSize)
    let rafId: number | null = null

    const tick = (now: number) => {
      if (cancelled) return
      const isPlayingAudio = audioElement
        ? !audioElement.paused && !audioElement.ended
        : isActiveRef.current
      if (isPlayingAudio) {
        analyser.getByteTimeDomainData(samples)
        const rms = computeRms(samples)
        const amplitude = clamp(rms * 1.6, 0, 1)
        const time = audioElement
          ? Number.isFinite(audioElement.currentTime)
            ? audioElement.currentTime
            : 0
          : currentTimeRef.current
        updateSampleBuffer(samplesRef.current, time, amplitude)
        const targetDuration = Math.max(visualDurationRef.current, time + 0.35)
        if (targetDuration > visualDurationRef.current) {
          visualDurationRef.current = targetDuration
        }
      }

      if (now - lastRenderRef.current > RENDER_THROTTLE_MS) {
        renderWaveform()
        lastRenderRef.current = now
      }
      rafId = requestAnimationFrame(tick)
    }

    if (typeof (context as AudioContext).resume === 'function') {
      ;(context as AudioContext).resume().catch(() => undefined)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [audioAnalyser, audioElement, isCurrent, renderWaveform, shouldShowWaveform])

  const commitPeaks = useCallback(() => {
    if (!ttsId) return
    const durationForStore = Math.max(visualDurationRef.current, fallbackDuration)
    const peaks = getRenderPeaks(
      samplesRef.current,
      cachedPeaksRef.current,
      durationForStore,
      DEFAULT_WAVE_BARS
    )
    if (peaks.some((value) => value > 0)) {
      setWavePeaks(ttsId, peaks)
    }
  }, [fallbackDuration, setWavePeaks, ttsId])

  useEffect(() => {
    if (!isCurrent) {
      lastActiveRef.current = false
      return
    }
    if (lastActiveRef.current && !isActive) {
      commitPeaks()
    }
    lastActiveRef.current = isActive
  }, [commitPeaks, isActive, isCurrent])

  useEffect(() => {
    return () => {
      commitPeaks()
    }
  }, [commitPeaks])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      if (!isCurrent) return
      const node = waveformRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      if (!rect.width) return
      const x = clamp(clientX - rect.left, 0, rect.width)
      const durationForSeek = Math.max(visualDurationRef.current, fallbackDuration, 0.2)
      const nextTime = (x / rect.width) * durationForSeek
      seek(nextTime)
    },
    [fallbackDuration, isCurrent, seek]
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!shouldShowWaveform || !isCurrent) return
      isScrubbingRef.current = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      seekFromPointer(event.clientX)
      if (!isPlayingNow && !isGenerating) {
        onUserAction?.('play', ttsId)
        void resume()
      }
    },
    [isCurrent, isGenerating, isPlayingNow, onUserAction, resume, seekFromPointer, shouldShowWaveform, ttsId]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return
      seekFromPointer(event.clientX)
    },
    [seekFromPointer]
  )

  const stopScrubbing = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return
    isScrubbingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [])

  const handleToggle = async () => {
    if (!ttsId || !trimmedText) return

    if (!audioAnalyser) {
      resumeSharedAudioContext()
    }

    if (isCurrent && isPlayingNow) {
      pause()
      onUserAction?.('pause', ttsId)
      return
    }

    if (isCurrent && isGenerating) {
      stop()
      onUserAction?.('stop', ttsId)
      return
    }

    if (onBeforePlay?.() === false) return

    if (isCurrent) {
      onUserAction?.('play', ttsId)
      await resume()
      return
    }

    onUserAction?.('play', ttsId)
    await play(ttsId, trimmedText, { source, skipTagging })
  }

  // Display duration: show current time while playing, show "--:--" while loading or unknown.
  const displayDuration = isCurrent && duration > 0 ? duration : cachedDuration
  const displayTime = isCurrent && isActive ? currentTime : 0
  const timeText = isGenerating
    ? '--:--'
    : isActive
      ? formatDuration(displayTime)
      : displayDuration > 0
        ? formatDuration(displayDuration)
        : '--:--'

  return (
    <div
      className={cn(
        'group relative flex items-center',
        shouldShowWaveform ? 'gap-2.5' : 'gap-0',
        className
      )}
    >
      {/* Play/Pause Button - LINE style circular */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          // Default state - LINE green circle
          'bg-[#5ac463] text-white',
          // Hover
          'hover:bg-[#4eb356]',
          // Active/pressed
          'active:scale-95',
          // Loading state
          isGenerating && !isActive && 'animate-pulse bg-[#5ac463]/70',
          // Transition
          'transition-all duration-150'
        )}
        aria-label={isGenerating ? 'Stop' : isActive ? 'Pause audio' : 'Play audio'}
      >
        {isGenerating ? (
          <Spinner className="size-3.5 text-white" />
        ) : (
          <HugeiconsIcon
            icon={isActive ? PauseIcon : PlayIcon}
            className="size-3.5"
          />
        )}
      </button>

      {/* Waveform */}
      <div
        className={cn('relative h-8 flex-1 min-w-0 overflow-hidden', waveformClassName)}
        ref={waveformRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopScrubbing}
        onPointerCancel={stopScrubbing}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* Duration label - right of waveform */}
      {shouldShowWaveform && (
        <span className="text-[11px] opacity-50 tabular-nums shrink-0">
          {timeText}
        </span>
      )}
    </div>
  )
}
