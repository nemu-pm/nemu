# Library Progress Indicator

Reading progress tracking system for library manga cards.

## Data Model

LibraryManga stores four fields for progress tracking:

```ts
interface LibraryManga {
  lastReadChapter?: ChapterSummary;    // Most recently read chapter
  lastReadAt?: number;                  // Timestamp (ms) of last read
  latestChapter?: ChapterSummary;       // Current latest from source
  seenLatestChapter?: ChapterSummary;   // Latest when user last viewed manga page
}

interface ChapterSummary {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
}
```

The distinction between `latestChapter` and `seenLatestChapter` enables the "Updated" badge. When background refresh detects new chapters, it updates only `latestChapter`. When user visits the manga detail page, both are set equal. The badge shows when `latestChapter.chapterNumber > seenLatestChapter.chapterNumber`.

## Update Triggers

Three store actions update these fields:

```
updateLastRead(registryId, sourceId, mangaId, chapter)
  - Sets lastReadChapter, lastReadAt = Date.now()
  - Called from reader.tsx when saving progress

updateChapterInfo(registryId, sourceId, mangaId, latestChapter)
  - Sets latestChapter, seenLatestChapter = latestChapter
  - Called from manga.tsx when chapters load
  - Clears "Updated" badge

updateLatestChapter(registryId, sourceId, mangaId, latestChapter)
  - Sets latestChapter only
  - Initializes seenLatestChapter if undefined (first refresh)
  - Called from library.tsx during background refresh
  - Triggers "Updated" badge when new chapters found
```

## Display Logic

Badge and subtitle computed in `useProgressInfo()`:

```ts
// "Updated" badge - requires valid chapterNumber on both
const hasNewChapters =
  latestChapter?.chapterNumber != null &&
  seenLatestChapter?.chapterNumber != null &&
  latestChapter.chapterNumber > seenLatestChapter.chapterNumber;

// "Caught up" - user read latest (by ID or chapterNumber)
const isCaughtUp =
  lastReadChapter &&
  latestChapter &&
  (lastReadChapter.id === latestChapter.id ||
    (lastReadChapter.chapterNumber != null &&
      latestChapter.chapterNumber != null &&
      lastReadChapter.chapterNumber >= latestChapter.chapterNumber));
```

Subtitle text priority:
1. If caught up: "Caught up"
2. If has lastReadChapter and latestChapter: "Ch.24 / Ch.189"
3. If has lastReadChapter only: "Ch.24"
4. Otherwise: "Unread"

## Chapter Formatting

`formatChapterShort()` in `src/lib/format-chapter.ts` produces compact strings for subtitles:

```
{ chapterNumber: 24 }                    → "Ch.24"
{ volumeNumber: 3, chapterNumber: 12 }   → "Vol.3 Ch.12"
{ title: "Epilogue" }                    → "Epilogue"
{ title: "Very Long Title Here..." }     → "Very Long Title…" (18 char max)
```

Numbers formatted with f32 precision fix: `Math.round(n * 100) / 100`.

## Background Refresh

Library page auto-refreshes to detect new chapters:

```ts
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const MAX_CONCURRENT_REQUESTS = 5;
```

Triggers on page mount if last refresh > 30 minutes ago, then repeats every 30 minutes while page is active. Timestamp stored in `localStorage["library_last_refresh"]`.

Refresh process:
1. Process manga in chunks of 5 (rate limiting)
2. For each manga, fetch chapters via `source.getChapters()`
3. Find chapter with highest `chapterNumber`
4. Call `updateLatestChapter()` (triggers badge if chapter number increased)

Errors logged but don't interrupt other manga.

## Sorting

Library sorted by:
1. Updated manga first (has badge)
2. By lastReadAt descending (most recent first)
3. By addedAt descending

## Cloud Sync

All four fields synced to Convex. Merge strategy in `src/sync/engine.ts`:

```ts
// lastReadAt: keep most recent
const lastReadAt = Math.max(cloudManga.lastReadAt ?? 0, localManga.lastReadAt ?? 0);

// lastReadChapter: use chapter corresponding to most recent lastReadAt
const lastReadChapter = (lastReadAt === cloudManga.lastReadAt)
  ? cloudManga.lastReadChapter ?? localManga.lastReadChapter
  : localManga.lastReadChapter ?? cloudManga.lastReadChapter;

// latestChapter, seenLatestChapter: prefer cloud, fall back to local
```

## i18n Keys

```json
{
  "library.unread": "Unread",
  "library.caughtUp": "Caught up",
  "library.updated": "Updated",
  "chapter.chX": "Ch.{{n}}",
  "chapter.volX": "Vol.{{n}}"
}
```

## File Locations

```
src/data/schema.ts           ChapterSummarySchema, LibraryMangaSchema
src/stores/library.ts        updateLastRead, updateChapterInfo, updateLatestChapter
src/lib/format-chapter.ts    formatChapterShort
src/pages/library.tsx        Refresh logic, sorting, useProgressInfo
src/pages/manga.tsx          Calls updateChapterInfo on chapter load
src/pages/reader.tsx         Calls updateLastRead on progress save
src/components/manga-card.tsx  badge prop renders top-right overlay
convex/schema.ts             Cloud schema with ChapterSummary fields
src/sync/engine.ts           Merge logic for cloud sync
```

## Edge Cases

Chapters with no `chapterNumber` (title only): "Updated" badge won't show, "caught up" falls back to ID comparison, subtitle shows truncated title.

Source not installed: refresh skips manga, existing data preserved.

Re-reading old chapters: `lastReadChapter` tracks most recently read, not furthest read.
