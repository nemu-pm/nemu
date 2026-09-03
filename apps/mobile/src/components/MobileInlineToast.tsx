import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  GlassSurface,
  NemuButton,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";

type MobileInlineToastProps = {
  title: string;
  detail?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onActionPress?: () => void;
};

/** Toast geometry embedded in a sheet rather than anchored to app chrome. */
export function MobileInlineToast({
  title,
  detail,
  actionLabel,
  actionDisabled = false,
  actionLoading = false,
  onActionPress,
}: MobileInlineToastProps) {
  const { tokens } = useNemuTheme();
  const announcement = [title, detail].filter(Boolean).join(". ");

  return (
    <GlassSurface
      intensity={32}
      style={styles.shell}
      contentStyle={styles.content}
    >
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="cloud-offline-outline"
        size={19}
        color={tokens.warning}
      />
      <View
        accessible
        accessibilityLabel={announcement}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.textBlock}
      >
        <Text
          numberOfLines={1}
          style={[styles.title, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            numberOfLines={2}
            style={[styles.detail, { color: tokens.mutedForeground }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        actionLoading ? (
          <ActivityIndicator size="small" color={tokens.primary} />
        ) : (
          <NemuButton
            disabled={actionDisabled}
            label={actionLabel}
            onPress={onActionPress}
            size="xs"
            variant="secondary"
          />
        )
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radius.tab,
  },
  content: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
});
