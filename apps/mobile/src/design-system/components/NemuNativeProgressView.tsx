import { Host as SwiftHost, ProgressView } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import {
  CircularProgressIndicator,
  Host as ComposeHost,
  LinearProgressIndicator,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxWidth,
  size as composeSize,
} from "@expo/ui/jetpack-compose/modifiers";
import { Platform, StyleSheet, ActivityIndicator, View } from "react-native";
import { useNemuTheme } from "@/design/useNemuTheme";
import { resolveNemuProgressIndicatorMetrics } from "./nemuProgressIndicatorMetrics";

type NemuNativeProgressViewProps = {
  accessibilityLabel?: string;
  /**
   * Diameter in dp. Honoured exactly on Android, where Material's
   * `CircularProgressIndicator` otherwise draws at its own 40dp. iOS keeps the
   * platform `ProgressView` at its natural size in the historic 28pt host.
   */
  size?: number;
};

export function NemuNativeProgressView({
  accessibilityLabel,
  size,
}: NemuNativeProgressViewProps) {
  const { scheme, tokens } = useNemuTheme();

  if (Platform.OS === "ios") {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        style={styles.host}
      >
        <SwiftHost colorScheme={scheme} matchContents style={styles.swiftHost}>
          <ProgressView />
        </SwiftHost>
      </View>
    );
  }

  if (Platform.OS === "android") {
    const metrics = resolveNemuProgressIndicatorMetrics(size);
    const box = { width: metrics.size, height: metrics.size };
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        style={[styles.androidHost, box]}
      >
        <ComposeHost colorScheme={scheme} seedColor={tokens.primary} style={box}>
          <CircularProgressIndicator
            color={tokens.primary}
            modifiers={[composeSize(metrics.size, metrics.size)]}
            strokeWidth={metrics.strokeWidth}
          />
        </ComposeHost>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.host}
    >
      <ActivityIndicator color={tokens.primary} />
    </View>
  );
}

type NemuNativeProgressBarProps = {
  accessibilityLabel?: string;
  /** 0…1; `null` draws the platform's indeterminate bar. */
  value: number | null;
};

/**
 * Full-width linear progress: SwiftUI `ProgressView(value:)` on iOS, Material
 * `LinearProgressIndicator` on Android, both tinted with the Nemu primary.
 */
export function NemuNativeProgressBar({
  accessibilityLabel,
  value,
}: NemuNativeProgressBarProps) {
  const { scheme, tokens } = useNemuTheme();
  const clamped = value == null ? null : Math.min(1, Math.max(0, value));
  const accessibilityValue =
    clamped == null
      ? undefined
      : { min: 0, max: 100, now: Math.round(clamped * 100) };

  if (Platform.OS === "ios") {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        accessibilityValue={accessibilityValue}
        style={styles.barHost}
      >
        <SwiftHost
          colorScheme={scheme}
          matchContents={{ vertical: true }}
          style={styles.barHost}
        >
          <ProgressView
            modifiers={[tint(tokens.primary)]}
            value={clamped}
          />
        </SwiftHost>
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        accessibilityValue={accessibilityValue}
        style={styles.barHost}
      >
        <ComposeHost colorScheme={scheme} seedColor={tokens.primary} style={styles.barHost}>
          <LinearProgressIndicator
            color={tokens.primary}
            modifiers={[fillMaxWidth()]}
            progress={clamped}
          />
        </ComposeHost>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={accessibilityValue}
      style={[styles.webTrack, { backgroundColor: tokens.muted }]}
    >
      <View
        style={[
          styles.webFill,
          { backgroundColor: tokens.primary, width: `${(clamped ?? 0.3) * 100}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  barHost: {
    alignSelf: "stretch",
    minHeight: 6,
  },
  webTrack: {
    alignSelf: "stretch",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  webFill: {
    height: 4,
    borderRadius: 2,
  },
  host: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  androidHost: {
    alignItems: "center",
    justifyContent: "center",
  },
  swiftHost: {
    minWidth: 28,
    minHeight: 28,
  },
});
