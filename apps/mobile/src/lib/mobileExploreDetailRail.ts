import type { MobileAdaptiveLayout } from "@/lib/mobileAdaptiveLayout";

/**
 * The title page's actions that stand as their own bar buttons beside the
 * Duo's inner rail (Add to Collection, Share), by their menu symbol.
 */
const RAIL_BUTTON_ICONS: readonly string[] = ["rectangle.stack.badge.plus", "square.and.arrow.up"];

/**
 * The vertical bar on the Duo's inner display (landscape): the one bar with
 * room for more than Back and the ··· menu. The outer display's bar is short,
 * so it keeps the single menu like every horizontal bar.
 */
export function mobileExploreDetailRailHasButtons(
  adaptive: Pick<MobileAdaptiveLayout, "verticalBarSide" | "hasFoldRegion">,
): boolean {
  return adaptive.verticalBarSide !== null && adaptive.hasFoldRegion;
}

/**
 * The bar's own buttons and the ··· menu's items, both in the menu's order.
 * Without the rail every action stays in the menu.
 */
export function splitMobileExploreDetailBarActions<T extends { icon: string }>(
  actions: readonly T[],
  rail: boolean,
): { buttons: T[]; menu: T[] } {
  if (!rail) return { buttons: [], menu: [...actions] };
  return {
    buttons: actions.filter((action) => RAIL_BUTTON_ICONS.includes(action.icon)),
    menu: actions.filter((action) => !RAIL_BUTTON_ICONS.includes(action.icon)),
  };
}
