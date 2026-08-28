import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  MobileSheetScaffold,
  radius,
  nemuFontWeight,
  useNemuTheme,
  NemuButton,
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
  confirmDisabled?: boolean;
  destructive?: boolean;
  children?: ReactNode;
  onCancel: () => void;
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
  confirmDisabled = false,
  destructive = false,
  children,
  onCancel,
  onConfirm,
}: MobileConfirmationSheetProps) {
  const { tokens } = useNemuTheme();
  const accentColor = destructive ? tokens.danger : tokens.primary;

  // The sheet only reports a close once it has actually closed, so swallowing
  // it while loading would leave the caller's `visible` flag stuck true with
  // nothing on screen. Always let the dismissal through.
  const handleRequestClose = () => {
    void hapticPress();
    onCancel();
  };

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={handleRequestClose}
      dismissLabel={cancelLabel}
      // Pan-down stays off during an in-flight confirm so the sheet cannot be
      // swiped away by accident. The caller-provided label keeps an explicit
      // chrome Cancel route in addition to the Cancel button below.
      backdropDisabled={loading}
    >
      <View style={styles.header}>
        <View
          style={[styles.iconShell, { backgroundColor: `${accentColor}18` }]}
        >
          <Ionicons name={iconName} size={22} color={accentColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.description, { color: tokens.mutedForeground }]}>
            {description}
          </Text>
        </View>
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
          // Cancel stays live while the confirm is in flight — it is the
          // sheet's escape route. Callers that can abort should do so; the
          // rest let the operation settle in the background.
          hapticFeedback="none"
          label={cancelLabel}
          onPress={onCancel}
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
          variant={destructive ? "destructive" : "default"}
        />
      </View>
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    gap: 12,
  },
  iconShell: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
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
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
