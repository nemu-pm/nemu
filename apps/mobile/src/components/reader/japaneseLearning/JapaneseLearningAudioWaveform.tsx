import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, PanResponder, StyleSheet, View } from "react-native";
import { JapaneseLearningWebIcon } from "./JapaneseLearningWebIcon";
import { NemuPressable, useNemuTheme } from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import { JAPANESE_LEARNING_AUDIO_COLORS } from "@/lib/mobileJapaneseLearningSurfaceTheme";
import {
  estimateJapaneseLearningWaveDuration,
  getJapaneseLearningWaveVersion,
  isJapaneseLearningWaveBarPlayed,
  japaneseLearningWaveSeekTime,
  readJapaneseLearningWave,
  subscribeJapaneseLearningWave,
} from "@/lib/mobileJapaneseLearningWave";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_MIN_HEIGHT = 3;
const WAVEFORM_HEIGHT = 28;

/** Deterministic pseudo-peaks for a text (no audio analyser on native). */
function peaksForSeed(seed: string, count: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const peaks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const noise = ((hash >>> 0) % 1000) / 1000;
    const envelope = 0.55 + 0.45 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    peaks.push(Math.max(0.12, Math.min(1, noise * envelope + 0.1)));
  }
  return peaks;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

type AudioWaveformProps = {
  /** Seeds the bar shape so a page keeps the same waveform. */
  seed: string;
  /**
   * The audio's id in the wave store (`mobileJapaneseLearningWave`): the bars
   * are its real peaks, read while it plays (web `AudioWaveform`), instead of
   * the seed's shape.
   */
  waveId?: string;
  /** With `waveId`: drag on the waveform to seek while it plays (seconds). */
  onSeek?: (seconds: number) => void;
  loading: boolean;
  playing: boolean;
  /** Web `showWaveform`: bars appear once this audio has been played. */
  showWaveform: boolean;
  currentTime?: number;
  duration?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  onToggle: () => void;
  /**
   * The time label's colour (shown at 50%). Web inherits the surrounding
   * text colour — inside a chat bubble that is the bubble's text, not the
   * page foreground (dark bubbles are white with #111 text).
   */
  textColor?: string;
};

/**
 * Native port of web `AudioWaveform` (components/tts/audio-waveform.tsx) as
 * the transcript uses it: a LINE-green circular play button, then (after the
 * first play) a bar waveform coloured green up to the playback position and
 * the elapsed / total time.
 */
export function JapaneseLearningAudioWaveform({
  seed,
  textColor,
  waveId,
  onSeek,
  loading,
  playing,
  showWaveform,
  currentTime,
  duration,
  accessibilityLabel,
  disabled = false,
  onToggle,
}: AudioWaveformProps) {
  const { scheme, tokens } = useNemuTheme();
  const [width, setWidth] = useState(0);
  const barCount = width > 0 ? Math.max(8, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP))) : 0;
  const waveVersion = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        waveId ? subscribeJapaneseLearningWave(waveId, listener) : () => undefined,
      [waveId],
    ),
    () => (waveId ? getJapaneseLearningWaveVersion(waveId) : 0),
  );
  const fallbackDuration = useMemo(() => estimateJapaneseLearningWaveDuration(seed), [seed]);
  const wave = useMemo(
    () =>
      waveId && barCount > 0
        ? readJapaneseLearningWave(waveId, fallbackDuration, barCount)
        : null,
    // `waveVersion` is the store's change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [barCount, fallbackDuration, waveId, waveVersion],
  );
  const peaks = useMemo(
    () => wave?.peaks ?? (waveId ? [] : peaksForSeed(seed, barCount)),
    [barCount, seed, wave, waveId],
  );
  const active = loading || playing;
  // Web draws progress against the visual duration (the real one, or the
  // text's estimate while it is longer or unknown).
  const progressDuration = wave ? wave.duration : duration;
  const progress =
    playing && progressDuration && progressDuration > 0 && currentTime != null
      ? Math.min(1, Math.max(0, currentTime / progressDuration))
      : 0;

  // Web `seekFromPointer` on pointer down / move: only the playing audio.
  const seekStateRef = useRef({ enabled: false, width: 0, duration: 0, onSeek });
  seekStateRef.current = {
    enabled: Boolean(waveId && onSeek && playing),
    width,
    duration: wave?.duration ?? 0,
    onSeek,
  };
  const seekResponder = useMemo(() => {
    const seekTo = (x: number) => {
      const state = seekStateRef.current;
      const time = japaneseLearningWaveSeekTime(x, state.width, state.duration);
      if (time != null) state.onSeek?.(time);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => seekStateRef.current.enabled,
      onMoveShouldSetPanResponder: () => seekStateRef.current.enabled,
      // A scrub keeps the touch (the chat's scroll view does not take it over).
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => seekTo(event.nativeEvent.locationX),
      onPanResponderMove: (event) => seekTo(event.nativeEvent.locationX),
    });
  }, []);
  const timeText = loading
    ? "--:--"
    : playing && currentTime != null
      ? formatDuration(currentTime)
      : duration && duration > 0
        ? formatDuration(duration)
        : wave && wave.audioDuration > 0
          ? formatDuration(wave.audioDuration)
          : "--:--";
  const waveColor = JAPANESE_LEARNING_AUDIO_COLORS.wave[scheme === "dark" ? "dark" : "light"];

  return (
    <View style={[styles.row, showWaveform ? styles.rowExpanded : null]}>
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, busy: loading }}
        disabled={disabled}
        hapticFeedback="press"
        hitSlop={6}
        onPress={onToggle}
        pressedScale={0.95}
        style={[
          styles.playButton,
          {
            backgroundColor: JAPANESE_LEARNING_AUDIO_COLORS.button,
            opacity: loading && !playing ? 0.7 : disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <JapaneseLearningWebIcon
            name={active ? "pause" : "play"}
            size={14}
            color="#ffffff"
          />
        )}
      </NemuPressable>
      {showWaveform ? (
        <>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={styles.waveform}
            {...(waveId && onSeek ? seekResponder.panHandlers : {})}
          >
            {peaks.map((peak, index) => {
              const played = isJapaneseLearningWaveBarPlayed(index, barCount, progress);
              return (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      height: Math.max(BAR_MIN_HEIGHT, peak * WAVEFORM_HEIGHT),
                      backgroundColor: played ? JAPANESE_LEARNING_AUDIO_COLORS.progress : waveColor,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={[styles.time, { color: textColor ?? tokens.foreground }]}>{timeText}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowExpanded: {
    gap: 10,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  waveform: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: BAR_GAP,
    overflow: "hidden",
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
  },
  time: {
    fontSize: 11,
    opacity: 0.5,
    fontVariant: ["tabular-nums"],
  },
});
