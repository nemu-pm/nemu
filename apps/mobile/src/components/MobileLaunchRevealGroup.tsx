import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useMobilePageGutters, useNemuTheme } from "@/design-system";
import { useMobileLaunchRevealGroup } from "@/lib/mobileLaunchReveal";
import type { MobileLaunchRevealGroup as Group } from "@/lib/mobileLaunchRevealPlan";

/**
 * A content group of the cold-launch reveal; in place at any other time. It
 * rises into place while a page-coloured veil over it fades out (the page
 * behind every group is the flat page colour, so this reads as the group
 * fading in without an opacity animation on Liquid Glass ancestors). The veil
 * runs out through the page gutters: rows that bleed to the window's edges (a
 * shelf's plank, a carousel) showed their ends unveiled there.
 */
export function MobileLaunchRevealGroup({
  group,
  style,
  children,
}: {
  group: Group;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { tokens } = useNemuTheme();
  const gutters = useMobilePageGutters();
  const { rise, veil, initiallyHidden } = useMobileLaunchRevealGroup(group);
  return (
    <Animated.View style={[style, rise]}>
      {children}
      {initiallyHidden ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.veil,
            { left: -gutters.left, right: -gutters.right, backgroundColor: tokens.background },
            veil,
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});
