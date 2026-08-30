export type MobileImageCacheUriStore = {
  getUri(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
};

export type MobileImageCacheLoadPriority = "prefetch" | "visible";

export type MobileImageCacheResolveOptions = {
  priority?: MobileImageCacheLoadPriority;
  signal?: AbortSignal;
};

type MobileImageCacheLoad = {
  key: string;
  priority: number;
  sequence: number;
  controller: AbortController;
  loadMissing: (signal: AbortSignal) => Promise<string | null>;
  completion: Promise<string | null>;
  resolveCompletion: (value: string | null) => void;
  rejectCompletion: (reason: unknown) => void;
  consumerCount: number;
  started: boolean;
  settled: boolean;
  cancelRequested: boolean;
};

function loadPriorityValue(priority: MobileImageCacheLoadPriority | undefined) {
  return priority === "prefetch" ? 0 : 1;
}

/**
 * Keeps the synchronous URI hint and the on-disk cache in agreement.
 *
 * Disk quotas can evict an entry without notifying React. Every async resolve
 * therefore revalidates the file through the cache before returning an in-memory
 * URI. Missing files fall through to the supplied loader and are repopulated.
 */
export class MobileImageCacheCoordinator {
  private readonly resolvedUris = new Map<string, string>();
  private readonly loaders = new Map<string, MobileImageCacheLoad>();
  private readonly invalidations = new Map<string, Promise<void>>();
  private readonly bypassDiskOnce = new Set<string>();
  private readonly loadQueue: MobileImageCacheLoad[] = [];
  private activeLoadCount = 0;
  private loadSequence = 0;
  private clearing: Promise<void> | null = null;

  constructor(
    private readonly store: MobileImageCacheUriStore,
    private readonly maxResolvedUris: number,
    private readonly maxConcurrentLoads = Number.MAX_SAFE_INTEGER,
  ) {
    if (!Number.isSafeInteger(maxResolvedUris) || maxResolvedUris < 1) {
      throw new Error("Invalid mobile image URI cache limit.");
    }
    if (!Number.isSafeInteger(maxConcurrentLoads) || maxConcurrentLoads < 1) {
      throw new Error("Invalid mobile image load concurrency limit.");
    }
  }

  getResolvedUri(key: string): string | null {
    return this.resolvedUris.get(key) ?? null;
  }

  private remember(key: string, uri: string): void {
    this.resolvedUris.delete(key);
    while (this.resolvedUris.size >= this.maxResolvedUris) {
      const oldestKey = this.resolvedUris.keys().next().value;
      if (oldestKey === undefined) break;
      this.resolvedUris.delete(oldestKey);
    }
    this.resolvedUris.set(key, uri);
  }

  private createLoad(
    key: string,
    loadMissing: (signal: AbortSignal) => Promise<string | null>,
    priority: number,
  ): MobileImageCacheLoad {
    let resolveCompletion!: (value: string | null) => void;
    let rejectCompletion!: (reason: unknown) => void;
    const completion = new Promise<string | null>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    this.loadSequence += 1;
    return {
      key,
      priority,
      sequence: this.loadSequence,
      controller: new AbortController(),
      loadMissing,
      completion,
      resolveCompletion,
      rejectCompletion,
      consumerCount: 0,
      started: false,
      settled: false,
      cancelRequested: false,
    };
  }

  private finishLoad(
    load: MobileImageCacheLoad,
    value: string | null,
    error?: unknown,
  ): void {
    if (load.settled) return;
    load.settled = true;
    const queuedIndex = this.loadQueue.indexOf(load);
    if (queuedIndex >= 0) this.loadQueue.splice(queuedIndex, 1);
    if (load.started) {
      this.activeLoadCount = Math.max(0, this.activeLoadCount - 1);
    }
    if (this.loaders.get(load.key) === load) this.loaders.delete(load.key);

    if (error !== undefined && !load.cancelRequested) {
      load.rejectCompletion(error);
    } else {
      load.resolveCompletion(load.cancelRequested ? null : value);
    }
    this.startQueuedLoads();
  }

  private cancelLoad(load: MobileImageCacheLoad): void {
    if (load.settled || load.cancelRequested) return;
    load.cancelRequested = true;
    if (load.started) {
      load.controller.abort();
      return;
    }
    this.finishLoad(load, null);
  }

  private cancelLoadIfOrphaned(load: MobileImageCacheLoad): void {
    if (load.consumerCount === 0) this.cancelLoad(load);
  }

  private subscribeToLoad(
    load: MobileImageCacheLoad,
    signal: AbortSignal | undefined,
  ): Promise<string | null> {
    if (signal?.aborted) {
      this.cancelLoadIfOrphaned(load);
      return Promise.resolve(null);
    }

    load.consumerCount += 1;
    return new Promise<string | null>((resolve, reject) => {
      let completed = false;
      const release = () => {
        signal?.removeEventListener("abort", handleAbort);
        load.consumerCount = Math.max(0, load.consumerCount - 1);
        this.cancelLoadIfOrphaned(load);
      };
      const handleAbort = () => {
        if (completed) return;
        completed = true;
        release();
        resolve(null);
      };

      signal?.addEventListener("abort", handleAbort, { once: true });
      load.completion.then(
        (value) => {
          if (completed) return;
          completed = true;
          release();
          resolve(value);
        },
        (error: unknown) => {
          if (completed) return;
          completed = true;
          release();
          reject(error);
        },
      );
    });
  }

  private async executeLoad(load: MobileImageCacheLoad): Promise<string | null> {
    const bypassDisk = this.bypassDiskOnce.delete(load.key);
    let cachedUri: string | null = null;
    if (!bypassDisk) {
      try {
        cachedUri = await this.store.getUri(load.key);
      } catch {
        cachedUri = null;
      }
    }

    if (load.cancelRequested) return null;
    if (cachedUri) {
      this.remember(load.key, cachedUri);
      return cachedUri;
    }

    // An in-memory hit whose file was quota-evicted is stale. Remove it before
    // network work begins so native readers wait for a policy-checked repair.
    this.resolvedUris.delete(load.key);
    const loadedUri = await load.loadMissing(load.controller.signal);
    if (load.cancelRequested) return null;
    if (loadedUri) this.remember(load.key, loadedUri);
    return loadedUri;
  }

  private startQueuedLoads(): void {
    while (
      this.activeLoadCount < this.maxConcurrentLoads &&
      this.loadQueue.length > 0
    ) {
      let nextIndex = 0;
      for (let index = 1; index < this.loadQueue.length; index += 1) {
        const candidate = this.loadQueue[index]!;
        const selected = this.loadQueue[nextIndex]!;
        if (
          candidate.priority > selected.priority ||
          (candidate.priority === selected.priority &&
            candidate.sequence < selected.sequence)
        ) {
          nextIndex = index;
        }
      }
      const [load] = this.loadQueue.splice(nextIndex, 1);
      if (!load || load.settled) continue;
      load.started = true;
      this.activeLoadCount += 1;
      void this.executeLoad(load).then(
        (value) => this.finishLoad(load, value),
        (error: unknown) => this.finishLoad(load, null, error),
      );
    }
  }

  resolve(
    key: string,
    loadMissing: (signal: AbortSignal) => Promise<string | null>,
    options: MobileImageCacheResolveOptions = {},
  ): Promise<string | null> {
    if (options.signal?.aborted) return Promise.resolve(null);
    const clearing = this.clearing;
    if (clearing) {
      return clearing
        .catch(() => undefined)
        .then(() => this.resolve(key, loadMissing, options));
    }
    const invalidation = this.invalidations.get(key);
    if (invalidation) {
      return invalidation
        .catch(() => undefined)
        .then(() => this.resolve(key, loadMissing, options));
    }
    const existingLoader = this.loaders.get(key);
    if (existingLoader) {
      if (existingLoader.cancelRequested) {
        return existingLoader.completion
          .catch(() => null)
          .then(() => this.resolve(key, loadMissing, options));
      }
      existingLoader.priority = Math.max(
        existingLoader.priority,
        loadPriorityValue(options.priority),
      );
      return this.subscribeToLoad(existingLoader, options.signal);
    }

    const loader = this.createLoad(
      key,
      loadMissing,
      loadPriorityValue(options.priority),
    );
    this.loaders.set(key, loader);
    this.loadQueue.push(loader);
    const result = this.subscribeToLoad(loader, options.signal);
    this.startQueuedLoads();
    return result;
  }

  /** Invalidates synchronously, then removes the potentially corrupt file. */
  invalidate(key: string): Promise<void> {
    const existingInvalidation = this.invalidations.get(key);
    if (existingInvalidation) return existingInvalidation;
    this.resolvedUris.delete(key);
    // If deletion fails, the next resolve must still bypass the known-bad file
    // and overwrite it from the network instead of returning it again.
    this.bypassDiskOnce.add(key);
    const inFlightLoader = this.loaders.get(key)?.completion;
    const invalidation = (async () => {
      if (inFlightLoader) {
        await inFlightLoader.catch(() => null);
      }
      // A loader that started before invalidation may have repopulated both
      // layers. Remove its result only after it settles, then allow repair.
      this.resolvedUris.delete(key);
      this.bypassDiskOnce.add(key);
      await this.store.remove(key);
    })().finally(() => {
      if (this.invalidations.get(key) === invalidation) {
        this.invalidations.delete(key);
      }
    });
    this.invalidations.set(key, invalidation);
    return invalidation;
  }

  clearMemory(): void {
    this.resolvedUris.clear();
    this.bypassDiskOnce.clear();
    for (const loader of [...this.loaders.values()]) {
      this.cancelLoad(loader);
    }
  }

  /** Prevents an in-flight download from recreating files after Clear Cache. */
  clearAll(clearStore: () => Promise<void>): Promise<void> {
    if (this.clearing) return this.clearing;
    const clearing = (async () => {
      const loaders = [...this.loaders.values()];
      for (const loader of loaders) this.cancelLoad(loader);
      await Promise.allSettled([
        ...this.invalidations.values(),
        ...loaders.map((loader) => loader.completion),
      ]);
      try {
        await clearStore();
      } finally {
        // A partially failed disk clear must not leave synchronous hints to
        // files that may already have been deleted.
        this.clearMemory();
      }
    })().finally(() => {
      if (this.clearing === clearing) this.clearing = null;
    });
    this.clearing = clearing;
    return clearing;
  }
}

export function shouldRetryCachedMobileImageError({
  cachedUri,
  retriedSourceKey,
  sourceKey,
}: {
  cachedUri: string | null;
  retriedSourceKey: string | null;
  sourceKey: string;
}): boolean {
  return Boolean(cachedUri && sourceKey && retriedSourceKey !== sourceKey);
}
