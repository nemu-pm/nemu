import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import type { ComponentProps } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { MobileCachedImage, nemuFontWeight, NemuText, useMobilePageGutters, useNemuTheme } from "@/design-system";
import {
  getMobileExploreBarTitleBookFrame,
  getMobileExploreBarTitleCentredWidth,
  getMobileExploreBarTitleInlineItems,
  getMobileExploreBarTitleMaxWidth,
  getMobileExploreBarTitleShift,
  getMobileExploreBarTitleSlotX,
} from "@/lib/mobileExploreBarTitle";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";

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
  const { width: windowWidth } = useWindowDimensions();
  const adaptive = useMobileAdaptiveLayout();
  // Book posture (either orientation): the title belongs to the left pane,
  // centred in it and clear of the fold, not centred on the whole bar.
  const bookFrame = getMobileExploreBarTitleBookFrame(adaptive);
  const gutters = useMobilePageGutters();
  if (!bookFrame) {
    // Every other posture: exactly the bar's own placement, as before the book
    // frame existed — no wrapper, no translateX, no width but the bar's. Its
    // own element (by key), so nothing set for book (a shift, the pane width)
    // can stay on the view after unfolding or closing (r20: +10.33pt in flat
    // and closed after book).
    const maxWidth = centred
      ? getMobileExploreBarTitleCentredWidth(windowWidth, trailingItems)
      : getMobileExploreBarTitleMaxWidth(windowWidth, trailingItems);
    return (
      <PlainBarTitle
        key="plain"
        title={title}
        cover={cover}
        centred={centred}
        shown={shown}
        hidden={hidden}
        width={maxWidth}
      />
    );
  }
  // Where the bar puts the slot, computed from the same geometry UIKit
  // centres it with (window width, slot width, margins, the bar's own items)
  // instead of measured: a measurement of a header title goes stale whenever
  // the bar re-centres it without resizing it (see getMobileExploreBarTitleSlotX),
  // so every posture, window or margin change recomputes it in render.
  const slotX = getMobileExploreBarTitleSlotX({
    // The observer's window, the same snapshot as the fold and gutters.
    windowWidth: adaptive.width,
    slotWidth: bookFrame.width,
    margins: gutters,
    inlineItems: adaptive.verticalBarSide === null ? getMobileExploreBarTitleInlineItems(trailingItems) : null,
  });
  return (
    <BookBarTitle
      key="book"
      title={title}
      cover={cover}
      shown={shown}
      hidden={hidden}
      width={bookFrame.width}
      shiftX={getMobileExploreBarTitleShift(bookFrame.x, slotX)}
    />
  );
}

type BarTitleRowProps = {
  title: string;
  cover?: CoverSource | null;
  shown?: SharedValue<number>;
  hidden: boolean;
  width: number;
};

/**
 * Not book: the title as the bar lays it out. As wide as the gap between the
 * back button and the trailing buttons, content at its leading edge: three
 * bar buttons leave no room to centre the title on the window, so it hugs the
 * back button on purpose instead of floating a little left of centre.
 */
function PlainBarTitle({ centred, ...row }: BarTitleRowProps & { centred: boolean }) {
  const { shown } = row;
  const fade = useAnimatedStyle(() => {
    const value = shown ? shown.value : 1;
    return { opacity: value, transform: [{ translateY: (1 - value) * 6 }] };
  });
  return <BarTitleRow {...row} style={[{ width: row.width }, centred ? styles.centred : null, fade]} />;
}

/**
 * Book: the slot is the left pane's title width and the row moves from where
 * the bar centres the slot to the pane's centre.
 */
function BookBarTitle({ shiftX, ...row }: BarTitleRowProps & { shiftX: number }) {
  const { shown } = row;
  const fade = useAnimatedStyle(() => {
    const value = shown ? shown.value : 1;
    return { opacity: value, transform: [{ translateX: shiftX }, { translateY: (1 - value) * 6 }] };
  }, [shiftX, shown]);
  return (
    <View style={{ width: row.width }}>
      <BarTitleRow {...row} style={[{ width: row.width }, styles.centred, fade]} />
    </View>
  );
}

function BarTitleRow({
  title,
  cover,
  hidden,
  style,
}: BarTitleRowProps & { style: ComponentProps<typeof Animated.View>["style"] }) {
  const { tokens } = useNemuTheme();
  return (
    <Animated.View
      accessible={!hidden}
      accessibilityElementsHidden={hidden}
      accessibilityRole="header"
      accessibilityLabel={title}
      style={[styles.row, style]}
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
