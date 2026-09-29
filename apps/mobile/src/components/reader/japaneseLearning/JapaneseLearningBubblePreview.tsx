import { useState } from "react";
import { I18nManager, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";
import { MobileCachedImage, nemuColorWithAlpha, radius, useNemuTheme } from "@/design-system";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import {
  computeMobileOcrCropRect,
  type MobileImageSize,
} from "@/lib/mobileJapaneseLearningOverlay";
import {
  japaneseLearningBubbleBoxInNaturalPixels,
  japaneseLearningBubblePopoutFrame,
  japaneseLearningBubblePopoutRegion,
  japaneseLearningBubblePopoutVerticalSpan,
} from "@/lib/mobileJapaneseLearningBubblePopout";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { useJapaneseLearningDrawerFrame } from "./useJapaneseLearningDrawerFrame";
import type { MobileOcrDetection } from "@/lib/mobileJapaneseLearningOcr";

export type JapaneseLearningBubbleSource = {
  imageUri: string;
  headers?: Record<string, string>;
  uriOwnership: MobileImageUriOwnership;
  /** The page image's natural pixel size (detection boxes are in this space). */
  naturalSize: MobileImageSize;
  /** The selected bubble. */
  box: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">;
  /**
   * Pixel size of the image `box` was measured in, when it differs from the
   * page's natural size (on-device OCR can read a rescaled copy). Without it
   * a box outside the natural bounds clamps to nothing (no popout) or crops
   * the wrong area of the page.
   */
  boxSpace?: MobileImageSize;
};


/** Web text-popout: the crop keeps ~20% of the window height, capped to the width. */
const PREVIEW_MAX_HEIGHT = 150;

/**
 * Mobile port of web `TextPopout` (japanese-learning/ui/text-popout.tsx):
 * the selected speech bubble cropped from the page (10px padding, as web's
 * `cropBoxFromImage`) above the sentence, so the reader sees which bubble the
 * analysis is about — used inside the sheet when the sheet covers the window
 * and the floating `JapaneseLearningBubblePopout` has nowhere to show. Drawn by offsetting the full page image inside a clipped
 * frame — no bitmap copy — and it pops in like web's spring unless Reduce
 * Motion is on.
 */
export function JapaneseLearningBubblePreview({
  source,
  accessibilityLabel,
  maxHeight = PREVIEW_MAX_HEIGHT,
  embedded = false,
}: {
  source: JapaneseLearningBubbleSource;
  accessibilityLabel: string;
  maxHeight?: number;
  /** Inside a padded pane: no own gutters, aligned to the text's leading edge. */
  embedded?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const reduceMotion = useReducedMotion();
  const [frameWidth, setFrameWidth] = useState(0);
  const crop = computeMobileOcrCropRect(japaneseLearningBubbleBoxInNaturalPixels(source), source.naturalSize);
  if (!crop) return null;
  const aspect = crop.width / crop.height;
  // Fit: full width unless that makes it taller than the cap.
  const widthByHeight = maxHeight * aspect;
  const width = frameWidth > 0 ? Math.min(frameWidth, widthByHeight) : 0;
  const height = width / aspect;
  const scale = width / crop.width;
  return (
    <View
      style={embedded ? styles.rowEmbedded : styles.row}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setFrameWidth((current) => (current === next ? current : next));
      }}
    >
      {width > 0 ? (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : ZoomIn.springify().damping(18).stiffness(320)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.frame,
            { width, height, borderColor: tokens.border, backgroundColor: tokens.card },
          ]}
        >
          <CroppedBubbleImage source={source} crop={crop} scale={scale} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function CroppedBubbleImage({
  source,
  crop,
  scale,
}: {
  source: JapaneseLearningBubbleSource;
  crop: { x: number; y: number };
  scale: number;
}) {
  return (
    <MobileCachedImage
      cacheKind="page"
      fadeIn={false}
      fallback={null}
      uriOwnership={source.uriOwnership}
      source={{ uri: source.imageUri, headers: source.headers }}
      resizeMode="stretch"
      style={{
        position: "absolute",
        left: -crop.x * scale,
        top: -crop.y * scale,
        width: source.naturalSize.width * scale,
        height: source.naturalSize.height * scale,
      }}
    />
  );
}

/**
 * Web `TextPopout` as it appears over a compact sheet: the cropped bubble
 * floats above the sheet, centred horizontally at `max(15vh, safe top + 16)`,
 * 20% of the window tall (capped to 90% of its width), on `bg-background/95
 * rounded-xl shadow-2xl`. Render it over the reader, outside the sheet; it
 * never takes touches.
 */
export function JapaneseLearningBubblePopout({
  source,
  accessibilityLabel,
  progress,
}: {
  source: JapaneseLearningBubbleSource;
  accessibilityLabel: string;
  progress: SharedValue<number>;
}) {
  const { tokens } = useNemuTheme();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const adaptive = useMobileAdaptiveLayout();
  // A compact-height sheet covers the whole window; the sheet shows the
  // bubble itself instead (`JapaneseLearningOcrResultSheet`).
  const { fullScreen, horizontalFold } = useJapaneseLearningDrawerFrame();
  // Book posture: stay in the sheet's pane, never across the fold.
  const region = japaneseLearningBubblePopoutRegion({
    platform: Platform.OS,
    posture: adaptive.posture,
    panels: adaptive.panels,
    layoutDirection: I18nManager.isRTL ? "rtl" : "ltr",
  });
  // The native sheet is the animation clock, including cancelled swipe dismissals.
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.1 + 0.9 * progress.value }],
  }));
  const crop = computeMobileOcrCropRect(japaneseLearningBubbleBoxInNaturalPixels(source), source.naturalSize);
  if (!crop || fullScreen) return null;
  const frame = japaneseLearningBubblePopoutFrame({
    cropWidth: crop.width,
    cropHeight: crop.height,
    windowWidth: window.width,
    windowHeight: window.height,
    safeAreaTop: insets.top,
    region,
    // Horizontal fold: the drawer takes the half below it, the popout the half above.
    verticalSpan: japaneseLearningBubblePopoutVerticalSpan({ horizontalFold, safeAreaTop: insets.top }),
  });
  if (!frame) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.popout,
          {
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
            backgroundColor: nemuColorWithAlpha(tokens.background, 0.95),
          },
          animatedStyle,
        ]}
      >
        <View style={styles.popoutClip}>
          <CroppedBubbleImage source={source} crop={crop} scale={frame.width / crop.width} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Web `rounded-xl shadow-2xl`.
  // Web: `rounded-xl` + `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)`.
  popout: {
    position: "absolute",
    borderRadius: 14.4,
    boxShadow: "0px 8px 32px 0px rgba(0,0,0,0.3), 0px 0px 0px 1px rgba(255,255,255,0.1)",
  },
  popoutClip: {
    flex: 1,
    borderRadius: 14.4,
    overflow: "hidden",
  },
  row: {
    width: "100%",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  rowEmbedded: {
    width: "100%",
    alignItems: "flex-start",
    paddingBottom: 12,
  },
  frame: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
