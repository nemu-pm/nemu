import type { SQLiteDatabase } from "expo-sqlite";
import {
  createMobileSourceSettingsVault,
  decodeLegacyMobileSourceSettings,
  decodeMobileSourceSettingsVaultMarker,
  encodeMobileSourceSettingsVaultMarker,
} from "./mobileSourceSettingsVault";

export const MOBILE_DATABASE_NAME = "nemu-mobile.db";
export const MOBILE_ANONYMOUS_DATABASE_NAME = "nemu-mobile-anonymous.db";

const DATABASE_VERSION = 6;
/**
 * `PRAGMA application_id` doubles as the durable "the v6 plaintext VACUUM is
 * still owed" flag. VACUUM rewrites the whole database file, which used to run
 * inside the migration — behind the splash screen, with nothing rendered — so
 * an upgrade's first launch sat on a blank screen for as long as the rewrite
 * took. The flag lets `user_version` advance immediately and the VACUUM run as
 * an idle task once the UI is up, while still being retried on the next launch
 * if the process dies first.
 */
const PENDING_PLAINTEXT_VACUUM_APPLICATION_ID = 1;

let deferredVacuumPending = false;

export function isDeferredNativeDatabaseVacuumPending(): boolean {
  return deferredVacuumPending;
}

/**
 * Purges free-page residue left by the pre-v6 plaintext source settings. The
 * rows themselves were already overwritten in place (`secure_delete`) and the
 * WAL copy was checkpointed away inside the migration, so skipping or failing
 * here costs residue in unallocated pages, never schema correctness — and the
 * flag keeps it owed until it succeeds.
 */
export async function runDeferredNativeDatabaseVacuum(
  db: SQLiteDatabase,
): Promise<void> {
  if (!deferredVacuumPending) return;
  deferredVacuumPending = false;
  try {
    await db.execAsync("VACUUM;");
    await db.execAsync("PRAGMA application_id = 0");
  } catch {
    // Retried on the next launch: the pragma flag is still set on disk.
    deferredVacuumPending = true;
  }
}

type SourceSettingsRow = {
  sourceKey: string;
  json: string;
};

async function migrateSourceSettingsToSecureVault(
  db: SQLiteDatabase,
): Promise<void> {
  const vault = createMobileSourceSettingsVault(db.databasePath);
  const rows = await db.getAllAsync<SourceSettingsRow>(
    "SELECT sourceKey, json FROM source_settings",
  );
  const replacements: Array<{ sourceKey: string; marker: string }> = [];

  for (const row of rows) {
    const marker = decodeMobileSourceSettingsVaultMarker(row.json);
    if (marker) {
      if (!vault.isValidRef(marker.ref)) {
        throw new TypeError("Invalid secure mobile source settings reference.");
      }
      continue;
    }
    const settings = decodeLegacyMobileSourceSettings(row.json, row.sourceKey);
    const ref = await vault.put(settings);
    replacements.push({
      sourceKey: row.sourceKey,
      marker: encodeMobileSourceSettingsVaultMarker(ref),
    });
  }

  if (replacements.length === 0) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const replacement of replacements) {
      await txn.runAsync(
        "UPDATE source_settings SET json = ? WHERE sourceKey = ?",
        replacement.marker,
        replacement.sourceKey,
      );
    }
  });
}

export async function migrateNativeDatabase(db: SQLiteDatabase) {
  // Ensure future updates/deletes overwrite credential-bearing SQLite cells.
  // The v6 migration also checkpoints historical plaintext below; its VACUUM
  // is owed to `runDeferredNativeDatabaseVacuum` once the UI is up.
  await db.execAsync("PRAGMA secure_delete = ON;");
  const current = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = current?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) {
    // A previous launch recorded v6 but was killed before its idle VACUUM.
    const marker = await db.getFirstAsync<{ application_id: number }>(
      "PRAGMA application_id",
    );
    if (marker?.application_id === PENDING_PLAINTEXT_VACUUM_APPLICATION_ID) {
      deferredVacuumPending = true;
    }
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installed_sources (
  id TEXT PRIMARY KEY NOT NULL,
  registryId TEXT NOT NULL,
  version INTEGER NOT NULL,
  updatedAt INTEGER,
  removed INTEGER NOT NULL DEFAULT 0,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_settings (
  sourceKey TEXT PRIMARY KEY NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_items (
  libraryItemId TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  inLibrary INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_links (
  id TEXT PRIMARY KEY NOT NULL,
  libraryItemId TEXT NOT NULL,
  registryId TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  sourceMangaId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_links_library_item_id ON source_links(libraryItemId);
CREATE INDEX IF NOT EXISTS idx_source_links_source_ref ON source_links(registryId, sourceId, sourceMangaId);

CREATE TABLE IF NOT EXISTS chapter_progress (
  id TEXT PRIMARY KEY NOT NULL,
  registryId TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  sourceMangaId TEXT NOT NULL,
  sourceChapterId TEXT NOT NULL,
  libraryItemId TEXT,
  progress INTEGER NOT NULL,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  lastReadAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapter_progress_manga ON chapter_progress(registryId, sourceId, sourceMangaId);

CREATE TABLE IF NOT EXISTS manga_progress (
  id TEXT PRIMARY KEY NOT NULL,
  registryId TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  sourceMangaId TEXT NOT NULL,
  libraryItemId TEXT,
  lastReadAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manga_progress_manga ON manga_progress(registryId, sourceId, sourceMangaId);

CREATE TABLE IF NOT EXISTS collections (
  collectionId TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  id TEXT PRIMARY KEY NOT NULL,
  collectionId TEXT NOT NULL,
  libraryItemId TEXT NOT NULL,
  addedAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collectionId);
CREATE INDEX IF NOT EXISTS idx_collection_items_library_item_id ON collection_items(libraryItemId);

CREATE TABLE IF NOT EXISTS pending_sync_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  json TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY NOT NULL,
  generation INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_health (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
`);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS source_settings (
  sourceKey TEXT PRIMARY KEY NOT NULL,
  updatedAt INTEGER NOT NULL,
  json TEXT NOT NULL
);
`);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS pending_sync_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  json TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
`);
  }

  if (currentVersion < 4) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY NOT NULL,
  generation INTEGER NOT NULL
);
`);
  }

  if (currentVersion < 5) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS sync_health (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
`);
  }

  if (currentVersion < 6) {
    await migrateSourceSettingsToSecureVault(db);
    // Plaintext source credentials may exist in both the main file and its
    // WAL. Complete physical cleanup before recording v6 so an interrupted
    // attempt is retried on the next launch.
    await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
    // The VACUUM itself is deferred to an idle task after the first frame; see
    // `PENDING_PLAINTEXT_VACUUM_APPLICATION_ID`.
    await db.execAsync(
      `PRAGMA application_id = ${PENDING_PLAINTEXT_VACUUM_APPLICATION_ID}`,
    );
    deferredVacuumPending = true;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
