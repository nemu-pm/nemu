import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { glassChildrenAboveMaterialAvailable, glassViewAvailable } from "../../../modules/nemu-window-layout";
import { READER_CHROME_MATERIAL_CURVE } from "@/lib/mobileReaderChromeMotion";
import {
  MOBILE_READER_TITLE_RESIZE_MS,
  mobileReaderTitleTransition,
  mobileReaderTitleWidthAt,
  resolveMobileReaderTitleCapsuleWidth,
} from "@/lib/mobileReaderTitleMemory";
import { ReaderCapsule, type ReaderCapsuleProps } from "./ReaderCapsule";

const TITLE_EASING = Easing.bezier(...READER_CHROME_MATERIAL_CURVE);

/**
 * The text sits above the material, unclipped: on native glass where the
 * binary can host children there (older binaries clip to the glass's shape),
 * always on the painted fallback.
 */
const TITLE_TEXT_ABOVE_MATERIAL = glassChildrenAboveMaterialAvailable || !glassViewAvailable;

export type ReaderTitleCapsuleProps = Omit<ReaderCapsuleProps, "children" | "style" | "layout" | "childrenAboveMaterial"> & {
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
 * one frame (designer, build 9 round 3):
 * - the text is laid out at the widest the capsule can be, centred, and
 *   drawn above the material unclipped (native glass: `childrenAboveMaterial`,
 *   its children in a layer over the effect view, which clips to its shape);
 *   only the glass widens or narrows behind it, around its centre (the slot
 *   centres the capsule);
 * - one transition (`progress` 0 → 1, 200 ms, UIKit's ease-out) drives the
 *   width and the cross-fade: the new text is fully shown exactly when the
 *   width arrives, the old one gone;
 * - a page number moving on alone only resizes (its digits are tabular, so
 *   only a new digit count, 9 → 10, changes the width).
 *
 * The content's natural width is measured by a hidden copy laid out in the
 * slot without the capsule's width; it is remounted with each new content,
 * so a same-width change still reports (and starts the cross-fade). Hidden
 * or still transparent (the opening's hold): set at once.
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

  // One transition: width = from → to by `progress`; while content `fadingId`
  // cross-fades, its text's opacity is `progress` and the old one's 1 − it.
  const fromWidth = useSharedValue(0);
  const toWidth = useSharedValue(0);
  const progress = useSharedValue(1);
  const fadingId = useSharedValue(-1);
  // The newest content whose first measurement has been applied.
  const settledId = useSharedValue(0);
  const naturalRef = useRef<number | null>(null);
  // The text is laid out at the widest the capsule can be, centred on it:
  // never truncated by the capsule's width in between (a widening capsule or
  // a page number that just gained a digit), drawn over the material unclipped.
  // Until the first measurement the capsule sizes to its text as usual.
  const [measured, setMeasured] = useState(false);
  const layerWidth = measured ? Math.max(0, maxWidth - paddingHorizontal * 2) : null;

  // Each content is its own keyed layer; on a change while shown the previous
  // one stays (absolute, centred, its own width) until the transition ends,
  // and the new one mounts hidden until its first measurement starts it.
  const lastChildrenRef = useRef<ReactNode>(children);
  const [content, setContent] = useState({ key: contentKey, id: 0, startHidden: false });
  const [outgoing, setOutgoing] = useState<{ node: ReactNode; id: number } | null>(null);
  if (content.key !== contentKey) {
    const id = content.id + 1;
    setContent({ key: contentKey, id, startHidden: visible });
    setOutgoing(visible ? { node: lastChildrenRef.current, id } : null);
  }
  const contentRef = useRef(content);
  contentRef.current = content;
  useLayoutEffect(() => {
    lastChildrenRef.current = children;
  });

  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const measuredRef = useRef(false);
  const apply = useCallback(
    (natural: number) => {
      naturalRef.current = natural;
      const next = resolveMobileReaderTitleCapsuleWidth({ natural, minWidth, maxWidth });
      if (next == null) return;
      const { id, startHidden } = contentRef.current;
      const contentChanged = settledId.value !== id;
      settledId.value = id;
      // Mid-transition: from where the width is now.
      const currentWidth = measuredRef.current
        ? mobileReaderTitleWidthAt(fromWidth.value, toWidth.value, progress.value)
        : null;
      measuredRef.current = true;
      setMeasured(true);
      const transition = mobileReaderTitleTransition({
        currentWidth,
        nextWidth: next,
        contentChanged: contentChanged && startHidden,
        visible: visibleRef.current,
        reduceMotion: reduceMotionRef.current,
      });
      if (transition.kind === "none") return;
      if (transition.kind === "set") {
        fromWidth.value = transition.width;
        toWidth.value = transition.width;
        fadingId.value = -1;
        progress.value = 1;
        setOutgoing(null);
        return;
      }
      fromWidth.value = transition.fromWidth;
      toWidth.value = transition.toWidth;
      fadingId.value = transition.crossFade ? id : -1;
      progress.value = 0;
      progress.value = withTiming(1, { duration: MOBILE_READER_TITLE_RESIZE_MS, easing: TITLE_EASING });
    },
    [fadingId, fromWidth, maxWidth, minWidth, progress, settledId, toWidth],
  );
  // A new range (the slot moved or resized) re-clamps the measured width.
  useLayoutEffect(() => {
    if (naturalRef.current != null) apply(naturalRef.current);
  }, [apply]);
  const onMeasure = useCallback((event: LayoutChangeEvent) => apply(event.nativeEvent.layout.width), [apply]);
  // The old text leaves once its transition is surely over.
  useLayoutEffect(() => {
    if (!outgoing) return;
    const timer = setTimeout(
      () => setOutgoing((current) => (current?.id === outgoing.id ? null : current)),
      MOBILE_READER_TITLE_RESIZE_MS * 2 + 80,
    );
    return () => clearTimeout(timer);
  }, [outgoing]);

  // The capsule passes its style to the animated glass host.
  const widthStyle = useAnimatedStyle(() =>
    toWidth.value > 0 ? { width: mobileReaderTitleWidthAt(fromWidth.value, toWidth.value, progress.value) } : {},
  ) as StyleProp<ViewStyle>;

  return (
    <>
      <View
        key={content.id}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onMeasure}
        style={[styles.measurer, { height: flat.height, paddingHorizontal, maxWidth }]}
      >
        {children}
      </View>
      <ReaderCapsule
        {...capsule}
        childrenAboveMaterial={TITLE_TEXT_ABOVE_MATERIAL}
        style={[style, { minWidth, maxWidth }, widthStyle]}
      >
        {outgoing ? (
          <TitleLayer
            key={`out-${outgoing.id}`}
            role="outgoing"
            id={outgoing.id}
            startHidden={false}
            progress={progress}
            fadingId={fadingId}
            settledId={settledId}
            width={layerWidth}
          >
            {outgoing.node}
          </TitleLayer>
        ) : null}
        <TitleLayer
          key={content.id}
          role="incoming"
          id={content.id}
          startHidden={content.startHidden}
          progress={progress}
          fadingId={fadingId}
          settledId={settledId}
          width={layerWidth}
        >
          {children}
        </TitleLayer>
      </ReaderCapsule>
    </>
  );
}

/**
 * One content of the capsule, at its own (final) width, centred. Its opacity
 * follows the transition: the incoming text is hidden from its mount until
 * its measurement starts the cross-fade (`startHidden`), then `progress`;
 * the outgoing one is 1 − `progress` once the incoming fade has started.
 * Its own animated style, so a newly mounted layer starts from its own state.
 */
function TitleLayer({
  role,
  id,
  startHidden,
  progress,
  fadingId,
  settledId,
  width,
  children,
}: {
  role: "incoming" | "outgoing";
  id: number;
  startHidden: boolean;
  progress: SharedValue<number>;
  fadingId: SharedValue<number>;
  settledId: SharedValue<number>;
  width: number | null;
  children: ReactNode;
}) {
  const opacityStyle = useAnimatedStyle(() => {
    if (role === "outgoing") {
      if (fadingId.value === id) return { opacity: 1 - progress.value };
      return { opacity: settledId.value < id ? 1 : 0 };
    }
    if (fadingId.value === id) return { opacity: progress.value };
    return { opacity: startHidden && settledId.value < id ? 0 : 1 };
  });
  if (role === "outgoing") {
    return (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.outgoing, opacityStyle]}
      >
        <View style={width != null ? { width } : undefined}>{children}</View>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[width != null ? [styles.content, { width }] : null, opacityStyle]}>
      {children}
    </Animated.View>
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
  outgoing: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
