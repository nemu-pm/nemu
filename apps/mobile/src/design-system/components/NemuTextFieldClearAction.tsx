import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { useNemuTheme } from "@/design/useNemuTheme";
import { getMobileTextFieldTrailingAccessoryMargin } from "@/lib/mobileNativeSearchText";
import { NemuPressable } from "./NemuPressable";

type NemuTextFieldClearActionProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  /** Horizontal padding applied by the containing text-field shell. */
  trailingInset?: number;
};

/**
 * A trailing text-field clear action that mirrors iOS's xmark.circle.fill:
 * the glyph supplies the subtle circular plate while the touch target stays
 * transparent. Keep this free of Nemu button depth, shadows, and haptics so it
 * behaves like an inline native editing control on every platform.
 *
 * Keep this shared clone on iOS instead of `TextInput.clearButtonMode`: these
 * custom field shells coordinate the same trailing slot with loading/busy
 * accessories and expose stable test IDs. A native overlay cannot reliably
 * participate in that ordering, but this control preserves its no-scale,
 * dim-only feedback and the native 44pt target.
 */
export function NemuTextFieldClearAction({
  accessibilityLabel,
  disabled = false,
  onPress,
  testID,
  trailingInset,
}: NemuTextFieldClearActionProps) {
  const { tokens } = useNemuTheme();
  const [pressed, setPressed] = useState(false);
  const trailingMargin = getMobileTextFieldTrailingAccessoryMargin(trailingInset);

  useEffect(() => {
    // Native Pressable may omit onPressOut when its host becomes disabled.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient gesture state from that external lifecycle change
    if (disabled) setPressed(false);
  }, [disabled]);

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      containerStyle={[
        styles.hitTarget,
        Platform.OS === "android" ? styles.androidHitTarget : null,
        trailingMargin === 0 ? null : { marginEnd: trailingMargin },
      ]}
      disabled={disabled}
      hapticFeedback="none"
      hitSlop={0}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressAnimationEnabled={false}
      pressedScale={1}
      style={[
        styles.glyphFrame,
        { opacity: disabled ? 0.48 : pressed ? 0.62 : 1 },
      ]}
      testID={testID}
    >
      <Ionicons
        color={tokens.mutedForeground}
        name="close-circle"
        size={19}
      />
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  hitTarget: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  androidHitTarget: {
    width: 48,
    height: 48,
  },
  glyphFrame: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
