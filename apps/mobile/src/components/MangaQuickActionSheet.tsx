import { StyleSheet, Text, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  useNemuTheme,
  nemuMaxFontSizeMultiplier,
} from "@/design-system";

export type MangaQuickAction = {
  id: "markAllRead" | "addToCollection" | "openInSource" | "remove";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Compact quick-action sheet opened by long-pressing a library manga card.
 * Rows follow the shared sheet-option geometry: 44pt min height, 20pt bare
 * icons (no frame), 12pt gap.
 */
export function MangaQuickActionSheet({
  visible,
  title,
  actions,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  actions: MangaQuickAction[];
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedHeight =
    56 + actions.length * 44 * effectiveFontScale;
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
      <Text
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        numberOfLines={1}
        accessibilityLabel={title}
        style={[styles.headerTitle, { color: tokens.foreground }]}
      >
        {title}
      </Text>
      {actions.map((action) => (
        <NemuPressable
          key={action.id}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hapticFeedback="selection"
          onPress={action.onPress}
          pressProfile="row"
          style={[
            styles.option,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Ionicons
            name={action.icon}
            size={20}
            color={action.destructive ? tokens.danger : tokens.foreground}
          />
          <Text
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={1}
            style={[
              styles.optionLabel,
              { color: action.destructive ? tokens.danger : tokens.foreground },
            ]}
          >
            {action.label}
          </Text>
        </NemuPressable>
      ))}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    opacity: 0.72,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 6,
  },
  option: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
});
