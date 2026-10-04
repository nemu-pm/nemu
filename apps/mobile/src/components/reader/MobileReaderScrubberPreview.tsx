import type { ViewInstance } from "react-native";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ReadingMode } from "@/data/schema";
import { NemuText, nemuFontWeight, radius, useNemuTheme } from "@/design-system";
import {
  READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
  READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
  READER_SCRUBBER_PREVIEW_IMAGE_GAP,
  READER_SCRUBBER_PREVIEW_IMAGE_HEIGHT,
  READER_SCRUBBER_PREVIEW_IMAGE_WIDTH,
  readerScrubberPreviewBubblePosition,
  readerScrubberPreviewBubbleWidth,
  readerScrubberPreviewLabel,
  readerScrubberTrackWindowFrame,
  type ReaderScrubberPreviewGeometry,
} from "@/lib/mobileReaderScrubberPreview";
import type { MobileSliderTrackWindowFrame } from "@/lib/mobileSliderTrack";
import { READER_CAPSULE_COLORS, ReaderCapsule } from "@/components/reader/ReaderCapsule";
import type { ReaderScrubPreviewThumbnail } from "@/components/reader/useReaderScrubPreviewThumbnails";

export type MobileReaderScrubberPreviewHandle = {
  /** Publishes the live thumb geometry, or clears the bubble with `null`. */
  setGeometry(geometry: ReaderScrubberPreviewGeometry | null): void;
};

export type MobileReaderScrubberPreviewProps = {
  /**
   * A plain view in the main tree wrapping the toolbar panel. The scrubber can
   * only measure itself inside that panel, which on iOS is a SwiftUI host with
   * its own coordinate space; this anchor puts the thumb back in window space.
   */
  panelAnchorRef?: RefObject<ViewInstance | null>;
  pageIndex: number | null;
  pageCount: number;
  mode: ReadingMode;
  /**
   * The previewed page (or, two-up, the spread's pages) in source order,
   * each with its thumbnail file once it is available.
   */
  thumbnails: readonly ReaderScrubPreviewThumbnail[];
};

type LayerSize = { width: number; height: number };
type LayerOrigin = { x: number; y: number };

/** A layer that never measured itself is still at the window origin. */
const LAYER_ORIGIN_FALLBACK: LayerOrigin = { x: 0, y: 0 };

const BUBBLE_MOTION_MS = 140;
const THUMBNAIL_FADE_MS = 120;

/**
 * One page thumbnail: a quiet placeholder until the image has decoded, then
 * the image cross-fades in over it (at once under Reduce Motion). Moving
 * between already-shown thumbnails swaps without fading back through the
 * placeholder.
 */
function PreviewThumbnail({
  uri,
  reduceMotion,
}: {
  uri: string | null;
  reduceMotion: boolean;
}) {
  const opacity = useSharedValue(0);
  const imageStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const shownUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (uri) return;
    shownUriRef.current = null;
    opacity.set(0);
  }, [opacity, uri]);
  const onLoad = useCallback(() => {
    if (shownUriRef.current) return;
    shownUriRef.current = uri;
    opacity.set(reduceMotion ? 1 : withTiming(1, { duration: THUMBNAIL_FADE_MS }));
  }, [opacity, reduceMotion, uri]);
  return (
    <View style={styles.previewPlaceholder}>
      <Ionicons
        name="image-outline"
        size={16}
        color={READER_CAPSULE_COLORS.secondaryText}
      />
      {uri ? (
        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
          <Image
            accessibilityIgnoresInvertColors
            fadeDuration={0}
            onLoad={onLoad}
            // Decode at thumbnail size (Android); iOS downsamples local files
            // to the view's size itself.
            resizeMethod="resize"
            resizeMode="cover"
            source={{ uri }}
            style={styles.previewImage}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A subtle fade + scale up from the thumb as the drag starts. */
function bubbleEntering() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: BUBBLE_MOTION_MS }),
      transform: [{ scale: withTiming(1, { duration: BUBBLE_MOTION_MS }) }],
    },
  };
}

/** And back down into it when the finger lifts. */
function bubbleExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: BUBBLE_MOTION_MS }),
      transform: [{ scale: withTiming(0.9, { duration: BUBBLE_MOTION_MS }) }],
    },
  };
}

/**
 * The scrub preview bubble, rendered as a sibling of the reader's bottom
 * toolbar instead of inside it: the toolbar is a rounded glass panel that
 * clips its content (on iOS it is a SwiftUI host, so no `overflow` value can
 * let a child escape it), which used to cut the bubble in half.
 *
 * Geometry arrives imperatively so a drag never re-renders the reader — only
 * this leaf — while the previewed page and its cached image stay ordinary
 * props, updated once per previewed page.
 */
export const MobileReaderScrubberPreview = forwardRef<
  MobileReaderScrubberPreviewHandle,
  MobileReaderScrubberPreviewProps
