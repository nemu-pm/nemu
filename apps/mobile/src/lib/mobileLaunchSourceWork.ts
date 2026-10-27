import {
  scheduleMobileIdleTask,
  type MobileIdleTaskEnvironment,
} from "./mobileIdleTask";

/**
 * Source work that a cold launch must not pay before the first frame: the
 * cover request rewrites (`modifyImageRequest`, cover processors) need an
 * Aidoku session, and on iOS a cold session boots a WKWebView on the main
 * thread. The launch shows the Library with its remembered cover requests and
 * placeholders first; this gate opens once the launch screen has lifted and
 * the JS thread has gone idle, and only then do covers revalidate or resolve.
 */

/**
 * The gate opens on its own this long after the first caller waits, so a
 * launch that never reveals (a headless background task, an error screen)
 * never starves its covers.
 */
export const MOBILE_LAUNCH_SOURCE_WORK_FALLBACK_MS = 5000;
/** How long the idle task after the reveal may wait for an idle period. */
export const MOBILE_LAUNCH_SOURCE_WORK_IDLE_TIMEOUT_MS = 1000;

let allowed = false;
let revealed = false;
let waiters: Array<() => void> = [];
let gate: Promise<void> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let idleTask: { cancel: () => void } | null = null;
let idleEnvironment: MobileIdleTaskEnvironment | undefined;

function allow(): void {
  if (allowed) return;
  allowed = true;
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  idleTask = null;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve();
}

export function isMobileLaunchSourceWorkAllowed(): boolean {
  return allowed;
}

/** Resolves once launch-deferred source work may run (at once after launch). */
export function waitForMobileLaunchSourceWork(): Promise<void> {
  if (allowed) return Promise.resolve();
  if (!gate) {
    gate = new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
    fallbackTimer = setTimeout(allow, MOBILE_LAUNCH_SOURCE_WORK_FALLBACK_MS);
  }
  return gate;
}

/**
 * The launch screen has lifted (the root's reveal or the safety cap): open the
 * gate at the next idle period. Idempotent.
 */
export function markMobileLaunchSourceWorkRevealed(): void {
  if (allowed || revealed) return;
  revealed = true;
  idleTask = scheduleMobileIdleTask(allow, {
    timeout: MOBILE_LAUNCH_SOURCE_WORK_IDLE_TIMEOUT_MS,
    environment: idleEnvironment,
  });
}

/** Tests only: a fresh launch, optionally with a fake idle environment. */
export function resetMobileLaunchSourceWorkForTests(
  environment?: MobileIdleTaskEnvironment,
): void {
  idleTask?.cancel();
  idleTask = null;
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  allowed = false;
  revealed = false;
  waiters = [];
  gate = null;
  idleEnvironment = environment;
}
