import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

/**
 * A two-colour gradient drawn by Core Animation (React Native's
 * `backgroundImage`, a `CAGradientLayer` on iOS). The bitmap-backed gradient
 * view rasterises its whole area on the main thread, twice, every time it is
 * displayed, and it is displayed again whenever its traits change, which a
 * screen transition does to every view on the screen underneath. For a
 * page-sized wash that held the main thread for a quarter of a second at the
 * start of each cover zoom; this one has no bitmap to redraw.
 */
export function ExploreGradient({
  colors,
  direction = "down",
  style,
  pointerEvents,
}: {
  /** Two colours, end to end; or `[colour, position 0…1]` stops. */
  colors: readonly [string, string] | ReadonlyArray<readonly [string, number]>;
  /** Top to bottom (default) or leading to trailing edge. */
  direction?: "down" | "right";
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps["pointerEvents"];
}) {
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        style,
        {
          backgroundImage: `linear-gradient(${direction === "right" ? "to right" : "to bottom"}, ${colors
            .map((stop) =>
              typeof stop === "string" ? stop : `${stop[0]} ${(stop[1] * 100).toFixed(2)}%`,
            )
            .join(", ")})`,
        },
      ]}
    />
  );
}
