import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState, type ComponentProps } from "react";
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
  nemuText,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getMobileStrings } from "@/lib/mobileI18n";
import { splitMobileInlineErrorDetail } from "@/lib/mobileSourceErrors";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

// The embedded variant lives inside fixed-height sheet bodies, so both the
// friendly description and the expanded diagnostic stay bounded. The sheet
// host turns scrollable as soon as its content outgrows the detent height.
const EMBEDDED_DESCRIPTION_MAX_LINES = 2;
const EMBEDDED_DIAGNOSTIC_MAX_LINES = 4;

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
  /** Optional override; the localized "Technical details" label is default. */
  diagnosticDetailsLabel?: string;
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
  diagnosticDetailsLabel,
}: MobileInlineErrorBannerProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const detailsLabel =
    diagnosticDetailsLabel ?? strings.feedback.technicalDetails;
  const accentColor = tone === "success" ? tokens.success : tokens.danger;
  const announcement = `${title}. ${detail}`;
  const { description, diagnostic } = splitMobileInlineErrorDetail(detail);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
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

  const embedded = variant === "embedded";

  const content = (
    <>
      <Ionicons name={iconName} size={18} color={accentColor} />
      <View style={styles.textBlock}>
        <View
          accessible={announce || undefined}
          accessibilityLabel={announce ? announcement : undefined}
          accessibilityLiveRegion={announce ? "polite" : undefined}
          accessibilityRole={announce ? "alert" : undefined}
        >
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {title}
          </Text>
          <Text
            numberOfLines={
              embedded ? EMBEDDED_DESCRIPTION_MAX_LINES : undefined
            }
            style={[styles.detail, { color: tokens.mutedForeground }]}
          >
            {embedded ? description : detail}
          </Text>
        </View>
        {embedded && diagnostic ? (
          <View style={styles.diagnostic}>
            <NemuPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: diagnosticOpen }}
              accessibilityLabel={detailsLabel}
              hapticFeedback="selection"
              pressProfile="row"
              onPress={() => setDiagnosticOpen((open) => !open)}
              style={styles.diagnosticToggle}
            >
              <Ionicons
                name={
                  diagnosticOpen
                    ? "chevron-down-outline"
                    : "chevron-forward-outline"
                }
                size={12}
                color={tokens.mutedForeground}
              />
              <Text
                style={[nemuText.caption, { color: tokens.mutedForeground }]}
              >
                {detailsLabel}
              </Text>
            </NemuPressable>
            {diagnosticOpen ? (
              <Text
                numberOfLines={EMBEDDED_DIAGNOSTIC_MAX_LINES}
                selectable
                style={[
                  styles.diagnosticBody,
                  styles.diagnosticMono,
                  {
                    backgroundColor: tokens.secondary,
                    color: tokens.mutedForeground,
                  },
                ]}
              >
                {diagnostic}
              </Text>
            ) : null}
          </View>
        ) : null}
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
          minimumTouchTarget
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
          minimumTouchTarget
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

const MONOSPACE_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

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
  diagnostic: {
    marginTop: 2,
    gap: 2,
  },
  diagnosticToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagnosticBody: {
    alignSelf: "stretch",
    padding: 10,
    borderRadius: 8,
  },
  diagnosticMono: {
    fontFamily: MONOSPACE_FONT_FAMILY,
    fontSize: 11,
    lineHeight: 15,
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
