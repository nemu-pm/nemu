import { ExploreSettingsGlyph } from "@/components/explore/ExploreSettingsGlyph";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { radius, nemuFontWeight, useNemuTheme } from "@/design-system";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { MOBILE_EXPLORE_RADIUS } from "@/lib/mobileExploreRadius";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  fetchMobileAgentStatus,
  getMobileAgentCapability,
  type MobileAgentStatus,
} from "@/lib/mobileAgentStatus";

const REFRESH_INTERVAL_MS = 30000;

export function MobileAgentStatusCard() {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [status, setStatus] = useState<MobileAgentStatus | null>(null);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const nextStatus = await fetchMobileAgentStatus();
      if (!active) return;
      setStatus(nextStatus);
    };

    void refresh();
    const intervalId = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  const capability = status ? getMobileAgentCapability(status) : null;
  const statusTitle =
    capability === null
      ? strings.settings.loading
      : capability === "cloudflare-verification"
        ? strings.settings.agentBuiltInEnabled
        : capability === "native-networking"
          ? strings.settings.agentConnected
          : strings.settings.agentNotRunning;
  const statusDetail =
    capability === null
      ? strings.settings.agentProtectedCompatibility
      : capability === "cloudflare-verification"
        ? strings.settings.agentReady
        : capability === "native-networking"
          ? strings.settings.agentVerificationUnavailable
          : strings.settings.agentDescription;
  const statusColor =
    capability === "cloudflare-verification"
      ? tokens.success
      : capability === "native-networking"
        ? tokens.mutedForeground
        : tokens.danger;

  const statusGlyph =
    capability === null ? (
      <ActivityIndicator size="small" color={tokens.primary} />
    ) : (
      <Ionicons
        name={
          capability === "cloudflare-verification"
            ? mobileDesignExploreFlag
              ? "checkmark-circle"
              : "checkmark-circle-outline"
            : mobileDesignExploreFlag
              ? "alert-circle"
              : "alert-circle-outline"
        }
        size={19}
        color={statusColor}
      />
    );

  if (mobileDesignExploreFlag) {
    // Design-explore: one row of the Settings groups — the outline glyph, the
    // name and its state, the state's glyph on the trailing edge.
    return (
      <View
        accessible
        accessibilityLabel={`${strings.settings.agent}, ${statusTitle}, ${statusDetail}`}
        style={[
          styles.shell,
          styles.exploreShell,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View style={styles.exploreRow}>
          <ExploreSettingsGlyph name="hardware-chip-outline" />
          <View style={styles.headerText}>
            <Text style={[styles.exploreTitle, { color: tokens.foreground }]}>{strings.settings.agent}</Text>
            <Text style={[styles.statusTitle, { color: tokens.foreground }]}>{statusTitle}</Text>
            <Text style={[styles.statusDetail, { color: tokens.mutedForeground }]}>{statusDetail}</Text>
          </View>
          {statusGlyph}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconFrame}>
            <Ionicons name="hardware-chip-outline" size={20} color={tokens.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: tokens.foreground }]}>
              {strings.settings.agent}
            </Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, { color: tokens.foreground }]}>
              {statusTitle}
            </Text>
            <Text style={[styles.statusDetail, { color: tokens.mutedForeground }]}>
              {statusDetail}
            </Text>
          </View>
          <View
            accessibilityRole="image"
            accessibilityLabel={statusTitle}
            style={styles.statusIcon}
          >
            {statusGlyph}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 112,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    gap: 12,
    padding: 12,
  },
  exploreShell: {
    minHeight: 0,
    borderRadius: MOBILE_EXPLORE_RADIUS.group,
    borderCurve: "continuous",
  },
  exploreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  exploreTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.medium,
    marginBottom: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  statusCard: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 36,
    paddingRight: 12,
    paddingVertical: 4,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  statusDetail: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  statusIcon: {
    minWidth: 74,
    minHeight: 34,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
