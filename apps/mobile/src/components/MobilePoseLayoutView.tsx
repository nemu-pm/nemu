import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";
import { useMobilePoseLayout } from "@/lib/MobilePoseTransitionContext";

/**
 * A View whose frame changes glide with the shared pose settle spring (UI
 * thread). Use it for cells, panes and slots that move when the device folds
 * or the window resizes: grid cells opening the fold gutter, split panes
 * lining up with the fold halves. Reduce Motion: frames change instantly.
 *
 * A window resize (display switch, Split View) remounts and re-parents whole
 * grids and panes. Starting a layout animation on a view whose parent is
 * detached in the same mounting transaction crashed Reanimated, and a glide
 * across a remount means nothing anyway (the pose veil covers it), so the
 * transition is only attached to constant-size pose changes.
 */
export function MobilePoseLayoutView(props: ComponentProps<typeof Animated.View>) {
  return <Animated.View layout={useMobilePoseLayout()} {...props} />;
}
