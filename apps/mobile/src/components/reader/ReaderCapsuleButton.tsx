import type { ComponentProps } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NemuPressable, NemuText, nemuFontWeight } from "@/design-system";
import { READER_CAPSULE_COLORS, ReaderCapsule } from "@/components/reader/ReaderCapsule";

/**
 * A labelled reader action in the chrome's capsule language (Retry, Next
 * chapter, Source settings on the reader's error / locked / offline states):
 * the same dark Liquid Glass as the chrome capsules, icon + label, 44pt
 * minimum height. `prominent` reads as the primary action (brighter tint).
 */
export function ReaderCapsuleButton({
  label,
  icon,
  onPress,
  prominent = false,
  accessibilityLabel,
  style,
  stopTouchPropagation = false,
}: {
  label: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  prominent?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Keep the tap from bubbling to the reader stage (which toggles the chrome). */
  stopTouchPropagation?: boolean;
}) {
  return (
    <ReaderCapsule
      pointerEvents="auto"
      tintColor={prominent ? READER_CAPSULE_BUTTON_PROMINENT_TINT : undefined}
      style={[styles.capsule, style]}
    >
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        hapticFeedback="press"
        onPress={onPress}
        onTouchEnd={stopTouchPropagation ? (event) => event.stopPropagation() : undefined}
        pressedScale={0.97}
        style={styles.button}
      >
        {icon ? <Ionicons name={icon} size={17} color={READER_CAPSULE_COLORS.primaryText} /> : null}
        <NemuText
          numberOfLines={1}
          style={[
            styles.label,
            { color: READER_CAPSULE_COLORS.primaryText },
            prominent ? styles.labelProminent : null,
          ]}
        >
          {label}
        </NemuText>
      </NemuPressable>
    </ReaderCapsule>
  );
}

/** A lighter glass tint for the primary action of a reader state. */
export const READER_CAPSULE_BUTTON_PROMINENT_TINT = "rgba(72,72,80,0.62)";

const styles = StyleSheet.create({
  capsule: {
    minHeight: 44,
    height: 44,
    alignSelf: "center",
  },
  button: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  labelProminent: {
    fontWeight: nemuFontWeight.semibold,
  },
});
