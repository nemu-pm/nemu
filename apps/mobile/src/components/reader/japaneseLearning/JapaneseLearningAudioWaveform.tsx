import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NemuPressable, useNemuTheme } from "@/design-system";
import { JAPANESE_LEARNING_AUDIO_COLORS } from "@/lib/mobileJapaneseLearningSurfaceTheme";

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
  loading: boolean;
  playing: boolean;
  /** Web `showWaveform`: bars appear once this audio has been played. */
  showWaveform: boolean;
  currentTime?: number;
  duration?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * Native port of web `AudioWaveform` (components/tts/audio-waveform.tsx) as
 * the transcript uses it: a LINE-green circular play button, then (after the
 * first play) a bar waveform coloured green up to the playback position and
 * the elapsed / total time.
 */
export function JapaneseLearningAudioWaveform({
  seed,
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
  const peaks = useMemo(() => peaksForSeed(seed, barCount), [barCount, seed]);
  const active = loading || playing;
  const progress =
    playing && duration && duration > 0 && currentTime != null
      ? Math.min(1, Math.max(0, currentTime / duration))
      : 0;
  const timeText = loading
    ? "--:--"
    : playing && currentTime != null
      ? formatDuration(currentTime)
      : duration && duration > 0
        ? formatDuration(duration)
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
        minimumTouchTarget
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
          <Ionicons
            name={active ? "pause" : "play"}
            size={14}
            color="#ffffff"
            style={active ? null : styles.playGlyph}
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
          >
            {peaks.map((peak, index) => {
              const x = index * (BAR_WIDTH + BAR_GAP);
              const played = x + BAR_WIDTH <= progress * (barCount * (BAR_WIDTH + BAR_GAP) - BAR_GAP) + 0.5;
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
          <Text style={[styles.time, { color: tokens.foreground }]}>{timeText}</Text>
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
  playGlyph: {
    marginLeft: 2,
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
