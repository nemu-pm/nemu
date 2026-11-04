import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { MobileCachedImage, useNemuTheme } from "@/design-system";
import { resolveMobileExploreCoverState } from "@/lib/mobileExploreCoverState";
import { useSkeletonPulse } from "@/lib/useSkeletonPulse";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";

type CoverSource = { uri: string; headers?: Record<string, string>; cache?: "force-cache" | "default" };

/**
 * A source cover with a face for every moment: a quiet breathing tile while it
 * loads (never the grey book glyph that read as broken), the image fading in,
 * and the titled cloth book when there is no cover or it fails. Fills its
 * parent; the parent supplies the frame, radius and shadow.
 */
export function ExploreCoverImage({
  source,
  title,
  style,
}: {
  source: CoverSource | null;
  title: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens, reduceMotion } = useNemuTheme();
  const uri = source?.uri ?? null;
  // What the image reported, for this cover only (a recycled cell's new cover starts over).
  const [report, setReport] = useState<{ uri: string | null; loaded: boolean; failed: boolean }>({
    uri,
    loaded: false,
    failed: false,
  });
  const { loaded, failed } = report.uri === uri ? report : { loaded: false, failed: false };
  const [width, setWidth] = useState(120);
  const state = resolveMobileExploreCoverState({ hasSource: Boolean(source), loaded, failed });
  const pulse = useSkeletonPulse(reduceMotion === true, state === "loading");
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const placeholder = <MobileExploreCoverPlaceholder title={title} width={width} />;
  return (
    <View onLayout={onLayout} style={[styles.fill, style]}>
      {state === "failed" ? (
        placeholder
      ) : (
        <>
          {state === "loading" ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.muted }, pulseStyle]} />
          ) : null}
          {source ? (
            <MobileCachedImage
              uriOwnership="source"
              source={source}
              fallback={<View style={StyleSheet.absoluteFill} />}
              onLoad={() => setReport({ uri, loaded: true, failed: false })}
              onError={() => setReport({ uri, loaded: false, failed: true })}
              style={styles.fill}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%", overflow: "hidden" },
});
