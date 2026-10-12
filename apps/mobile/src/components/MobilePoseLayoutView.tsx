import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";
import { mobilePoseLayoutTransition } from "@/lib/mobilePoseLayoutAnimations";

/**
 * A View whose frame changes glide with the shared pose settle spring (UI
 * thread). Use it for cells, panes and slots that move when the device folds
 * or the window resizes: grid cells opening the fold gutter, split panes
 * lining up with the fold halves. Reduce Motion: frames change instantly.
 */
export function MobilePoseLayoutView(props: ComponentProps<typeof Animated.View>) {
  return <Animated.View layout={mobilePoseLayoutTransition} {...props} />;
}
