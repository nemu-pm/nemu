import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { radius } from "@/design/tokens";
import { nemuMaxFontSizeMultiplier, nemuText } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { MobileCachedImage } from "./MobileCachedImage";
import { NemuPressable } from "./NemuPressable";

type NemuListRowProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  imageUri?: string;
  accessory?: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function NemuListRow({
  title,
  subtitle,
  icon,
  imageUri,
  accessory,
  disabled,
  onPress,
  testID,
}: NemuListRowProps) {
  const { tokens } = useNemuTheme();
  const content = (
    <View
      style={[
        styles.row,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.border,
          opacity: disabled ? 0.56 : 1,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.iconFrame, { backgroundColor: tokens.sourceIconGlass }]}>
        {imageUri ? (
          <MobileCachedImage
            fallback={
              icon ? (
                <Ionicons name={icon} size={20} color={tokens.primary} />
              ) : (
                <Ionicons
                  name="globe-outline"
                  size={20}
                  color={tokens.mutedForeground}
                />
              )
            }
            uriOwnership="source"
            source={{ uri: imageUri }}
            style={styles.iconImage}
          />
        ) : icon ? (
          <Ionicons name={icon} size={20} color={tokens.primary} />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={1}
          style={[nemuText.rowTitle, { color: tokens.foreground }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={2}
            style={[nemuText.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.985}
    >
      {content}
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconFrame: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  accessory: {
    alignItems: "center",
    justifyContent: "center",
  },
});
