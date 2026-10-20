export type MobileSettingsSplitSectionId = "reader" | "sources" | "directories" | "appearance" | "data" | "experimental";

/** Order of the section list; the first one is selected by default (iOS Settings). */
export const MOBILE_SETTINGS_SPLIT_SECTIONS: readonly MobileSettingsSplitSectionId[] = [
  "reader",
  "sources",
  "appearance",
  "data",
];

/**
 * Section shown in the trailing pane of the regular-width Settings split view.
 * An explicit tap wins, then the route's section (deep link to
 * `settings/[section]`), then a focus deep link that implies a section, then
 * the first section.
 */
export function resolveMobileSettingsSplitSelection({
  selected,
  routeSection,
  focus,
}: {
  selected: MobileSettingsSplitSectionId | null;
  routeSection: MobileSettingsSplitSectionId | null;
  focus: string | undefined;
}): MobileSettingsSplitSectionId {
  if (selected) return selected;
  if (routeSection) return routeSection;
  if (focus === "agent") return "data";
  return MOBILE_SETTINGS_SPLIT_SECTIONS[0];
}

/**
 * The section-list row highlighted for the section in the trailing pane.
 * Source Directories is opened from Installed Sources and has no row of its
 * own, so Installed Sources stays selected (the system Settings keeps a
 * parent's row selected for its subpages).
 */
export function getMobileSettingsSplitHighlightedRow(
  section: MobileSettingsSplitSectionId,
): MobileSettingsSplitSectionId {
  return section === "directories" ? "sources" : section;
}

/**
 * Which pane the route's own screen instance is. It keeps that React identity
 * across a resize (compact ⇄ split), so its state survives: the index route is
 * the section list, a `settings/[section]` route is the section content.
 */
export function getMobileSettingsPrimaryPane(
  routeSection: MobileSettingsSplitSectionId | null,
): "list" | "detail" {
  return routeSection ? "detail" : "list";
}

export type MobileSettingsSplitTitleAlignment = "center" | "leading";

/**
 * How the split view titles its two columns, or null to keep the one native
 * title. The system Settings puts each column's title over that column (the
 * selected section's centred over the detail), never one title across both.
 *
 * iOS on the Duo's inner display (and any non-iPad split): both columns get a
 * title in the native bar's title row — centred per column under a top bar,
 * leading per column beside a vertical bar (where the bar's own title sits
 * leading). iPad keeps the native title: its tab bar floats in that row, over
 * where a detail title would go. Android's opaque bar keeps its own title.
 */
export function getMobileSettingsSplitColumnTitles({
  split,
  platform,
  isPad,
  verticalBar,
}: {
  split: boolean;
  platform: string;
  isPad: boolean;
  verticalBar: boolean;
}): MobileSettingsSplitTitleAlignment | null {
  if (!split || platform !== "ios" || isPad) return null;
  return verticalBar ? "leading" : "center";
}

/**
 * Where the split's detail-column Back (Source Directories → Installed
 * Sources) goes, from the same column-title policy so a pose change moves it
 * in one render: `bar` — a native bar item, first in the vertical bar (custom
 * views never go vertical); `column` — the drawn 48pt back at the detail
 * column's leading edge, in the horizontal bar's title row; `pane` — atop the
 * pane where the split keeps the one native title (iPad, Android); null while
 * the column shows no pushed page.
 */
export function getMobileSettingsSplitColumnBack({
  columnTitles,
  pushed,
}: {
  columnTitles: MobileSettingsSplitTitleAlignment | null;
  /** Source Directories is showing in the detail column. */
  pushed: boolean;
}): "bar" | "column" | "pane" | null {
  if (!pushed) return null;
  if (columnTitles === "leading") return "bar";
  if (columnTitles === "center") return "column";
  return "pane";
}
