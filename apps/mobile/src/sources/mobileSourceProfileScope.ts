const LOCAL_MOBILE_SOURCE_PROFILE_SCOPE = "local";

export type MobileSourceProfileTransition = {
  fromScope: string;
  toScope: string;
};

export type MobileSourceProfileTransitionHandler = (
  transition: MobileSourceProfileTransition,
) => void | Promise<void>;

const transitionHandlers = new Map<
  string,
  MobileSourceProfileTransitionHandler
>();

let activeProfileScope = LOCAL_MOBILE_SOURCE_PROFILE_SCOPE;
let profileTransitionQueue: Promise<void> = Promise.resolve();
let pendingProfileTransitionCount = 0;

function normalizeProfileScope(scope: string): string {
  const normalized = scope.trim();
  if (!normalized) {
    throw new Error("A non-empty mobile source profile scope is required.");
  }
  return normalized;
}

export function getActiveMobileSourceProfileScope(): string {
  return activeProfileScope;
}

export class MobileSourceProfileChangedError extends Error {
  readonly expectedScope: string;
  readonly activeScope: string;

  constructor(expectedScope: string, activeScope: string) {
    super("The mobile source profile changed during this operation.");
    this.name = "MobileSourceProfileChangedError";
    this.expectedScope = expectedScope;
    this.activeScope = activeScope;
  }
}

export function assertActiveMobileSourceProfileScope(
  expectedScope: string,
): void {
  const normalizedExpectedScope = normalizeProfileScope(expectedScope);
  if (
    pendingProfileTransitionCount > 0 ||
    activeProfileScope !== normalizedExpectedScope
  ) {
    throw new MobileSourceProfileChangedError(
      normalizedExpectedScope,
      activeProfileScope,
    );
  }
}

export function isMobileSourceProfileChangedError(
  error: unknown,
): error is MobileSourceProfileChangedError {
  return error instanceof MobileSourceProfileChangedError;
}

export function isMobileSourceProfileTransitionPending(): boolean {
  return pendingProfileTransitionCount > 0;
}

/**
 * Namespace every stateful source runtime and user-content cache. The
 * canonical source key remains unchanged in local settings/database rows;
 * only the execution identity crosses this boundary.
 */
export function makeMobileSourceExecutionKey(
  canonicalSourceKey: string,
  profileScope = activeProfileScope,
): string {
  const normalizedSourceKey = canonicalSourceKey.trim();
  if (!normalizedSourceKey) {
    throw new Error("A non-empty mobile source key is required.");
  }
  return `${normalizeProfileScope(profileScope)}::${normalizedSourceKey}`;
}

/**
 * Register process-memory/native cleanup that must complete before another
 * account may mount source-facing UI. Stable ids make Fast Refresh replace a
 * handler instead of accumulating duplicate callbacks.
 */
export function registerMobileSourceProfileTransitionHandler(
  id: string,
  handler: MobileSourceProfileTransitionHandler,
): () => void {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("A transition handler id is required.");
  transitionHandlers.set(normalizedId, handler);
  return () => {
    if (transitionHandlers.get(normalizedId) === handler) {
      transitionHandlers.delete(normalizedId);
    }
  };
}

/**
 * Serialize A -> B -> C transitions and publish the new scope only after all
 * registered cleanup succeeds. Callers render a fail-closed boundary while
 * this promise is pending, so stale sessions cannot service the next account.
 */
export function transitionMobileSourceProfile(
  nextScope: string,
): Promise<void> {
  const normalizedNextScope = normalizeProfileScope(nextScope);
  pendingProfileTransitionCount += 1;
  const task = profileTransitionQueue
    .catch(() => undefined)
    .then(async () => {
      if (activeProfileScope === normalizedNextScope) return;
      const transition = {
        fromScope: activeProfileScope,
        toScope: normalizedNextScope,
      };
      const failures: unknown[] = [];
      for (const handler of [...transitionHandlers.values()]) {
        try {
          await handler(transition);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        const first = failures[0];
        throw first instanceof Error
          ? first
          : new Error("Failed to isolate the mobile source profile.");
      }
      activeProfileScope = normalizedNextScope;
    });
  const trackedTask = task.finally(() => {
    pendingProfileTransitionCount = Math.max(
      0,
      pendingProfileTransitionCount - 1,
    );
  });
  profileTransitionQueue = trackedTask;
  return trackedTask;
}

export async function resetMobileSourceProfileScopeForTesting(): Promise<void> {
  await profileTransitionQueue.catch(() => undefined);
  activeProfileScope = LOCAL_MOBILE_SOURCE_PROFILE_SCOPE;
  pendingProfileTransitionCount = 0;
  profileTransitionQueue = Promise.resolve();
}
