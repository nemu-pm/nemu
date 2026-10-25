import type { ComponentProps, ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { useMobilePoseLayout } from "@/lib/MobilePoseTransitionContext";
import { mobilePoseSizeFlipTransition } from "@/lib/mobilePoseLayoutAnimations";
import { useMobilePoseWidthSpring } from "@/lib/useMobilePoseSizeSpring";

type MobilePoseLayoutViewProps = ComponentProps<typeof Animated.View> & {
  /**
   * The width the content is laid out at (a grid cell's width). A layout
   * transition only moves the view's own frame — its children are laid out
   * at the new size in one step — so with this set the content also starts
   * at its old size and grows or shrinks back to 1 from its top-left corner
   * on the same spring (MobilePoseSizeSpringView), in place with the frame.
   */
  contentSize?: number;
};

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
export function MobilePoseLayoutView({ contentSize, children, ...props }: MobilePoseLayoutViewProps) {
  const layout = useMobilePoseLayout();
  return (
    <Animated.View layout={layout} {...props}>
      {contentSize === undefined ? children : <MobilePoseSizeSpringView size={contentSize}>{children}</MobilePoseSizeSpringView>}
    </Animated.View>
  );
}

/**
 * Content laid out at `width` that glides to a new width through a pose
 * change, re-laid out at each in-between width (useMobilePoseWidthSpring):
 * for rows whose height does not follow their width — a scale would stretch
 * their text — so their trailing edge and chevron slide with the frame.
 */
export function MobilePoseWidthSpringView({
  width,
  style,
  children,
}: {
  width: number;
  style?: ComponentProps<typeof Animated.View>["style"];
  children: ReactNode;
}) {
  const animatedWidth = useMobilePoseWidthSpring(width);
  return <Animated.View style={[style, animatedWidth]}>{children}</Animated.View>;
}

/**
 * Content whose rendered size is `size` (a prop: it re-lays out at the new
 * size in one step): through a pose change it starts scaled to its old size
 * and springs to 1 from its top-left corner (the pose settle spring).
 *
 * The scale is this view's own layout transition (old / new measured width,
 * mobilePoseSizeFlipTransition), so it lands in the same mount as the new
 * size. The JS-side spring it replaces (useMobilePoseSizeSpring: a shared
 * value written in a layout effect after the commit) raced that mount — the
 * scale could land on the old size for a frame (a cover shrinking before it
 * grows) — and ran one animated style per cover, each frame a shadow-tree
 * commit, through the unfold. `size` keys nothing: the view is as wide as
 * its cell, which is `size` wide.
 */
export function MobilePoseSizeSpringView({ size: _size, children }: { size: number; children: ReactNode }) {
  const layout = useMobilePoseLayout();
  return (
    <Animated.View layout={layout ? mobilePoseSizeFlipTransition : undefined} style={styles.leadingOrigin}>
      {children}
    </Animated.View>
  );
}

/**
 * `CellRendererComponent` for a FlatList whose rows (and footer cell) must
 * glide when the cells above them change size on a fold or unfold: each
 * cell's frame takes the pose layout transition, like Reanimated's
 * `itemLayoutAnimation`. Outside a pose change frames change as before.
 */
export function MobilePoseListCell({
  cellKey: _cellKey,
  index: _index,
  item: _item,
  ...props
}: ComponentProps<typeof Animated.View> & { cellKey?: string; index?: number; item?: unknown }) {
  return <MobilePoseLayoutView {...props} />;
}

const styles = StyleSheet.create({
  // Grows with its cell like the content it wraps (cards that stretch to the row).
  leadingOrigin: {
    flexGrow: 1,
    minWidth: 0,
    transformOrigin: "left top",
  },
});
