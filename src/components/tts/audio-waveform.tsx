import { useEffect, useMemo, useRef } from 'react'
import { useWavesurfer } from '@wavesurfer/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
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

let sharedAudioContext: AudioContext | null = null
let sharedAnalyser: AnalyserNode | null = null
let sharedSource: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
let sharedAudioElement: HTMLAudioElement | null = null
let sharedStream: MediaStream | null = null

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
    const captureStream =
      typeof audio.captureStream === 'function'
        ? audio.captureStream()
        : typeof (audio as HTMLAudioElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream ===
            'function'
          ? (audio as HTMLAudioElement & { mozCaptureStream: () => MediaStream }).mozCaptureStream()
          : null

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

function estimateDurationSeconds(text: string): number {
  const base = Math.max(2.5, text.length * 0.07)
  return Math.min(base, 45)
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
  const isPrefetching = useTtsStore((s) => s.loadingIds.has(ttsId))
  const cachedPeaks = useTtsStore((s) => s.wavePeaks.get(ttsId))
  const setWavePeaks = useTtsStore((s) => s.setWavePeaks)

  const isCurrent = currentAudioId === ttsId
  const isActive = isCurrent && isPlaying
  const isGenerating = (isCurrent && isLoading) || isPrefetching

  const trimmedText = useMemo(() => text.trim(), [text])

  const shouldShowWaveform = showWaveform
  const waveformRef = useRef<HTMLDivElement | null>(null)
  const lastDurationRef = useRef(0)
  const livePeaksRef = useRef<number[]>([])
  const liveRafRef = useRef<number | null>(null)
  const durationRef = useRef(0)
  const initialPeaks = useMemo(
    () => cachedPeaks ?? buildEmptyPeaks(DEFAULT_WAVE_BARS),
    [cachedPeaks, ttsId]
  )
  const peaks = useMemo(() => [initialPeaks], [initialPeaks])
  const fallbackDuration = useMemo(() => estimateDurationSeconds(trimmedText), [trimmedText])
  const waveOptions = useMemo(
    () => ({
      container: waveformRef,
      peaks,
      duration: fallbackDuration,
      height: 32,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      barHeight: 0.85,
      barMinHeight: 1,
      barAlign: 'bottom' as const,
      waveColor: 'rgba(94, 90, 214, 0.25)',
      progressColor: 'rgba(94, 90, 214, 0.85)',
      cursorColor: 'rgba(94, 90, 214, 0.9)',
      cursorWidth: 2,
      normalize: true,
      dragToSeek: true,
      hideScrollbar: true,
    }),
    [fallbackDuration, peaks]
  )
  const { wavesurfer } = useWavesurfer(waveOptions)

  useEffect(() => {
    livePeaksRef.current = cachedPeaks ? [...cachedPeaks] : buildEmptyPeaks(DEFAULT_WAVE_BARS)
    lastDurationRef.current = 0
  }, [cachedPeaks, ttsId])

  useEffect(() => {
    durationRef.current = isCurrent && duration > 0 ? duration : fallbackDuration
  }, [duration, fallbackDuration, isCurrent])

  useEffect(() => {
    if (!wavesurfer || !shouldShowWaveform) return
    const nextDuration = durationRef.current || fallbackDuration
    wavesurfer.setOptions({ peaks: [livePeaksRef.current], duration: nextDuration })
  }, [fallbackDuration, shouldShowWaveform, ttsId, wavesurfer])

  useEffect(() => {
    if (!wavesurfer) return undefined
    const unsubscribe = wavesurfer.on('interaction', (time) => {
      if (!isCurrent) return
      seek(time)
    })
    return () => unsubscribe()
  }, [wavesurfer, isCurrent, seek])

  useEffect(() => {
    if (!wavesurfer) return
    if (!isCurrent) {
      wavesurfer.setTime(0)
      return
    }
    if (!Number.isFinite(currentTime)) return
    wavesurfer.setTime(currentTime)
  }, [wavesurfer, isCurrent, currentTime])

  useEffect(() => {
    if (!shouldShowWaveform || !wavesurfer || !isCurrent || !audioElement) return undefined

    let cancelled = false
    const audio = audioElement
    const peaksLength = DEFAULT_WAVE_BARS
    const { context, analyser } = ensureSharedAnalyser(audio)
    if (!analyser || !context) return undefined

    const samples = new Uint8Array(analyser.fftSize)
    let lastCommit = 0

    const tick = (now: number) => {
      if (cancelled) return

      if (!audio.paused && !audio.ended) {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / samples.length)
        const amplitude = Math.min(1, Math.max(0, rms * 1.6))

        const effectiveDuration = durationRef.current || fallbackDuration
        const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
        const index = Math.min(
          peaksLength - 1,
          Math.max(0, Math.floor((time / Math.max(effectiveDuration, 0.2)) * peaksLength))
        )
        const current = livePeaksRef.current[index] ?? 0
        livePeaksRef.current[index] = Math.max(current, amplitude)

        if (now - lastCommit > 160) {
          const nextDuration = Math.max(effectiveDuration, time + 0.4)
          if (nextDuration > lastDurationRef.current + 0.2) {
            lastDurationRef.current = nextDuration
          }
          wavesurfer.setOptions({
            peaks: [livePeaksRef.current],
            duration: lastDurationRef.current || nextDuration,
          })
          lastCommit = now
        }
      }

      liveRafRef.current = requestAnimationFrame(tick)
    }

    context.resume().catch(() => undefined)
    liveRafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current)
        liveRafRef.current = null
      }
      setWavePeaks(ttsId, [...livePeaksRef.current])
    }
  }, [audioElement, fallbackDuration, isCurrent, setWavePeaks, shouldShowWaveform, ttsId, wavesurfer])

  const handleToggle = async () => {
    if (!ttsId || !trimmedText) return

    if (isCurrent && isGenerating) {
      stop()
      onUserAction?.('stop', ttsId)
      return
    }

    if (isCurrent && isPlaying) {
      pause()
      onUserAction?.('pause', ttsId)
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

  return (
    <div
      className={cn(
        'flex items-center rounded-full border border-border/50',
        'bg-transparent px-2 py-1.5 transition-all duration-200',
        shouldShowWaveform ? 'gap-2' : 'gap-0',
        className
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex size-8 items-center justify-center rounded-full',
          'bg-primary/10 text-primary transition-colors',
          'hover:bg-primary/20'
        )}
        aria-label={isActive ? 'Pause audio' : 'Play audio'}
      >
        {isGenerating ? (
          <Spinner className="size-4" />
        ) : (
          <HugeiconsIcon icon={isActive ? PauseIcon : PlayIcon} className="size-4" />
        )}
      </button>
      <div
        className={cn(
          'transition-[opacity,max-width] duration-300 ease-out overflow-hidden',
          shouldShowWaveform ? 'opacity-100 max-w-[360px]' : 'opacity-0 max-w-0'
        )}
      >
        <div
          className={cn(
            'h-8 w-full',
            shouldShowWaveform ? 'min-w-[120px] sm:min-w-[160px] max-w-[320px]' : 'min-w-0',
            waveformClassName
          )}
          ref={waveformRef}
        />
      </div>
    </div>
  )
}
