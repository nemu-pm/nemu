import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileSheetScaffold,
  nemuFontWeight,
  NEMU_PROMINENT_CTA_SIZE,
  NemuButton,
  NemuText,
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

function pluginValueText(
  value: unknown,
  labels: Pick<MobileStrings["reader"], "pluginValueOn" | "pluginValueOff">,
): string {
  if (typeof value === "boolean") {
    return value ? labels.pluginValueOn : labels.pluginValueOff;
  }
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
  ocrUnavailableDetail?: string;
  chatLoading: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onDetectText: () => void;
  onOpenChat: () => void;
}

/**
 * Compact plugin launcher sheet — the entry surface that shows plugin status
 * pills + the primary "Detect Text" / "Nemu Chat" actions.
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
  ocrUnavailableDetail,
  chatLoading,
  onClose,
  onDismiss,
  onDetectText,
  onOpenChat,
}: PluginLauncherSheetProps) {
  const { tokens } = useNemuTheme();
  const canRunChat = canRunMobileJapaneseLearningChatAction(
    chatLoading,
    ocrLoading,
  );
  const canRunOcr = !ocrLoading && !ocrUnavailableDetail;

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      onDismiss={onDismiss}
      dismissLabel={strings.reader.closePlugin}
      frameMaxHeight="auto"
    >
      {/*
        The plugin mark belongs to the title, not to the sheet chrome: a
        leading header slot leaves the icon stranded in the top-left corner
        while the title stays optically centered. Compose both into one
        centered row and center the status line under it.
      */}
      <View style={styles.pluginHeader}>
        <View style={styles.pluginTitleRow}>
          <Ionicons
            name={pluginIcon}
            size={22}
            color={enabled ? tokens.primary : tokens.mutedForeground}
          />
          <NemuText
            accessibilityRole="header"
            color={tokens.foreground}
            density="compact"
            numberOfLines={2}
            style={styles.pluginTitle}
            variant="sheetTitle"
          >
            {pluginName}
          </NemuText>
        </View>
        <NemuText
          color={tokens.mutedForeground}
          density="compact"
          style={styles.pluginStatus}
          variant="caption"
        >
          {enabled ? strings.reader.enabled : strings.reader.disabled}
        </NemuText>
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
              {pluginValueText(value, strings.reader)}
            </Text>
          </View>
        ))}
      </View>

      {/* Primary action: Detect Text */}
      <NemuButton
        accessibilityLabel={strings.reader.pluginJapaneseLearningDetectText}
        disabled={!canRunOcr}
        icon="scan-outline"
        label={
          ocrLoading
            ? strings.reader.pluginJapaneseLearningDetectingText
            : strings.reader.pluginJapaneseLearningDetectText
        }
        loading={ocrLoading}
        onPress={onDetectText}
        size={NEMU_PROMINENT_CTA_SIZE}
        variant="default"
      />
      {ocrUnavailableDetail ? (
        <Text
          style={[styles.unavailableDetail, { color: tokens.mutedForeground }]}
        >
          {ocrUnavailableDetail}
        </Text>
      ) : null}

      {/* Secondary action: Nemu Chat */}
      <NemuButton
        accessibilityLabel={strings.reader.pluginJapaneseLearningNemuChat}
        disabled={!canRunChat}
        icon="chatbubbles-outline"
        label={
          chatLoading
            ? strings.reader.pluginJapaneseLearningChatThinking
            : strings.reader.pluginJapaneseLearningNemuChat
        }
        loading={chatLoading}
        onPress={onOpenChat}
        size={NEMU_PROMINENT_CTA_SIZE}
        variant="secondary"
      />

    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  pluginHeader: {
    alignItems: "center",
    gap: 4,
  },
  pluginTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pluginTitle: {
    flexShrink: 1,
    textAlign: "center",
  },
  pluginStatus: {
    textAlign: "center",
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
  unavailableDetail: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
