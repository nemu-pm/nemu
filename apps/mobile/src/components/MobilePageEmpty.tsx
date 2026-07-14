import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuText, useNemuTheme, NemuButton } from "@/design-system";

type MobilePageEmptyProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  variant?: "full" | "inline";
  actionLabel?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
};

export function MobilePageEmpty({
  icon,
  title,
  description,
  variant = "full",
  actionLabel,
  onActionPress,
  actionDisabled,
  actionLoading,
}: MobilePageEmptyProps) {
  const { tokens } = useNemuTheme();
  const disabled = Boolean(actionDisabled || actionLoading);

  return (
    <View style={[styles.root, variant === "inline" ? styles.inlineRoot : null]}>
      <View style={styles.header}>
        <View style={[styles.media, { backgroundColor: tokens.muted }]}>
          <Ionicons name={icon} size={48} color={tokens.mutedForeground} />
        </View>
        <Text style={[nemuText.pageEmptyTitle, styles.title, { color: tokens.foreground }]}>
          {title}
        </Text>
        {description ? (
          <Text
            style={[
              nemuText.pageEmptyDescription,
              styles.description,
              { color: tokens.mutedForeground },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <NemuButton
          accessibilityLabel={actionLabel}
          disabled={disabled}
          icon="add-outline"
          label={actionLabel}
          loading={actionLoading}
          onPress={onActionPress}
          variant="default"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 48,
  },
  inlineRoot: {
    minHeight: 340,
  },
  header: {
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
  },
  media: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    marginBottom: 8,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
  },
});
