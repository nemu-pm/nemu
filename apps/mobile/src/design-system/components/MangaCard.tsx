import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  ZoomIn,
  useReducedMotion,
} from "react-native-reanimated";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { createNemuShadowStyle } from "@/design/shadows";
import { radius } from "@/design/tokens";
import { nemuFontWeight, nemuMaxFontSizeMultiplier } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { getMobileStrings } from "@/lib/mobileI18n";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import { NemuPressable } from "./NemuPressable";
import { MobileCachedImage } from "./MobileCachedImage";

export type MangaCardModel = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  cover?: string;
  coverHeaders?: Record<string, string>;
};

export function MangaCard({
  item,
  onLongPress,
}: {
  item: MangaCardModel;
  onLongPress?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const reducedMotion = useReducedMotion();

  // The badge pops (spring scale-in) only on a zero→non-zero transition; a
  // count bump on an existing badge and a badge present at mount stay still.
  // Derived-state-during-render keeps the transition detect without effects.
  const [badgePresent, setBadgePresent] = useState(() => Boolean(item.badge));
  const [badgePopToken, setBadgePopToken] = useState(0);
  if (Boolean(item.badge) !== badgePresent) {
    const hasNow = Boolean(item.badge);
    setBadgePresent(hasNow);
    if (hasNow) setBadgePopToken((token) => token + 1);
  }

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={formatMobileMangaCardAccessibilityLabel({
        openTemplate: strings.search.openItem,
        title: item.title,
        subtitle: item.subtitle,
        badge: item.badge,
      })}
      hapticFeedback="press"
      pressProfile="card"
      onPress={() => {
        router.push({
          pathname: "/library/[id]",
          params: { id: item.id },
        });
      }}
      onLongPress={
        onLongPress
          ? () => {
              onLongPress();
            }
          : undefined
      }
      style={styles.root}
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
          <Animated.View
            key={badgePopToken}
            entering={
              badgePopToken > 0 && !reducedMotion
                ? ZoomIn.springify().damping(16).stiffness(220)
                : undefined
            }
            style={[styles.badge, { backgroundColor: tokens.primary }]}
          >
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              numberOfLines={1}
              style={[styles.badgeText, { color: tokens.primaryForeground }]}
            >
              {item.badge}
            </Text>
          </Animated.View>
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
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
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
