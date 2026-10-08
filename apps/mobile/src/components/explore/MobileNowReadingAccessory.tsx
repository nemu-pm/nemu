import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { PlatformColor, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getEntryTitle } from "@/data/schema";
import {
  MobileCachedImage,
  nemuFontWeight,
  NemuText,
  useNemuTheme,
} from "@/design-system";
import { hapticPress } from "@/lib/haptics";
import { formatMobileExploreChapterLabel } from "@/lib/mobileContinueReadingCopy";
import { getMobileStrings } from "@/lib/mobileI18n";
import { getMobileSourceReaderHref } from "@/lib/mobileSourceRoutes";
import {
  mobileExploreSourceName,
  useMobileExploreEntryCover,
} from "./mobileExploreCover";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import type { MobileNowReading } from "./useMobileNowReading";

const ACCESSORY_TEXT_MAX_SCALE = 1.2;
/**
 * iOS semantic label colours, resolved by UIKit against the accessory's own
 * traits: the system glass (Clear or Tinted, the user's choice) switches its
 * content between light and dark over what is behind it, and these follow,
 * as the tab bar's labels do. Nothing is painted on or behind the glass.
 */
const LABEL = PlatformColor("label");
const SECONDARY_LABEL = PlatformColor("secondaryLabel");

/**
 * iOS 26 tab-bar bottom accessory (the Music app's mini player): cover, title, the chapter it resumes, and a play glyph. The system
 * draws the Liquid Glass capsule (the same glass as the tab bar) and moves it
 * inline beside the minimised tab bar; tapping anywhere reopens the reader on
 * the saved page.
 */
export function MobileNowReadingAccessory({ nowReading }: { nowReading: MobileNowReading }) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const inline = placement === "inline";
  const { item, installedSources } = nowReading;
  const { entry, source, chapter } = item;
  const cover = useMobileExploreEntryCover(entry, installedSources);
  const title = getEntryTitle(entry);
  const placeholder = <MobileExploreCoverPlaceholder title={title} width={inline ? 20 : 26} />;
  const chapterLabel =
    formatMobileExploreChapterLabel(chapter, strings) ?? strings.library.progressInProgress;
  const subtitle = `${chapterLabel} · ${mobileExploreSourceName(source, installedSources)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${strings.designExplore.nowReading}: ${title}, ${chapterLabel}`}
      accessibilityHint={strings.designExplore.nowReadingHint}
      onPress={() => {
        void hapticPress();
        router.push(
          getMobileSourceReaderHref({
            registryId: source.registryId,
            sourceId: source.sourceId,
            mangaId: source.sourceMangaId,
            chapter,
            mangaTitle: title,
          }),
        );
      }}
      style={({ pressed }) => [
        styles.root,
        inline ? styles.rootInline : null,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.cover, inline ? styles.coverInline : null, { backgroundColor: tokens.muted }]}>
        {cover ? (
          <MobileCachedImage
            uriOwnership="source"
            cacheKind="cover"
            source={cover}
            // No fade: inside the system bottom accessory the native-driven
            // opacity animation never reaches the view (it is re-hosted), so a
            // freshly downloaded cover stayed at opacity 0 — an empty square.
            fadeIn={false}
            fallback={placeholder}
            style={styles.coverImage}
          />
        ) : (
          placeholder
        )}
      </View>
      <View style={styles.copy}>
        <NemuText
          numberOfLines={1}
          maxFontSizeMultiplier={ACCESSORY_TEXT_MAX_SCALE}
          style={[styles.title, { color: LABEL }]}
        >
          {title}
        </NemuText>
        {inline ? null : (
          <NemuText
            numberOfLines={1}
            maxFontSizeMultiplier={ACCESSORY_TEXT_MAX_SCALE}
            style={[styles.subtitle, { color: SECONDARY_LABEL }]}
          >
            {subtitle}
          </NemuText>
        )}
      </View>
      <Ionicons name="play" size={inline ? 18 : 21} color={LABEL} style={styles.play} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingRight: 14,
  },
  rootInline: {
    gap: 8,
    paddingLeft: 8,
    paddingRight: 10,
  },
  cover: {
    width: 26,
    height: 38,
    borderRadius: R.thumb,
    overflow: "hidden",
  },
  coverInline: {
    width: 20,
    height: 28,
    borderRadius: R.thumb,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.regular,
  },
  play: {
    marginLeft: 2,
  },
});
