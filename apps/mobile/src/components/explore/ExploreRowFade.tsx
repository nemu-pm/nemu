import type { ComponentType, ReactElement, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { MOBILE_EXPLORE_BAR_SIDE_GAP } from "@/lib/mobileExploreRowBleed";
import type { MobileExploreRowBleed } from "@/lib/mobileExploreRowBleed";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { ExploreGradient } from "./ExploreGradient";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "box-none";
  style?: object;
}>;

/**
 * Room above and below the row that its shadows fade out in: the largest
 * shadow (a 24 pt blur, 12 pt down) with 2x the blur to spare.
 */
export const EXPLORE_ROW_FADE_ABOVE = 72;
export const EXPLORE_ROW_FADE_BELOW = 96;

/**
 * The edge of a design-explore row beside the system's vertical bar. Cards
 * must not slide under the bar, but a hard clip showed as straight cuts in
 * the cards' shadows and glow. The row is masked instead: opaque over the
 * cards and a generous margin above and below (shadows fade out inside it),
 * and fading to nothing across the last `MOBILE_EXPLORE_BAR_SIDE_GAP` of the
 * frame, which the row's content leaves empty at rest (the frame reaches the
 * bar's column; the first and last items stop that gap short of it).
 * Away from a vertical bar this is a plain pass-through.
 */
export function ExploreRowFade({
  bleed,
  children,
}: {
  bleed: MobileExploreRowBleed;
  children: ReactNode;
}) {
  const { verticalBarSide: barSide } = useMobileAdaptiveLayout();
  if (!bleed.clips || !barSide) return <>{children}</>;
  const right = barSide === "right";
  const stops = right
    ? (["#000000", "rgba(0,0,0,0)"] as const)
    : (["rgba(0,0,0,0)", "#000000"] as const);
  const fade = (
    <ExploreGradient
      direction="right"
      colors={stops}
      style={{ width: MOBILE_EXPLORE_BAR_SIDE_GAP }}
    />
  );
  const solid = <View style={styles.solid} />;
  return (
    <MaskedView
      pointerEvents="box-none"
      style={{
        marginTop: -EXPLORE_ROW_FADE_ABOVE,
        marginBottom: -EXPLORE_ROW_FADE_BELOW,
      }}
      maskElement={
        <View style={styles.mask}>
          {right ? solid : fade}
          {right ? fade : solid}
        </View>
      }
    >
      <View
        pointerEvents="box-none"
        style={{
          paddingTop: EXPLORE_ROW_FADE_ABOVE,
          paddingBottom: EXPLORE_ROW_FADE_BELOW,
        }}
      >
        {children}
      </View>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, flexDirection: "row", backgroundColor: "transparent" },
  solid: { flex: 1, backgroundColor: "#000000" },
});
