import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { useMobileExploreZoomLanded } from "@/components/explore/mobileExploreZoomLanded";
import { ReaderZoomEntryContext, type ReaderZoomEntry } from "@/components/reader/readerZoomEntry";
import { MobileCachedImage } from "@/design-system";
import { getMobileReaderZoomCoverFrame, peekMobileReaderZoomCover } from "@/lib/mobileReaderZoomHandoff";
import { ReaderScreen } from "@/screens/ReaderScreen";
import { ZoomTarget } from "../../../../../modules/nemu-window-layout";

/** The landing cover fades into the first page, and back in as the reader leaves. */
const COVER_REVEAL_MS = 240;
const COVER_RETURN_MS = 180;
/** A page that is slow to load (or fails) is not waited for any longer than this. */
const COVER_HOLD_MAX_MS = 1500;

export default function ReaderRoute() {
  const { zoom } = useLocalSearchParams<{ zoom?: string }>();
  // Design-explore: the reader grows out of the cover that opened it. No
  // swipe-to-dismiss: page turns own the reader's gestures.
  return (
    <MobileExploreZoomRoute zoomId={zoom} interactiveDismiss={false}>
      <ReaderAfterZoom zoomId={zoom ?? null} />
    </MobileExploreZoomRoute>
  );
}

/**
 * The reader is far too heavy to mount in the commit a zoom pushes, so the
 * zoom lands on the tapped cover, laid out where the first page will be, and
 * the reader mounts underneath once it has landed; the cover fades into the
 * first page when it has drawn. Outside a zoom this is the reader and nothing
 * else.
 */
function ReaderAfterZoom({ zoomId }: { zoomId: string | null }) {
  const landed = useMobileExploreZoomLanded();
  const [cover] = useState(() => peekMobileReaderZoomCover(zoomId));
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = getMobileReaderZoomCoverFrame({ width: window.width, height: window.height, insets });
  const opacity = useSharedValue(1);
  const [pageShown, setPageShown] = useState(false);
  const onFirstPage = useCallback(() => setPageShown(true), []);
  useEffect(() => {
    if (!landed || pageShown) return;
    const timer = setTimeout(onFirstPage, COVER_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [landed, onFirstPage, pageShown]);
  useEffect(() => {
    if (pageShown) opacity.value = withTiming(0, { duration: COVER_REVEAL_MS });
  }, [opacity, pageShown]);
  const onLeave = useCallback(() => {
    opacity.value = withTiming(1, { duration: COVER_RETURN_MS });
  }, [opacity]);
  const entry = useMemo<ReaderZoomEntry>(() => ({ onFirstPage, onLeave }), [onFirstPage, onLeave]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.backdrop}>
      {landed ? (
        <ReaderZoomEntryContext.Provider value={entry}>
          <ReaderScreen />
        </ReaderZoomEntryContext.Provider>
      ) : null}
      {cover && zoomId ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverStyle]}>
          {/* Where the zoom lands, both ways: the cover grows into this frame
              and the zoom back shrinks it into the source cover. */}
          <ZoomTarget
            zoomId={zoomId}
            style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
          >
            <MobileCachedImage
              uriOwnership="source"
              cacheKind="cover"
              source={cover}
              // No fade inside the native zoom target.
              fadeIn={false}
              fallback={null}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          </ZoomTarget>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The reader's page background.
  backdrop: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
