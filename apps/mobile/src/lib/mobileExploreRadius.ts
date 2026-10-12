/**
 * One corner scale for the design-explore surfaces. Every rounded thing on
 * them takes one of these, by what it is, and anything nested inside a
 * rounded container takes the container's radius less the padding between
 * them (`concentricMobileExploreRadius`), so corners run parallel. System
 * controls (tab bar, bar buttons, system sheets) keep
 * the system's own shapes.
 */
export const MOBILE_EXPLORE_RADIUS = {
  /** Hairline marks: progress lines, plank ends, drawn strokes. */
  hair: 2,
  /** Small covers: shelf and grid books, bar thumbnails, folder fans. */
  thumb: 4,
  /** Large covers (the hero). */
  cover: 8,
  /** Rows and cells: chapter rows, the up-next highlight. */
  row: 14,
  /** Groups: a settings group, a collection folder. */
  group: 20,
  /** Cards and panes: Continue Reading cards, the hero as a pane. */
  card: 26,
  /**
   * An iOS 26 floating sheet's own corner, measured on screen (a sheet floats
   * 8pt in from the display edge; its corner arc reads ~35pt). It is the
   * outermost shape inside a sheet: a group in the sheet's body (inset
   * `MOBILE_SHEET_BODY_INSET`) takes `group`, and everything inside that
   * takes the group's radius less its own inset.
   */
  sheet: 36,
} as const;

/** The gutter between a sheet's edge and the groups in its body (iOS). */
export const MOBILE_SHEET_BODY_INSET = 16;

/**
 * A corner nested `inset` inside a container with `outer` corners: parallel
 * to it (`outer - inset`), square once the inset swallows the radius. Applied
 * at every level (sheet → group → row or field → control), never skipped.
 */
export function concentricMobileExploreRadius(outer: number, inset: number): number {
  return Math.max(0, outer - Math.max(0, inset));
}

/** The radii of a stack of nested shapes: `insets[i]` is the padding between level `i` and level `i + 1`. */
/** The corner of a group drawn in a sheet's body (it lands on the scale's `group`). */
export const MOBILE_SHEET_GROUP_RADIUS = concentricMobileExploreRadius(
  MOBILE_EXPLORE_RADIUS.sheet,
  MOBILE_SHEET_BODY_INSET,
);

/** Shared inset from a settings group's edge to its custom fields and marks. */
export const MOBILE_SETTINGS_GROUP_INSET = 14;
/** Custom controls follow the group's corner; native switches and menus keep system shapes. */
export const MOBILE_SETTINGS_CONTROL_RADIUS = concentricMobileExploreRadius(
  MOBILE_SHEET_GROUP_RADIUS,
  MOBILE_SETTINGS_GROUP_INSET,
);
