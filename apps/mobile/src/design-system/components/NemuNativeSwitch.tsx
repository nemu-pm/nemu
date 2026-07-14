import { Switch as ExpoSwitch } from "@expo/ui";
import {
  Host as ComposeHost,
  Switch as ComposeSwitch,
} from "@expo/ui/jetpack-compose";
import { testID as composeTestID } from "@expo/ui/jetpack-compose/modifiers";
import { Host as SwiftHost } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, Switch as RNSwitch, View } from "react-native";
import { useNemuTheme } from "@/design/useNemuTheme";

type NemuNativeSwitchProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function NemuNativeSwitch({
  accessibilityLabel,
  disabled = false,
  testID,
  value,
  onValueChange,
}: NemuNativeSwitchProps) {
  const { scheme, tokens } = useNemuTheme();

  if (Platform.OS === "ios") {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        style={styles.host}
      >
        <SwiftHost colorScheme={scheme} matchContents style={styles.swiftHost}>
          <ExpoSwitch
            disabled={disabled}
            modifiers={[tint(tokens.primary)]}
            testID={testID}
            value={value}
            onValueChange={onValueChange}
          />
        </SwiftHost>
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        style={styles.host}
      >
        <ComposeHost
          colorScheme={scheme}
          matchContents
          seedColor={tokens.primary}
          style={styles.composeHost}
        >
          <ComposeSwitch
            enabled={!disabled}
            value={value}
            modifiers={testID ? [composeTestID(testID)] : undefined}
            colors={{
              checkedThumbColor: tokens.primaryForeground,
              checkedTrackColor: tokens.primary,
              uncheckedThumbColor: tokens.card,
              uncheckedTrackColor: tokens.muted,
              uncheckedBorderColor: tokens.border,
            }}
            onCheckedChange={onValueChange}
          />
        </ComposeHost>
      </View>
    );
  }

  return (
    <RNSwitch
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      ios_backgroundColor={tokens.muted}
      testID={testID}
      trackColor={{ false: tokens.muted, true: tokens.primary }}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

const styles = StyleSheet.create({
  host: {
    minWidth: 54,
    minHeight: 32,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  swiftHost: {
    minWidth: 54,
    minHeight: 32,
  },
  composeHost: {
    minWidth: 54,
    minHeight: 32,
  },
});
