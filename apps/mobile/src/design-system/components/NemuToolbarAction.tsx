import { ActivityIndicator, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { radius } from "@/design/tokens";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NemuPressable } from "./NemuPressable";

export type NemuToolbarActionModel = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  onPress: () => void;
};

export type NemuToolbarActionProps = NemuToolbarActionModel & {
  color?: string;
  testID?: string;
};

export function NemuToolbarAction({
  icon,
  label,
  hint,
  disabled,
  loading,
  danger,
  color,
  onPress,
  testID,
}: NemuToolbarActionProps) {
  const { tokens } = useNemuTheme();
  const resolvedDisabled = Boolean(disabled || loading);
  const foreground = color ?? (danger ? tokens.danger : tokens.primary);

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{
        disabled: resolvedDisabled,
        busy: loading || undefined,
      }}
      buttonDepth={danger ? "toolbar-danger" : "toolbar"}
      disabled={resolvedDisabled}
      onPress={onPress}
      pressedScale={0.94}
      style={[
        styles.action,
        {
          opacity: resolvedDisabled ? 0.56 : 1,
        },
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Ionicons name={icon} size={19} color={foreground} />
      )}
    </NemuPressable>
  );
}

export function NemuToolbarActionGroup({
  actions,
}: {
  actions: NemuToolbarActionProps[];
}) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.group}>
      {actions.map((action) => (
        <NemuToolbarAction key={action.label} {...action} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  action: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    overflow: "hidden",
  },
});
