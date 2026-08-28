export type StoreGenerationToken = {
  readonly generation: number | null;
  readonly revision: number;
};

/**
 * Coordinates a Zustand view with the durable IndexedDB generation reset.
 * The generation is published synchronously (so old objects disappear at
 * once), while actions that start in the new generation wait for the reset
 * transaction to commit before reading or writing.
 */
export class StoreGenerationGate {
  private generation: number | null = null;
  private revision = 0;
  private readiness: Promise<void> = Promise.resolve();

  get currentGeneration(): number | null {
    return this.generation;
  }

  prepare(generation: number, readiness?: Promise<unknown>): boolean {
    if (this.generation !== null && generation < this.generation) return false;
    if (this.generation === generation && readiness === undefined) return false;

    this.generation = generation;
    this.revision += 1;
    const revision = this.revision;
    this.readiness = Promise.resolve(readiness).then(() => undefined);
    // Keep a rejected reset observable by the next action without creating an
    // unhandled rejection when no action is attempted before a retry.
    void this.readiness.catch(() => undefined);
    void this.readiness.then(
      () => {
        // The revision check documents that an older readiness completion does
        // not make a newer generation ready. wait() always checks its token.
        if (this.revision !== revision) return;
      },
      () => undefined,
    );
    return true;
  }

  capture(): StoreGenerationToken {
    return { generation: this.generation, revision: this.revision };
  }

  isCurrent(token: StoreGenerationToken): boolean {
    return (
      token.revision === this.revision &&
      token.generation === this.generation
    );
  }

  async wait(token: StoreGenerationToken): Promise<boolean> {
    const readiness = this.readiness;
    await readiness;
    return this.isCurrent(token);
  }
}
