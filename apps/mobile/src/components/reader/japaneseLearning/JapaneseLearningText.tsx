import { forwardRef, type ComponentProps } from "react";
import { StyleSheet, type TextInstance, type TextStyle } from "react-native";
import { NemuText } from "@/design-system";

/**
 * The web learning sheets set every Latin label in `Inter Variable`
 * (`src/index.css` `--font-sans`, from `@fontsource-variable/inter`). The app
 * embeds static 400 / 500 / 600 instances of that same font (latin subset,
 * generated from the web's woff2; `assets/fonts/NemuInter-*.ttf`, registered
 * by the expo-font config plugin). Anything outside the subset (kana, kanji)
 * falls back to the system font, exactly as the browser does.
 */
const INTER_FACES = {
  regular: "NemuInter-Regular",
  medium: "NemuInter-Medium",
  semibold: "NemuInter-SemiBold",
} as const;

function interFace(weight: TextStyle["fontWeight"]) {
  const numeric = typeof weight === "number" ? weight : Number.parseInt(String(weight ?? "400"), 10);
  if (weight === "bold" || numeric >= 600) return INTER_FACES.semibold;
  if (numeric >= 500) return INTER_FACES.medium;
  return INTER_FACES.regular;
}

/**
 * Web `font-sans` at a CSS weight. The face carries its weight, so
 * `fontWeight` is reset to keep platforms from synthesising bold on top.
 */
export function japaneseLearningInterStyle(weight: TextStyle["fontWeight"] = "400"): TextStyle {
  return { fontFamily: interFace(weight), fontWeight: "normal" };
}

/**
 * `NemuText` in the web sheets' sans font: text without an explicit
 * `fontFamily` (the Japanese serif keeps its own) renders in the Inter face
 * that matches its `fontWeight`.
 */
export const JapaneseLearningText = forwardRef<TextInstance, ComponentProps<typeof NemuText>>(
  function JapaneseLearningText({ style, ...props }, ref) {
    const flat = StyleSheet.flatten(style) as TextStyle | undefined;
    const inter = flat?.fontFamily ? null : japaneseLearningInterStyle(flat?.fontWeight);
    return <NemuText ref={ref} style={[style, inter]} {...props} />;
  },
);
