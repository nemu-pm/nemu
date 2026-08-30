import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  MobileSheetScaffold,
  NemuButton,
  NemuNativeProgressView,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticPress } from "@/lib/haptics";
import { getMobileStrings } from "@/lib/mobileI18n";
import { redactMobileCloudflareUrlForDisplay } from "@/lib/mobileSourceErrors";
import {
  shouldOfferNemuAgentVerificationAction,
  type NemuAgentSheetStatus,
} from "@/lib/nemuAgentSheetReducer";
import NemuAidoku from "../../modules/nemu-aidoku/src/NemuAidokuModule";

type MobileNemuAgentSheetProps = {
  visible: boolean;
  status: NemuAgentSheetStatus;
  url?: string;
  onVerify: () => void;
  onDismiss: () => void;
};

type StatusVisual = {
  /** Status-line copy shown under the title. */
  copy: string;
  /** Inline icon for terminal/idle states; `null` means show a spinner. */
  icon: keyof typeof Ionicons.glyphMap | null;
  /** Tint for the icon shell + status accent. */
  tone: "primary" | "success" | "danger";
};

const INFLIGHT_STATUSES: ReadonlySet<NemuAgentSheetStatus> = new Set([
  "opening",
  "waiting",
  "captcha",
]);

/**
 * Nemu Agent sheet for Cloudflare-classified failures. The native capability
 * flag is fail-closed: current iOS/Android builds explain that secure embedded
 * verification is unavailable and never offer a retry action that cannot work.
 *
 * Styling matches `MobileAgentStatusCard` (hardware-chip identity, token
 * colors, `radius.lg`) so the sheet reads as the same Nemu Agent the settings
 * page describes. All UI is imported from `@/design-system`.
 */
export function MobileNemuAgentSheet({
  visible,
  status,
  url,
  onVerify,
  onDismiss,
}: MobileNemuAgentSheetProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const secureVerificationAvailable = supportsSecureCloudflareVerification();
  const displayUrl = url ? redactMobileCloudflareUrlForDisplay(url) : undefined;

  const visual = statusVisual(status, strings, secureVerificationAvailable);
  const accentColor = toneColor(visual.tone, tokens);
  const inFlight = INFLIGHT_STATUSES.has(status);
  const showAction = shouldOfferNemuAgentVerificationAction(
    status,
    secureVerificationAvailable,
    Boolean(url),
  );
  const actionLabel = status === "failed" ? strings.common.retry : strings.common.agentVerify;

  const closeFromBackdrop = () => {
    void hapticPress();
    onDismiss();
  };

  const handleVerify = () => {
    onVerify();
  };

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={closeFromBackdrop}
    >
      <View style={styles.header}>
        <View style={[styles.iconShell, { backgroundColor: `${accentColor}18` }]}>
          <Ionicons name="hardware-chip-outline" size={22} color={accentColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.settings.agent}
          </Text>
          <Text style={[styles.description, { color: tokens.mutedForeground }]}>
            {visual.copy}
          </Text>
        </View>
      </View>

      <View
        style={[styles.statusRow, { backgroundColor: tokens.card, borderColor: tokens.border }]}
      >
        <View style={styles.statusBadge}>
          {visual.icon ? (
            <Ionicons name={visual.icon} size={18} color={accentColor} />
          ) : (
            <NemuNativeProgressView accessibilityLabel={visual.copy} />
          )}
        </View>
        <Text
          style={[styles.statusText, { color: tokens.foreground }]}
          numberOfLines={2}
        >
          {statusLabel(status, strings)}
        </Text>
      </View>

      {displayUrl ? (
        <View style={[styles.subjectPill, { backgroundColor: tokens.muted }]}>
          <Text numberOfLines={2} style={[styles.subjectText, { color: tokens.foreground }]}>
            {displayUrl}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.actionButton}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onDismiss}
          variant="secondary"
        />
        {showAction ? (
          <NemuButton
            accessibilityLabel={actionLabel}
            containerStyle={styles.actionButton}
            hapticFeedback="confirm"
            label={actionLabel}
            onPress={handleVerify}
            variant="default"
          />
        ) : secureVerificationAvailable && url ? (
          <NemuButton
            accessibilityLabel={strings.common.agentVerify}
            containerStyle={styles.actionButton}
            disabled
            hapticFeedback="none"
            label={strings.common.agentVerify}
            loading={inFlight}
            onPress={handleVerify}
            variant="default"
          />
        ) : null}
      </View>
    </MobileSheetScaffold>
  );
}

function statusVisual(
  status: NemuAgentSheetStatus,
  strings: ReturnType<typeof getMobileStrings>,
  secureVerificationAvailable: boolean,
): StatusVisual {
  if (!secureVerificationAvailable) {
    return {
      copy: strings.common.agentSheetUnavailable,
      icon: "shield-outline",
      tone: "danger",
    };
  }
  switch (status) {
    case "needs-verification":
      return {
        copy: strings.common.sourceCloudflareBlockedDescription,
        icon: "shield-outline",
        tone: "primary",
      };
    case "opening":
      return { copy: strings.common.agentSheetOpening, icon: null, tone: "primary" };
    case "waiting":
      return { copy: strings.common.agentSheetWaiting, icon: null, tone: "primary" };
    case "captcha":
      return { copy: strings.common.agentSheetCaptcha, icon: "alert-circle-outline", tone: "danger" };
    case "success":
      return { copy: strings.common.agentSheetSuccess, icon: "checkmark-circle-outline", tone: "success" };
    case "failed":
      return { copy: strings.common.agentSheetFailed, icon: "close-circle-outline", tone: "danger" };
    default:
      return {
        copy: strings.common.sourceCloudflareBlockedDescription,
        icon: "shield-outline",
        tone: "primary",
      };
  }
}

function supportsSecureCloudflareVerification(): boolean {
  try {
    return NemuAidoku.getHttpClientStatus().supportsCloudflareSolver === true;
  } catch {
    return false;
  }
}

function statusLabel(
  status: NemuAgentSheetStatus,
  strings: ReturnType<typeof getMobileStrings>,
): string {
  switch (status) {
    case "needs-verification":
      return strings.common.sourceCloudflareBlocked;
    case "opening":
      return strings.common.agentSheetOpening;
    case "waiting":
      return strings.common.agentSheetWaiting;
    case "captcha":
      return strings.common.agentSheetCaptcha;
    case "success":
      return strings.common.agentSheetSuccess;
    case "failed":
      return strings.common.sourceCloudflareBlocked;
    default:
      return strings.common.sourceCloudflareBlocked;
  }
}

function toneColor(
  tone: StatusVisual["tone"],
  tokens: ReturnType<typeof useNemuTheme>["tokens"],
): string {
  switch (tone) {
    case "success":
      return tokens.success;
    case "danger":
      return tokens.danger;
    case "primary":
    default:
      return tokens.primary;
  }
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statusBadge: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
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
