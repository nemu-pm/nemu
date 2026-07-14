import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileSheetScaffold,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import { canRunMobileJapaneseLearningChatAction } from "@/lib/mobileJapaneseLearningChat";
import type { MobileStrings } from "@/lib/mobileI18n";

export interface JapaneseLearningPluginValues {
  autoDetect: boolean;
  enableForAllLanguages: boolean;
  minConfidence: number;
  nemuResponseMode: string;
}

function pluginValueText(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return `${Math.round(value * 100)}%`;
  if (typeof value === "string") return value;
  return String(value);
}

interface PluginLauncherSheetProps {
  visible: boolean;
  strings: MobileStrings;
  pluginName: string;
  pluginIcon: keyof typeof Ionicons.glyphMap;
  enabled: boolean;
  values: JapaneseLearningPluginValues;
  ocrLoading: boolean;
  chatLoading: boolean;
  onClose: () => void;
  onDetectText: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
}

/**
 * Compact plugin launcher sheet — the entry surface that shows plugin status
 * pills + the primary "Detect Text" / "Nemu Chat" actions + settings link.
 *
 * On web these are navbar action buttons (OcrNavbarIcon, NemuChatNavbarIcon);
 * mobile has no reader navbar popover, so this sheet serves as the launcher
 * that opens the OCR result sheet or chat drawer (the other two surfaces).
 */
export function JapaneseLearningPluginLauncherSheet({
  visible,
  strings,
  pluginName,
  pluginIcon,
  enabled,
  values,
  ocrLoading,
  chatLoading,
  onClose,
  onDetectText,
  onOpenChat,
  onOpenSettings,
}: PluginLauncherSheetProps) {
  const { tokens } = useNemuTheme();
  const canRunChat = canRunMobileJapaneseLearningChatAction(chatLoading, ocrLoading);

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      frameMaxHeight="auto"
      contentStyle={{ padding: 16, gap: 14 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: tokens.primary }]}>
          <Ionicons name={pluginIcon} size={20} color={tokens.primaryForeground} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: tokens.foreground }]} numberOfLines={1}>
            {pluginName}
          </Text>
          <Text
            style={[styles.subtitle, { color: tokens.mutedForeground }]}
            numberOfLines={1}
          >
            {enabled ? strings.reader.enabled : strings.reader.disabled}
          </Text>
        </View>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.reader.closePlugin}
          onPress={onClose}
          pressedScale={0.94}
          style={[styles.closeButton, { backgroundColor: tokens.muted }]}
        >
          <Ionicons name="close-outline" size={20} color={tokens.mutedForeground} />
        </NemuPressable>
      </View>

      {/* Status grid */}
      <View style={styles.statusGrid}>
        {(
          [
            [strings.reader.pluginAutoDetect, values.autoDetect],
            [strings.reader.pluginAllLanguages, values.enableForAllLanguages],
            [strings.reader.pluginConfidence, values.minConfidence],
            [strings.reader.pluginResponse, values.nemuResponseMode],
          ] as Array<[string, unknown]>
        ).map(([label, value]) => (
          <View
            key={label}
            style={[
              styles.statusPill,
              { backgroundColor: tokens.muted, borderColor: tokens.border },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.statusLabel, { color: tokens.mutedForeground }]}
            >
              {label}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.statusValue, { color: tokens.foreground }]}
            >
              {pluginValueText(value)}
            </Text>
          </View>
        ))}
      </View>

      {/* Primary action: Detect Text */}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={strings.reader.pluginJapaneseLearningDetectText}
        accessibilityState={{ disabled: ocrLoading }}
        disabled={ocrLoading}
        onPress={onDetectText}
        pressedScale={0.98}
        style={[
          styles.primaryAction,
          {
            backgroundColor: tokens.primary,
            opacity: ocrLoading ? 0.72 : 1,
          },
        ]}
      >
        {ocrLoading ? (
          <ActivityIndicator size="small" color={tokens.primaryForeground} />
        ) : (
          <Ionicons name="scan-outline" size={17} color={tokens.primaryForeground} />
        )}
        <Text style={[styles.primaryActionText, { color: tokens.primaryForeground }]}>
          {ocrLoading
            ? strings.reader.pluginJapaneseLearningDetectingText
            : strings.reader.pluginJapaneseLearningDetectText}
        </Text>
      </NemuPressable>

      {/* Secondary action: Nemu Chat */}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={strings.reader.pluginJapaneseLearningNemuChat}
        accessibilityState={{ disabled: !canRunChat }}
        disabled={!canRunChat}
        onPress={onOpenChat}
        pressedScale={0.98}
        style={[
          styles.secondaryAction,
          {
            backgroundColor: tokens.muted,
            borderColor: tokens.border,
            opacity: canRunChat ? 1 : 0.72,
          },
        ]}
      >
        {chatLoading ? (
          <ActivityIndicator size="small" color={tokens.foreground} />
        ) : (
          <Ionicons name="chatbubbles-outline" size={17} color={tokens.foreground} />
        )}
        <Text style={[styles.secondaryActionText, { color: tokens.foreground }]} numberOfLines={1}>
          {chatLoading
            ? strings.reader.pluginJapaneseLearningChatThinking
            : strings.reader.pluginJapaneseLearningNemuChat}
        </Text>
      </NemuPressable>

      {/* Settings link */}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={strings.settings.pluginSettings}
        onPress={onOpenSettings}
        pressedScale={0.98}
        style={[
          styles.settingsAction,
          {
            backgroundColor: tokens.card,
            borderColor: tokens.border,
          },
        ]}
      >
        <Ionicons name="settings-outline" size={16} color={tokens.mutedForeground} />
        <Text style={[styles.settingsText, { color: tokens.mutedForeground }]} numberOfLines={1}>
          {strings.settings.pluginSettings}
        </Text>
      </NemuPressable>
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: nemuFontWeight.regular,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: nemuFontWeight.regular,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.lg,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: nemuFontWeight.medium,
  },
  settingsAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settingsText: {
    fontSize: 14,
    fontWeight: nemuFontWeight.medium,
  },
});