/**
 * Small external store for the imperative pause used by sign-out/data-clear.
 * A ref alone does not re-render Convex hooks, so failed sign-out could leave
 * subscriptions permanently skipped until some unrelated render occurred.
 */
export const subscriptionStoppedRef: { current: boolean } = { current: false };

const listeners = new Set<() => void>();

export function getSyncSubscriptionsStopped(): boolean {
  return subscriptionStoppedRef.current;
}

export function setSyncSubscriptionsStopped(stopped: boolean): void {
  if (subscriptionStoppedRef.current === stopped) return;
  subscriptionStoppedRef.current = stopped;
  for (const listener of listeners) listener();
}

export function subscribeSyncSubscriptionsStopped(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
