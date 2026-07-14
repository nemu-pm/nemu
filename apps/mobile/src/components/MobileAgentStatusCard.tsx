import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { radius, nemuFontWeight, useNemuTheme } from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  fetchMobileAgentStatus,
  type MobileAgentStatus,
} from "@/lib/mobileAgentStatus";

const REFRESH_INTERVAL_MS = 30000;

export function MobileAgentStatusCard() {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [status, setStatus] = useState<MobileAgentStatus>({ available: true });

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

  const statusTitle = status.available
    ? strings.settings.agentBuiltInEnabled
    : strings.settings.agentNotRunning;
  const statusDetail = status.available
    ? strings.settings.agentReady
    : (status.detail ?? strings.settings.agentDescription);
  const statusColor = status.available ? tokens.success : tokens.danger;

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
            <Ionicons
              name={status.available ? "checkmark-circle-outline" : "alert-circle-outline"}
              size={19}
              color={statusColor}
            />
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
