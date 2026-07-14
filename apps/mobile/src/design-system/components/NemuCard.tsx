import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { radius } from "@/design/tokens";
import { useNemuTheme } from "@/design/useNemuTheme";
import { GlassSurface } from "./GlassSurface";
import { NemuPressable } from "./NemuPressable";

type NemuCardProps = {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function NemuCard({
  children,
  contentStyle,
  disabled,
  onPress,
  style,
  testID,
}: NemuCardProps) {
  const { tokens } = useNemuTheme();
  const card = (
    <GlassSurface
      contentStyle={[styles.content, contentStyle]}
      style={[styles.shell, style]}
      testID={testID}
    >
      {children}
    </GlassSurface>
  );

  if (!onPress) return card;

  return (
    <NemuPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.985}
      style={[
        styles.pressable,
        {
          opacity: disabled ? 0.58 : 1,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      {card}
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.xl,
  },
  shell: {
    borderRadius: radius.xl,
  },
  content: {
    padding: 16,
  },
});
