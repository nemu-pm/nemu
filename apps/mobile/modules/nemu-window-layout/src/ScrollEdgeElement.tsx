import type { ComponentType } from "react";
import type { ViewProps } from "react-native";

export type ScrollEdgeElementProps = ViewProps & {
  /** The edge of the scroll view (around it, else the nearest beside it) this overlays. */
  edge: "top" | "bottom" | "left" | "right";
  /** The edge's effect shows only once content has scrolled past its rest there. */
  revealPastRest?: boolean;
};
export const ScrollEdgeElement = null as ComponentType<ScrollEdgeElementProps> | null;
