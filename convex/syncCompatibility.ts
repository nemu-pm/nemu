import type { MutationCtx } from "./_generated/server";
import { requireAuth, requireAuthForUser } from "./_lib";
import {
  getCurrentSyncGeneration,
  requireSyncGeneration,
  resolveSyncClock,
  SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED,
  SYNC_MUTATION_CONTEXT_REQUIRED,
} from "./syncGeneration";

export const LEGACY_SYNC_WRITE_CUTOFF_ENV = "SYNC_LEGACY_WRITE_CUTOFF_AT";

export type LegacySyncTelemetryEvent = {
  event:
    | "legacy-sync-write-grace"
    | "legacy-sync-write-rejected"
    | "legacy-sync-cutoff-invalid";
  generation: number;
  cutoffAt: number | null;
};

export type LegacySyncWritePolicy = {
  allow: boolean;
  cutoffAt: number | null;
  reason:
    | "compatibility-default"
    | "before-cutoff"
    | "cutoff-reached"
    | "invalid-cutoff";
};

/**
 * Parse either epoch milliseconds or an ISO-8601 date. An unset value keeps
 * the deployment-compatible grace path; setting the environment variable
 * makes the rollout self-expiring without another backend deploy.
 */
export function resolveLegacySyncWritePolicy(
  cutoffValue: string | null | undefined,
  now: number,
): LegacySyncWritePolicy {
  if (!Number.isSafeInteger(now) || now < 0) {
    return { allow: false, cutoffAt: null, reason: "invalid-cutoff" };
  }
  if (cutoffValue == null) {
    return { allow: true, cutoffAt: null, reason: "compatibility-default" };
  }
  const value = cutoffValue.trim();
  if (!value) {
    return { allow: false, cutoffAt: null, reason: "invalid-cutoff" };
  }
  const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { allow: false, cutoffAt: null, reason: "invalid-cutoff" };
  }
  return now < parsed
    ? { allow: true, cutoffAt: parsed, reason: "before-cutoff" }
    : { allow: false, cutoffAt: parsed, reason: "cutoff-reached" };
}

type SyncMutationContextOptions = {
  now?: number;
  /** Test/preview override. Omit to read `SYNC_LEGACY_WRITE_CUTOFF_AT`. */
  cutoffValue?: string | null;
  onLegacyTelemetry?: (event: LegacySyncTelemetryEvent) => void;
};

function defaultLegacyTelemetry(event: LegacySyncTelemetryEvent): void {
  if (event.event === "legacy-sync-write-grace") {
    console.info("[sync-compat]", JSON.stringify(event));
  } else {
    console.warn("[sync-compat]", JSON.stringify(event));
  }
}

export function legacyVisibleLibraryRows<
  T extends { id: string; inLibrary?: boolean },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.inLibrary !== false);
}

export function legacyVisibleSourceLinkRows<
  T extends { libraryItemId: string; removed?: boolean },
>(rows: readonly T[], activeLibraryItemIds: ReadonlySet<string>): T[] {
  return rows.filter(
    (row) =>
      row.removed !== true && activeLibraryItemIds.has(row.libraryItemId),
  );
}

export function legacyVisibleCollectionRows<
  T extends { collectionId: string; removed?: boolean },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.removed !== true);
}

export function legacyVisibleCollectionItemRows<
  T extends {
    collectionId: string;
    libraryItemId: string;
    removed?: boolean;
  },
>(
  rows: readonly T[],
  activeCollectionIds: ReadonlySet<string>,
  activeLibraryItemIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) =>
      row.removed !== true &&
      activeCollectionIds.has(row.collectionId) &&
      activeLibraryItemIds.has(row.libraryItemId),
  );
}

export type SyncMutationContext = {
  userId: string;
  generation: number;
  legacy: boolean;
  resolveClock: (clock: number | undefined, legacyNow: number) => number;
};

/**
 * Account and generation fencing for queued sync mutations.
 *
 * Validators keep the two fields optional because Convex deploys independently
 * of the web bundle: for the whole window between a backend push and the last
 * browser picking up new JS, every production client is still sending neither
 * field. Rejecting those payloads would silently discard every write those
 * clients make, so a payload with *both* fields absent takes the legacy path
 * and executes with the semantics the pre-fencing backend had until the
 * operator-configured cutoff is reached. An unset cutoff preserves the safe
 * deploy-first compatibility default.
 *
 * The legacy path stays fail-closed for cross-account safety. The account is
 * derived from the transport's own authentication, never from client input, so
 * a queued payload replayed on a reconnected socket can only ever write to the
 * account that socket is currently authenticated as — it can never be steered
 * at another user's data. A *half*-populated payload is still rejected: it
 * cannot be produced by any released client and would mean the caller believes
 * it is fencing when it is not.
 */
export async function requireSyncMutationContext(
  ctx: MutationCtx,
  args: {
    expectedUserId?: string;
    generation?: number;
  },
  options: SyncMutationContextOptions = {},
): Promise<SyncMutationContext> {
  const expectedUserId = args.expectedUserId;
  const legacy = expectedUserId === undefined && args.generation === undefined;
  if (legacy) {
    const userId = await requireAuth(ctx);
    // A legacy client cannot name a generation, so it writes into whichever
    // one the account currently occupies. That matches the pre-fencing
    // behaviour (writes always landed) and keeps its data visible to current
    // clients, at the cost of an un-upgraded device being able to re-push
    // into a generation created by a reset it never saw.
    const generation = await getCurrentSyncGeneration(ctx, userId);
    const now = options.now ?? Date.now();
    const cutoffValue = Object.prototype.hasOwnProperty.call(
      options,
      "cutoffValue",
    )
      ? options.cutoffValue
      : process.env[LEGACY_SYNC_WRITE_CUTOFF_ENV];
    const policy = resolveLegacySyncWritePolicy(cutoffValue, now);
    const onTelemetry = options.onLegacyTelemetry ?? defaultLegacyTelemetry;
    if (!policy.allow) {
      onTelemetry({
        event:
          policy.reason === "invalid-cutoff"
            ? "legacy-sync-cutoff-invalid"
            : "legacy-sync-write-rejected",
        generation,
        cutoffAt: policy.cutoffAt,
      });
      throw new Error(
        `${SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED}: ${policy.reason}`,
      );
    }
    onTelemetry({
      event: "legacy-sync-write-grace",
      generation,
      cutoffAt: policy.cutoffAt,
    });
    return {
      userId,
      generation,
      legacy: true,
      // Legacy payloads predate the logical clock requirement, so fall back to
      // the server's wall clock instead of failing the write.
      resolveClock: (clock, legacyNow) =>
        resolveSyncClock(clock, 0, legacyNow),
    };
  }
  if ((expectedUserId === undefined) !== (args.generation === undefined)) {
    throw new Error(SYNC_MUTATION_CONTEXT_REQUIRED);
  }
  const userId = await requireAuthForUser(ctx, expectedUserId!);
  const generation = await requireSyncGeneration(ctx, userId, args.generation);
  return {
    userId,
    generation,
    legacy: false,
    resolveClock: (clock, legacyNow) =>
      resolveSyncClock(clock, generation, legacyNow),
  };
}
