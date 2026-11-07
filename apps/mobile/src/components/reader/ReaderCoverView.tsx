import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { MobileCachedImage } from "@/design-system";
import {
  MOBILE_READER_COVER_VIEW_PAGE_BLUR,
  type MobileReaderCoverViewImage,
} from "@/lib/mobileReaderCoverView";

/**
 * iPhone Duo outer display: the title's cover over the whole window, edge to
 * edge under the camera and the vertical bar (as Apple Books there). It owns
 * every touch while it shows, so nothing reaches the page: a tap only shows or
 * hides the system chrome (status bar, Back and the toggle in the bar).
 */
export function ReaderCoverView({
  image,
  fadeMs,
  accessibilityLabel,
  accessibilityHint,
  onToggleChrome,
}: {
  image: MobileReaderCoverViewImage;
  /** The crossfade in and out; 0 (Reduce Motion) swaps at once. */
  fadeMs: number;
  accessibilityLabel: string;
  accessibilityHint: string;
  onToggleChrome: () => void;
}) {
  return (
    <Animated.View
      entering={fadeMs > 0 ? FadeIn.duration(fadeMs) : undefined}
      exiting={fadeMs > 0 ? FadeOut.duration(fadeMs) : undefined}
      style={[StyleSheet.absoluteFill, styles.backdrop, styles.layer]}
      // The page underneath is out of VoiceOver's reach while the cover is up;
      // Back and the toggle are in the system bar, outside this view.
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onToggleChrome}
        style={StyleSheet.absoluteFill}
      >
        <MobileCachedImage
          uriOwnership={image.uriOwnership}
          cacheKind={image.cacheKind}
          source={{ uri: image.uri, headers: image.headers }}
          // The layer itself fades; the image must not fade again inside it.
          fadeIn={false}
          fallback={<View style={[StyleSheet.absoluteFill, styles.backdrop]} />}
          blurRadius={image.blurred ? MOBILE_READER_COVER_VIEW_PAGE_BLUR : undefined}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000" },
  // Over the reader's chrome layer (20) as it dematerializes, under the
  // learning sheets' overlay (30).
  layer: { zIndex: 25, elevation: 25 },
});
