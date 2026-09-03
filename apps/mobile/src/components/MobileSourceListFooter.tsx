import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  NemuButton,
  NemuText,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import {
  formatMobileString,
  type MobileStrings,
} from "@/lib/mobileI18n";

export type MobileSourceListFooterState = {
  /** A page request is in flight. */
  busy: boolean;
  /** The next page failed while previous items were already visible. */
  failed: boolean;
  /** More pages exist and the list is idle — shows the fallback button. */
  hasMore: boolean;
  /** Page number of the page being loaded (for the loading caption). */
  loadingPage?: number;
  /** Total rendered items (for the exhausted caption). */
  total: number;
};

/**
 * Three-state list footer for source browsing: loading page N, exhausted
 * (with total), and a stacked error row with a retry pill. Replaces the
 * single "Load more" button; the button remains only as the idle fallback.
 */
export function MobileSourceListFooter({
  state,
  strings,
  onRetry,
  onLoadMore,
}: {
  state: MobileSourceListFooterState;
  strings: MobileStrings;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const { tokens } = useNemuTheme();

  if (state.failed) {
    return (
      <View
        style={[styles.footerCard, styles.footerStack, { minHeight: 64, gap: 6 }]}
      >
        <Text style={[styles.errorLine, { color: tokens.danger }]}>
          {strings.feedback.loadFailed}
        </Text>
        <NemuButton
          accessibilityLabel={strings.common.retry}
          size="xs"
          variant="secondary"
          label={strings.common.retry}
          onPress={onRetry}
        />
      </View>
    );
  }

  if (state.busy) {
    return (
      <View style={[styles.footerCard, styles.footerRow]}>
        <ActivityIndicator color={tokens.primary} />
        <NemuText variant="caption" style={{ color: tokens.mutedForeground }}>
          {state.loadingPage !== undefined
            ? formatMobileString(strings.feedback.loadingPageN, {
                page: state.loadingPage,
              })
            : strings.sourceBrowse.loadingMoreSourceResults}
        </NemuText>
      </View>
    );
  }

  if (state.hasMore) {
    return (
      <View style={styles.footerCard}>
        <NemuButton
          accessibilityLabel={strings.sourceBrowse.loadMore}
          size="sm"
          variant="secondary"
          label={strings.sourceBrowse.loadMore}
          onPress={onLoadMore}
        />
      </View>
    );
  }

  return (
    <View style={[styles.footerCard, styles.footerRow]}>
      <NemuText variant="caption" style={{ color: tokens.mutedForeground }}>
        {formatMobileString(strings.feedback.noMoreResultsTotal, {
          count: state.total,
        })}
      </NemuText>
    </View>
  );
}

const styles = StyleSheet.create({
  footerCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
  footerStack: {
    flexDirection: "column",
  },
  errorLine: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
});
