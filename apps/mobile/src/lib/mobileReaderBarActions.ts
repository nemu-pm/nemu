/**
 * The reader's chrome actions, in the order the actions capsule draws them,
 * and which of them stay in the bar when it cannot hold them all. How many
 * stay is the pose's call (`visibleActionCount`, the system bar's
 * `mobileReaderVerticalBarVisibleActionCount`); the rest move to the ⋯ menu.
 */
export type MobileReaderBarActionId =
  | "detect-text"
  | "nemu-chat"
  | `plugin:${string}`
  | "bilingual-layout"
  | "chapter-list"
  | "settings";

/** Capsule order: plugins (Japanese Learning draws two), the bilingual toggle, chapters, the gear. */
export function mobileReaderBarActionIds(input: {
  enabledPluginIds: readonly string[];
  bilingualToggle: boolean;
}): MobileReaderBarActionId[] {
  const ids = input.enabledPluginIds.flatMap((id): MobileReaderBarActionId[] =>
    id === "japanese-learning" ? ["detect-text", "nemu-chat"] : [`plugin:${id}`],
  );
  if (input.bilingualToggle) ids.push("bilingual-layout");
  ids.push("chapter-list", "settings");
  return ids;
}

/** The order actions earn a place in the bar: the gear, Chapters, then the rest as drawn. */
function barActionPriority(actions: readonly MobileReaderBarActionId[]): MobileReaderBarActionId[] {
  const pinned: MobileReaderBarActionId[] = ["settings", "chapter-list"];
  return [
    ...pinned.filter((id) => actions.includes(id)),
    ...actions.filter((id) => !pinned.includes(id)),
  ];
}

/**
 * Both lists keep the drawn order, so an action never changes places as room
 * comes and goes. The gear stays whatever the count.
 */
export function splitMobileReaderBarActions(
  actions: readonly MobileReaderBarActionId[],
  visibleCount: number,
): { visible: MobileReaderBarActionId[]; overflow: MobileReaderBarActionId[] } {
  const kept = new Set(barActionPriority(actions).slice(0, Math.max(1, visibleCount)));
  return {
    visible: actions.filter((id) => kept.has(id)),
    overflow: actions.filter((id) => !kept.has(id)),
  };
}
