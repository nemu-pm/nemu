/**
 * Design-explore order for a title's quick actions: what a reader reaches
 * for most (file it in a collection, open it on its source) first, the one
 * that rewrites reading progress (mark all as read) after them, and removal
 * last. The shipping sheet led with "Mark all as read", the action most
 * costly to hit by mistake.
 */
const ORDER = ["addToCollection", "openInSource", "markAllRead", "remove"] as const;

export function orderMobileTitleQuickActions<T extends { id: string }>(actions: readonly T[]): T[] {
  const rank = (id: string) => {
    const index = (ORDER as readonly string[]).indexOf(id);
    return index < 0 ? ORDER.indexOf("markAllRead") - 0.5 : index;
  };
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rank(a.action.id) - rank(b.action.id) || a.index - b.index)
    .map(({ action }) => action);
}
