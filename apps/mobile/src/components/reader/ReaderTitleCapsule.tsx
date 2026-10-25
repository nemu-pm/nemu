import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { READER_CHROME_MATERIAL_CURVE } from "@/lib/mobileReaderChromeMotion";
import {
  MOBILE_READER_TITLE_RESIZE_MS,
  mobileReaderTitleWidthChange,
  resolveMobileReaderTitleCapsuleWidth,
} from "@/lib/mobileReaderTitleMemory";
import { ReaderCapsule, type ReaderCapsuleProps } from "./ReaderCapsule";

const TITLE_EASING = Easing.bezier(...READER_CHROME_MATERIAL_CURVE);
const TITLE_FADE_IN = FadeIn.duration(MOBILE_READER_TITLE_RESIZE_MS).easing(TITLE_EASING);
const TITLE_FADE_OUT = FadeOut.duration(MOBILE_READER_TITLE_RESIZE_MS).easing(TITLE_EASING);

export type ReaderTitleCapsuleProps = Omit<ReaderCapsuleProps, "children" | "style" | "layout"> & {
  /** The capsule's own style (height, padding); its width is this component's. */
  style: StyleProp<ViewStyle>;
  /** The slot's width range (`mobileReaderTitleCapsuleWidthRange`). */
  minWidth: number;
  maxWidth: number;
  /** What the content says (`mobileReaderTitleContentKey`): a change cross-fades. */
  contentKey: string;
  /** The capsule is on screen (shown, past the opening's transparent hold). */
  visible: boolean;
  reduceMotion: boolean;
  children: ReactNode;
};

/**
 * The reader's title capsule. A change of its text never jumps its width in
 * one frame: the capsule resizes around its centre (the slot centres it)
 * over 200 ms on UIKit's ease-out, and the old and new text cross-fade
 * (designer, build 9 round 3: the cold open's "Fetching pages" → page count).
 *
 * The content's natural width is measured by a hidden copy laid out without
 * the capsule's width (it is absolute in the slot), so the capsule can be
 * given an explicit, animated width. The content keeps its final width,
 * centred, while the capsule resizes (no ellipsis mid-resize). Hidden or
 * still transparent (the opening's hold) it is set at once.
 */
export function ReaderTitleCapsule({
  style,
  minWidth,
  maxWidth,
  contentKey,
  visible,
  reduceMotion,
  children,
  ...capsule
}: ReaderTitleCapsuleProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const paddingHorizontal = typeof flat.paddingHorizontal === "number" ? flat.paddingHorizontal : 0;
  const width = useSharedValue(0);
  const widthRef = useRef<number | null>(null);
  const naturalRef = useRef<number | null>(null);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const apply = useCallback(
    (natural: number) => {
      naturalRef.current = natural;
      const next = resolveMobileReaderTitleCapsuleWidth({ natural, minWidth, maxWidth });
      if (next == null) return;
      const change = mobileReaderTitleWidthChange({
        previous: widthRef.current,
        next,
        visible: visibleRef.current,
        reduceMotion,
      });
      if (change === "none") return;
      widthRef.current = next;
      width.value = change === "animate"
        ? withTiming(next, { duration: MOBILE_READER_TITLE_RESIZE_MS, easing: TITLE_EASING })
        : next;
      setContentWidth(Math.max(0, next - paddingHorizontal * 2));
    },
    [maxWidth, minWidth, paddingHorizontal, reduceMotion, width],
  );
  // A new range (the slot moved or resized) re-clamps the measured width.
  useLayoutEffect(() => {
    if (naturalRef.current != null) apply(naturalRef.current);
  }, [apply]);
  const onMeasure = useCallback((event: LayoutChangeEvent) => apply(event.nativeEvent.layout.width), [apply]);
  const widthStyle = useAnimatedStyle(() => (width.value > 0 ? { width: width.value } : {}));

  // Each content gets its own keyed view: a new one fades in, the old one
  // fades out where it was (centred on the same centre), while shown.
  const [content, setContent] = useState({ key: contentKey, id: 0 });
  if (content.key !== contentKey) setContent({ key: contentKey, id: content.id + 1 });
  const crossFade = visible;

  return (
    <>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onMeasure}
        style={[
          styles.measurer,
          { height: flat.height, paddingHorizontal, maxWidth },
        ]}
      >
        {children}
      </View>
      <ReaderCapsule {...capsule} style={[style, { minWidth, maxWidth }, widthStyle]}>
        <Animated.View
          key={content.id}
          entering={crossFade && content.id > 0 ? TITLE_FADE_IN : undefined}
          exiting={crossFade ? TITLE_FADE_OUT : undefined}
          style={contentWidth != null ? [styles.content, { width: contentWidth }] : undefined}
        >
          {children}
        </Animated.View>
      </ReaderCapsule>
    </>
  );
}

const styles = StyleSheet.create({
  measurer: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignSelf: "center",
  },
});
