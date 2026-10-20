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
 * the section list, a `settings/[section]` route is the section content. An
 * index route that still holds a split selection (it has just collapsed, and
 * the routes that keep that page are being pushed) shows the selection in
 * place, so the root list never flashes before the push lands.
 */
export function getMobileSettingsPrimaryPane(
  routeSection: MobileSettingsSplitSectionId | null,
  collapsedSelection: MobileSettingsSplitSectionId | null = null,
): "list" | "detail" {
  return routeSection || collapsedSelection ? "detail" : "list";
}

/** The `settings/[section]` route's name in the Settings stack. */
export const MOBILE_SETTINGS_SECTION_ROUTE = "[section]";
/** The Settings stack's root route (its anchor). */
export const MOBILE_SETTINGS_ROOT_ROUTE = "index";
/**
 * Route param marking a route pushed to keep the page through a collapse. The
 * Settings stack gives such a route no push animation (it is already on
 * screen); the route clears the param once it is in place, so its pop and
 * the edge swipe are the system's again.
 */
export const MOBILE_SETTINGS_RESTORED_PARAM = "restored";

export function isMobileSettingsRestoredPush(params: object | undefined): boolean {
  return (params as Record<string, unknown> | undefined)?.[MOBILE_SETTINGS_RESTORED_PARAM] === "1";
}

/**
 * The pages a section sits on in one column, root excluded: Source
 * Directories is opened from Installed Sources, everything else from the root.
 */
export function getMobileSettingsPageChain(
  page: MobileSettingsSplitSectionId,
): MobileSettingsSplitSectionId[] {
  return page === "directories" ? ["sources", "directories"] : [page];
}

export type MobileSettingsCollapsePlan = {
  /** How many of the routes above the root stay (with their keys and state). */
  keep: number;
  /** Sections pushed on top of them, bottom to top. */
  push: MobileSettingsSplitSectionId[];
};

/**
 * When the split collapses to one column, the routes that keep the page the
 * detail column showed (`shown`: the split's explicit selection, else the
 * route's own section; null keeps the root list). `routeSections` are the
 * stack's routes above the root, bottom to top (null for a route that is not
 * a section). Null when the stack already ends in that page's chain.
 *
 * The page on top is always a new route, even when the chain is a prefix of
 * the stack (Installed Sources under a Source Directories route): the change
 * is then a push, which can go unanimated, never a pop.
 */
export function planMobileSettingsSplitCollapse({
  routeSections,
  shown,
}: {
  routeSections: readonly (MobileSettingsSplitSectionId | null)[];
  shown: MobileSettingsSplitSectionId | null;
}): MobileSettingsCollapsePlan | null {
  if (!shown) return null;
  const chain = getMobileSettingsPageChain(shown);
  let keep = 0;
  while (keep < routeSections.length && keep < chain.length && routeSections[keep] === chain[keep]) keep++;
  if (keep === routeSections.length && keep === chain.length) return null;
  keep = Math.min(keep, chain.length - 1);
  return { keep, push: chain.slice(keep) };
}

export type MobileSettingsStackRoute = { key?: string; name: string; params?: object };
export type MobileSettingsStackState = {
  index: number;
  routes: MobileSettingsStackRoute[];
  [key: string]: unknown;
};

function routeSection(route: MobileSettingsStackRoute | undefined): MobileSettingsSplitSectionId | null {
  if (route?.name !== MOBILE_SETTINGS_SECTION_ROUTE) return null;
  const section = (route.params as { section?: unknown } | undefined)?.section;
  return section === "reader" || section === "sources" || section === "directories" ||
    section === "appearance" || section === "data" || section === "experimental"
    ? section
    : null;
}

/** Sections of the stack's routes above its root, bottom to top. */
export function getMobileSettingsStackSections(
  state: MobileSettingsStackState,
): (MobileSettingsSplitSectionId | null)[] {
  const above = state.routes[0]?.name === MOBILE_SETTINGS_ROOT_ROUTE ? state.routes.slice(1) : state.routes;
  return above.map(routeSection);
}

/** Whether the stack's top route is this screen's route (the root for a null section). */
export function isMobileSettingsStackTop(
  state: MobileSettingsStackState,
  section: MobileSettingsSplitSectionId | null,
): boolean {
  const top = state.routes[state.index];
  if (!top) return false;
  return section === null ? top.name === MOBILE_SETTINGS_ROOT_ROUTE : routeSection(top) === section;
}

