import { StyleSheet, View } from "react-native";
import { nemuColorWithAlpha, NemuNativeProgressBar, useNemuTheme } from "@/design-system";
import { describeMobileJapaneseLearningPackLoading } from "@/lib/mobileJapaneseLearningAnalysisPackState";
import { useMobileJapaneseLearningAnalysisPackState } from "@/lib/mobileJapaneseLearningAnalysisPackStore";
import type { MobileStrings } from "@/lib/mobileI18n";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";

/**
 * First on-device analysis: the dictionary pack's download progress, shown
 * while the sentence waits for it. The only view of the sentence display
 * subscribed to byte counts, so a progress tick re-renders this line and its
 * bar, not the sentence and its details.
 */
export function JapaneseLearningPackLoadingStatus({ strings }: { strings: MobileStrings }) {
  const { tokens } = useNemuTheme();
  const loading = describeMobileJapaneseLearningPackLoading(
    useMobileJapaneseLearningAnalysisPackState(),
    strings,
  );
  if (!loading) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.packLoading}>
      <Text style={[styles.label, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.8) }]}>
        {loading.label}
      </Text>
      <NemuNativeProgressBar
        accessibilityLabel={strings.japaneseLearningDictionary.progressAccessibility}
        value={loading.progress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  packLoading: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
