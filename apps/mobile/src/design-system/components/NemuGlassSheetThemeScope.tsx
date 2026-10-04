import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { NemuThemeContext, type NemuTheme } from "@/design/themeContext";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  nemuGlassSheetTheme,
  nemuGlassSheetVeil,
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
 * `veilBleed` extends the veil past the content's top edge (points), over
 * the room a host leaves for the system grabber; the sheet clips it to its
 * shape.
 */
export function NemuGlassSheetThemeScope({
  look,
  veilBleed = 0,
  children,
}: {
  look: MobileSheetGlassLook;
  veilBleed?: number;
  children: ReactNode;
}) {
  const value = useNemuGlassSheetTheme(look);
  const veil = nemuGlassSheetVeil(look, value.scheme);
  return (
    <NemuThemeContext.Provider value={value}>
      {veil ? (
        <View
          pointerEvents="none"
          style={[styles.veil, { top: -veilBleed, backgroundColor: veil }]}
        />
      ) : null}
      {children}
    </NemuThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    left: 0,
    right: 0,
    // Past the content's bottom too: a content-sized sheet's home-indicator
    // inset sits below it.
    bottom: -64,
  },
});
