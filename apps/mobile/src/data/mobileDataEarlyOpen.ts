/**
 * Launch-time head start for the local database.
 *
 * `SQLiteProvider` only opens and migrates the profile database in an effect
 * after the provider tree has rendered, so the open + `migrateNativeDatabase`
 * round trips used to run strictly after bundle evaluation and the first
 * render, while the launch screen was still up. The boot module
 * (`mobileDataBoot.native.ts`) opens the predicted database at JS entry and
 * runs the migration on that handle. expo-sqlite shares one native connection
 * per (path, options) and refcounts it, so when the provider later opens the
 * same database it reuses the connection and its `onInit` simply awaits the
 * early migration instead of repeating it. The early JS handle is then closed
 * (dropping only its reference).
 *
 * Any mismatch or failure falls back to the previous behaviour: the provider's
 * `onInit` runs the migration on its own handle.
 */

export type EarlyOpenDatabase = {
  readonly databasePath: string;
  closeAsync: () => Promise<void>;
};

export type MobileDatabaseEarlyOpen<Db extends EarlyOpenDatabase> = {
  /** Start opening + migrating `databaseName`. Ignored if one is pending. */
  start: (databaseName: string) => void;
  /** `SQLiteProvider` `onInit`: consume the early migration when it matches. */
  onInit: (db: Db) => Promise<void>;
};

type EarlyOpenEntry<Db> = {
  db: Promise<Db | null>;
  migrated: Promise<boolean>;
  timer: ReturnType<typeof setTimeout> | null;
};

export function createMobileDatabaseEarlyOpen<Db extends EarlyOpenDatabase>({
  open,
  migrate,
  unclaimedCloseMs = 30_000,
}: {
  open: (databaseName: string) => Promise<Db>;
  migrate: (db: Db) => Promise<void>;
  /** Close a handle no provider claimed (e.g. a headless launch). */
  unclaimedCloseMs?: number;
}): MobileDatabaseEarlyOpen<Db> {
  let pending: EarlyOpenEntry<Db> | null = null;

  function release(entry: EarlyOpenEntry<Db>): void {
    if (entry.timer != null) clearTimeout(entry.timer);
    entry.timer = null;
    // Close only after the migration settled so it never races a close.
    void entry.migrated.then(() =>
      entry.db.then((db) => db?.closeAsync().catch(() => undefined)),
    );
  }

  function start(databaseName: string): void {
    if (pending) return;
    const db = open(databaseName).catch(() => null);
    const migrated = db.then((handle) =>
      handle
        ? migrate(handle).then(
            () => true,
            () => false,
          )
        : false,
    );
    const entry: EarlyOpenEntry<Db> = { db, migrated, timer: null };
    entry.timer = setTimeout(() => {
      if (pending !== entry) return;
      pending = null;
      release(entry);
    }, unclaimedCloseMs);
    pending = entry;
  }

  async function onInit(db: Db): Promise<void> {
    const entry = pending;
    pending = null;
    if (entry) {
      const earlyDb = await entry.db;
      const matches = earlyDb != null && earlyDb.databasePath === db.databasePath;
      const migrated = matches ? await entry.migrated : false;
      release(entry);
      if (migrated) return;
    }
    await migrate(db);
  }

  return { start, onInit };
}
