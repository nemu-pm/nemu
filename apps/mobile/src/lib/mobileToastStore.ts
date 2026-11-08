export type MobileToastDuration = "normal" | "long" | "sticky";

export const MOBILE_TOAST_AUTO_DISMISS_MS = 4_000;
export const MOBILE_TOAST_ACTION_AUTO_DISMISS_MS = 6_000;

export type MobileToastEntry<Options> = { id: string; options: Options };

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * The one visible toast and its auto-dismiss timer. It lives outside React so
 * a toast outlives the provider tree: switching data profile (a first sign-in,
 * signing out with Remove data) remounts everything under `MobileDataProvider`,
 * and the "Signed out" that closes such a flow is shown across that remount.
 *
 * Dismissing an id that is no longer showing touches nothing: a late dismiss
 * (a progress toast finishing after another replaced it) used to clear the
 * visible toast's timer, leaving it on screen until tapped.
 */
export function createMobileToastStore<Options extends { id?: string; action?: unknown; duration?: MobileToastDuration }>({
  schedule = setTimeout,
  cancel = clearTimeout,
}: {
  schedule?: (run: () => void, ms: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
} = {}) {
  let current: MobileToastEntry<Options> | null = null;
  let timer: TimerHandle | null = null;
  let sequence = 0;
  const listeners = new Set<() => void>();

  const set = (next: MobileToastEntry<Options> | null) => {
    current = next;
    for (const listener of listeners) listener();
  };
  const clearTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };

  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show: (options: Options): string => {
      const id = options.id ?? `mobile-toast-${++sequence}`;
      clearTimer();
      set({ id, options });
      const duration = options.duration ?? (options.action ? "long" : "normal");
      if (duration !== "sticky") {
        timer = schedule(
          () => {
            timer = null;
            if (current?.id === id) set(null);
          },
          duration === "long" ? MOBILE_TOAST_ACTION_AUTO_DISMISS_MS : MOBILE_TOAST_AUTO_DISMISS_MS,
        );
      }
      return id;
    },
    dismiss: (id: string): void => {
      if (current?.id !== id) return;
      clearTimer();
      set(null);
    },
  };
}
