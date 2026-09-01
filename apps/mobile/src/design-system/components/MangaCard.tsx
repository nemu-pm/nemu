import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { createNemuShadowStyle } from "@/design/shadows";
import { radius } from "@/design/tokens";
import { nemuFontWeight, nemuMaxFontSizeMultiplier } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { getMobileStrings } from "@/lib/mobileI18n";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import { hapticPress } from "@/lib/haptics";
import { MobileCachedImage } from "./MobileCachedImage";

export type MangaCardModel = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  cover?: string;
  coverHeaders?: Record<string, string>;
};

export function MangaCard({ item }: { item: MangaCardModel }) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.search.openItem,
        title: item.title,
        subtitle: item.subtitle,
        badge: item.badge,
      })}
      onPress={() => {
        void hapticPress();
        router.push({
          pathname: "/library/[id]",
          params: { id: item.id },
        });
      }}
      style={({ pressed }) => [
        styles.root,
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={[
          styles.cover,
          {
            backgroundColor: tokens.muted,
            borderColor: tokens.coverBorder,
            ...createNemuShadowStyle({
              color: tokens.shadow,
              offsetY: 3,
              radius: 14,
              elevation: 4,
            }),
          },
        ]}
      >
        {item.cover ? (
          <MobileCachedImage
            fallback={
              <LinearGradient
                colors={[`${tokens.primary}55`, tokens.muted]}
                style={styles.placeholder}
              />
            }
            uriOwnership="source"
            source={{ uri: item.cover, headers: item.coverHeaders }}
            style={styles.coverImage}
          />
        ) : (
          <LinearGradient
            colors={[`${tokens.primary}55`, tokens.muted]}
            style={styles.placeholder}
          />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.2)"]}
          style={styles.coverShade}
        />
        {item.badge ? (
          <View style={[styles.badge, { backgroundColor: tokens.primary }]}>
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              numberOfLines={1}
              style={[styles.badgeText, { color: tokens.primaryForeground }]}
            >
              {item.badge}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.textBlock}>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={2}
          style={[styles.title, { color: tokens.foreground }]}
        >
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={1}
            style={[styles.subtitle, { color: tokens.mutedForeground }]}
          >
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  cover: {
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
  },
  coverShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "42%",
    pointerEvents: "none",
  },
  badge: {
    position: "absolute",
    right: 6,
    top: 6,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: nemuFontWeight.semibold,
  },
  textBlock: {
    // A fixed height clips the title and subtitle at larger Dynamic Type
    // sizes; reserve the same space but let the block grow.
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
  },
});
