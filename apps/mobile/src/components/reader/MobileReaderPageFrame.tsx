import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type ImageProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  NemuText,
  nemuFontWeight,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import type { MobileCachedSegmentedImageAsset } from "@/lib/mobileImageCache";
import { ReaderCapsuleButton } from "@/components/reader/ReaderCapsuleButton";

const READER_IMAGE_STATUS_BACKGROUND = "rgba(0,0,0,0.58)";
const READER_IMAGE_STATUS_TEXT = "rgba(255,255,255,0.86)";
const READER_IMAGE_STATUS_ICON = "rgba(255,255,255,0.72)";

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
  offline?: boolean;
  strings: MobileStrings;
  onImageError: (error: string) => void;
  onImageLoad: (size: MobileImageSize) => void;
  onImageLoadStart: () => void;
  /** Clears the latched failure and re-requests this page's image. */
  onRetry?: () => void;
  onSegmentedImage?: (asset: MobileCachedSegmentedImageAsset | null) => void;
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
  offline = false,
  strings,
  onImageError,
  onImageLoad,
  onImageLoadStart,
  onRetry,
  onSegmentedImage,
}: MobileReaderPageFrameProps) {
  const canRetry = Boolean(error) && Boolean(onRetry);

  return (
    <View
      style={[
        styles.readerImageFrame,
        {
          width: frameSize.width,
          height: frameSize.height,
          // Painted only while there is no image to show (loading / error).
          // A decoded page covers its frame anyway, and a transparent frame
          // lets the previous list show through while a remounted one
          // decodes (spread ⇄ single, rotation) instead of a black box.
          backgroundColor: loading || error ? backgroundColor : "transparent",
        },
      ]}
    >
      <MobileCachedImage
        cacheKind="page"
        allowLongStripSegments={allowLongStripSegments}
        cacheKey={cacheKey}
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
        style={styles.readerImage}
      />
      {loading || error ? (
        <View
          // A failed page must be recoverable: the overlay only stays inert
          // while there is nothing to tap.
          pointerEvents={canRetry ? "auto" : "none"}
          style={[
            styles.readerImageStatusOverlay,
            {
              backgroundColor: READER_IMAGE_STATUS_BACKGROUND,
            },
          ]}
        >
          {error ? (
            <Ionicons
              name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
              size={22}
              color={READER_IMAGE_STATUS_ICON}
            />
          ) : (
            <ActivityIndicator color={READER_IMAGE_STATUS_TEXT} size="small" />
          )}
          <NemuText
            numberOfLines={2}
            style={[
              styles.readerImageStatusText,
              { color: READER_IMAGE_STATUS_TEXT },
            ]}
          >
            {error
              ? offline
                ? strings.feedback.readerWaitingForNetwork
                : strings.reader.pageImageFailed
              : strings.reader.pageImageLoading}
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
