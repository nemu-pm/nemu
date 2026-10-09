import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { MobileCachedImage, nemuFontWeight, NemuText, useNemuTheme } from "@/design-system";
import {
  getMobileExploreBarTitleCentredWidth,
  getMobileExploreBarTitleMaxWidth,
} from "@/lib/mobileExploreBarTitle";

type CoverSource = number | { uri: string; headers?: Record<string, string> };

const THUMB_WIDTH = 22;

/**
 * The navigation bar's title once the hero's title has scrolled away: a small
 * cover beside the title, so the bar still says which book this is. Text in
 * the scheme's label colour, like the bar's own title, aligned to the back
 * button. A long title is truncated before the bar's trailing buttons.
 */
export function MobileExploreBarTitle({
  title,
  cover,
  trailingItems,
  centred = false,
  shown,
  hidden = false,
}: {
  title: string;
  cover?: CoverSource | null;
  /** Buttons in the bar's trailing group. */
  trailingItems: number;
  /** Centred on the window (one menu button on the trailing side). */
  centred?: boolean;
  /** 0…1: how far the title has faded in (it rises a few points as it does). */
  shown?: SharedValue<number>;
  /** Not on screen: hidden from VoiceOver as well. */
  hidden?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const fade = useAnimatedStyle(() => {
    const value = shown ? shown.value : 1;
    return { opacity: value, transform: [{ translateY: (1 - value) * 6 }] };
  });
  const maxWidth = centred
    ? getMobileExploreBarTitleCentredWidth(windowWidth, trailingItems)
    : getMobileExploreBarTitleMaxWidth(windowWidth, trailingItems);
  return (
    // As wide as the gap between the back button and the trailing buttons,
    // content at its leading edge: three bar buttons leave no room to centre
    // the title on the window, so it hugs the back button on purpose instead
    // of floating a little left of centre.
    <Animated.View
      accessible={!hidden}
      accessibilityElementsHidden={hidden}
      accessibilityRole="header"
      accessibilityLabel={title}
      style={[styles.row, { width: maxWidth }, centred ? styles.centred : null, fade]}
    >
      {cover ? (
        <View style={[styles.thumb, { backgroundColor: tokens.muted }]}>
          {typeof cover === "number" ? (
            <Image source={cover} style={styles.image} />
          ) : (
            <MobileCachedImage
              uriOwnership="source"
              cacheKind="cover"
              source={cover}
              fadeIn={false}
              style={styles.image}
            />
          )}
        </View>
      ) : null}
      <NemuText numberOfLines={1} maxFontSizeMultiplier={1.2} color={tokens.foreground} style={styles.title}>
        {title}
      </NemuText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  centred: {
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_WIDTH * 1.5,
    borderRadius: R.thumb,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
});
