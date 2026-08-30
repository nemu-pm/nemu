/**
 * Client-side handling for the sync error protocol.
 *
 * Sync mutations are fired from store operations that nobody awaits, so an
 * unhandled rejection was the only thing distinguishing "the server refused
 * this write forever" from "the write landed". This module classifies the
 * failure once and publishes the recovery the session needs, which `setup.tsx`
 * subscribes to and acts on.
 */

import { classifySyncError, type SyncErrorKind } from "@nemu/core";

export type SyncRecoveryRequest = {
  kind: SyncErrorKind;
  code: string;
  /** Server-reported current generation, when the error carried one. */
  expectedGeneration?: number;
  /** Monotonic so a repeat of the same failure still wakes subscribers. */
  revision: number;
};

let currentRequest: SyncRecoveryRequest | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeSyncRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncRecoveryRequest(): SyncRecoveryRequest | null {
  return currentRequest;
}

/**
 * Clear a request once it has been acted on. The revision guard keeps a slow
 * handler from clearing a newer failure that arrived while it was running.
 */
export function clearSyncRecoveryRequest(handledRevision: number): void {
  if (currentRequest?.revision !== handledRevision) return;
  currentRequest = null;
  publish();
}

export function resetSyncRecoveryState(): void {
  currentRequest = null;
  revision = 0;
  publish();
}

/**
 * Record a rejected sync mutation.
 *
 * Returns the classification when the failure is part of the sync protocol
 * (and therefore handled here), or `null` for an ordinary transient failure
 * the caller should treat as a normal retryable error.
 */
export function reportSyncMutationError(
  error: unknown,
): SyncRecoveryRequest | null {
  const classification = classifySyncError(error);
  if (!classification) return null;
  // An account mismatch means a queued write was replayed under a different
  // session. The identity guards already stop that write from mattering, and
  // there is nothing for the user to do, so it is logged and dropped.
  if (classification.kind === "account-mismatch") {
    console.warn("[sync] Dropped a write replayed under a different account.");
    return null;
  }
  revision += 1;
  currentRequest = {
    kind: classification.kind,
    code: classification.code,
    expectedGeneration: classification.expectedGeneration,
    revision,
  };
  publish();
  return currentRequest;
}

/**
 * Run a sync mutation, absorbing protocol errors into the recovery channel.
 *
 * Anything unrecognised is re-thrown so genuinely transient failures keep the
 * behaviour they had before, including the caller's own retry handling.
 */
export async function runSyncMutation<T>(
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    // Classify first: some protocol errors are absorbed by
    // `reportSyncMutationError` without publishing a request, and those must
    // still not escape as an unhandled rejection.
    if (!classifySyncError(error)) throw error;
    reportSyncMutationError(error);
    return undefined;
  }
}
