import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { radius } from "@/design/tokens";
import { nemuText } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { GlassSurface } from "./GlassSurface";
import { NemuButton } from "./NemuButton";

type NemuInlineEmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  tone?: "muted" | "danger";
  actionLabel?: string;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onActionPress?: () => void;
  testID?: string;
};

export function NemuInlineEmptyState({
  icon,
  title,
  description,
  tone = "muted",
  actionLabel,
  actionDisabled,
  actionLoading,
  onActionPress,
  testID,
}: NemuInlineEmptyStateProps) {
  const { tokens } = useNemuTheme();
  const iconColor = tone === "danger" ? tokens.danger : tokens.mutedForeground;

  return (
    <GlassSurface
      intensity={18}
      style={styles.shell}
      contentStyle={styles.content}
      testID={testID}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={styles.copy}>
        <Text style={[nemuText.body, styles.title, { color: tokens.mutedForeground }]}>
          {title}
        </Text>
        {description ? (
          <Text style={[nemuText.caption, { color: tokens.mutedForeground }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <NemuButton
          accessibilityLabel={actionLabel}
          disabled={actionDisabled}
          icon="refresh-outline"
          label={actionLabel}
          loading={actionLoading}
          onPress={onActionPress}
          size="sm"
          variant="secondary"
        />
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radius.xl,
  },
  content: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    flexShrink: 1,
  },
});
