import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuText, useNemuTheme, NemuButton } from "@/design-system";
import { shouldUseCompactMobilePageEmptyLayout } from "@/lib/mobilePageEmptyLayout";

type MobilePageEmptyProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  variant?: "full" | "inline";
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
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
  actionIcon = "add-outline",
  onActionPress,
  actionDisabled,
  actionLoading,
}: MobilePageEmptyProps) {
  const { tokens } = useNemuTheme();
  const { height } = useWindowDimensions();
  const compactHeight = shouldUseCompactMobilePageEmptyLayout(height);
  const disabled = Boolean(actionDisabled || actionLoading);

  return (
    <View
      style={[
        styles.root,
        variant === "inline" ? styles.inlineRoot : null,
        compactHeight ? styles.compactRoot : null,
      ]}
    >
      <View style={[styles.header, compactHeight ? styles.compactHeader : null]}>
        <View
          style={[
            styles.media,
            compactHeight ? styles.compactMedia : null,
            { backgroundColor: tokens.muted },
          ]}
        >
          <Ionicons
            name={icon}
            size={compactHeight ? 28 : 48}
            color={tokens.mutedForeground}
          />
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
          icon={actionIcon}
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
  compactRoot: {
    minHeight: 0,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  header: {
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
  },
  compactHeader: {
    gap: 4,
  },
  media: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    marginBottom: 8,
  },
  compactMedia: {
    width: 56,
    height: 56,
    marginBottom: 2,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
  },
});
