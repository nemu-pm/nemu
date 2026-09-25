import { Host as SwiftHost, ProgressView } from "@expo/ui/swift-ui";
import {
  CircularProgressIndicator,
  Host as ComposeHost,
} from "@expo/ui/jetpack-compose";
import { size as composeSize } from "@expo/ui/jetpack-compose/modifiers";
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

const styles = StyleSheet.create({
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
