/** A set of change listeners for `useSyncExternalStore`: `subscribe` returns the unsubscribe. */
export function createChangeListeners() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
}
