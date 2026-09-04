import type { ImageSourcePropType } from "react-native";
import primary320 from "../../assets/portrait-glow-primary-320.png";
import primary360 from "../../assets/portrait-glow-primary-360.png";
import primary390 from "../../assets/portrait-glow-primary.png";
import primary411 from "../../assets/portrait-glow-primary-411.png";
import primary430 from "../../assets/portrait-glow-primary-430.png";
import primary512 from "../../assets/portrait-glow-primary-512.png";
import primary639 from "../../assets/portrait-glow-primary-639.png";
import secondary320 from "../../assets/portrait-glow-secondary-320.png";
import secondary360 from "../../assets/portrait-glow-secondary-360.png";
import secondary390 from "../../assets/portrait-glow-secondary.png";
import secondary411 from "../../assets/portrait-glow-secondary-411.png";
import secondary430 from "../../assets/portrait-glow-secondary-430.png";
import secondary512 from "../../assets/portrait-glow-secondary-512.png";
import secondary639 from "../../assets/portrait-glow-secondary-639.png";
import type { NemuPortraitGlowStageWidth } from "./nemuPortraitHalo";
import {
  nemuPortraitShadowAssets,
  type NemuPortraitGlowAssets,
} from "./nemuPortraitGlowAssets.shared";

const primaryAssets: Record<
  NemuPortraitGlowStageWidth,
  ImageSourcePropType
> = {
  320: primary320,
  360: primary360,
  390: primary390,
  411: primary411,
  430: primary430,
  512: primary512,
  639: primary639,
};

const secondaryAssets: Record<
  NemuPortraitGlowStageWidth,
  ImageSourcePropType
> = {
  320: secondary320,
  360: secondary360,
  390: secondary390,
  411: secondary411,
  430: secondary430,
  512: secondary512,
  639: secondary639,
};

export function getNemuPortraitGlowAssets(
  stageWidth: NemuPortraitGlowStageWidth,
): NemuPortraitGlowAssets {
  return {
    primary: primaryAssets[stageWidth],
    secondary: secondaryAssets[stageWidth],
    shadow: nemuPortraitShadowAssets[stageWidth],
  };
}
