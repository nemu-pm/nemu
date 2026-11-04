import type { AppStateStatus } from "react-native";
import type { MobileHttpForegroundGate } from "./mobileNativeHttpRetry";

type AppStateLike = {
  // RN types `AppState.currentState` as a plain string.
  currentState: AppStateStatus | string | null | undefined;
  addEventListener(
    type: "change",
    listener: (state: AppStateStatus) => void,
  ): { remove(): void };
};

/** Longest a background-interrupted request waits for the foreground. */
export const MOBILE_HTTP_FOREGROUND_WAIT_MAX_MS = 10 * 60_000;

/**
 * The retry policy's view of AppState. "inactive" (Control Centre, the app
 * switcher, a fold transition) is not a background: only "background" bumps
 * the epoch, and only "active" releases waiting requests.
 */
export function createMobileHttpForegroundGate(
  appState: AppStateLike,
  options: { maxWaitMs?: number } = {},
): MobileHttpForegroundGate {
  const maxWaitMs = options.maxWaitMs ?? MOBILE_HTTP_FOREGROUND_WAIT_MAX_MS;
  let state: AppStateStatus | string = appState.currentState ?? "active";
  let epoch = 0;
  const waiters = new Set<() => void>();
  appState.addEventListener("change", (next) => {
    if (next === "background" && state !== "background") epoch += 1;
    state = next;
    if (next === "active") {
      for (const wake of [...waiters]) wake();
    }
  });
  return {
    isActive: () => state === "active",
    backgroundEpoch: () => epoch,
    waitForActive(signal) {
      if (state === "active") return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          waiters.delete(done);
          clearTimeout(timer);
          signal?.removeEventListener("abort", done);
          // An abort is reported by the caller's own signal check.
          resolve();
        };
        const timer = setTimeout(done, maxWaitMs);
        waiters.add(done);
        signal?.addEventListener("abort", done, { once: true });
      });
    },
  };
}
