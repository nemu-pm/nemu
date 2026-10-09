import type { ComponentType, ReactElement, ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { useNemuTheme } from "@/design-system";
import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { ExploreGradient } from "./ExploreGradient";

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
 * A horizontal rail whose ends dissolve instead of being cut: opaque across the
 * middle, fading to nothing over the last `EXPLORE_RAIL_FADE` at both edges. The
 * rail inside already bleeds to the screen edges; the mask only softens them.
 */
export function ExploreRailFade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <MaskedView
      pointerEvents="box-none"
      style={style as object}
      maskElement={
        <View style={styles.mask}>
          <ExploreGradient direction="right" colors={["rgba(0,0,0,0)", "#000000"]} style={{ width: EXPLORE_RAIL_FADE }} />
          <View style={styles.solid} />
          <ExploreGradient direction="right" colors={["#000000", "rgba(0,0,0,0)"]} style={{ width: EXPLORE_RAIL_FADE }} />
        </View>
      }
    >
      {children}
    </MaskedView>
  );
}

/** Rows read as one inset group (a settings group's shape), centred at the phone's reading width. */
export const EXPLORE_HOME_GROUP_MAX_WIDTH = 640;

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
  group: {
    width: "100%",
    maxWidth: EXPLORE_HOME_GROUP_MAX_WIDTH,
    alignSelf: "center",
    borderRadius: R.group,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
