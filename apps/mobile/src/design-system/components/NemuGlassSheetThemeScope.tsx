import { useMemo, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { NemuThemeContext, type NemuTheme } from "@/design/themeContext";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  nemuGlassSheetTheme,
  nemuGlassSheetVeil,
  nemuGlassSheetVeilBleed,
  type MobileSheetGlassLook,
} from "@/lib/mobileSheetGlass";

/**
 * The current theme as content on a sheet of `look` draws with it (see
 * `nemuGlassSheetTheme`); the theme itself for `opaque`.
 */
export function useNemuGlassSheetTheme(look: MobileSheetGlassLook): NemuTheme {
  const theme = useNemuTheme();
  return useMemo(() => nemuGlassSheetTheme(theme, look), [look, theme]);
}

/**
 * Renders sheet content that sits on a Liquid Glass sheet background: the
 * scope's own scheme with the look's token overrides (translucent cards,
 * fills and icon tiles, lifted secondary text) and, for `tinted`, the veil
 * behind the content. `opaque` passes the theme through untouched, so
 * callers keep one tree for every look.
 *
 * The veil reaches a window's length past the content on every side
 * (`nemuGlassSheetVeilBleed`) and the sheet clips it to its shape, so the
 * sheet stays one colour wherever the content sits in it: under the system
 * grabber, in the home-indicator inset, in the room an upward stretch opens
 * above and below a content-sized sheet, and in a landscape sheet's side
 * safe areas.
 */
export function NemuGlassSheetThemeScope({
  look,
  children,
}: {
  look: MobileSheetGlassLook;
  children: ReactNode;
}) {
  const value = useNemuGlassSheetTheme(look);
  const veil = nemuGlassSheetVeil(look, value.scheme);
  const bleed = -nemuGlassSheetVeilBleed(useWindowDimensions());
  return (
    <NemuThemeContext.Provider value={value}>
      {veil ? (
        <View
          pointerEvents="none"
          style={[
            styles.veil,
            { top: bleed, right: bleed, bottom: bleed, left: bleed, backgroundColor: veil },
          ]}
        />
      ) : null}
      {children}
    </NemuThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
  },
});
