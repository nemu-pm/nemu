import type { ComponentType, ReactElement, ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { NemuHorizontalScrollEdges, nemuHorizontalScrollEdgesAvailable, useNemuTheme } from "@/design-system";
import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { ExploreGradient } from "./ExploreGradient";
import { EXPLORE_ROW_FADE_ABOVE, EXPLORE_ROW_FADE_BELOW } from "./ExploreRowFade";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "box-none";
  style?: object;
}>;

/** The width a rail's content fades out over at each screen edge. */
export const EXPLORE_RAIL_FADE = 22;

/**
 * A horizontal rail whose ends dissolve instead of being cut: UIKit's soft edge
 * effect on iOS 26 (`NemuHorizontalScrollEdges`). Elsewhere a mask, opaque across
 * the middle, fading to nothing over the last `EXPLORE_RAIL_FADE` at both edges.
 * The rail inside already bleeds to the screen edges; the mask only softens them.
 *
 * Vertically the mask reaches well past the rail (ExploreRowFade's overscan),
 * so the cards' shadows and glow fade out inside it instead of ending in a
 * straight line at the rail's top and bottom; the scroller inside sets
 * `overflow: "visible"` (`EXPLORE_RAIL_FADE_SCROLLER`) for the same reason.
 */
export function ExploreRailFade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (nemuHorizontalScrollEdgesAvailable) {
    return (
      <View pointerEvents="box-none" style={style}>
        {children}
        <NemuHorizontalScrollEdges />
      </View>
    );
  }
  const frame = StyleSheet.flatten(style) ?? {};
  const marginTop = typeof frame.marginTop === "number" ? frame.marginTop : 0;
  const marginBottom = typeof frame.marginBottom === "number" ? frame.marginBottom : 0;
  return (
    <MaskedView
      pointerEvents="box-none"
      style={{
        ...frame,
        marginTop: marginTop - EXPLORE_ROW_FADE_ABOVE,
        marginBottom: marginBottom - EXPLORE_ROW_FADE_BELOW,
      }}
      maskElement={
        <View style={styles.mask}>
          <ExploreGradient direction="right" colors={["rgba(0,0,0,0)", "#000000"]} style={{ width: EXPLORE_RAIL_FADE }} />
          <View style={styles.solid} />
          <ExploreGradient direction="right" colors={["#000000", "rgba(0,0,0,0)"]} style={{ width: EXPLORE_RAIL_FADE }} />
        </View>
      }
    >
      <View pointerEvents="box-none" style={styles.overscan}>
        {children}
      </View>
    </MaskedView>
  );
}

/** The rail's scroller inside `ExploreRailFade`: its shadows aren't clipped at its bounds. */
export const EXPLORE_RAIL_FADE_SCROLLER = { overflow: "visible" } as const;

/** Rows read as one inset group (a settings group's shape). */
export function ExploreHomeGroup({ children }: { children: ReactNode }) {
  const { tokens } = useNemuTheme();
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, flexDirection: "row", backgroundColor: "transparent" },
  solid: { flex: 1, backgroundColor: "#000000" },
  overscan: { paddingTop: EXPLORE_ROW_FADE_ABOVE, paddingBottom: EXPLORE_ROW_FADE_BELOW },
  group: {
    width: "100%",
    borderRadius: R.group,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
