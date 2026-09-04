import { forwardRef, type ReactNode } from "react";
import {
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";
import {
  nemuMaxFontSizeMultiplier,
  nemuText,
} from "@/design/typography";
import {
  resolveNemuTextMaxFontSizeMultiplier,
  type NemuTextDensity,
} from "./nemuTextStyle";

export type NemuTextVariant = keyof typeof nemuText;

export type { NemuTextDensity };

export type NemuTextProps = Omit<TextProps, "style"> & {
  /**
   * Optional typography preset. Omitting it applies no typography at all, so
   * `NemuText` can replace a bare `Text` without changing a single glyph.
   */
  variant?: NemuTextVariant;
  density?: NemuTextDensity;
  /** Explicit color; defaults to the inherited foreground. */
  color?: string;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

/**
 * The single text primitive. Every variant lives in `nemuText` so typography
 * stays audit-able, and the max font-size multiplier is bounded by default so
 * enlarged type cannot escape measured native chrome.
 */
export const NemuText = forwardRef<Text, NemuTextProps>(function NemuText(
  { variant, density, color, style, maxFontSizeMultiplier, ...props },
  ref,
) {
  return (
    <Text
      ref={ref}
      maxFontSizeMultiplier={resolveNemuTextMaxFontSizeMultiplier({
        density,
        defaultMultiplier: nemuMaxFontSizeMultiplier,
        override: maxFontSizeMultiplier,
      })}
      // Precedence order: variant typography first, then the `color`
      // shorthand, then the caller's own `style` so an explicit style wins.
      style={[
        variant ? nemuText[variant] : null,
        color ? { color } : null,
        style ?? null,
      ]}
      {...props}
    />
  );
});
