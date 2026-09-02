import { forwardRef, type ReactNode } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import {
  nemuMaxFontSizeMultiplier,
  nemuText,
} from "@/design/typography";

export type NemuTextVariant = keyof typeof nemuText;

export type NemuTextDensity = "default" | "compact";

const densityMultipliers: Record<NemuTextDensity, number> = {
  default: nemuMaxFontSizeMultiplier,
  // Sheets and the tab bar sit on measured native surfaces; keep their headroom
  // slightly tighter than the app-wide cap.
  compact: 1.5,
};

export type NemuTextProps = Omit<TextProps, "style"> & {
  variant?: NemuTextVariant;
  density?: NemuTextDensity;
  /** Explicit color; defaults to the inherited foreground. */
  color?: string;
  style?: TextStyle;
  children?: ReactNode;
};

/**
 * The single text primitive. Every variant lives in `nemuText` so typography
 * stays audit-able, and the max font-size multiplier is bounded by default so
 * enlarged type cannot escape measured native chrome.
 */
export const NemuText = forwardRef<Text, NemuTextProps>(function NemuText(
  {
    variant = "body",
    density = "default",
    color,
    style,
    maxFontSizeMultiplier,
    ...props
  },
  ref,
) {
  return (
    <Text
      ref={ref}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? densityMultipliers[density]
      }
      style={[nemuText[variant], color ? { color } : null, style]}
      {...props}
    />
  );
});
