import { useMemo, type ReactNode } from "react";
import { NemuThemeContext, nemuTokens, useNemuTheme } from "@/design-system";

/**
 * Renders its subtree with the dark nemu tokens. Reader surfaces that float
 * over the black immersive page (capsule chrome, docked learning panels) are
 * dark in either app theme, so a light theme never paints a white slab over
 * the manga. Sheets presented by the system keep the app theme.
 */
export function ReaderDarkThemeScope({
  children,
  overrides,
}: {
  children: ReactNode;
  /** Token tweaks for this subtree (e.g. a translucent slider track on glass). Keep the object stable. */
  overrides?: Partial<(typeof nemuTokens)["dark"]>;
}) {
  const theme = useNemuTheme();
  const value = useMemo(
    () =>
      theme.scheme === "dark" && !overrides
        ? theme
        : { ...theme, scheme: "dark" as const, tokens: { ...nemuTokens.dark, ...overrides } },
    [overrides, theme],
  );
  return <NemuThemeContext.Provider value={value}>{children}</NemuThemeContext.Provider>;
}
