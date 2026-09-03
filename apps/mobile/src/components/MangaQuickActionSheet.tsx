import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuPressable,
  NemuText,
  useNemuTheme,
  nemuFontWeight,
} from "@/design-system";

export type MangaQuickAction = {
  id: "markAllRead" | "addToCollection" | "openInSource" | "remove";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function QuickActionRow({ action }: { action: MangaQuickAction }) {
  const { tokens } = useNemuTheme();
  const [pressed, setPressed] = useState(false);
  const color = action.destructive ? tokens.danger : tokens.foreground;

  return (
    <NemuPressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      hapticFeedback="selection"
      onPress={action.onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressProfile="row"
      style={[
        styles.option,
        pressed ? { backgroundColor: tokens.secondary } : null,
      ]}
    >
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name={action.icon}
        size={20}
        color={action.destructive ? tokens.danger : tokens.primary}
      />
      <NemuText
        color={color}
        density="compact"
        numberOfLines={1}
        style={styles.optionLabel}
        variant="rowTitle"
      >
        {action.label}
      </NemuText>
    </NemuPressable>
  );
}

/**
 * Compact quick-action sheet opened by long-pressing a library manga card.
 * The header anchors the sheet to the pressed card (40x60 cover, title,
 * source + progress), and the rows are plain: no card fill, no border, a bare
 * 20pt tinted glyph 12pt from a 15/500 label.
 */
export function MangaQuickActionSheet({
  visible,
  title,
  subtitle,
  cover,
  coverHeaders,
  actions,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  cover?: string;
  coverHeaders?: Record<string, string>;
  actions: MangaQuickAction[];
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedHeight = 84 + actions.length * 44 * effectiveFontScale;
  const scroll = estimatedHeight > Math.max(280, height * 0.72);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      snapPoints={scroll ? ["48%"] : undefined}
      scroll={scroll}
      contentStyle={styles.sheet}
      testID="MangaQuickActionSheet"
    >
      <View style={styles.header}>
        <View style={[styles.thumb, { backgroundColor: tokens.muted }]}>
          {cover ? (
            <MobileCachedImage
              source={{ uri: cover, headers: coverHeaders }}
              style={styles.thumbImage}
              uriOwnership="source"
            />
          ) : null}
        </View>
        <View style={styles.headerText}>
          <NemuText
            color={tokens.foreground}
            density="compact"
            numberOfLines={1}
            style={styles.headerTitle}
            variant="rowTitle"
          >
            {title}
          </NemuText>
          {subtitle ? (
            <NemuText
              color={tokens.mutedForeground}
              density="compact"
              numberOfLines={1}
              variant="caption"
            >
              {subtitle}
            </NemuText>
          ) : null}
        </View>
      </View>
      {actions.map((action) => (
        <QuickActionRow key={action.id} action={action} />
      ))}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 2,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 10,
  },
  thumb: {
    width: 40,
    height: 60,
    borderRadius: 6,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerTitle: {
    fontWeight: nemuFontWeight.semibold,
  },
  option: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
  },
});
