import { createContext, type ReactNode } from "react";

/**
 * Docked panel corners: 28pt — the 44pt reader capsules' 22pt radius plus the
 * panel's 8pt gap to the pane edge, so the panel's corners are concentric
 * with the capsule row and read as one shape language.
 */
export const DOCKED_PANEL_RADIUS = 28;
/**
 * The docked panels are the web reader popover (`.dark .reader-settings-popup`
 * in src/index.css: `oklch(0.14 0 0 / 0.92)` with a `oklch(1 0 0 / 0.12)`
 * hairline), converted to sRGB. The reader is always dark, so the panel is
 * the web dark theme regardless of the app theme.
 */
export const DOCKED_PANEL_BASE = "rgba(9,9,9,0.92)";
export const DOCKED_PANEL_BORDER = "rgba(255,255,255,0.12)";
/** Glass tint matching the web popover surface. */
export const DOCKED_PANEL_GLASS_TINT = "rgba(9,9,9,0.55)";
/**
 * Inside the panel every token is the web dark theme's (`nemuTokens.dark` is
 * generated from it); only the page background becomes transparent so
 * footers and input bars (`bg-background/80`) sit on the panel itself.
 */
export const DOCKED_PANEL_TOKEN_OVERRIDES = {
  background: "rgba(9,9,9,0)",
} as const;

/**
 * Study desk host (notebook posture): when a docked surface renders inside
 * it, the desk owns the card and the header row (its surface switch and close
 * button). The surface hands over its own header action (e.g. Listen) and
 * renders only its body, so every surface keeps its exact content, states
 * and actions.
 */
export type JapaneseLearningEmbeddedHost = {
  renderHeader: (input: { action: ReactNode | undefined }) => ReactNode;
};
export const JapaneseLearningEmbeddedHostContext = createContext<JapaneseLearningEmbeddedHost | null>(null);