function splitRoot(state: MobileSettingsStackState): {
  root: MobileSettingsStackRoute;
  above: MobileSettingsStackRoute[];
} {
  const first = state.routes[0];
  const hasRoot = first?.name === MOBILE_SETTINGS_ROOT_ROUTE;
  return {
    root: first && hasRoot ? first : { name: MOBILE_SETTINGS_ROOT_ROUTE, params: {} },
    above: hasRoot ? state.routes.slice(1) : state.routes,
  };
}

/**
 * The stack after a collapse plan, as a RESET payload — its first step: the
 * root (inserted if the stack lacks it) and the kept routes keep their keys,
 * so their screens stay mounted, and only the plan's top page is pushed (no
 * key: the router's RESET handler mints it), carrying
 * `MOBILE_SETTINGS_RESTORED_PARAM`. Pages under it (Installed Sources under
 * Source Directories) are inserted once it is in place
 * (`completeMobileSettingsRestoredStack`): pushing two screens at once makes
 * react-native-screens set the lower one as the top without animation and
 * then push the upper one, so the lower page showed for a frame or two.
 */
export function applyMobileSettingsCollapsePlan<State extends MobileSettingsStackState>(
  state: State,
  plan: MobileSettingsCollapsePlan,
): State {
  const { root, above } = splitRoot(state);
  const top = plan.push[plan.push.length - 1];
  const routes = [
    root,
    ...above.slice(0, plan.keep),
    ...(top
      ? [{ name: MOBILE_SETTINGS_SECTION_ROUTE, params: { section: top, [MOBILE_SETTINGS_RESTORED_PARAM]: "1" } }]
      : []),
  ];
  return { ...state, index: routes.length - 1, routes, stale: false };
}

/**
 * The second step, once the restored top route is in place: the pages of its
 * chain missing beneath it are inserted (a change under the top, which
 * react-native-screens applies without a transition, out of sight), routes
 * beneath it that are not in its chain are dropped, and its
 * `MOBILE_SETTINGS_RESTORED_PARAM` is cleared so its own pop and edge swipe
 * animate again. Null when the top is not this section's route.
 */
export function completeMobileSettingsRestoredStack<State extends MobileSettingsStackState>(
  state: State,
  section: MobileSettingsSplitSectionId,
): State | null {
  if (!isMobileSettingsStackTop(state, section)) return null;
  const { root, above } = splitRoot(state);
  const top = above[above.length - 1];
  if (!top) return null;
  const below = above.slice(0, -1);
  const chainBelow = getMobileSettingsPageChain(section).slice(0, -1);
  let keep = 0;
  while (keep < below.length && keep < chainBelow.length && routeSection(below[keep]) === chainBelow[keep]) keep++;
  const params: Record<string, unknown> = { ...(top.params ?? {}) };
  delete params[MOBILE_SETTINGS_RESTORED_PARAM];
  const routes = [
    root,
    ...below.slice(0, keep),
    ...chainBelow.slice(keep).map((page) => ({ name: MOBILE_SETTINGS_SECTION_ROUTE, params: { section: page } })),
    { ...top, params },
  ];
  return { ...state, index: routes.length - 1, routes, stale: false };
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

/**
 * Which column backs are mounted for a placement. With native bar-axis views
 * (`axisViews`) the bar item and the title-row back are both mounted for
 * either bar axis, and the native side shows the one that fits the bar in the
 * frame the bar turns (the bar item only in a vertical bar, the drawn one
 * only in a top bar) — a React commit would land frames later, showing two
 * backs or none. Without them, only the one for `placement` is mounted.
 */
export function getMobileSettingsSplitColumnBackMounts({
  placement,
  axisViews,
}: {
  placement: "bar" | "column" | "pane" | null;
  axisViews: boolean;
}): { barItem: boolean; titleRow: boolean; pane: boolean } {
  const inBarRow = placement === "bar" || placement === "column";
  return {
    barItem: axisViews ? inBarRow : placement === "bar",
    titleRow: axisViews ? inBarRow : placement === "column",
    pane: placement === "pane",
  };
}
