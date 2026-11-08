import type { ReactNode } from "react";
import type { ViewProps } from "react-native";

export type WindowLayoutRect = { x: number; y: number; width: number; height: number };
export type WindowReservedRegion = WindowLayoutRect & { id: string; active: boolean };
export type WindowLayoutEdgeInsets = { top: number; left: number; bottom: number; right: number };
/**
 * Hinge state. iOS: `UIHingeInteraction` status (27.1+). Android: the window's
 * `FoldingFeature.state` (HALF_OPENED → partiallyOpen, FLAT → fullyOpen).
 * Absent when the device has no hinge or the state is unknown. Layout must
 * still split on active `divisions`, never on this value alone.
 */
export type WindowHingeStatus = "closed" | "partiallyOpen" | "fullyOpen";

/**
 * Geometry of the observer view, in its own local coordinates (points / dp).
 * Fields after `occlusions` are optional so older natives and hand-built
 * fallbacks stay valid.
 */
export type MobileWindowLayout = {
  width: number;
  height: number;
  /** The platform reports reserved regions (iOS 27.1+, Android WindowManager); false = bounds-only fallback. */
  supported: boolean;
  /** Fold regions. iOS frames already include Apple's interaction margins; Android frames are the physical feature bounds. */
  divisions: WindowReservedRegion[];
  occlusions: WindowReservedRegion[];
  /**
   * Edge the system uses for the vertical bar (toolbar, tab bar, navigation
   * bar, status bar) — UIKit `UITraitCollection.verticalBarEdge` (iOS 27.1+).
   * Reported whether or not a bar is currently visible; absent/null when the
   * system never uses a vertical bar in this context (e.g. inner portrait).
   * Leading/trailing are relative to `layoutDirection`.
   */
  verticalBarEdge?: "leading" | "trailing" | null;
  /** Safe-area insets of the observer view itself (include a vertical bar's inset). */
  safeAreaInsets?: WindowLayoutEdgeInsets;
  /**
   * The safe area adapted horizontally to the window's corners (iOS 26+
   * `edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))`): in a
   * resizable iPad window it also clears the window controls, which the plain
   * safe area does not. A bar row along the top keeps its leading item past
   * them, as a navigation bar's does. Absent on older systems, Android, web.
   */
  cornerSafeAreaInsets?: WindowLayoutEdgeInsets;
  /** UIKit system minimum content margins, resolved to physical edges. */
  minimumLayoutMargins?: { left: number; right: number };
  /** Effective layout direction of the observer view. */
  layoutDirection?: "ltr" | "rtl";
  hinge?: WindowHingeStatus | null;
  /**
   * The observer's window covers its whole screen (iOS: the window's size
   * equals its scene's screen bounds). False in Split View, Slide Over, a
   * resizable window or iPhone Mirroring; absent when unknown (Android, web,
   * older natives) — treat absent as "fills".
   */
  fillsScreen?: boolean;
  /**
   * The device is a foldable iPhone (iOS: its display is wider than any
   * ordinary iPhone's, or a hinge reported or is remembered for this model;
   * see `NemuDeviceInfo`). A device fact, not this window's; absent on
   * Android, web and older natives.
   */
  foldableDevice?: boolean;
  /**
   * UIKit size classes of the observer's window (iOS; `window.traitCollection`).
   * Absent on Android, web, older natives and while unspecified: layout then
   * falls back to width/height thresholds (`mobileAdaptiveLayout`).
   */
  horizontalSizeClass?: WindowSizeClass;
  verticalSizeClass?: WindowSizeClass;
};
/** A UIKit size class (`UIUserInterfaceSizeClass`, unspecified omitted). */
export type WindowSizeClass = "compact" | "regular";
/** A window size change (rotation, fold, Split View) about to animate, with the system's own timing. */
export type WindowTransitionTiming = {
  width: number;
  height: number;
  /** The transition coordinator's duration, ms (0 when the system does not animate it). */
  durationMs: number;
  curve: "easeInOut" | "easeIn" | "easeOut" | "linear";
};

export type WindowLayoutObserverProps = {
  style?: ViewProps["style"];
  enabled?: boolean;
  onLayoutChange: (layout: MobileWindowLayout) => void;
  /** iOS: fired at the start of every window size transition (not by the bounds-only fallback). */
  onWillTransition?: (timing: WindowTransitionTiming) => void;
};

export type VerticalBarBehaviorProps = {
  /** Prefer `UIVerticalBarBehavior.disabled` for the owning screen while mounted. */
  disabled: boolean;
  /**
   * Appearance forced on the screen's containers (its navigation controller
   * up to the root of its presentation, `overrideUserInterfaceStyle`) while
   * `appearanceCoversBars` is true, so the system bars and the surfaces the
   * screen presents (popovers, sheets, menus) match it; the screen inherits
   * it. Never applied to the screen alone: iOS 27.1 keeps a screen's bar
   * items in a horizontal bar when its appearance differs from its
   * navigation controller's, and the vertical bar (the navigation
   * controller's) would keep the old appearance.
   */
  appearance?: "dark" | "light";
  /**
   * Whether `appearance` is applied now. Pass true only while the screen is
   * the focused (top) one: the containers are shared with every other screen
   * of the stack.
   */
  appearanceCoversBars?: boolean;
};

export type GlassViewProps = {
  children?: ReactNode;
  style?: ViewProps["style"];
  pointerEvents?: ViewProps["pointerEvents"];
  /** Glass tint (any React Native color string). Omit for untinted system glass. */
  tintColor?: string;
  /** Fixed corner radius; 0 or omitted = capsule. */
  cornerRadius?: number;
  /** `UIGlassEffect.Style.clear` instead of `.regular`. */
  clear?: boolean;
  /**
   * Corners concentric with the container (UIKit `containerConcentric`): the
   * display's rounded corners where the view meets them, never below this
   * radius. Overrides `cornerRadius`.
   */
  concentricMinimum?: number;
  /** Interactive glass: the system press response for touches on its children. */
  interactive?: boolean;
  /** Force the glass appearance (dark glass over a dark reader). */
  colorScheme?: "light" | "dark";
  /**
   * Materialized (default) or dematerialized. Changing it animates the glass
   * effect itself (UIKit: `effect` set inside `UIView.animate`) together with
   * the content's alpha, so glass and its icons/text appear and disappear as
   * one — never alpha-fade a glass view (UIKit drops glass drawn mid-fade).
   */
  materialized?: boolean;
  /** Materialize from nothing when the view first appears (same animation). */
  animateAppearance?: boolean;
  /** Duration of the (de)materialize animation, ms (0 = instant). */
  materializeDurationMs?: number;
  /**
   * Where the piece sits while dematerialized (pt, vertical; + = below): it
   * slides from there as it materializes, in the same native animation as
   * the material (`glassMaterializeMotionAvailable`).
   */
  materializeOffsetY?: number;
  /** Wall clock (ms since 1970) before which a materialize does not start; 0 = at once. */
  materializeNotBeforeMs?: number;
  /**
   * Children in an unclipped layer above the material instead of inside it
   * (`glassChildrenAboveMaterialAvailable`): content may overflow the glass's
   * shape (text kept at its final width while the glass resizes behind it).
   * It fades and slides with the material.
   */
  childrenAboveMaterial?: boolean;
};

export type GlassContainerProps = {
  children?: ReactNode;
  style?: ViewProps["style"];
  pointerEvents?: ViewProps["pointerEvents"];
  /** Distance at which child glass shapes start to blend. */
  spacing?: number;
};

export type ContextMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** SF Symbol name. */
  systemImage?: string;
  destructive?: boolean;
  disabled?: boolean;
};
