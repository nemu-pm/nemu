import { useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, type ErrorBoundaryProps } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createNemuShadowStyle,
  nemuTokens,
  radius,
  spacing,
  nemuFontWeight,
} from "@/design-system";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  formatMobileErrorLog,
  formatMobileErrorSummary,
  resolveMobileErrorBoundaryLanguage,
} from "@/lib/mobileErrorBoundary";

type CopyState = "copied" | "failed" | null;

function systemLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export function MobileErrorBoundaryScreen({ error, retry }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const tokens = nemuTokens[scheme];
  const strings = getMobileStrings(resolveMobileErrorBoundaryLanguage(systemLocale()));
  const pathname = usePathname();
  const [retrying, setRetrying] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>(null);
  const logText = useMemo(
    () => formatMobileErrorLog({ error, routePath: pathname }),
    [error, pathname],
  );
  const summary = formatMobileErrorSummary(error);

  const copyLog = async () => {
    setCopyState(null);
    try {
      await Clipboard.setStringAsync(logText);
      setCopyState("copied");
      await hapticConfirm();
    } catch {
      setCopyState("failed");
      await hapticError();
    }
  };

  const retryRoute = async () => {
    if (retrying) return;
    setRetrying(true);
    setCopyState(null);
    try {
      await retry();
    } catch {
      await hapticError();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <BlurView
          intensity={24}
          tint={scheme}
          style={[
            styles.cardShell,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              ...createNemuShadowStyle({
                color: tokens.shadow,
                offsetY: 8,
                radius: 22,
                elevation: 8,
              }),
            },
          ]}
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={[styles.iconFrame, { backgroundColor: `${tokens.danger}18` }]}>
                <Ionicons name="alert-circle-outline" size={27} color={tokens.danger} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, { color: tokens.foreground }]}>
                  {strings.errorBoundary.title}
                </Text>
                <Text style={[styles.description, { color: tokens.mutedForeground }]}>
                  {strings.errorBoundary.description}
                </Text>
              </View>
            </View>

            <View style={[styles.messageBox, { backgroundColor: tokens.muted }]}>
              <Text style={[styles.boxLabel, { color: tokens.mutedForeground }]}>
                {strings.errorBoundary.messageLabel}
              </Text>
              <Text selectable style={[styles.messageText, { color: tokens.foreground }]}>
                {summary}
              </Text>
            </View>

            <View style={[styles.detailsBox, { backgroundColor: tokens.muted }]}>
              <Text style={[styles.boxLabel, { color: tokens.mutedForeground }]}>
                {strings.errorBoundary.detailsLabel}
              </Text>
              <ScrollView nestedScrollEnabled style={styles.detailsScroll}>
                <Text selectable style={[styles.detailsText, { color: tokens.mutedForeground }]}>
                  {logText}
                </Text>
              </ScrollView>
            </View>

            {copyState ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.copyState,
                  {
                    color:
                      copyState === "copied" ? tokens.success : tokens.danger,
                  },
                ]}
              >
                {copyState === "copied"
                  ? strings.errorBoundary.copied
                  : strings.errorBoundary.copyFailed}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.errorBoundary.copyLog}
                onPress={() => {
                  void copyLog();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: tokens.muted },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="copy-outline" size={17} color={tokens.mutedForeground} />
                <Text style={[styles.secondaryButtonText, { color: tokens.mutedForeground }]}>
                  {strings.errorBoundary.copyLog}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.errorBoundary.retry}
                accessibilityState={{ busy: retrying || undefined }}
                disabled={retrying}
                onPress={() => {
                  void retryRoute();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: tokens.primary,
                    opacity: retrying ? 0.72 : 1,
                  },
                  pressed && styles.buttonPressed,
                ]}
              >
                {retrying ? (
                  <ActivityIndicator size="small" color={tokens.primaryForeground} />
                ) : (
                  <Ionicons
                    name="refresh-outline"
                    size={17}
                    color={tokens.primaryForeground}
                  />
                )}
                <Text style={[styles.primaryButtonText, { color: tokens.primaryForeground }]}>
                  {retrying ? strings.errorBoundary.retrying : strings.errorBoundary.retry}
                </Text>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: spacing.pageTop,
    paddingBottom: 104,
    paddingHorizontal: spacing.pageX,
  },
  cardShell: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
  },
  card: {
    gap: 16,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    gap: 12,
  },
  iconFrame: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: nemuFontWeight.semibold,
  },
  description: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  messageBox: {
    gap: 7,
    borderRadius: radius.lg,
    padding: 12,
  },
  detailsBox: {
    maxHeight: 230,
    gap: 8,
    borderRadius: radius.lg,
    padding: 12,
  },
  detailsScroll: {
    maxHeight: 184,
  },
  boxLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.bold,
  },
  detailsText: {
    fontSize: 11,
    lineHeight: 16,
  },
  copyState: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  secondaryButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
});
