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
import { normalizeMobileSourceIconUri } from "@/lib/mobileSourceIconResolution";

export type QuickAction<TId extends string = string> = {
  id: TId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Which artwork the header anchors to: a 40x60 manga cover, or a 40pt source
 * mark. The variant also owns the two spacing beats that differ between them.
 */
type QuickActionSheetVariant = "cover" | "icon";

function QuickActionRow({ action }: { action: QuickAction }) {
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
 * Compact quick-action sheet opened by long-pressing a library/search manga
 * card or a Browse source card. The header anchors the sheet to the pressed
 * card (artwork, title, optional subtitle), and the rows are plain: no card
 * fill, no border, a bare 20pt tinted glyph 12pt from a 15/500 label.
 *
 * A short press still opens the card's destination, so nothing here duplicates
 * that.
 */
export function QuickActionSheet<TId extends string>({
  visible,
  variant,
  title,
  subtitle,
  image,
  imageHeaders,
  actions,
  testID,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  variant: QuickActionSheetVariant;
  title: string;
  subtitle?: string;
  image?: string | null;
  imageHeaders?: Record<string, string>;
  actions: QuickAction<TId>[];
  testID: string;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const isIcon = variant === "icon";
  const uri = isIcon ? normalizeMobileSourceIconUri(image) : (image ?? undefined);
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedHeight = 84 + actions.length * 44 * effectiveFontScale;
  const scroll = estimatedHeight > Math.max(280, height * 0.72);
  const placeholder = isIcon ? (
    <Ionicons name="globe-outline" size={22} color={tokens.mutedForeground} />
  ) : null;

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      snapPoints={scroll ? ["48%"] : undefined}
      scroll={scroll}
      contentStyle={isIcon ? styles.iconSheet : styles.sheet}
      testID={testID}
    >
      <View style={isIcon ? styles.iconHeader : styles.header}>
        <View
          style={[
            isIcon ? styles.iconThumb : styles.thumb,
            {
              backgroundColor: isIcon ? tokens.sourceIconGlass : tokens.muted,
            },
          ]}
        >
          {uri ? (
            <MobileCachedImage
              fallback={placeholder ?? undefined}
              source={{ uri, headers: imageHeaders }}
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

const sheetBase = {
  paddingHorizontal: 16,
  paddingBottom: 12,
} as const;

const headerBase = {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  paddingHorizontal: 4,
  paddingTop: 2,
} as const;

const styles = StyleSheet.create({
  sheet: {
    ...sheetBase,
    gap: 2,
  },
  iconSheet: {
    ...sheetBase,
    // No inter-row gap: each row already carries its own 44pt box with 6pt of
    // vertical padding.
    gap: 0,
  },
  header: {
    ...headerBase,
    paddingBottom: 10,
  },
  iconHeader: {
    ...headerBase,
    paddingBottom: 12,
  },
  thumb: {
    width: 40,
    height: 60,
    borderRadius: 6,
    overflow: "hidden",
  },
  iconThumb: {
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
