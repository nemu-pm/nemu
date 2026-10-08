import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

/**
 * A two-colour gradient drawn by Core Animation: no bitmap to redraw on each transition.
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
