import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuPressable,
  NemuText,
  radius,
  useNemuTheme,
  nemuFontWeight,
} from "@/design-system";
import type { MobileSourceQuickActionId } from "@/lib/mobileBrowseSources";
import { normalizeMobileSourceIconUri } from "@/lib/mobileSourceIconResolution";

export type SourceQuickAction = {
  id: MobileSourceQuickActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function QuickActionRow({ action }: { action: SourceQuickAction }) {
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
 * Quick actions for an installed source, opened by long-pressing its Browse
 * card. Same anatomy as `MangaQuickActionSheet`: the header anchors the sheet
 * to the pressed card (40pt mark, name, languages + registry), and the rows are
 * borderless with a bare 20pt tinted glyph beside a 15/500 label.
 *
 * A short press still opens the source, so nothing here duplicates that.
 */
export function SourceQuickActionSheet({
  visible,
  title,
  subtitle,
  icon,
  actions,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  icon?: string | null;
  actions: SourceQuickAction[];
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const iconUri = normalizeMobileSourceIconUri(icon);
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedHeight = 84 + actions.length * 44 * effectiveFontScale;
  const scroll = estimatedHeight > Math.max(280, height * 0.72);
  const placeholder = (
    <Ionicons name="globe-outline" size={22} color={tokens.mutedForeground} />
  );

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      snapPoints={scroll ? ["48%"] : undefined}
      scroll={scroll}
      contentStyle={styles.sheet}
      testID="SourceQuickActionSheet"
    >
      <View style={styles.header}>
        <View style={[styles.thumb, { backgroundColor: tokens.sourceIconGlass }]}>
          {iconUri ? (
            <MobileCachedImage
              fallback={placeholder}
              source={{ uri: iconUri }}
              style={styles.thumbImage}
              uriOwnership="source"
            />
          ) : (
            placeholder
          )}
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
    // No inter-row gap: each row already carries its own 44pt box with 6pt of
    // vertical padding, exactly like MangaQuickActionSheet.
    gap: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 12,
  },
  thumb: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
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
