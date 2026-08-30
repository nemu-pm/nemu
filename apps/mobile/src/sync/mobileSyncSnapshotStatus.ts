import type { MobileSyncSnapshotState } from "@/data/schema";

type SnapshotStateBase = Omit<
  MobileSyncSnapshotState,
  "status" | "observedAt"
> & {
  observedAt?: number;
};

export function createMobileSyncBudgetExceededState(
  input: SnapshotStateBase,
): MobileSyncSnapshotState {
  return {
    ...input,
    status: "budget-exceeded",
    observedAt: input.observedAt ?? Date.now(),
  };
}

export function createMobileSyncHealthyState(
  input: Pick<SnapshotStateBase, "generation" | "origin" | "observedAt">,
): MobileSyncSnapshotState {
  return {
    status: "healthy",
    generation: input.generation,
    origin: input.origin,
    observedAt: input.observedAt ?? Date.now(),
  };
}
