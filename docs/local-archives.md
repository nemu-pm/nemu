# Local archives (导入漫画)

Status: design plus plumbing (`apps/mobile/src/lib/localArchives/`). The UI entry points are not built; they wait for owner approval (see the Line B UI proposals).

## Model

A local archive provider sits beside the Aidoku runtime. It is not a fake Aidoku package: it has no WASM, no registry and no network.

- **Volume** = one imported CBZ/ZIP file. `volumeId` = `v-` + first 32 hex chars of the file's content hash, so the same file gets the same id on every device.
- **Work** = a manual grouping of volumes. `workId` is a random UUID minted when the work is created and synced as ordinary metadata. Importing a file creates a work with that one volume; the user may later move volumes between works.
- It reuses the existing source-link model so library, collections and progress sync need no schema change: `registryId = "local-archive"`, `sourceId = "local"`, `sourceMangaId = workId`, chapter id = `volumeId`. A volume is a chapter of its work.

## Import pipeline

1. The system document picker returns a `file:`/`content:` URI. It is copied (streamed, 256 KiB chunks) into the persistent directory `<documentDirectory>/local-archives/<volumeId>/archive.zip`. Never the cache directory.
2. The content hash is computed while copying (blocked SHA-256: SHA-256 over the concatenated SHA-256 of each 1 MiB block, so memory stays bounded and the result is device independent).
3. Pages are extracted by streaming the zip (fflate `Unzip`) and written one entry at a time to `pages/NNNNNN.<ext>`. The archive is never held in JS memory.
4. The cover is page 1, referenced by path (a downscaled thumbnail is a later optimisation).
5. Reader pages are `{ imageUri, imageUriOwnership: "app" }`, registered through `registerMobileAppLocalImageUri`, i.e. the same path source-processed covers use.

## Entry rules

- Only `jpg jpeg png webp gif avif` entries are pages; other files are skipped.
- Skipped: directories, hidden files (any path segment starting with `.`), `__MACOSX/`, `Thumbs.db`, `desktop.ini`.
- Rejected (whole import fails): absolute paths, `..` segments, backslashes, NUL/control characters, over-long names.
- Order: natural sort on the full path, case-insensitive, numeric runs compared as numbers (`2.jpg` < `10.jpg`), folder by folder.

## Limits

Archive 2 GiB, 20,000 entries, 4,000 pages, 128 MiB per page, 4 GiB total uncompressed, compression ratio 200:1 per entry. Sizes are enforced on bytes actually inflated (headers can lie), and exceeding any limit aborts the import and deletes the partial files.

## Sync

- Synced (existing paths): work metadata, volume list (as chapters), collection membership, reading progress.
- Never synced: file bytes.
- Device mapping is local only: `volumeId -> { present, importedAt, pageCount }`. A volume known from sync but with no local mapping reports `missing-file`, shown as "此设备尚未导入文件". Importing a file whose content hash equals a synced `volumeId` re-links it to the existing volume (and work) instead of creating a new one.

## Deleting

Deleting a volume removes its directory and local mapping; the synced volume stays, so the work keeps its progress and shows "尚未导入文件". Deleting the last volume of a work is a normal library removal. "Clear cache" never touches `local-archives/` (`assertNotLocalArchivePath` guards the cache-clear code).

## Not done yet

Thumbnail generation, the picker/UI, reader wiring in `ReaderScreen`, and the native FS adapter (the extractor and store take injected file I/O; the adapter over `expo-file-system` is a thin follow-up).
