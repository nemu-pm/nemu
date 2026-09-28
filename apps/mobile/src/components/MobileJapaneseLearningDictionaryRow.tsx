import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  NemuButton,
  NemuNativeProgressBar,
  NemuText,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  describeMobileJapaneseLearningPackRow,
  shouldStartMobileJapaneseLearningPackInstall,
} from "@/lib/mobileJapaneseLearningAnalysisPackState";
import {
  installMobileJapaneseLearningAnalysisPackNow,
  removeMobileJapaneseLearningAnalysisPackNow,
  useMobileJapaneseLearningAnalysisPackState,
} from "@/lib/mobileJapaneseLearningAnalysisPackStore";
import { normalizeMobileJapaneseLearningEnginePreference } from "@/lib/mobileJapaneseLearningEngine";

type MobileJapaneseLearningDictionaryRowProps = {
  /** The Recognition Engine setting's current value. */
  engine: unknown;
  strings: MobileStrings;
  disabled?: boolean;
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
}: MobileJapaneseLearningDictionaryRowProps) {
  const { tokens } = useNemuTheme();
  const packState = useMobileJapaneseLearningAnalysisPackState();
  const preference = normalizeMobileJapaneseLearningEnginePreference(engine);
  const previousPreferenceRef = useRef<typeof preference | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Choosing On Device / Automatic here starts the download right away.
  useEffect(() => {
    const previous = previousPreferenceRef.current;
    previousPreferenceRef.current = preference;
    if (
      shouldStartMobileJapaneseLearningPackInstall({
        previous,
        next: preference,
        state: packState,
      })
    ) {
      void installMobileJapaneseLearningAnalysisPackNow();
    }
    // Only a preference change may start an install, never a state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference]);

  const row = describeMobileJapaneseLearningPackRow(packState, strings, preference);
  if (!row) return null;
  const copy = strings.japaneseLearningDictionary;

  const runAction = async () => {
    if (!row.action || actionPending) return;
    setActionPending(true);
    try {
      const ok =
        row.action === "remove"
          ? await removeMobileJapaneseLearningAnalysisPackNow()
          : await installMobileJapaneseLearningAnalysisPackNow();
      await (ok ? hapticConfirm() : hapticError());
    } finally {
      setActionPending(false);
    }
  };

  const actionLabel =
    row.action === "remove"
      ? copy.remove
      : row.action === "retry"
        ? copy.retry
        : row.action === "download"
          ? copy.downloadNow
          : null;

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
                color:
                  packState.kind === "failed" ? tokens.danger : tokens.mutedForeground,
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
