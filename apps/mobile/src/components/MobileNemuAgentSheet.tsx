import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import {
  MobileNativeSheetScaffold,
  NemuButton,
  NemuNativeProgressView,
  NemuText,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuToneColor,
  radius,
  useNemuTheme,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticPress } from "@/lib/haptics";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  getNemuAgentSheetPresentation,
  type NemuAgentRowGlyph,
  type NemuAgentSheetAction,
} from "@/lib/mobileNemuAgentSheetPresentation";
import type {
  NemuAgentSheetInflightStatus,
  NemuAgentSheetStatus,
} from "@/lib/nemuAgentSheetReducer";
import { supportsMobileCloudflareSolver } from "@/lib/useNemuAgentSheet";

type MobileNemuAgentSheetProps = {
  visible: boolean;
  status: NemuAgentSheetStatus;
  url?: string;
  /** Machine-readable reason from the last native failure, when there is one. */
  failureReason?: string;
  /** The solve needed the user (native presented the challenge sheet). */
  interactive?: boolean;
  /** The in-flight step the last failure interrupted. */
  failedAt?: NemuAgentSheetInflightStatus;
  /** Overrides the native capability probe; production leaves it unset. */
  solverSupported?: boolean;
  onVerify: () => void;
  onDismiss: () => void;
};

/**
 * Nemu Agent sheet for Cloudflare-classified failures.
 *
 * Built like the app's settings sheets (reader-plugin and installed-source
 * settings): no chrome bar, a centered title row with a bare mark, one muted
 * description, then a hairline-bordered card of grouped rows, and a single
 * row of depth buttons. The rows are the solve's four steps — open the site,
 * automatic check, human check, resume — so each native event moves one
 * glyph rather than rewriting the sheet; the step and action model lives in
 * `mobileNemuAgentSheetPresentation.ts`.
 *
 * The native capability flag still gates everything: where
 * `supportsCloudflareSolver` is false the card is one row explaining that
 * verification is unavailable, and the only action closes the sheet.
 */
export function MobileNemuAgentSheet({
  visible,
  status,
  url,
  failureReason,
  interactive,
  failedAt,
  solverSupported,
  onVerify,
  onDismiss,
}: MobileNemuAgentSheetProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const presentation = getNemuAgentSheetPresentation(
    {
      status,
      url,
      failureReason,
      interactive,
      failedAt,
      solverSupported: solverSupported ?? supportsMobileCloudflareSolver(),
    },
    strings,
  );

  const closeFromSheet = () => {
    if (!visible) return;
    void hapticPress();
    onDismiss();
  };

  const runAction = (action: NemuAgentSheetAction) => {
    if (action.kind === "retry" || action.kind === "verify") {
      onVerify();
      return;
    }
    onDismiss();
  };

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={closeFromSheet}
      testID="NemuAgentSheet"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons
            name="hardware-chip-outline"
            size={22}
            color={tokens.primary}
          />
          <NemuText
            accessibilityRole="header"
            color={tokens.foreground}
            density="compact"
            numberOfLines={1}
            style={styles.title}
            variant="sheetTitle"
          >
            {strings.settings.agent}
          </NemuText>
        </View>
        <NemuText
          color={tokens.mutedForeground}
          density="compact"
          style={styles.description}
          variant="rowSubtitle"
        >
          {presentation.description}
        </NemuText>
      </View>

      <View
        accessible
        accessibilityLabel={presentation.accessibilitySummary}
        style={[
          styles.card,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        {presentation.rows.map((row, index) => {
          const muted = row.glyph === "pending";
          return (
            <View
              key={row.key}
              style={[
                styles.row,
                index > 0
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: tokens.border }
                  : null,
              ]}
            >
              <View style={styles.glyph}>
                <RowGlyph glyph={row.glyph} />
              </View>
              <View style={styles.rowText}>
                <NemuText
                  color={muted ? tokens.mutedForeground : tokens.foreground}
                  density="compact"
                  numberOfLines={1}
                  style={styles.rowTitle}
                >
                  {row.title}
                </NemuText>
                {row.detail ? (
                  <NemuText
                    color={
                      row.glyph === "failed" || row.glyph === "unavailable"
                        ? nemuToneColor(tokens, "danger")
                        : tokens.mutedForeground
                    }
                    density="compact"
                    style={styles.rowDetail}
                  >
                    {row.detail}
                  </NemuText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        {presentation.actions.map((action) => (
          <NemuButton
            key={action.kind}
            accessibilityLabel={action.label}
            containerStyle={styles.action}
            hapticFeedback={action.emphasis === "primary" ? "confirm" : "press"}
            label={action.label}
            onPress={() => runAction(action)}
            testID={`NemuAgentSheet:${action.kind}`}
            variant={action.emphasis === "primary" ? "default" : "secondary"}
          />
        ))}
      </View>
    </MobileNativeSheetScaffold>
  );
}

/** Bare state marks — no tinted wells behind them. */
function RowGlyph({ glyph }: { glyph: NemuAgentRowGlyph }) {
  const { tokens } = useNemuTheme();
  switch (glyph) {
    case "active":
      return <NemuNativeProgressView />;
    case "done":
      return (
        <Ionicons
          name="checkmark-circle"
          size={20}
          color={nemuToneColor(tokens, "success")}
        />
      );
    case "skipped":
      return (
        <Ionicons
          name="checkmark-circle-outline"
          size={20}
          color={tokens.mutedForeground}
        />
      );
    case "failed":
      return (
        <Ionicons
          name="close-circle"
          size={20}
          color={nemuToneColor(tokens, "danger")}
        />
      );
    case "unavailable":
      return (
        <Ionicons
          name="shield-outline"
          size={20}
          color={nemuToneColor(tokens, "danger")}
        />
      );
    case "shield":
      return <Ionicons name="shield-outline" size={20} color={tokens.primary} />;
    case "pending":
    default:
      return (
        <Ionicons
          name="ellipse-outline"
          size={20}
          color={nemuColorWithAlpha(tokens.mutedForeground, 0.55)}
        />
      );
  }
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    textAlign: "center",
  },
  description: {
    textAlign: "center",
  },
  card: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  glyph: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  rowDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
  },
});
