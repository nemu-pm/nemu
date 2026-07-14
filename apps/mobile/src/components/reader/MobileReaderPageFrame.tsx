import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileCachedImage, nemuFontWeight } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import type { MobileImageUriOwnership } from "@/lib/mobileImageUriPolicy";

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
  loading: boolean;
  strings: MobileStrings;
  onImageError: (error: string) => void;
  onImageLoad: (size: MobileImageSize) => void;
  onImageLoadStart: () => void;
};

export function MobileReaderPageFrame({
  backgroundColor,
  children,
  error,
  frameSize,
  headers,
  imageUri,
  imageUriOwnership,
  loading,
  strings,
  onImageError,
  onImageLoad,
  onImageLoadStart,
}: MobileReaderPageFrameProps) {
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
        fallback={null}
        uriOwnership={imageUriOwnership}
        source={{ uri: imageUri, headers }}
        onLoadStart={onImageLoadStart}
        onLoad={(event) => {
          const { width, height } = event.nativeEvent.source;
          onImageLoad({ width, height });
        }}
        onError={onImageError}
        resizeMode="contain"
        style={styles.readerImage}
      />
      {loading || error ? (
        <View
          pointerEvents="none"
          style={[
            styles.readerImageStatusOverlay,
            {
              backgroundColor: READER_IMAGE_STATUS_BACKGROUND,
            },
          ]}
        >
          {error ? (
            <Ionicons
              name="alert-circle-outline"
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
              ? strings.reader.pageImageFailed
              : strings.reader.pageImageLoading}
          </Text>
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
});
