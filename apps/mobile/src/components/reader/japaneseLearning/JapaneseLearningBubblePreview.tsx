import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, ZoomIn, useReducedMotion } from "react-native-reanimated";
import { MobileCachedImage, radius, useNemuTheme } from "@/design-system";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import {
  computeMobileOcrCropRect,
  type MobileImageSize,
} from "@/lib/mobileJapaneseLearningOverlay";
import type { MobileOcrDetection } from "@/lib/mobileJapaneseLearningOcr";

export type JapaneseLearningBubbleSource = {
  imageUri: string;
  headers?: Record<string, string>;
  uriOwnership: MobileImageUriOwnership;
  /** The page image's natural pixel size (detection boxes are in this space). */
  naturalSize: MobileImageSize;
  /** The selected bubble. */
  box: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">;
};

/** Web text-popout: the crop keeps ~20% of the window height, capped to the width. */
const PREVIEW_MAX_HEIGHT = 150;

/**
 * Mobile port of web `TextPopout` (japanese-learning/ui/text-popout.tsx):
 * the selected speech bubble cropped from the page (10px padding, as web's
 * `cropBoxFromImage`) above the sentence, so the reader sees which bubble the
 * analysis is about. Drawn by offsetting the full page image inside a clipped
 * frame — no bitmap copy — and it pops in like web's spring unless Reduce
 * Motion is on.
 */
export function JapaneseLearningBubblePreview({
  source,
  accessibilityLabel,
}: {
  source: JapaneseLearningBubbleSource;
  accessibilityLabel: string;
}) {
  const { tokens } = useNemuTheme();
  const reduceMotion = useReducedMotion();
  const [frameWidth, setFrameWidth] = useState(0);
  const crop = computeMobileOcrCropRect(source.box, source.naturalSize);
  if (!crop) return null;
  const aspect = crop.width / crop.height;
  // Fit: full width unless that makes it taller than the cap.
  const widthByHeight = PREVIEW_MAX_HEIGHT * aspect;
  const width = frameWidth > 0 ? Math.min(frameWidth, widthByHeight) : 0;
  const height = width / aspect;
  const scale = width / crop.width;
  return (
    <View
      style={styles.row}
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
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  frame: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
