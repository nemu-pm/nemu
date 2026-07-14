import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text } from "react-native";
import {
  MobileCachedImage,
  nemuFontWeight,
  useNemuTheme,
  NemuPressable,
} from "@/design-system";

type MobileSourceChipProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "checkbox" | "tab";
  onPress: () => void;
  onLongPress?: () => void;
};

export function MobileSourceChip({
  label,
  selected,
  disabled = false,
  icon,
  fallbackIcon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  onPress,
  onLongPress,
}: MobileSourceChipProps) {
  const { tokens } = useNemuTheme();
  const foregroundColor = selected ? tokens.primaryForeground : tokens.mutedForeground;
  const accessibilityState =
    accessibilityRole === "checkbox"
      ? { checked: selected, disabled }
      : { selected, disabled };

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      buttonDepth={selected ? "chip-selected" : "chip"}
      disabled={disabled}
      hapticFeedback={disabled ? "none" : "selection"}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      pressedScale={0.97}
      style={[
        styles.root,
        {
          opacity: disabled ? 0.58 : 1,
        },
      ]}
    >
      {icon ? (
        <MobileCachedImage
          fallback={
            fallbackIcon ? (
              <Ionicons name={fallbackIcon} size={16} color={foregroundColor} />
            ) : null
          }
          uriOwnership="source"
          source={{ uri: icon }}
          style={styles.iconImage}
        />
      ) : fallbackIcon ? (
        <Ionicons name={fallbackIcon} size={16} color={foregroundColor} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, { color: foregroundColor }]}
      >
        {label}
      </Text>
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 30,
    maxWidth: 154,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  iconImage: {
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 4,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
});
