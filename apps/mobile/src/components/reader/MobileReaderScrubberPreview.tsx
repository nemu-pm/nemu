import {
  forwardRef,
  useCallback,
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
import type { ReadingMode } from "@/data/schema";
import { NemuText, nemuFontWeight, useNemuTheme } from "@/design-system";
import {
  READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
  READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
  readerScrubberPreviewBubblePosition,
  readerScrubberTrackWindowFrame,
  type ReaderScrubberPreviewGeometry,
} from "@/lib/mobileReaderScrubberPreview";
import type { MobileSliderTrackWindowFrame } from "@/lib/mobileSliderTrack";
import { readerRoutePageForDisplayIndex } from "@/lib/mobileReaderProgress";
import {
  READER_CHROME_GLASS_BORDER,
  READER_CHROME_GLASS_TINT,
} from "@/components/reader/readerChromeGlass";

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
  panelAnchorRef?: RefObject<View | null>;
  pageIndex: number | null;
  pageCount: number;
  mode: ReadingMode;
  imageUri?: string | null;
};

type LayerSize = { width: number; height: number };
type LayerOrigin = { x: number; y: number };

/** A layer that never measured itself is still at the window origin. */
const LAYER_ORIGIN_FALLBACK: LayerOrigin = { x: 0, y: 0 };

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
  { panelAnchorRef, pageIndex, pageCount, mode, imageUri },
  ref,
) {
  const { scheme } = useNemuTheme();
  const layerRef = useRef<View | null>(null);
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

  const position =
    geometry && layerSize && pageIndex != null
      ? readerScrubberPreviewBubblePosition({
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
        <View
          style={[
            styles.previewBubble,
            {
              left: position.left,
              bottom: position.bottom,
              backgroundColor: READER_CHROME_GLASS_TINT[scheme],
              borderColor: READER_CHROME_GLASS_BORDER[scheme],
            },
          ]}
        >
          {imageUri ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: imageUri }}
              style={styles.previewImage}
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons
                name="image-outline"
                size={15}
                color="rgba(235,238,245,0.66)"
              />
            </View>
          )}
          {/* Bounded Dynamic Type: the bubble is a fixed-size badge. */}
          <NemuText style={styles.previewLabel}>
            {readerRoutePageForDisplayIndex(pageIndex, pageCount, mode)}
          </NemuText>
        </View>
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
  previewBubble: {
    position: "absolute",
    width: READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
    minHeight: READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 6,
    gap: 6,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 0.5,
    boxShadow: "0px 8px 24px -8px rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  previewImage: {
    width: 44,
    height: 62,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  previewPlaceholder: {
    width: 44,
    height: 62,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  previewLabel: {
    color: "rgba(235,238,245,0.96)",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
});
