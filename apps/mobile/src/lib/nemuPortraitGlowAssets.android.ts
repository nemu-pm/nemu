import type { ImageSourcePropType } from "react-native";
import composite320 from "../../assets/portrait-glow-320.png";
import composite360 from "../../assets/portrait-glow-360.png";
import composite390 from "../../assets/portrait-glow.png";
import composite411 from "../../assets/portrait-glow-411.png";
import composite430 from "../../assets/portrait-glow-430.png";
import composite512 from "../../assets/portrait-glow-512.png";
import composite639 from "../../assets/portrait-glow-639.png";
import type { NemuPortraitGlowStageWidth } from "./nemuPortraitHalo";
import {
  nemuPortraitShadowAssets,
  type NemuPortraitGlowAssets,
} from "./nemuPortraitGlowAssets.shared";

const compositeAssets: Record<
  NemuPortraitGlowStageWidth,
  ImageSourcePropType
> = {
  320: composite320,
  360: composite360,
  390: composite390,
  411: composite411,
  430: composite430,
  512: composite512,
  639: composite639,
};

export function getNemuPortraitGlowAssets(
  stageWidth: NemuPortraitGlowStageWidth,
): NemuPortraitGlowAssets {
  return {
    composite: compositeAssets[stageWidth],
    shadow: nemuPortraitShadowAssets[stageWidth],
  };
}
