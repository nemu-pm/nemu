import type { SourcePackageSetting } from "@/data/schema";

export type SourceSettingSliderProps = {
  setting: SourcePackageSetting;
  /** The stored value; the slider commits a new one when a drag ends. */
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
};
