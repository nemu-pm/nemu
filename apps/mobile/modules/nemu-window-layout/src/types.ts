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
};
export type WindowLayoutObserverProps = {
  style?: ViewProps["style"];
  enabled?: boolean;
  onLayoutChange: (layout: MobileWindowLayout) => void;
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
};

export type GlassContainerProps = {
  children?: ReactNode;
  style?: ViewProps["style"];
  pointerEvents?: ViewProps["pointerEvents"];
  /** Distance at which child glass shapes start to blend. */
  spacing?: number;
};
