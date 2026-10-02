import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { NemuThemeContext } from "@/design/themeContext";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  nemuGlassSheetTokenOverrides,
  nemuGlassSheetVeil,
  type MobileSheetGlassLook,
} from "@/lib/mobileSheetGlass";

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
  const theme = useNemuTheme();
  const overrides = nemuGlassSheetTokenOverrides(look, theme.scheme);
  const veil = nemuGlassSheetVeil(look, theme.scheme);
  const value = useMemo(
    () => (overrides ? { ...theme, tokens: { ...theme.tokens, ...overrides } } : theme),
    [overrides, theme],
  );
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
