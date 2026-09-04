import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { radius } from "@/design/tokens";
import { nemuFontWeight, nemuMaxFontSizeMultiplier } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { resolveSourceCardVisuals } from "@/lib/mobileSourceCardVisuals";
import { getMobileSourceBrowseHref } from "@/lib/mobileSourceRoutes";
import { MobileCachedImage } from "./MobileCachedImage";
import { NemuPressable } from "./NemuPressable";

export type SourceCardModel = {
  id: string;
  registryId: string;
  sourceId: string;
  name: string;
  icon?: string;
  languages?: string[];
  subtitle?: string;
};

export function SourceCard({
  item,
  onLongPress,
}: {
  item: SourceCardModel;
  onLongPress?: () => void;
}) {
  const { scheme, tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const visuals = resolveSourceCardVisuals(scheme);
  const longPressHandledRef = useRef(false);

  const openSource = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }

    router.push(
      getMobileSourceBrowseHref({
        registryId: item.registryId,
        sourceId: item.sourceId,
      }),
    );
  };

  const openLongPressAction = onLongPress
    ? () => {
        longPressHandledRef.current = true;
        onLongPress();
        setTimeout(() => {
          longPressHandledRef.current = false;
        }, 600);
      }
    : undefined;

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={formatMobileString(
        strings.search.sourceAccessibility,
        {
          name: item.name,
        },
      )}
      onPress={openSource}
      onLongPress={openLongPressAction}
      delayLongPress={320}
      style={[
        styles.root,
        {
          backgroundColor: visuals.cardBackground,
          borderColor: visuals.cardBorder,
        },
        visuals.cardShadow,
      ]}
    >
      <View
        style={[
          styles.iconFrame,
          {
            backgroundColor: visuals.iconBackground,
            borderColor: visuals.iconBorder,
          },
        ]}
      >
        {item.icon ? (
          <MobileCachedImage
            fallback={
              <Ionicons
                name="globe-outline"
                size={24}
                color={tokens.mutedForeground}
              />
            }
            uriOwnership="source"
            source={{ uri: item.icon }}
            style={styles.iconImage}
          />
        ) : (
          <Ionicons
            name="globe-outline"
            size={24}
            color={tokens.mutedForeground}
          />
        )}
      </View>
      <View style={styles.text}>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={1}
          style={[styles.title, { color: tokens.foreground }]}
        >
          {item.name}
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
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  iconFrame: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.lg,
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.regular,
  },
});
