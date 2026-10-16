import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import { useMobileLaunchRevealGroup } from "@/lib/mobileLaunchReveal";
import type { MobileLaunchRevealGroup as Group } from "@/lib/mobileLaunchRevealPlan";

/**
 * A content group of the cold-launch reveal; in place at any other time. It
 * rises into place while a page-coloured veil over it fades out (the page
 * behind every group is the flat page colour, so this reads as the group
 * fading in without an opacity animation on Liquid Glass ancestors).
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
  const { rise, veil, initiallyHidden } = useMobileLaunchRevealGroup(group);
  return (
    <Animated.View style={[style, rise]}>
      {children}
      {initiallyHidden ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tokens.background }, veil]}
        />
      ) : null}
    </Animated.View>
  );
}
