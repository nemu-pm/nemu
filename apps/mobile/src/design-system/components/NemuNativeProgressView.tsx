import { Host as SwiftHost, ProgressView } from "@expo/ui/swift-ui";
import {
  CircularProgressIndicator,
  Host as ComposeHost,
} from "@expo/ui/jetpack-compose";
import { Platform, StyleSheet, ActivityIndicator, View } from "react-native";
import { useNemuTheme } from "@/design/useNemuTheme";

type NemuNativeProgressViewProps = {
  accessibilityLabel?: string;
};

export function NemuNativeProgressView({
  accessibilityLabel,
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
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        style={styles.host}
      >
        <ComposeHost
          colorScheme={scheme}
          matchContents
          seedColor={tokens.primary}
          style={styles.composeHost}
        >
          <CircularProgressIndicator color={tokens.primary} />
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
  swiftHost: {
    minWidth: 28,
    minHeight: 28,
  },
  composeHost: {
    minWidth: 28,
    minHeight: 28,
  },
});
