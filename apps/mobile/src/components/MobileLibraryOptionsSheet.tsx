import { ActivityIndicator, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  NemuText,
  nemuMaxFontSizeMultiplier,
  nemuSheetMetrics,
  nemuText,
  radius,
  useMobileNativeSheetTheme,
} from "@/design-system";
import type { MobileLibraryOptionsSheetProps } from "./MobileLibraryOptionsSheet.types";

type OptionRow = {
  key: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "primary" | "danger";
  busy?: boolean;
  navigates?: boolean;
  hapticFeedback?: "warning";
  onPress: () => void;
};

/**
 * The manga page's library button (Android / web): one grouped list of
 * actions — a single surface with hairline dividers, like a Material list —
 * instead of a boxed card per action. iOS presents the SwiftUI sheet in
 * `MobileLibraryOptionsSheet.ios.tsx`.
 */
export function MobileLibraryOptionsSheet({
  visible,
  mode,
  strings,
  busy,
  adding,
  canAddAndRead,
  error,
  onClearError,
  onClose,
  onDismiss,
  onAdd,
  onAddAndRead,
  onManageCollections,
  onRemove,
}: MobileLibraryOptionsSheetProps) {
  const { tokens } = useMobileNativeSheetTheme();
  const inLibrary = mode === "in-library";
  const rows: OptionRow[] = inLibrary
    ? [
        {
          key: "collections",
          label: strings.sourceManga.manageCollections,
          hint: strings.sourceManga.manageCollectionsHint,
          icon: "albums-outline",
          tone: "primary",
          navigates: true,
          onPress: onManageCollections,
        },
        {
          key: "remove",
          label: strings.sourceManga.removeFromLibrary,
          hint: strings.sourceManga.removeFromLibraryHint,
          icon: "trash-outline",
          tone: "danger",
          navigates: true,
          hapticFeedback: "warning",
          onPress: onRemove,
        },
      ]
    : [
        {
          key: "add",
          label: strings.sourceManga.addToLibrary,
          hint: strings.sourceManga.addToLibraryHint,
          icon: "bookmark-outline",
          tone: "primary",
          busy: adding,
          onPress: onAdd,
        },
        ...(canAddAndRead
          ? [
              {
                key: "add-read",
                label: strings.sourceManga.addAndStartReading,
                hint: strings.sourceManga.addAndStartReadingHint,
                icon: "play-outline" as const,
                tone: "primary" as const,
                busy: adding,
                onPress: onAddAndRead,
              },
            ]
          : []),
      ];

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={inLibrary ? strings.sourceManga.libraryOptionsTitle : strings.sourceManga.addOptionsTitle}
      subtitle={inLibrary ? strings.sourceManga.libraryOptionsDescription : strings.sourceManga.addOptionsDescription}
      dismissLabel={strings.common.done}
      dismissDisabled={busy}
      enablePanDownToClose={!busy}
      contentStyle={styles.sheet}
      testID="SourceMangaLibraryOptionsSheet"
    >
      <View style={[styles.group, { backgroundColor: tokens.muted, borderColor: tokens.border }]}>
        {rows.map((row, index) => {
          const color = row.tone === "danger" ? tokens.danger : tokens.primary;
          return (
            <View key={row.key}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              ) : null}
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityHint={row.hint}
                accessibilityState={{ busy: row.busy || undefined, disabled: busy }}
                disabled={busy}
                hapticFeedback={row.hapticFeedback}
                onPress={row.onPress}
                pressProfile="row"
                style={[styles.row, nemuSheetMetrics.listRowLayout]}
              >
                <View style={styles.rowIcon}>
                  {row.busy ? (
                    <ActivityIndicator size="small" color={color} />
                  ) : (
                    <Ionicons name={row.icon} size={nemuSheetMetrics.rowIconSize} color={color} />
                  )}
                </View>
                <NemuText
                  maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                  numberOfLines={1}
                  style={[
                    nemuText.rowTitle,
                    nemuSheetMetrics.rowLabel,
                    styles.rowLabel,
                    { color: row.tone === "danger" ? tokens.danger : tokens.foreground },
                  ]}
                >
                  {row.label}
                </NemuText>
                {row.navigates ? (
                  <Ionicons name="chevron-forward" size={17} color={tokens.mutedForeground} />
                ) : null}
              </NemuPressable>
            </View>
          );
        })}
      </View>
      {error ? (
        <MobileInlineErrorBanner
          title={strings.sourceManga.actionFailed}
          detail={error}
          dismissLabel={strings.common.clear}
          onDismiss={onClearError}
          variant="embedded"
        />
      ) : null}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 14,
  },
  group: {
    overflow: "hidden",
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 24,
    alignItems: "center",
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
  },
});
