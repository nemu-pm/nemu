import type { ImageSourcePropType } from "react-native";
import shadow320 from "../../assets/portrait-shadow-320.png";
import shadow360 from "../../assets/portrait-shadow-360.png";
import shadow390 from "../../assets/portrait-shadow.png";
import shadow411 from "../../assets/portrait-shadow-411.png";
import shadow430 from "../../assets/portrait-shadow-430.png";
import shadow512 from "../../assets/portrait-shadow-512.png";
import shadow639 from "../../assets/portrait-shadow-639.png";
import type { NemuPortraitGlowStageWidth } from "./nemuPortraitHalo";

export type NemuPortraitGlowAssets = {
  composite?: ImageSourcePropType;
  primary?: ImageSourcePropType;
  secondary?: ImageSourcePropType;
  shadow: ImageSourcePropType;
};

export const nemuPortraitShadowAssets: Record<
  NemuPortraitGlowStageWidth,
  ImageSourcePropType
> = {
  320: shadow320,
  360: shadow360,
  390: shadow390,
  411: shadow411,
  430: shadow430,
  512: shadow512,
  639: shadow639,
};
