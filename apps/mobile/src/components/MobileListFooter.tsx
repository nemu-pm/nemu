import { StyleSheet, View } from "react-native";
import {
  NemuButton,
  NemuRingSpinner,
  NemuText,
  useNemuTheme,
} from "@/design-system";
import {
  formatMobileString,
  type MobileStrings,
} from "@/lib/mobileI18n";

export type MobileListFooterState = "loading" | "end" | "error";

type MobileListFooterProps = {
  /**
   * The mock footer's three states, or `null` to render nothing (list idle
   * with more pages, or no content yet). Computed with
   * `resolveMobileListFooterState`.
   */
  state: MobileListFooterState | null;
  /** Page number being loaded; renders 「正在加载第 N 页…」. */
  pageNumber?: number;
  /** Total rendered items for the exhausted caption; omit when unknown. */
  totalCount?: number;
  /**
   * Loading caption override for lists without page numbers (e.g. fan-out
   * search). Falls back to the generic "loading more" string.
   */
  loadingLabel?: string;
  /** Pressed by the stacked retry pill in the error state. */
  onRetry?: () => void;
  strings: MobileStrings;
};

/**
 * The one list footer: a `.footer-state` row — flex centered, gap 10,
 * min-height 56 — rendered bare on the page background (owner: no card box)
 * with the muted 13pt caption.
 *
 * - loading: the Nemu ring + 「正在加载第 N 页…」
 * - end: muted 「没有更多了 · 共 N 部」 (count segment dropped when unknown)
 * - error: danger 「加载失败」 stacked above a small secondary retry pill
 */
export function MobileListFooter({
  state,
  pageNumber,
  totalCount,
  loadingLabel,
  onRetry,
  strings,
}: MobileListFooterProps) {
  const { tokens } = useNemuTheme();

  if (!state) return null;

  if (state === "error") {
    return (
      <View style={[styles.footer, styles.footerStack]}>
        <NemuText variant="rowSubtitle" style={{ color: tokens.danger }}>
          {strings.feedback.loadFailed}
        </NemuText>
        {onRetry ? (
          <NemuButton
            accessibilityLabel={strings.common.retry}
            label={strings.common.retry}
            onPress={onRetry}
            size="sm"
            variant="secondary"
          />
        ) : null}
      </View>
    );
  }

  if (state === "loading") {
    const caption =
      pageNumber !== undefined
        ? formatMobileString(strings.feedback.loadingPageN, {
            page: pageNumber,
          })
        : (loadingLabel ?? strings.sourceBrowse.loadingMoreSourceResults);
    return (
      <View style={[styles.footer, styles.footerRow]}>
        <NemuRingSpinner accessibilityLabel={caption} />
        <NemuText
          variant="rowSubtitle"
          style={{ color: tokens.mutedForeground }}
        >
          {caption}
        </NemuText>
      </View>
    );
  }

  return (
    <View style={[styles.footer, styles.footerRow]}>
      <NemuText
        variant="rowSubtitle"
        style={{ color: tokens.mutedForeground }}
      >
        {totalCount !== undefined
          ? formatMobileString(strings.feedback.noMoreResultsTotal, {
              count: totalCount,
            })
          : strings.feedback.noMoreResults}
      </NemuText>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerStack: {
    flexDirection: "column",
    gap: 6,
  },
});
