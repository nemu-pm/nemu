# Library Data Model

## Overview

The library system manages user's saved manga with:

1. **UUID-based IDs** - Library entries use UUIDs (not composite keys)
2. **Multi-source binding** - One library entry links to multiple sources
3. **Metadata + Overrides** - Auto-fetched metadata with user override layer
4. **History-derived progress** - Reading progress stored in history, derived for display
5. **External metadata** - Can fetch from MangaUpdates, AniList, MAL

---

## Current Schema

### LibraryManga

```typescript
{
  id: string;                    // UUID
  addedAt: number;               // Timestamp when first added

  // Metadata (from source or external APIs)
  metadata: {
    title: string;
    cover?: string;
    authors?: string[];
    artists?: string[];
    description?: string;
    tags?: string[];
    status?: number;             // MangaStatus enum (0-4)
    url?: string;
  };

  // User overrides (sparse - merged over metadata)
  overrides?: Partial<MangaMetadata>;

  // Custom cover uploaded by user (R2 key)
  coverCustom?: string;

  // External IDs for re-fetching metadata
  externalIds?: {
    mangaUpdates?: number;
    aniList?: number;
    mal?: number;
  };

  // Source bindings (no active source - most recent derived from history)
  sources: SourceLink[];
}
```

### SourceLink

```typescript
{
  registryId: string;
  sourceId: string;
  mangaId: string;

  // Chapter availability (for "Updated" badge)
  latestChapter?: ChapterSummary;       // Latest chapter from last refresh
  updateAcknowledged?: ChapterSummary;  // Latest when user last viewed detail

  // NOTE: No lastReadChapter/lastReadAt - derived from history
}
```

### ChapterSummary

```typescript
{
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
}
```

### HistoryEntry

```typescript
{
  id: string;                    // Composite: registryId:sourceId:mangaId:chapterId
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  progress: number;              // Current page (0-indexed)
  total: number;                 // Total pages
  completed: boolean;
  dateRead: number;              // Timestamp

  // Chapter metadata (cached for display without re-fetching)
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
}
```

---

## Display Priority

```
Title:   overrides.title > metadata.title
Cover:   coverCustom > overrides.cover > metadata.cover
Status:  overrides.status > metadata.status
Other:   overrides.X > metadata.X
```

Helper functions in `src/data/schema.ts`:
- `getEffectiveMetadata(manga)` - Returns merged metadata
- `getEffectiveCover(manga)` - Returns effective cover URL
- `getMostRecentSource(manga, history)` - Most recently read source
- `getSourceHistoryProgress(source, history)` - Progress from history
- `hasAnySourceUpdate(manga)` - Any source has new chapters
- `mergeStatus(...statuses)` - Merge status with priority

---

## Data Flow: When Is Each Field Updated?

### On Add to Library (user clicks "Add to Library")

| Field | Value | Source |
|-------|-------|--------|
| `id` | New UUID | Generated |
| `addedAt` | `Date.now()` | Generated |
| `metadata.title` | Source manga title | `source.getManga()` |
| `metadata.cover` | Source manga cover | `source.getManga()` |
| `metadata.authors` | Source manga authors | `source.getManga()` |
| `metadata.description` | Source manga description | `source.getManga()` |
| `metadata.tags` | Source manga tags | `source.getManga()` |
| `metadata.status` | Source manga status | `source.getManga()` |
| `sources[0]` | First source link | User's current source |

### On Library Refresh (background, every 30 min)

For each library manga, fetches ALL sources in parallel:

| Field | Value | Source |
|-------|-------|--------|
| `sources[i].latestChapter` | Latest chapter | `source.getChapters()` |
| `metadata.cover` | First source's cover | `source.getManga()` (if no custom/override) |
| `metadata.status` | Merged status | `mergeStatus()` across all sources |

**Status merge priority:** Completed > Hiatus > Ongoing > Cancelled > Unknown

### On View Manga Detail (user opens detail page)

| Field | Value | Source |
|-------|-------|--------|
| `sources[i].updateAcknowledged` | Current `latestChapter` | Copies from `latestChapter` |

This clears the "Updated" badge for that source.

### On Read Chapter (user reads in reader)

History is updated, NOT library:

| Field | Value | Source |
|-------|-------|--------|
| `history[chapterId].progress` | Current page | Reader |
| `history[chapterId].total` | Total pages | Reader |
| `history[chapterId].completed` | `progress >= total - 1` | Computed |
| `history[chapterId].dateRead` | `Date.now()` | Generated |
| `history[chapterId].chapterNumber` | Chapter number | From chapter data |
| `history[chapterId].chapterTitle` | Chapter title | From chapter data |

Library progress is DERIVED from history, not stored.

### On Fetch External Metadata (user clicks "Fetch Metadata")

| Field | Value | Source |
|-------|-------|--------|
| `metadata.*` | Fetched metadata | MangaUpdates/AniList/MAL |
| `externalIds.*` | Provider IDs | MangaUpdates/AniList/MAL |

### On User Edit (manual override)

| Field | Value | Source |
|-------|-------|--------|
| `overrides.*` | User's edited values | User input |
| `coverCustom` | R2 key | User upload |

---

## "Updated" Badge Logic

