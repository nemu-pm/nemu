/**
 * Port of web `AudioWaveform` (src/components/tts/audio-waveform.tsx) peak
 * handling: web reads the playing audio's amplitude (an AnalyserNode's RMS,
 * every animation frame) into 80ms buckets, draws those as the bars, and
 * keeps 96 peaks per audio (`useTtsStore.wavePeaks`) once playback stops, so
 * a replayed or finished bubble shows its real shape. Before the first play
 * the bars are flat. Native reads the same amplitude from expo-audio's
 * sample stream. Pure helpers first (tested), then the per-audio store.
 */

export const JAPANESE_LEARNING_WAVE_DEFAULT_BARS = 96;
export const JAPANESE_LEARNING_WAVE_HEIGHT = 28;
export const JAPANESE_LEARNING_WAVE_BAR_WIDTH = 3;
export const JAPANESE_LEARNING_WAVE_BAR_GAP = 2;
export const JAPANESE_LEARNING_WAVE_BAR_MIN_HEIGHT = 3;
/** Web `SAMPLE_INTERVAL`: one amplitude bucket per 80ms of audio. */
export const JAPANESE_LEARNING_WAVE_SAMPLE_INTERVAL = 0.08;
/** Web `RENDER_THROTTLE_MS`. */
export const JAPANESE_LEARNING_WAVE_RENDER_THROTTLE_MS = 80;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Web `estimateDurationSeconds`: the visual length until the real one is known. */
export function estimateJapaneseLearningWaveDuration(text: string): number {
  const base = Math.max(2.5, text.trim().length * 0.07);
  return Math.min(base, 45);
}

/** Web `getBarCount`. */
export function getJapaneseLearningWaveBarCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return JAPANESE_LEARNING_WAVE_DEFAULT_BARS;
  const count = Math.floor(
    (width + JAPANESE_LEARNING_WAVE_BAR_GAP) /
      (JAPANESE_LEARNING_WAVE_BAR_WIDTH + JAPANESE_LEARNING_WAVE_BAR_GAP),
  );
  return Math.max(8, count);
}

/**
 * Web `computeRms` × 1.6, clamped (the bar amplitude). Web reads bytes
 * centred on 128 (`(v - 128) / 128`); native frames are already -1…1.
 */
export function japaneseLearningWaveAmplitude(frames: ArrayLike<number>): number {
  if (frames.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const v = frames[i];
    if (Number.isFinite(v)) sum += v * v;
  }
  return clamp(Math.sqrt(sum / frames.length) * 1.6, 0, 1);
}

/** Web `updateSampleBuffer`: the loudest amplitude per 80ms bucket. */
export function updateJapaneseLearningWaveSamples(
  samples: number[],
  time: number,
  amplitude: number,
): void {
  if (!Number.isFinite(time) || time < 0) return;
  const index = Math.floor(time / JAPANESE_LEARNING_WAVE_SAMPLE_INTERVAL);
  if (index < 0) return;
  if (samples.length <= index) {
    for (let i = samples.length; i <= index; i += 1) samples.push(0);
  }
  const current = samples[index] ?? 0;
  if (amplitude > current) samples[index] = amplitude;
}

/** Web `resamplePeaks`. */
export function resampleJapaneseLearningWavePeaks(peaks: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];
  if (peaks.length === 0) return new Array<number>(targetCount).fill(0);
  if (peaks.length === targetCount) return [...peaks];
  const result = new Array<number>(targetCount).fill(0);
  const ratio = peaks.length / targetCount;
  for (let i = 0; i < targetCount; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j += 1) {
      if (peaks[j] > max) max = peaks[j];
    }
    result[i] = max;
  }
  return result;
}

/** Web `samplesToPeaks`. */
export function japaneseLearningWaveSamplesToPeaks(
  samples: number[],
  duration: number,
  barCount: number,
): number[] {
  if (barCount <= 0) return [];
  if (samples.length === 0 || duration <= 0) return new Array<number>(barCount).fill(0);
  const peaks = new Array<number>(barCount).fill(0);
  const sampleCount = Math.max(
    samples.length,
    Math.ceil(duration / JAPANESE_LEARNING_WAVE_SAMPLE_INTERVAL),
  );
  for (let bar = 0; bar < barCount; bar += 1) {
    const startIndex = Math.floor((bar / barCount) * sampleCount);
    const endIndex = Math.max(startIndex + 1, Math.ceil(((bar + 1) / barCount) * sampleCount));
    let max = 0;
    for (let i = startIndex; i < endIndex && i < samples.length; i += 1) {
      if (samples[i] > max) max = samples[i];
    }
    peaks[bar] = max;
  }
  return peaks;
}

