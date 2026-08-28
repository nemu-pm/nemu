/**
 * Bounded, race-aware snapshots for the synchronous Web Storage API.
 *
 * `Storage.key(index)` is live: another browsing context can insert or remove
 * a key while a caller is walking the index and silently make an entry move.
 * Capture every key name, reject an internally inconsistent pass, and require
 * two identical passes before a destructive caller trusts the selected data.
 */

export type DurableStorageSnapshotEntry = {
  key: string;
  value: string;
};

export type DurableStorageSnapshot = {
  signature: string;
  entries: DurableStorageSnapshotEntry[];
};

export class DurableStorageSnapshotError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DurableStorageSnapshotError";
  }
}

export class DurableStorageSnapshotChangedError extends Error {
  constructor() {
    super("Web Storage changed while it was being enumerated.");
    this.name = "DurableStorageSnapshotChangedError";
  }
}

export type DurableStorageSnapshotOptions = {
  maximumKeys: number;
  maximumKeyLength: number;
  maximumSelectedEntries: number;
  maximumSelectedValueLength: number;
  select: (key: string) => boolean;
};

function readLength(storage: Storage): number {
  let length: number;
  try {
    length = storage.length;
  } catch (error) {
    throw new DurableStorageSnapshotError(
      "Web Storage length could not be read.",
      error,
    );
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new DurableStorageSnapshotError(
      "Web Storage reported an invalid length.",
    );
  }
  return length;
}

export function captureDurableStorageSnapshot(
  storage: Storage,
  options: DurableStorageSnapshotOptions,
): DurableStorageSnapshot {
  const length = readLength(storage);
  if (length > options.maximumKeys) {
    throw new DurableStorageSnapshotError(
      "Web Storage exceeds the supported key limit.",
    );
  }

  const keys: string[] = [];
  const seenKeys = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    let key: string | null;
    try {
      key = storage.key(index);
    } catch (error) {
      throw new DurableStorageSnapshotError(
        "A Web Storage key could not be read.",
        error,
      );
    }
    if (key === null || seenKeys.has(key)) {
      throw new DurableStorageSnapshotChangedError();
    }
    if (key.length > options.maximumKeyLength) {
      throw new DurableStorageSnapshotError(
        "Web Storage contains an oversized key.",
      );
    }
    seenKeys.add(key);
    keys.push(key);
  }

  if (readLength(storage) !== length) {
    throw new DurableStorageSnapshotChangedError();
  }

  keys.sort();
  const entries: DurableStorageSnapshotEntry[] = [];
  for (const key of keys) {
    if (!options.select(key)) continue;
    let value: string | null;
    try {
      value = storage.getItem(key);
    } catch (error) {
      throw new DurableStorageSnapshotError(
        "A Web Storage value could not be read.",
        error,
      );
    }
    if (value === null) throw new DurableStorageSnapshotChangedError();
    if (value.length > options.maximumSelectedValueLength) {
      throw new DurableStorageSnapshotError(
        "Web Storage contains an oversized selected value.",
      );
    }
    entries.push({ key, value });
    if (entries.length > options.maximumSelectedEntries) {
      throw new DurableStorageSnapshotError(
        "Web Storage exceeds the supported selected-entry limit.",
      );
    }
  }

  if (readLength(storage) !== length) {
    throw new DurableStorageSnapshotChangedError();
  }

  return {
    signature: JSON.stringify([keys, entries]),
    entries,
  };
}

export function captureStableDurableStorageSnapshot(
  storage: Storage,
  options: DurableStorageSnapshotOptions,
  maximumAttempts = 4,
): DurableStorageSnapshot {
  let previous: DurableStorageSnapshot | null = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    let snapshot: DurableStorageSnapshot;
    try {
      snapshot = captureDurableStorageSnapshot(storage, options);
    } catch (error) {
      if (error instanceof DurableStorageSnapshotChangedError) {
        previous = null;
        continue;
      }
      throw error;
    }
    if (snapshot.signature === previous?.signature) return snapshot;
    previous = snapshot;
  }
  throw new DurableStorageSnapshotChangedError();
}
