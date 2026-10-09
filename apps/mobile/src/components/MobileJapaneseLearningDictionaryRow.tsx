import { StyleSheet, View } from "react-native";
import {
  NemuButton,
  NemuNativeProgressBar,
  NemuText,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import { useMobileJapaneseLearningDictionaryRowModel } from "./useMobileJapaneseLearningDictionaryRowModel";

type MobileJapaneseLearningDictionaryRowProps = {
  /** The Recognition Engine setting's current value. */
  engine: unknown;
  strings: MobileStrings;
  disabled?: boolean;
  /** False for an off-screen copy that only measures the row: it must not start a second install. */
  autoInstall?: boolean;
};

/**
 * The on-device dictionary line under Japanese Learning → Recognition Engine:
 * status (size / live download progress / failure), and Download now, Retry
 * or Remove. Renders nothing where there is no on-device analyzer (Android,
 * builds without the vendored kernel).
 */
export function MobileJapaneseLearningDictionaryRow({
  engine,
  strings,
  disabled = false,
  autoInstall = true,
}: MobileJapaneseLearningDictionaryRowProps) {
  const { tokens } = useNemuTheme();
  const { row, copy, failed, actionLabel, actionPending, runAction } =
    useMobileJapaneseLearningDictionaryRowModel({ engine, strings, autoInstall });
  if (!row) return null;

  return (
    <View
      style={[styles.row, { borderColor: tokens.border }]}
      testID="JapaneseLearningDictionaryRow"
    >
      <View style={styles.line}>
        <View style={styles.text}>
          <NemuText
            density="compact"
            numberOfLines={1}
            style={[styles.title, { color: tokens.foreground }]}
          >
            {copy.title}
          </NemuText>
          <NemuText
            accessibilityLiveRegion="polite"
            density="compact"
            numberOfLines={2}
            style={[
              styles.subtitle,
              {
                color: failed ? tokens.danger : tokens.mutedForeground,
              },
            ]}
          >
            {row.status}
          </NemuText>
        </View>
        {actionLabel ? (
          <NemuButton
            accessibilityLabel={`${actionLabel}, ${copy.title}`}
            disabled={disabled || actionPending}
            label={actionLabel}
            loading={actionPending}
            onPress={() => {
              void runAction();
            }}
            size="sm"
            variant={row.action === "remove" ? "outline" : "secondary"}
          />
        ) : null}
      </View>
      {row.progress !== undefined ? (
        <NemuNativeProgressBar
          accessibilityLabel={copy.progressAccessibility}
          value={row.progress}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    justifyContent: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 4,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
});
