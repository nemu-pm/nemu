import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  MobileSheetScaffold,
  radius,
  nemuFontWeight,
  useNemuTheme,
  NemuButton,
  NEMU_PROMINENT_CTA_SIZE,
} from "@/design-system";
import { hapticPress } from "@/lib/haptics";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type MobileConfirmationSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmAccessibilityLabel?: string;
  subject?: string;
  iconName?: IoniconName;
  loading?: boolean;
  cancelDisabled?: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  /** Called after the native sheet has fully finished dismissing. */
  onDismiss?: () => void;
  onConfirm: () => void;
};

export function MobileConfirmationSheet({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmAccessibilityLabel,
  subject,
  iconName = "alert-circle-outline",
  loading = false,
  cancelDisabled = loading,
  confirmDisabled = false,
  destructive = false,
  children,
  onCancel,
  onDismiss,
  onConfirm,
}: MobileConfirmationSheetProps) {
  const { tokens } = useNemuTheme();

  const handleRequestClose = () => {
    // Non-abortable mutations keep every cancellation route disabled until
    // they settle. This prevents the native sheet and its caller from
    // disagreeing about whether an in-flight destructive action is visible.
    if (cancelDisabled) return;
    // A controlled `visible={false}` also completes through this callback.
    // Only turn a still-visible native dismissal into a cancellation intent;
    // explicit Cancel already sent that intent before asking React to hide it.
    if (!visible) return;
    void hapticPress();
    onCancel();
  };

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={handleRequestClose}
      onDismiss={onDismiss}
      showDismissButton={false}
      // Pan-down/backdrop dismissal follows the same availability as Cancel.
      backdropDisabled={loading || cancelDisabled}
    >
      {/*
        Same composed header as the plugin/source settings sheets: the glyph
        rides IN the centered title row instead of stranding in a leading
        slot above a centered title.
      */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name={iconName} size={20} color={tokens.mutedForeground} />
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.title, { color: tokens.foreground }]}
          >
            {title}
          </Text>
        </View>
        <Text
          numberOfLines={3}
          style={[styles.description, { color: tokens.mutedForeground }]}
        >
          {description}
        </Text>
      </View>
      {subject ? (
        <View style={[styles.subjectPill, { backgroundColor: tokens.muted }]}>
          <Text
            numberOfLines={2}
            style={[styles.subjectText, { color: tokens.foreground }]}
          >
            {subject}
          </Text>
        </View>
      ) : null}
      {children}
      <View style={styles.actions}>
        <NemuButton
          accessibilityLabel={cancelLabel}
          containerStyle={styles.actionButton}
          disabled={cancelDisabled}
          hapticFeedback="none"
          label={cancelLabel}
          onPress={onCancel}
          size={NEMU_PROMINENT_CTA_SIZE}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
          containerStyle={styles.actionButton}
          disabled={loading || confirmDisabled}
          hapticFeedback={destructive ? "warning" : "press"}
          label={confirmLabel}
          loading={loading}
          onPress={onConfirm}
          size={NEMU_PROMINENT_CTA_SIZE}
          variant={destructive ? "destructive" : "default"}
        />
      </View>
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  subjectPill: {
    minHeight: 42,
    justifyContent: "center",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subjectText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  actions: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10,
  },
  actionButton: {
    width: "100%",
  },
});