Badge shows if ANY source has new chapters:

```typescript
function hasAnySourceUpdate(manga: LibraryManga): boolean {
  return manga.sources.some((source) => {
    const latest = source.latestChapter?.chapterNumber;
    const acked = source.updateAcknowledged?.chapterNumber;
    return latest != null && acked != null && latest > acked;
  });
}
```

Badge clears when user views manga detail (sets `updateAcknowledged = latestChapter`).

---

## Reading Progress Display

Progress is derived from history, not cached on SourceLink:

```typescript
// Get progress for library card subtitle
const sourceHistory = history[makeSourceMangaKey(source)];
const lastReadChapter = {
  id: sourceHistory.lastReadChapterId,
  chapterNumber: sourceHistory.lastReadChapterNumber,  // From history entry
  title: sourceHistory.lastReadChapterTitle,
};

// Display: "第5章 / 第82章" (localized)
subtitle = `${formatChapterShort(lastReadChapter)} / ${formatChapterShort(latestChapter)}`;
```

---

## History Storage

### Local (IndexedDB)
- Loaded on app start
- Updated immediately when reading
- Used for offline display

### Cloud (Convex)
- Subscribed via `history.getForLibrary` query
- Merged with local on load
- Real-time updates via subscription

### Sync Flow

```
Read Chapter
    ↓
Save to IndexedDB (instant)
    ↓
Update libraryHistory state (instant UI update)
    ↓
Queue Convex mutation (background)
    ↓
Convex subscription triggers (other devices)
```

---

## Migration Scripts

Run in order after deploying:

```bash
# Step 1: Migrate title/cover to metadata object
npx convex run migrations:migrateLibraryToMetadata

# Step 2: Migrate reading progress to per-source
npx convex run migrations:migrateProgressToPerSource

# Step 3: Copy chapter metadata from library to history
npx convex run migrations:migrateChapterMetadataToHistory

# Step 4: Remove active source, rename fields
npx convex run migrations:migrateToPhase2

# Step 5: Convert old composite key IDs to UUIDs
npx convex run migrations:migrateToUUID
```

---

## File Reference

### Schema & Types
| File | Purpose |
|------|---------|
| `src/data/schema.ts` | Zod schemas, helper functions |
| `convex/schema.ts` | Convex database schema |

### Stores
| File | Purpose |
|------|---------|
| `src/stores/library.ts` | Library state, CRUD operations |
| `src/stores/history.ts` | Reading history state |

### Sync
| File | Purpose |
|------|---------|
| `src/sync/provider.tsx` | History subscription, state management |
| `src/sync/engine.ts` | Cloud sync logic |
| `convex/library.ts` | Library mutations/queries |
| `convex/history.ts` | History mutations/queries |

### Metadata
| File | Purpose |
|------|---------|
| `src/lib/metadata/index.ts` | Metadata fetching orchestration |
| `src/lib/metadata/matching.ts` | Title matching algorithm |
| `convex/metadata.ts` | Server-side metadata actions (CORS proxy, AI) |

### UI
| File | Purpose |
|------|---------|
| `src/pages/library.tsx` | Library grid, refresh logic |
| `src/pages/library-manga.tsx` | Detail page with source tabs |
| `src/pages/manga.tsx` | Source manga page (add to library) |

---

## Status

### ✅ Completed

- [x] UUID-based IDs
- [x] Metadata object with overrides
- [x] Multi-source binding
- [x] Per-source chapter availability (`latestChapter`, `updateAcknowledged`)
- [x] History-derived reading progress
- [x] History stores chapter metadata (number, title)
- [x] Convex history subscription
- [x] Library refresh fetches all sources
- [x] Cover/status updated on refresh (first source's cover, merged status)
- [x] Tabs UI for source switching
- [x] "Updated" badge checks all sources
- [x] Localized chapter format display
- [x] Migration scripts

### 🚧 Stubbed

- [ ] "Fetch Metadata" button → needs dialog UI
- [ ] "Add Source" button → needs search dialog

### ❌ Not Started

- [ ] MetadataFetchDialog - UI to search/select metadata
- [ ] AddSourceDialog - Search and link additional sources
- [ ] Edit Metadata UI - Form for manual overrides
- [ ] Reset Metadata - Clear overrides, re-fetch from source
- [ ] Custom Cover Upload - Upload to R2
- [ ] Duplicate Manga Detection - Detect by externalIds, merge UI
- [ ] "Fetch All Metadata" - Batch operation

---

## Duplicate Manga Detection (Future)

### The Problem

Multiple library entries might be the same manga from different sources:
- "One Piece" from Source A
- "ワンピース" from Source B

### Detection Strategy

1. Fetch external metadata for entries without `externalIds`
2. If two entries have same `externalIds.mangaUpdates` or `externalIds.aniList` → same manga
3. Show merge dialog to user (never auto-merge)

### Merge Implementation

```typescript
async function mergeManga(primaryId: string, duplicateId: string) {
  const primary = get(primaryId);
  const duplicate = get(duplicateId);
  
  // Combine sources (progress is in history, so no conflict)
  const mergedSources = [...primary.sources, ...duplicate.sources];
  
  await update(primaryId, { sources: mergedSources });
  await remove(duplicateId);
}
```
