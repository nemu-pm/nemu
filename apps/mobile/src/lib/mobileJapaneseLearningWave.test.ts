import { afterEach, describe, expect, test } from "bun:test";
import {
  addJapaneseLearningWaveSample,
  beginJapaneseLearningWave,
  commitJapaneseLearningWave,
  estimateJapaneseLearningWaveDuration,
  getJapaneseLearningWaveBarCount,
  getJapaneseLearningWaveRenderPeaks,
  getJapaneseLearningWaveVersion,
  isJapaneseLearningWaveBarPlayed,
  japaneseLearningWaveAmplitude,
  japaneseLearningWaveSamplesToPeaks,
  japaneseLearningWaveSeekTime,
  readJapaneseLearningWave,
  resampleJapaneseLearningWavePeaks,
  resetJapaneseLearningWavesForTesting,
  setJapaneseLearningWaveDuration,
  subscribeJapaneseLearningWave,
  updateJapaneseLearningWaveSamples,
} from "./mobileJapaneseLearningWave";

afterEach(() => resetJapaneseLearningWavesForTesting());

describe("web audio-waveform helpers", () => {
  test("estimated duration: 0.07s per char, 2.5–45s", () => {
    expect(estimateJapaneseLearningWaveDuration("短い")).toBe(2.5);
    expect(estimateJapaneseLearningWaveDuration("あ".repeat(100))).toBeCloseTo(7);
    expect(estimateJapaneseLearningWaveDuration("あ".repeat(1000))).toBe(45);
  });

  test("bar count: 3pt bars, 2pt gaps, at least 8; 96 unmeasured", () => {
    expect(getJapaneseLearningWaveBarCount(0)).toBe(96);
    expect(getJapaneseLearningWaveBarCount(20)).toBe(8);
    expect(getJapaneseLearningWaveBarCount(148)).toBe(30);
  });

  test("amplitude is RMS × 1.6, clamped to 1", () => {
    expect(japaneseLearningWaveAmplitude([])).toBe(0);
    expect(japaneseLearningWaveAmplitude([0.25, -0.25])).toBeCloseTo(0.4);
    expect(japaneseLearningWaveAmplitude([1, -1])).toBe(1);
  });

  test("samples keep the loudest reading per 80ms bucket", () => {
    const samples: number[] = [];
    updateJapaneseLearningWaveSamples(samples, 0.01, 0.2);
    updateJapaneseLearningWaveSamples(samples, 0.05, 0.5);
    updateJapaneseLearningWaveSamples(samples, 0.07, 0.3);
    updateJapaneseLearningWaveSamples(samples, 0.25, 0.9);
    expect(samples).toEqual([0.5, 0, 0, 0.9]);
    updateJapaneseLearningWaveSamples(samples, -1, 1);
    updateJapaneseLearningWaveSamples(samples, Number.NaN, 1);
    expect(samples).toEqual([0.5, 0, 0, 0.9]);
  });

  test("samples spread over the visual duration, unplayed bars stay flat", () => {
    // 4 buckets of a 0.8s (10-bucket) audio over 5 bars: 2 buckets each.
    const peaks = japaneseLearningWaveSamplesToPeaks([0.1, 0.5, 0.2, 0.4], 0.8, 5);
    expect(peaks).toEqual([0.5, 0.4, 0, 0, 0]);
  });

  test("resampling keeps the maximum of each span", () => {
    expect(resampleJapaneseLearningWavePeaks([0.1, 0.9, 0.3, 0.2], 2)).toEqual([0.9, 0.3]);
    expect(resampleJapaneseLearningWavePeaks([], 3)).toEqual([0, 0, 0]);
  });

  test("render peaks merge live samples over stored peaks; nothing yet is flat", () => {
    expect(getJapaneseLearningWaveRenderPeaks([], null, 1, 3)).toEqual([0, 0, 0]);
    expect(getJapaneseLearningWaveRenderPeaks([], [0.2, 0.4, 0.6], 1, 3)).toEqual([0.2, 0.4, 0.6]);
    const merged = getJapaneseLearningWaveRenderPeaks([0.9], [0.2, 0.4, 0.6], 0.24, 3);
    expect(merged).toEqual([0.9, 0.4, 0.6]);
  });

  test("a bar is played once the progress passes its right edge", () => {
    expect(isJapaneseLearningWaveBarPlayed(0, 10, 0)).toBe(false);
    expect(isJapaneseLearningWaveBarPlayed(0, 10, 0.07)).toBe(true);
    expect(isJapaneseLearningWaveBarPlayed(9, 10, 1)).toBe(true);
    expect(isJapaneseLearningWaveBarPlayed(9, 10, 0.95)).toBe(false);
  });

  test("seek time follows the touch across the waveform", () => {
    expect(japaneseLearningWaveSeekTime(50, 200, 8)).toBe(2);
    expect(japaneseLearningWaveSeekTime(-10, 200, 8)).toBe(0);
    expect(japaneseLearningWaveSeekTime(300, 200, 8)).toBe(8);
    expect(japaneseLearningWaveSeekTime(10, 0, 8)).toBeNull();
    expect(japaneseLearningWaveSeekTime(10, 200, 0)).toBeNull();
  });
});

describe("per-audio wave store (web useTtsStore wavePeaks)", () => {
  test("live samples draw while playing, then the peaks are kept", () => {
    let calls = 0;
    const unsubscribe = subscribeJapaneseLearningWave("m1", () => {
      calls += 1;
    });
    beginJapaneseLearningWave("m1", 2.5);
    setJapaneseLearningWaveDuration("m1", 1);
    // Same duration again: no redraw.
    setJapaneseLearningWaveDuration("m1", 1);
    expect(readJapaneseLearningWave("m1", 2.5, 4).duration).toBe(2.5);
    expect(readJapaneseLearningWave("m1", 2.5, 4).audioDuration).toBe(1);
    addJapaneseLearningWaveSample("m1", 0.1, 0.8);
    commitJapaneseLearningWave("m1");
    expect(calls).toBe(3);
    expect(getJapaneseLearningWaveVersion("m1")).toBe(3);
    // A new playback clears the live samples but keeps the committed shape.
    beginJapaneseLearningWave("m1", 2.5);
    const { peaks } = readJapaneseLearningWave("m1", 2.5, 96);
    expect(Math.max(...peaks)).toBeCloseTo(0.8);
    unsubscribe();
  });

  test("an audio never played draws flat bars", () => {
    expect(readJapaneseLearningWave("never", 2.5, 4)).toEqual({
      audioDuration: 0,
      peaks: [0, 0, 0, 0],
      duration: 2.5,
    });
  });

  test("the visual duration stays ahead of the playhead", () => {
    beginJapaneseLearningWave("m2", 2.5);
    addJapaneseLearningWaveSample("m2", 3, 0.5);
    expect(readJapaneseLearningWave("m2", 2.5, 4).duration).toBeCloseTo(3.35);
  });
});
