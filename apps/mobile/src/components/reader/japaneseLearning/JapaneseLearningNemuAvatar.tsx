import { Image } from "react-native";
import NEMU_ICON from "../../../../assets/icon.jpg";

export function JapaneseLearningNemuAvatar({
  size = "md",
}: {
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? 40 : 48;
  return (
    <Image
      source={NEMU_ICON}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        resizeMode: "cover",
      }}
      accessibilityLabel="Nemu"
    />
  );
}
