export type NativeCacheWriteLease = Readonly<{
  epoch: number;
  key: string;
  token: number;
}>;

/**
 * Gives each cache key a latest-started-writer owner. Native downloads finish
 * out of order, so an older request must not replace bytes downloaded by a
 * newer install/update attempt for the same executable artifact.
 */
export class NativeCacheWriteCoordinator {
  private epoch = 0;
  private nextToken = 0;
  private readonly owners = new Map<string, number>();

  begin(key: string): NativeCacheWriteLease {
    this.nextToken = (this.nextToken + 1) % Number.MAX_SAFE_INTEGER;
    if (this.nextToken === 0) this.nextToken = 1;
    const lease = { epoch: this.epoch, key, token: this.nextToken } as const;
    this.owners.set(key, lease.token);
    return lease;
  }

  isCurrent(lease: NativeCacheWriteLease): boolean {
    return (
      lease.epoch === this.epoch &&
      this.owners.get(lease.key) === lease.token
    );
  }

  finish(lease: NativeCacheWriteLease): void {
    if (this.isCurrent(lease)) this.owners.delete(lease.key);
  }

  invalidate(key: string): void {
    this.owners.delete(key);
  }

  invalidateAll(): void {
    this.epoch = (this.epoch + 1) % Number.MAX_SAFE_INTEGER;
    this.owners.clear();
  }
}

/** Serializes only the short filesystem publish/delete phase. Downloads stay
 * concurrent, while remove/clear cannot interleave with an atomic cache move
 * and leave an invalidated executable discoverable on disk. */
export class NativeCacheMutationQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
