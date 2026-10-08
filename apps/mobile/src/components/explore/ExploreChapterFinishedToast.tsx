import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { nemuFontWeight, NemuText } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { ExploreGlass } from "./ExploreGlass";
import { useMobileChapterFinishedMoment } from "./mobileChapterFinishedMoment";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Timing of the moment: in, held, out (ms). It never waits on the reader. */
export const CHAPTER_FINISHED_TIMING = { in: 220, check: 320, hold: 1500, out: 320 } as const;
/** Length of the check stroke below (`M5.2 9.4 7.9 12 12.8 6.4`), rounded up. */
const CHECK_LENGTH = 12;
const GLYPH = 18;
const CAPSULE_TINT = "rgba(18,18,20,0.78)";

/**
 * The chapter-finished moment (design-explore): reading past a chapter's last
 * page goes straight on into the next chapter, as it always did, and a small
 * glass capsule under the reader's title says the one just left is done — a
 * check drawing itself in a ring, "Ch.118 finished" — then leaves on its own.
 * It takes no touches and holds nothing up; Reduce Motion: it fades in and
 * out, the check already drawn.
 */
export function ExploreChapterFinishedToast({ top, strings }: { top: number; strings: MobileStrings }) {
  const moment = useMobileChapterFinishedMoment();
  const reducedMotion = useReducedMotion();
  // The moment whose capsule has finished leaving (set when its fade ends).
  const [doneId, setDoneId] = useState(0);
  const shown = moment && moment.id !== doneId ? moment : null;
  const shownId = shown?.id ?? 0;
  const opacity = useSharedValue(0);
  const rise = useSharedValue(6);
  const drawn = useSharedValue(0);

  useEffect(() => {
    if (!shownId) return;
    const { in: enter, check, hold, out } = CHAPTER_FINISHED_TIMING;
    const ease = Easing.out(Easing.cubic);
    const done = () => setDoneId(shownId);
    opacity.set(0);
    rise.set(reducedMotion ? 0 : 6);
    drawn.set(reducedMotion ? 1 : 0);
    opacity.set(
      withSequence(
        withTiming(1, { duration: enter, easing: ease }),
        withDelay(
          check + hold,
          withTiming(0, { duration: out, easing: Easing.in(Easing.quad) }, (finished) => {
            if (finished) runOnJS(done)();
          }),
        ),
      ),
    );
    if (!reducedMotion) {
      rise.set(withTiming(0, { duration: enter, easing: ease }));
      drawn.set(withDelay(enter * 0.6, withTiming(1, { duration: check, easing: Easing.inOut(Easing.cubic) })));
    }
  }, [drawn, opacity, reducedMotion, rise, shownId]);

  const capsuleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: rise.value }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - drawn.value),
  }));

  if (!shown) return null;
  const text = formatMobileString(strings.designExplore.chapterFinished, { chapter: shown.label });
  return (
    <View pointerEvents="none" style={[styles.host, { top }]}>
      <Animated.View accessible accessibilityLiveRegion="polite" accessibilityLabel={text} style={capsuleStyle}>
        {/* Dark glass: it reads over a white page and a black one alike. */}
        <ExploreGlass tintColor={CAPSULE_TINT} style={styles.capsule}>
          <View style={styles.row}>
            <Svg width={GLYPH} height={GLYPH} viewBox="0 0 18 18">
              <Circle cx={9} cy={9} r={7.6} stroke="rgba(255,255,255,0.55)" strokeWidth={1.3} fill="none" />
              <AnimatedPath
                d="M5.2 9.4 7.9 12 12.8 6.4"
                stroke="#ffffff"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={CHECK_LENGTH}
                animatedProps={checkProps}
              />
            </Svg>
            <NemuText numberOfLines={1} maxFontSizeMultiplier={1.3} color="#ffffff" style={styles.label}>
              {text}
            </NemuText>
          </View>
        </ExploreGlass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },
  capsule: {
    minHeight: 36,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
});
