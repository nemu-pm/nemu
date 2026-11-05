import { useCallback, useContext, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type ImageProps,
  type ViewInstance,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  NemuText,
  nemuFontWeight,
} from "@/design-system";
import { MobileReaderCurlLeafOffsetContext } from "./mobileReaderCurlLeafOffset";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import type { MobileCachedSegmentedImageAsset } from "@/lib/mobileImageCache";
import { ReaderCapsuleButton } from "@/components/reader/ReaderCapsuleButton";
import { MobileReaderPageSpinner } from "@/components/reader/MobileReaderPageSpinner";
import { mobileReaderPageStatusColor } from "@/lib/mobileReaderPageLoading";
import { MOBILE_READER_SCROLL_IMAGE_FADE_MS } from "@/lib/mobileReaderScrollPresentation";

type MobileReaderPageFrameProps = {
  backgroundColor: string;
  children?: ReactNode;
  error?: string;
  frameSize: MobileImageSize;
  headers?: Record<string, string>;
  imageUri: string;
  imageUriOwnership: MobileImageUriOwnership;
  imageResizeMode?: ImageProps["resizeMode"];
  allowLongStripSegments?: boolean;
  cacheKey?: string;
  loading: boolean;
  /**
   * Scroll reading: the background stays painted under the page, and pages
   * appear with the scroll fade (no wait on a JS load callback).
   */
  quietLoading?: boolean;
  /**
   * Paged reading's mounted pages (the current one and its neighbours): the
   * decode is kept in native's small bounded store for a reopen's stand-in
   * (MobileCachedImage `retainDecoded`). Never scroll reading's strips.
   */
  retainDecoded?: boolean | "current";
  /** Replaces a spinner: fades in even if this session has shown its image before. */
  fadeShownSource?: boolean;
  offline?: boolean;
  strings: MobileStrings;
  onImageError: (error: string) => void;
  onImageLoad: (size: MobileImageSize) => void;
  onImageLoadStart: () => void;
  /** Clears the latched failure and re-requests this page's image. */
  onRetry?: () => void;
  onSegmentedImage?: (asset: MobileCachedSegmentedImageAsset | null) => void;
  /**
   * The page's image must not be shown (its processing failed: the source's
   * scrambled original): only the frame and its status, never a request.
   */
  withholdImage?: boolean;
  /**
   * The frame's view (where the page sits, for the opening stand-in), with
   * the curl leaf's offset to add to what it measures (see
   * MobileReaderCurlLeafOffsetContext; none outside the curl).
   */
  frameRef?: (view: ViewInstance | null, leafOffset: { x: number; y: number } | null) => void;
};

export function MobileReaderPageFrame({
  backgroundColor,
  children,
  error,
  frameSize,
  headers,
  imageUri,
  imageUriOwnership,
  imageResizeMode = "contain",
  allowLongStripSegments,
  cacheKey,
  loading,
  quietLoading = false,
  retainDecoded = false,
  fadeShownSource = false,
  offline = false,
  strings,
  onImageError,
  onImageLoad,
  onImageLoadStart,
  onRetry,
  onSegmentedImage,
  withholdImage = false,
  frameRef,
}: MobileReaderPageFrameProps) {
  const leafOffset = useContext(MobileReaderCurlLeafOffsetContext);
  const attachFrame = useCallback(
    (view: ViewInstance | null) => frameRef?.(view, leafOffset),
    [frameRef, leafOffset],
  );
  const canRetry = Boolean(error) && Boolean(onRetry);
  // A page without its image: the reader background, a small native spinner
  // (after a short wait; in scroll reading only while on screen), and on a
  // failure its icon and text in the same quiet colour — never a dark card.
  const statusColor = mobileReaderPageStatusColor(backgroundColor);
  const waiting = loading && !error;

  return (
    <View
      ref={frameRef ? attachFrame : undefined}
      accessibilityLabel={waiting ? strings.reader.pageImageLoading : undefined}
      style={[
        styles.readerImageFrame,
        {
          width: frameSize.width,
          height: frameSize.height,
          // Painted only while there is no image to show (loading / error).
          // A decoded page covers its frame anyway, and a transparent frame
          // lets the previous list show through while a remounted one
          // decodes (spread ⇄ single, rotation) instead of a black box.
          // Scroll reading always keeps its background: a page that remounts
          // paints over it the moment it decodes.
          backgroundColor:
            loading || error || quietLoading ? backgroundColor : "transparent",
        },
      ]}
    >
      {withholdImage ? null : <MobileCachedImage
        cacheKind="page"
        allowLongStripSegments={allowLongStripSegments}
        cacheKey={cacheKey}
        fadeDurationMs={quietLoading ? MOBILE_READER_SCROLL_IMAGE_FADE_MS : undefined}
        fadeFromCache={!quietLoading}
        fadeShownSource={fadeShownSource}
        // Scroll reading paints a page as soon as native decodes it, with no
        // wait on a JS load callback to start a fade.
        fadeIn={!quietLoading}
        fallback={null}
        uriOwnership={imageUriOwnership}
        source={{ uri: imageUri, headers }}
        onLoadStart={onImageLoadStart}
        onLoad={(event) => {
          const { width, height } = event.nativeEvent.source;
          onImageLoad({ width, height });
        }}
        onError={onImageError}
        onSegmentedImage={onSegmentedImage}
        resizeMode={imageResizeMode}
        retainDecoded={quietLoading ? false : retainDecoded}
        style={styles.readerImage}
      />}
      {waiting && !withholdImage ? <MobileReaderPageSpinner color={statusColor} /> : null}
      {error ? (
        <View
          // A failed page must be recoverable: the status only stays inert
          // while there is nothing to tap.
          pointerEvents={canRetry ? "auto" : "none"}
          style={styles.readerImageStatusOverlay}
        >
          <Ionicons
            name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
            size={22}
            color={statusColor}
          />
          <NemuText
            numberOfLines={2}
            style={[
              styles.readerImageStatusText,
              { color: statusColor },
            ]}
          >
            {offline
              ? strings.feedback.readerWaitingForNetwork
              : strings.reader.pageImageFailed}
          </NemuText>
          {canRetry && onRetry ? (
            // The chrome's capsule language: dark glass, icon + label, 44pt.
            <ReaderCapsuleButton
              label={strings.common.retry}
              accessibilityLabel={strings.reader.pageImageRetry}
              icon="refresh"
              onPress={onRetry}
              // Retrying must not also toggle the reader chrome, which the
              // stage derives from bubbled touch events.
              stopTouchPropagation
              style={styles.readerImageRetryCapsule}
            />
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  readerImage: {
    width: "100%",
    height: "100%",
  },
  readerImageFrame: {
    position: "relative",
    overflow: "hidden",
  },
  readerImageStatusOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 18,
  },
  readerImageStatusText: {
    maxWidth: 260,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  readerImageRetryCapsule: {
    marginTop: 6,
  },
});
