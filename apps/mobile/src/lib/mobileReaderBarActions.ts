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

/**
 * What the bar's buttons light up for, and the ⋯ menu's checkmarks: the one
 * answer both read, so they cannot disagree wherever an action sits. Detect
 * text is on once the page has a detection (running, read or failed), Nemu
 * Chat while it has a conversation.
 */
export function mobileReaderBarActionStates(input: {
  ocrStatus: "idle" | "loading" | "ready" | "error";
  chatMessageCount: number;
  chatStreaming: boolean;
  dualReadEnabled: boolean;
}): { detectTextActive: boolean; nemuChatActive: boolean; dualReadEnabled: boolean } {
  return {
    detectTextActive: input.ocrStatus !== "idle",
    nemuChatActive: input.chatMessageCount > 0 || input.chatStreaming,
    dualReadEnabled: input.dualReadEnabled,
  };
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
