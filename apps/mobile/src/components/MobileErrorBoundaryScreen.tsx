import { useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, type ErrorBoundaryProps } from "expo-router";
import {
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// The root ErrorBoundary replaces the layout tree, so it renders ABOVE
// NemuThemeProvider (which itself needs the data store). The theme context is
// published from the design-system barrel so this screen can subscribe to it
// directly and still use the shared depth controls.
import {
  NemuButton,
  NemuPressable,
  NemuText,
  NemuThemeContext,
  type NemuTheme,
  nemuTokens,
  nemuText,
  radius,
  spacing,
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>(null);
  const logText = useMemo(
    () => formatMobileErrorLog({ error, routePath: pathname }),
    [error, pathname],
  );
  const summary = formatMobileErrorSummary(error);
  const theme = useMemo<NemuTheme>(
    () => ({
      // Motion-safe default: the boundary never runs the accessibility probe.
      reduceMotion: null,
      scheme,
      themePreference: "system",
      tokens,
      setThemePreference: () => Promise.resolve(),
    }),
    [scheme, tokens],
  );

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
    <NemuThemeContext.Provider value={theme}>
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Ionicons name="alert-circle-outline" size={44} color={tokens.danger} />
            <NemuText style={[nemuText.pageEmptyTitle, styles.centered, { color: tokens.foreground }]}>
              {strings.errorBoundary.title}
            </NemuText>
            <NemuText
              style={[
                nemuText.pageEmptyDescription,
                styles.centered,
                { color: tokens.mutedForeground },
              ]}
            >
              {strings.errorBoundary.description}
            </NemuText>
            <NemuText
              accessibilityLabel={`${strings.errorBoundary.messageLabel}: ${summary}`}
              selectable
              style={[nemuText.caption, styles.centered, { color: tokens.foreground }]}
            >
              {summary}
            </NemuText>
          </View>

          <View style={styles.diagnostic}>
            <NemuPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel={strings.errorBoundary.detailsLabel}
              hapticFeedback="selection"
              pressProfile="row"
              onPress={() => setDetailsOpen((open) => !open)}
              style={styles.diagnosticToggle}
            >
              <Ionicons
                name={detailsOpen ? "chevron-down-outline" : "chevron-forward-outline"}
                size={12}
                color={tokens.mutedForeground}
              />
              <NemuText style={[nemuText.caption, { color: tokens.mutedForeground }]}>
                {strings.errorBoundary.detailsLabel}
              </NemuText>
            </NemuPressable>
            {detailsOpen ? (
              <ScrollView nestedScrollEnabled style={styles.diagnosticScroll}>
                <NemuText
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
                  {logText}
                </NemuText>
              </ScrollView>
            ) : null}
          </View>

          {copyState ? (
            <NemuText
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={[
                nemuText.caption,
                styles.centered,
                {
                  color: copyState === "copied" ? tokens.success : tokens.danger,
                },
              ]}
            >
              {copyState === "copied"
                ? strings.errorBoundary.copied
                : strings.errorBoundary.copyFailed}
            </NemuText>
          ) : null}

          <View style={styles.actions}>
            <NemuButton
              accessibilityLabel={strings.errorBoundary.copyLog}
              icon="copy-outline"
              label={strings.errorBoundary.copyLog}
              onPress={() => {
                void copyLog();
              }}
              variant="secondary"
            />
            <NemuButton
              accessibilityLabel={strings.errorBoundary.retry}
              accessibilityState={{ busy: retrying || undefined }}
              disabled={retrying}
              icon="refresh-outline"
              label={
                retrying ? strings.errorBoundary.retrying : strings.errorBoundary.retry
              }
              loading={retrying}
              onPress={() => {
                void retryRoute();
              }}
              variant="default"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </NemuThemeContext.Provider>
  );
}

const MONOSPACE_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: spacing.pageTop,
    paddingBottom: 104,
    paddingHorizontal: spacing.pageX,
  },
  header: {
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
  },
  centered: {
    textAlign: "center",
  },
  diagnostic: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 4,
  },
  diagnosticToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagnosticScroll: {
    alignSelf: "stretch",
    maxHeight: 220,
  },
  diagnosticBody: {
    alignSelf: "stretch",
    padding: 10,
    borderRadius: radius.md,
  },
  diagnosticMono: {
    fontFamily: MONOSPACE_FONT_FAMILY,
    fontSize: 11,
    lineHeight: 15,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
});
