import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  NemuButton,
  NemuText,
  nemuMaxFontSizeMultiplier,
  nemuText,
  useNemuTheme,
} from "@/design-system";
import { formatMobileList, formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import type { SearchSourceDisplay } from "@/lib/mobileSearch";
import { summarizeMobileSearchSourceNames } from "@/lib/mobileSearchResults";
import { MobileSearchSourceIcon } from "./MobileSearchSourceIcon";

function sourceList(sources: readonly Pick<SearchSourceDisplay, "name">[], strings: MobileStrings): string {
  const { names, overflow } = summarizeMobileSearchSourceNames(sources.map((source) => source.name));
  return formatMobileList(
    overflow > 0
      ? [...names, formatMobileString(strings.search.moreSourcesCount, { count: overflow })]
      : names,
    strings,
  );
}

/** Sources still searching: an inline native spinner and their names. */
export function MobileSearchSearchingLine({
  sources,
  strings,
  label: labelOverride,
}: {
  sources: readonly Pick<SearchSourceDisplay, "name">[];
  strings: MobileStrings;
  /** Replaces the "Searching A, B…" text (before the sources are known). */
  label?: string;
}) {
  const { tokens } = useNemuTheme();
  if (!sources.length && !labelOverride) return null;
  const label =
    labelOverride ??
    formatMobileString(strings.search.searchingSources, { sources: sourceList(sources, strings) });
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={styles.line}>
      <ActivityIndicator size="small" color={tokens.mutedForeground} />
      <NemuText
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        numberOfLines={2}
        style={[styles.lineText, { color: tokens.mutedForeground }]}
      >
        {label}
      </NemuText>
    </View>
  );
}

/** Every source that found nothing, in one quiet line instead of a card each. */
export function MobileSearchNoResultsLine({
  sources,
  strings,
}: {
  sources: readonly Pick<SearchSourceDisplay, "name">[];
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  if (!sources.length) return null;
  return (
    <NemuText
      maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
      style={[styles.lineText, styles.noResults, { color: tokens.mutedForeground }]}
    >
      {formatMobileString(strings.search.noResultsInSources, { sources: sourceList(sources, strings) })}
    </NemuText>
  );
}

/**
 * Sources that could not be searched for one reason: icon, their names and
 * the short reason, with Retry at the trailing edge — a compact row, not a
 * placeholder card per source.
 */
export function MobileSearchFailedSourceRow({
  sources,
  reason,
  detail,
  strings,
  onRetry,
}: {
  sources: readonly Pick<SearchSourceDisplay, "icon" | "name">[];
  reason: string;
  detail?: string;
  strings: MobileStrings;
  onRetry?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const names = sourceList(sources, strings);
  const first = sources[0];
  if (!first) return null;
  return (
    <View style={styles.failedRow}>
      <View
        accessible
        accessibilityLabel={[names, reason, detail].filter(Boolean).join(". ")}
        style={styles.failedCopy}
      >
        <MobileSearchSourceIcon source={sources.length === 1 ? first : {}} size={22} />
        <View style={styles.failedText}>
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={2}
            style={[nemuText.rowTitle, { color: tokens.foreground }]}
          >
            {names}
          </NemuText>
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={2}
            style={[nemuText.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {reason}
          </NemuText>
        </View>
      </View>
      {onRetry ? (
        <NemuButton
          accessibilityLabel={formatMobileString(strings.search.retrySourceAccessibility, { source: names })}
          label={strings.common.retry}
          onPress={onRetry}
          size="sm"
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lineText: {
    ...nemuText.rowSubtitle,
    flexShrink: 1,
    minWidth: 0,
  },
  noResults: {
    paddingVertical: 4,
  },
  failedRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  failedCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  failedText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
