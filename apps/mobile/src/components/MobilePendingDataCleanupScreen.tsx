import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import {
  createNemuShadowStyle,
  nemuFontWeight,
  nemuTokens,
  radius,
  spacing,
} from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";
import { resolveMobileErrorBoundaryLanguage } from "@/lib/mobileErrorBoundary";

function systemLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export function MobilePendingDataCleanupScreen({
  running,
  onRetry,
}: {
  running: boolean;
  onRetry: () => void;
}) {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const tokens = nemuTokens[scheme];
  const strings = getMobileStrings(
    resolveMobileErrorBoundaryLanguage(systemLocale()),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
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
          <View
            style={[styles.iconFrame, { backgroundColor: `${tokens.primary}18` }]}
          >
            {running ? (
              <ActivityIndicator size="small" color={tokens.primary} />
            ) : (
              <Ionicons
                name="shield-checkmark-outline"
                size={28}
                color={tokens.primary}
              />
            )}
          </View>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.settings.localDataCleanupTitle}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.description, { color: tokens.mutedForeground }]}
          >
            {strings.settings.localDataCleanupDescription}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.common.retry}
            accessibilityState={{
              busy: running || undefined,
              disabled: running,
            }}
            disabled={running}
            onPress={onRetry}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: tokens.primary,
                opacity: running ? 0.72 : pressed ? 0.84 : 1,
              },
            ]}
          >
            {running ? (
              <ActivityIndicator
                size="small"
                color={tokens.primaryForeground}
              />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={18}
                color={tokens.primaryForeground}
              />
            )}
            <Text
              style={[styles.buttonText, { color: tokens.primaryForeground }]}
            >
              {running
                ? strings.errorBoundary.retrying
                : strings.common.retry}
            </Text>
          </Pressable>
        </View>
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.pageX,
    paddingVertical: spacing.pageTop,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: 22,
  },
  iconFrame: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
  },
  title: {
    textAlign: "center",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: nemuFontWeight.semibold,
  },
  description: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    minHeight: 46,
    minWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
});
