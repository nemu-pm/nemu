/**
 * A window resize remounts and re-parents whole grids and panes; a layout
 * transition started on a view whose parent is detached in the same mounting
 * transaction crashed Reanimated. While a resize pose change's motion window
 * is open the frames get no layout transition (the pose veil covers the
 * change); constant-size pose changes (fold gutters) keep their glide.
 */
export function resolveMobilePoseLayout<T>(
  kind: "none" | "layout" | "resize",
  motionWindowOpen: boolean,
  layout: T,
): T | undefined {
  return kind === "resize" && motionWindowOpen ? undefined : layout;
}
