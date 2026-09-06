import { useEffect } from "react";
import { Switch as ExpoSwitch } from "@expo/ui";
import { Host as SwiftHost } from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  dynamicTypeSize,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Platform, Pressable, StyleSheet, Switch as RNSwitch, View } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design/useNemuTheme";
import { hapticSelection } from "@/lib/haptics";

const SHADCN_SWITCH_WIDTH = 32;
const SHADCN_SWITCH_HEIGHT = 18.4;
const SHADCN_THUMB_SIZE = 16;
const SHADCN_THUMB_INSET = (SHADCN_SWITCH_HEIGHT - SHADCN_THUMB_SIZE) / 2;
const SHADCN_THUMB_TRAVEL =
  SHADCN_SWITCH_WIDTH - SHADCN_THUMB_SIZE - SHADCN_THUMB_INSET * 2;

type NemuNativeSwitchProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function ShadcnAndroidSwitch({
  accessibilityLabel,
  disabled = false,
  testID,
  value,
  onValueChange,
}: NemuNativeSwitchProps) {
  const { scheme, tokens } = useNemuTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          SHADCN_THUMB_INSET + progress.value * SHADCN_THUMB_TRAVEL,
      },
    ],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      testID={testID}
      onPress={() => {
        if (disabled) return;
        void hapticSelection();
        onValueChange(!value);
      }}
      style={[styles.host, disabled ? styles.disabled : null]}
    >
      <View
        style={[
          styles.shadcnTrack,
          {
            backgroundColor: value ? tokens.primary : tokens.muted,
            borderColor: "transparent",
          },
        ]}
      >
        <Reanimated.View
          style={[
            styles.shadcnThumb,
            {
              backgroundColor:
                scheme === "dark" && !value
                  ? tokens.foreground
                  : tokens.background,
            },
            thumbStyle,
          ]}
        />
      </View>
    </Pressable>
  );
}

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
        {/*
          Fixed 51x31 host (no `matchContents`), and `ignoreSafeArea="all"`:
          UIHostingController applies the window's safe-area insets inside the
          host, so a switch sitting near the home indicator was laid out in a
          region shrunk by the bottom inset and drew above its own frame. The
          RN layout was already centred (measured); only the SwiftUI drawing
          moved.

          `dynamicTypeSize("large")` pins the SwiftUI environment to the default
          text size for the same reason. SwiftUI's `Toggle` scales its control
          with Dynamic Type while UIKit's `UISwitch` never does, so at larger
          text sizes the drawn switch outgrew this measured frame and any
          ancestor clipping its bounds (the settings cards) sheared the
          trailing edge off. Pinned, the control stays the platform's own
          51x31 at every Dynamic Type setting, so what Yoga reserves is exactly
          what SwiftUI paints. Nothing inside the host is text, so no copy is
          held back from scaling.
        */}
        <SwiftHost
          colorScheme={scheme}
          ignoreSafeArea="all"
          modifiers={[dynamicTypeSize("large")]}
          style={styles.swiftHost}
        >
          <ExpoSwitch
            disabled={disabled}
            modifiers={[
              swiftAccessibilityLabel(accessibilityLabel),
              tint(tokens.primary),
            ]}
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
      <ShadcnAndroidSwitch
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        testID={testID}
        value={value}
        onValueChange={onValueChange}
      />
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

// UISwitch is a fixed 51x31 control. Giving the SwiftUI host those exact
// dimensions (instead of a min-size box it can seat its content at the top of)
// keeps the switch on the row's optical centre line in every list row.
const IOS_SWITCH_WIDTH = 51;
const IOS_SWITCH_HEIGHT = 31;

const styles = StyleSheet.create({
  host: {
    minWidth: 54,
    minHeight: IOS_SWITCH_HEIGHT,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  swiftHost: {
    width: IOS_SWITCH_WIDTH,
    height: IOS_SWITCH_HEIGHT,
  },
  disabled: {
    opacity: 0.5,
  },
  shadcnTrack: {
    width: SHADCN_SWITCH_WIDTH,
    height: SHADCN_SWITCH_HEIGHT,
    borderRadius: SHADCN_SWITCH_HEIGHT / 2,
    borderWidth: 1,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  shadcnThumb: {
    position: "absolute",
    left: 0,
    width: SHADCN_THUMB_SIZE,
    height: SHADCN_THUMB_SIZE,
    borderRadius: SHADCN_THUMB_SIZE / 2,
  },
});
