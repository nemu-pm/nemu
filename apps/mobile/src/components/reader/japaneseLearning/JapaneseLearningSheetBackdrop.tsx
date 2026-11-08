import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { JAPANESE_LEARNING_SHEET_BACKDROP } from "@/lib/mobileJapaneseLearningSheetBackdrop";

function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/**
 * Web `DrawerOverlay` for the compact learning sheets: a light dim + small
 * blur over the reader (and its chrome). Never takes touches — the native
 * sheet owns tap-outside dismissal. Reduce Transparency drops the blur for a
 * denser dim. Opacity follows the sheet's presentation progress.
 */
export function JapaneseLearningSheetBackdrop({ progress }: { progress: SharedValue<number> }) {
  const reduceTransparency = useReduceTransparency();
  const blur = !reduceTransparency && Platform.OS === "ios";
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, animatedStyle]}
    >
      {blur ? (
        <BlurView
          intensity={JAPANESE_LEARNING_SHEET_BACKDROP.blurIntensity}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: `rgba(0,0,0,${
              blur
                ? JAPANESE_LEARNING_SHEET_BACKDROP.dimOpacity
                : JAPANESE_LEARNING_SHEET_BACKDROP.reducedTransparencyDimOpacity
            })`,
          },
        ]}
      />
    </Animated.View>
  );
}