/** Web `getRenderPeaks`: live samples merged over the stored peaks. */
export function getJapaneseLearningWaveRenderPeaks(
  samples: number[],
  cached: number[] | null,
  duration: number,
  barCount: number,
): number[] {
  const fromSamples = samples.length
    ? japaneseLearningWaveSamplesToPeaks(samples, duration, barCount)
    : [];
  const fromCache = cached ? resampleJapaneseLearningWavePeaks(cached, barCount) : [];
  if (fromSamples.length && fromCache.length) {
    return fromSamples.map((value, i) => Math.max(value ?? 0, fromCache[i] ?? 0));
  }
  if (fromSamples.length) return fromSamples;
  if (fromCache.length) return fromCache;
  return new Array<number>(barCount).fill(0);
}

/** Web `drawWaveform`'s per-bar played test, with bars packed from the left. */
export function isJapaneseLearningWaveBarPlayed(
  index: number,
  barCount: number,
  progress: number,
): boolean {
  const pitch = JAPANESE_LEARNING_WAVE_BAR_WIDTH + JAPANESE_LEARNING_WAVE_BAR_GAP;
  const totalWidth = barCount * pitch - JAPANESE_LEARNING_WAVE_BAR_GAP;
  const x = index * pitch;
  return x + JAPANESE_LEARNING_WAVE_BAR_WIDTH <= clamp(progress, 0, 1) * totalWidth + 0.5;
}

/** Web `seekFromPointer`: the time under a touch at `x` across `width`. */
export function japaneseLearningWaveSeekTime(x: number, width: number, duration: number): number | null {
  if (!(width > 0) || !(duration > 0)) return null;
  return (clamp(x, 0, width) / width) * duration;
}

// ---- Per-audio store (web `useTtsStore` wavePeaks / waveDurations) ----

type WaveEntry = {
  /** Live 80ms amplitude buckets of the current playback. */
  samples: number[];
  /** Committed 96 peaks (web `wavePeaks`). */
  peaks: number[] | null;
  /** Visual duration (web `visualDurationRef`), grown as playback passes it. */
  duration: number;
  /** The player's own duration (web `waveDurations`), 0 until known. */
  audioDuration: number;
  /** Bumped on every change, for `useSyncExternalStore`. */
  version: number;
};

const entries = new Map<string, WaveEntry>();
const listeners = new Map<string, Set<() => void>>();

function entryFor(id: string): WaveEntry {
  let entry = entries.get(id);
  if (!entry) {
    entry = { samples: [], peaks: null, duration: 0, audioDuration: 0, version: 0 };
    entries.set(id, entry);
  }
  return entry;
}

function notify(id: string) {
  const entry = entries.get(id);
  if (entry) entry.version += 1;
  listeners.get(id)?.forEach((listener) => listener());
}

export function subscribeJapaneseLearningWave(id: string, listener: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(id);
  };
}

export function getJapaneseLearningWaveVersion(id: string): number {
  return entries.get(id)?.version ?? 0;
}

/** The bars to draw for an audio at `barCount`, and its visual duration. */
export function readJapaneseLearningWave(
  id: string,
  fallbackDuration: number,
  barCount: number,
): { peaks: number[]; duration: number; audioDuration: number } {
  const entry = entries.get(id);
  const duration = Math.max(entry?.duration ?? 0, fallbackDuration, 0.2);
  return {
    audioDuration: entry?.audioDuration ?? 0,
    peaks: getJapaneseLearningWaveRenderPeaks(
      entry?.samples ?? [],
      entry?.peaks ?? null,
      duration,
      barCount,
    ),
    duration,
  };
}

/** A playback of this audio starts: live samples begin again (web resets them per audio). */
export function beginJapaneseLearningWave(id: string, fallbackDuration: number): void {
  const entry = entryFor(id);
  entry.samples = [];
  entry.duration = Math.max(entry.duration, fallbackDuration);
  notify(id);
}

/** The player knows the real duration (web `Math.max(duration, fallbackDuration)`). */
export function setJapaneseLearningWaveDuration(id: string, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const entry = entryFor(id);
  if (duration === entry.audioDuration && duration <= entry.duration) return;
  entry.audioDuration = duration;
  entry.duration = Math.max(entry.duration, duration);
  notify(id);
}

/** One amplitude reading at `time` seconds into the audio. */
export function addJapaneseLearningWaveSample(id: string, time: number, amplitude: number): void {
  const entry = entryFor(id);
  updateJapaneseLearningWaveSamples(entry.samples, time, amplitude);
  // Web: the visual duration stays 0.35s ahead of the playhead.
  const target = time + 0.35;
  if (Number.isFinite(target) && target > entry.duration) entry.duration = target;
}

/** Throttled redraw for the samples added since the last one. */
export function flushJapaneseLearningWave(id: string): void {
  notify(id);
}

/** Web `commitPeaks`: playback stopped; keep its 96 peaks for later draws. */
export function commitJapaneseLearningWave(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  const peaks = getJapaneseLearningWaveRenderPeaks(
    entry.samples,
    entry.peaks,
    Math.max(entry.duration, 0.2),
    JAPANESE_LEARNING_WAVE_DEFAULT_BARS,
  );
  if (peaks.some((value) => value > 0)) entry.peaks = peaks;
  notify(id);
}

/** Tests only. */
export function resetJapaneseLearningWavesForTesting(): void {
  entries.clear();
  listeners.clear();
}