>(function MobileReaderScrubberPreview(
  { panelAnchorRef, pageIndex, pageCount, mode, thumbnails },
  ref,
) {
  const { reduceMotion } = useNemuTheme();
  const layerRef = useRef<ViewInstance | null>(null);
  const [geometry, setGeometry] =
    useState<ReaderScrubberPreviewGeometry | null>(null);
  // Size comes from the layout event and the window origin from a measure:
  // a layout size is synchronous and always accurate, while a measure can
  // report an empty box before the view is in the mounted revision. A zero
  // size therefore means "not a full-screen layer yet" and suppresses the
  // bubble rather than anchoring it to nothing.
  const [layerSize, setLayerSize] = useState<LayerSize | null>(null);
  const [layerOrigin, setLayerOrigin] = useState<LayerOrigin | null>(null);
  const [panelFrame, setPanelFrame] =
    useState<MobileSliderTrackWindowFrame | null>(null);
  const draggingRef = useRef(false);

  // The panel moves with the safe area, the chrome animation and the error
  // banner, and `onLayout` does not fire when only a parent moves, so it is
  // measured on layout and again at the start of every drag.
  const measurePanelAnchor = useCallback(() => {
    panelAnchorRef?.current?.measureInWindow((x, y, width, height) => {
      setPanelFrame(
        width > 0 && height > 0 ? { x, y, width, height } : null,
      );
    });
  }, [panelAnchorRef]);

  useImperativeHandle(
    ref,
    () => ({
      setGeometry(next) {
        if (next && !draggingRef.current) measurePanelAnchor();
        draggingRef.current = next != null;
        setGeometry(next);
      },
    }),
    [measurePanelAnchor],
  );

  const onLayerLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayerSize((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height },
    );
    layerRef.current?.measureInWindow((x, y) => {
      setLayerOrigin((current) =>
        current && current.x === x && current.y === y ? current : { x, y },
      );
    });
    measurePanelAnchor();
  }, [measurePanelAnchor]);

  const bubbleWidth = readerScrubberPreviewBubbleWidth(thumbnails.length);
  const position =
    geometry && layerSize && pageIndex != null
      ? readerScrubberPreviewBubblePosition({
          bubbleWidth,
          geometry: {
            ratio: geometry.ratio,
            track: readerScrubberTrackWindowFrame({
              track: geometry.track,
              panel: panelFrame,
            }),
          },
          layer: { ...(layerOrigin ?? LAYER_ORIGIN_FALLBACK), ...layerSize },
        })
      : null;

  return (
    <View
      ref={layerRef}
      onLayout={onLayerLayout}
      pointerEvents="none"
      style={styles.layer}
    >
      {position && pageIndex != null ? (
        // The page stays put while dragging; this bubble is the preview:
        // the target page's thumbnail and "12 / 53" in the reader's dark
        // glass, riding the thumb (clamped inside the screen edges).
        <Animated.View
          entering={reduceMotion ? undefined : bubbleEntering}
          exiting={reduceMotion ? undefined : bubbleExiting}
          style={[
            styles.previewAnchor,
            { left: position.left, bottom: position.bottom, width: bubbleWidth },
          ]}
        >
          <ReaderCapsule
            cornerRadius={radius.xl}
            interactive={false}
            style={[styles.previewBubble, { width: bubbleWidth }]}
          >
            <View style={styles.previewPages}>
              {/* A spread reads right-to-left in RTL: its first page on the right. */}
              {(mode === "rtl" ? [...thumbnails].reverse() : thumbnails).map(
                (thumbnail) => (
                  <PreviewThumbnail
                    key={thumbnail.pageIndex}
                    uri={thumbnail.uri}
                    reduceMotion={reduceMotion === true}
                  />
                ),
              )}
            </View>
            {/* Bounded Dynamic Type: the bubble is a fixed-size badge. */}
            <NemuText maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.previewLabel}>
              {readerScrubberPreviewLabel(pageIndex, pageCount, mode)}
            </NemuText>
          </ReaderCapsule>
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    // Spelled out rather than spread from a helper: the whole overlay depends
    // on being a full-screen absolute layer, and a lost `position` would push
    // the bubble off the top of the screen.
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Drawn after the toolbar panel, and stacked above it explicitly so the
    // bubble cannot end up behind the glass surface it floats over.
    zIndex: 4,
    elevation: 4,
  },
  previewAnchor: {
    position: "absolute",
    width: READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
    height: READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
    borderRadius: radius.xl,
    boxShadow: "0px 8px 24px -8px rgba(0,0,0,0.5)",
  },
  previewBubble: {
    width: READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
    height: READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 6,
    gap: 6,
    alignItems: "center",
  },
  previewPages: {
    flexDirection: "row",
    gap: READER_SCRUBBER_PREVIEW_IMAGE_GAP,
  },
  previewImage: {
    width: READER_SCRUBBER_PREVIEW_IMAGE_WIDTH,
    height: READER_SCRUBBER_PREVIEW_IMAGE_HEIGHT,
    borderRadius: radius.sm,
  },
  previewPlaceholder: {
    overflow: "hidden",
    width: READER_SCRUBBER_PREVIEW_IMAGE_WIDTH,
    height: READER_SCRUBBER_PREVIEW_IMAGE_HEIGHT,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  previewLabel: {
    color: READER_CAPSULE_COLORS.primaryText,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
});
