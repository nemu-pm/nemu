import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, type ComponentProps } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  GlassSurface,
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type MobileInlineErrorBannerProps = {
  title: string;
  detail: string;
  actionDisabled?: boolean;
  actionLabel?: string;
  actionLoading?: boolean;
  onActionPress?: () => void;
  dismissLabel?: string;
  iconName?: IoniconName;
  onDismiss?: () => void;
  /** Disable only when an owning live region already announces this message. */
  announce?: boolean;
  tone?: "danger" | "success";
  variant?: "glass" | "embedded";
};

export function MobileInlineErrorBanner({
  title,
  detail,
  actionDisabled = false,
  actionLabel,
  actionLoading = false,
  onActionPress,
  dismissLabel,
  iconName = "alert-circle-outline",
  onDismiss,
  announce = true,
  tone = "danger",
  variant = "glass",
}: MobileInlineErrorBannerProps) {
  const { tokens } = useNemuTheme();
  const accentColor = tone === "success" ? tokens.success : tokens.danger;
  const announcement = `${title}. ${detail}`;
  const lastAnnouncementRef = useRef<string | null>(null);

  useEffect(() => {
    if (!announce || Platform.OS !== "ios") {
      lastAnnouncementRef.current = null;
      return;
    }
    if (lastAnnouncementRef.current === announcement) return;
    lastAnnouncementRef.current = announcement;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announce, announcement]);

  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: `${accentColor}18` }]}>
        <Ionicons name={iconName} size={18} color={accentColor} />
      </View>
      <View
        accessible={announce || undefined}
        accessibilityLabel={announce ? announcement : undefined}
        accessibilityLiveRegion={announce ? "polite" : undefined}
        accessibilityRole={announce ? "alert" : undefined}
        style={styles.textBlock}
      >
        <Text style={[styles.title, { color: tokens.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.detail, { color: tokens.mutedForeground }]}>
          {detail}
        </Text>
      </View>
      {actionLabel && onActionPress ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{
            disabled: actionDisabled,
            busy: actionLoading || undefined,
          }}
          disabled={actionDisabled}
          onPress={onActionPress}
          pressedScale={0.94}
          style={[
            styles.actionButton,
            {
              backgroundColor: tokens.primary,
              opacity: actionDisabled ? 0.6 : 1,
            },
          ]}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color={tokens.primaryForeground} />
          ) : (
            <Text
              numberOfLines={1}
              style={[styles.actionText, { color: tokens.primaryForeground }]}
            >
              {actionLabel}
            </Text>
          )}
        </NemuPressable>
      ) : null}
      {dismissLabel && onDismiss ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          onPress={onDismiss}
          pressedScale={0.94}
          style={[styles.closeButton, { backgroundColor: tokens.muted }]}
        >
          <Ionicons
            name="close-outline"
            size={18}
            color={tokens.mutedForeground}
          />
        </NemuPressable>
      ) : null}
    </>
  );

  if (variant === "embedded") {
    return (
      <View
        style={[
          styles.embeddedShell,
          { backgroundColor: tokens.muted, borderColor: tokens.border },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <GlassSurface style={styles.shell} contentStyle={styles.content}>
      {content}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 68,
    borderRadius: radius.xl,
  },
  content: {
    // GlassSurface defaults its child to flex: 1. These banners have intrinsic
    // height, so Android Yoga otherwise resolves a long diagnostic against the
    // shell's minimum height and clips its final lines.
    flex: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
  },
  embeddedShell: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  detail: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  actionButton: {
    minWidth: 56,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 10,
  },
  actionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
});
