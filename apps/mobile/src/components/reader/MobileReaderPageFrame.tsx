import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ImageProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  NemuPressable,
  nemuFontWeight,
  radius,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";
import type { MobileCachedSegmentedImageAsset } from "@/lib/mobileImageCache";

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
          backgroundColor,
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
          <Text
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
          </Text>
          {canRetry ? (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.reader.pageImageRetry}
              hapticFeedback="press"
              onPress={onRetry}
              // Retrying must not also toggle the reader chrome, which the
              // stage derives from bubbled touch events.
              onTouchEnd={(event) => event.stopPropagation()}
              pressedScale={0.97}
              style={styles.readerImageRetryButton}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={READER_IMAGE_STATUS_TEXT}
              />
              <Text
                style={[
                  styles.readerImageRetryText,
                  { color: READER_IMAGE_STATUS_TEXT },
                ]}
              >
                {strings.common.retry}
              </Text>
            </NemuPressable>
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
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  readerImageRetryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: READER_IMAGE_STATUS_ICON,
    paddingHorizontal: 16,
  },
  readerImageRetryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
});
