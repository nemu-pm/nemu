import { View, type ViewProps } from "react-native";
export type ConcentricViewProps = ViewProps & { minimumRadius?: number };
export function ConcentricView({ minimumRadius = 8, style, ...props }: ConcentricViewProps) {
  return <View {...props} style={[style, { borderRadius: minimumRadius, overflow: "hidden" }]} />;
}
