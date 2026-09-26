import { useEffect } from "react";
import { Switch as ExpoSwitch } from "@expo/ui";
import { Host as SwiftHost } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  dynamicTypeSize,
  labelsHidden,
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
import { getNemuIosSwitchFrame } from "./nemuNativeSwitchMetrics";

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
    const frame = getNemuIosSwitchFrame(Platform.Version);
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        onAccessibilityTap={() => {
          if (!disabled) onValueChange(!value);
        }}
        style={[styles.host, { minHeight: frame.height }]}
      >
        {/*
          Host sized to the platform switch (51x31 before iOS 26, 63x28 from
          iOS 26 — see nemuNativeSwitchMetrics), no `matchContents`, and
          `ignoreSafeArea="all"`: UIHostingController applies the window's
          safe-area insets inside the host, so a switch sitting near the home
          indicator was laid out in a region shrunk by the bottom inset and
          drew above its own frame. A 51x31 frame on iOS 26+ let the wider
          switch paint 12pt past its measured bounds, clipped by the settings
          cards.

          `dynamicTypeSize("large")` pins the SwiftUI environment to the default
          text size for the same reason. SwiftUI's `Toggle` scales its control
          with Dynamic Type while UIKit's `UISwitch` never does, so at larger
          text sizes the drawn switch outgrew this measured frame. Pinned, the
          control stays the platform's own size at every Dynamic Type setting.
          The label is hidden, so no visible copy is held back from scaling.

          Accessibility: the RN wrapper exposes one named, actionable switch.
          Hide the SwiftUI subtree, which otherwise exposes both its labelled
          toggle and an unlabelled UIKit switch on iOS 27. Native touch handling
          remains on the toggle; VoiceOver activates the wrapper's action.
        */}
        <SwiftHost
          colorScheme={scheme}
          ignoreSafeArea="all"
          modifiers={[dynamicTypeSize("large")]}
          style={{ width: frame.width, height: frame.height }}
        >
          <ExpoSwitch
            disabled={disabled}
            label={accessibilityLabel}
            modifiers={[
              labelsHidden(),
              accessibilityHidden(),
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

// UISwitch is a fixed-size control. Giving the SwiftUI host its exact
// dimensions (instead of a min-size box it can seat its content at the top of)
// keeps the switch on the row's optical centre line in every list row; the
// size comes from `getNemuIosSwitchFrame` per render.
const styles = StyleSheet.create({
  host: {
    minWidth: 54,
    minHeight: 31,
    alignItems: "flex-end",
    justifyContent: "center",
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
