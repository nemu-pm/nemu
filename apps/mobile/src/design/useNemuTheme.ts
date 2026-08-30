import { useContext } from "react";
import { NemuThemeContext, type NemuTheme } from "./themeContext";

export function useNemuTheme(): NemuTheme {
  const value = useContext(NemuThemeContext);
  if (!value) {
    throw new Error("useNemuTheme must be used within NemuThemeProvider");
  }
  return value;
}
