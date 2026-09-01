import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { createNemuShadowStyle } from "@/design/shadows";
import { radius } from "@/design/tokens";
import { nemuFontWeight, nemuMaxFontSizeMultiplier } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  isMobileHeaderActionDisabled,
  type MobileHeaderActionState,
} from "@/lib/mobileHeaderActions";
import { getMobileStrings } from "@/lib/mobileI18n";
import { NemuToolbarAction } from "./NemuToolbarAction";
import { MobileCachedImage } from "./MobileCachedImage";
import { NemuPressable } from "./NemuPressable";

export type PageHeaderAction = MobileHeaderActionState & {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  color?: string;
};

type PageHeaderProps = {
  title: string;
  titleIconUri?: string;
  loading?: boolean;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  leadingAccessibilityLabel?: string;
  onLeadingPress?: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  actionHint?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  actions?: PageHeaderAction[];
};

export function PageHeader({
  title,
  titleIconUri,
  loading,
  leadingIcon,
  leadingAccessibilityLabel,
  onLeadingPress,
  actionIcon,
  actionLabel,
  actionHint,
  onActionPress,
  actionDisabled,
  actionLoading,
  actions,
}: PageHeaderProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const resolvedActions =
    actions ??
    (actionIcon && onActionPress
      ? [
          {
            icon: actionIcon,
            label: actionLabel ?? title,
            hint: actionHint,
            onPress: onActionPress,
            disabled: actionDisabled,
            loading: actionLoading,
          },
        ]
      : []);

  return (
    <View style={styles.root}>
      {leadingIcon && onLeadingPress ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={leadingAccessibilityLabel ?? strings.common.back}
          onPress={onLeadingPress}
          style={[
            styles.leading,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              ...createNemuShadowStyle({
                color: tokens.shadow,
                offsetY: 4,
                radius: 12,
                elevation: 5,
              }),
            },
          ]}
        >
          <Ionicons name={leadingIcon} size={21} color={tokens.foreground} />
        </NemuPressable>
      ) : null}
      <View style={styles.titleRow}>
        {titleIconUri ? (
          <MobileCachedImage
            accessible={false}
            fallback={<View style={styles.titleIcon} />}
            uriOwnership="source"
            source={{ uri: titleIconUri }}
            style={styles.titleIcon}
          />
        ) : null}
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={1}
          style={[styles.title, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        {loading ? <ActivityIndicator color={tokens.primary} /> : null}
      </View>
      {resolvedActions.length ? (
        <View style={styles.actions}>
          {resolvedActions.map((action) => {
            const disabled = isMobileHeaderActionDisabled(action);
            return (
              <NemuToolbarAction
                key={action.label}
                color={action.color}
                disabled={disabled}
                hint={action.hint}
                icon={action.icon}
                label={action.label}
                loading={action.loading}
                onPress={action.onPress}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  titleRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leading: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
