# Library Progress Indicator

This document describes the reading progress indicator system for manga in the library.

## TL;DR

- Library cards show reading progress: "Ch.24 / Ch.189" or "Caught up"
- "Updated" badge appears when new chapters are detected
- Auto-refreshes every 30 minutes to check for new chapters
- All progress data syncs to cloud

## Overview

The library page displays manga cards with progress information:

```
┌─────────────────┐
│             [U] │  ← "Updated" badge (when new chapters)
│                 │
│     Cover       │
│                 │
│                 │
└─────────────────┘
  Manga Title
  Ch.24 / Ch.189    ← Progress subtitle
```

### Features

1. **"Updated" badge** - Shows when new chapters are available that the user hasn't seen
2. **Progress subtitle** - Shows reading progress ("Ch.24 / Ch.48", "Caught up", "Unread")
3. **Auto-refresh** - Checks for new chapters every 30 minutes
4. **Smart sorting** - Updated manga appear first, then by last read time
5. **Cloud sync** - All progress data syncs across devices

---

## Data Model

### ChapterSummary

Minimal chapter metadata stored for display. Stored as raw data (not pre-formatted strings) to support i18n - formatted at render time using current locale.

```ts
// src/data/schema.ts
interface ChapterSummary {
  id: string;              // Chapter ID from source
  title?: string;          // Chapter title (e.g., "Epilogue")
  chapterNumber?: number;  // Chapter number (e.g., 24)
  volumeNumber?: number;   // Volume number (e.g., 3)
}
```

### LibraryManga Extensions

New fields added to `LibraryManga`:

```ts
// src/data/schema.ts
interface LibraryManga {
  // ... existing fields (id, title, cover, addedAt, sources, etc.) ...

  // Reading state
  lastReadChapter?: ChapterSummary;  // Last chapter user read
  lastReadAt?: number;               // Timestamp of last read (ms)

  // Chapter availability tracking
  latestChapter?: ChapterSummary;       // Current latest chapter from source
  seenLatestChapter?: ChapterSummary;   // Latest chapter when user last viewed manga page
}
```

### Why Two "Latest" Fields?

This is the key insight that enables the "Updated" badge:

| Field | Updated When | Purpose |
|-------|--------------|---------|
| `latestChapter` | Refresh or manga page visit | Actual latest chapter from source |
| `seenLatestChapter` | Manga page visit only | What user has "seen" |

When `latestChapter.chapterNumber > seenLatestChapter.chapterNumber`, the user hasn't seen the new chapters yet → show "Updated" badge.

---

## Data Flow

### Update Points

```
┌─────────────────────────────────────────────────────────────────┐
│                         UPDATE TRIGGERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Reader (saving progress)                                        │
│    └─→ updateLastRead()                                          │
│          • lastReadChapter ✓                                     │
│          • lastReadAt ✓                                          │
│                                                                  │
│  Manga Detail Page (on load)                                     │
│    └─→ updateChapterInfo()                                       │
│          • latestChapter ✓                                       │
│          • seenLatestChapter ✓  (clears "Updated" badge)         │
│                                                                  │
│  Library Refresh (automatic)                                     │
│    └─→ updateLatestChapter()                                     │
│          • latestChapter ✓                                       │
│          • seenLatestChapter ✗  (triggers "Updated" badge)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Store Actions

| Action | Fields Updated | Called From |
|--------|----------------|-------------|
| `updateLastRead()` | `lastReadChapter`, `lastReadAt` | reader.tsx |
| `updateChapterInfo()` | `latestChapter`, `seenLatestChapter` | manga.tsx |
| `updateLatestChapter()` | `latestChapter` only | library.tsx (refresh) |

---

## Display Logic

### "Updated" Badge

Shows on manga cover when new chapters exist that user hasn't seen.

```ts
// src/pages/library.tsx
const hasNewChapters =
  latestChapter?.chapterNumber != null &&
  seenLatestChapter?.chapterNumber != null &&
  latestChapter.chapterNumber > seenLatestChapter.chapterNumber;
```

**Important:** Requires valid `chapterNumber` on both fields. If either is missing (e.g., chapters only have titles), badge won't show.

### "Caught Up" Status

User has read the latest available chapter.

```ts
// src/pages/library.tsx
const isCaughtUp =
  lastReadChapter &&
  latestChapter &&
  (lastReadChapter.id === latestChapter.id ||
    (lastReadChapter.chapterNumber != null &&
      latestChapter.chapterNumber != null &&
      lastReadChapter.chapterNumber >= latestChapter.chapterNumber));
```

**Note:** Also checks by ID to handle edge cases where chapter numbers are missing.

### Subtitle Text Priority

```ts
// src/pages/library.tsx - useProgressInfo()
if (isCaughtUp) {
  return t("library.caughtUp");           // "Caught up" / "已读至最新话"
} else if (lastReadChapter && latestChapter) {
  return `${formatChapterShort(lastReadChapter)} / ${formatChapterShort(latestChapter)}`;
} else if (lastReadChapter) {
  return formatChapterShort(lastReadChapter);  // "Ch.24"
} else {
  return t("library.unread");             // "Unread" / "未读"
}
```

---

## Example Scenarios

### Scenario 1: Normal Reading Progress

```
User has read chapter 175, source has 189 chapters

State:
  lastReadChapter = { id: "ch-175", chapterNumber: 175 }
  latestChapter = { id: "ch-189", chapterNumber: 189 }
  seenLatestChapter = { id: "ch-189", chapterNumber: 189 }

Display:
  Badge: None (189 > 189 is false)
  Subtitle: "Ch.175 / Ch.189"
```

### Scenario 2: New Chapter Released (Refresh Detects It)

```
Library refresh detects chapter 190 was released

State:
  lastReadChapter = { chapterNumber: 175 }
  latestChapter = { chapterNumber: 190 }      // Updated by refresh
  seenLatestChapter = { chapterNumber: 189 }  // NOT updated

Display:
  Badge: "Updated" ✓ (190 > 189)
  Subtitle: "Ch.175 / Ch.190"
```

### Scenario 3: User Views Manga Page

```
User clicks into the manga to see the new chapters

State:
  seenLatestChapter = { chapterNumber: 190 }  // Now updated

Display:
  Badge: None (190 > 190 is false) ← Badge cleared!
  Subtitle: "Ch.175 / Ch.190"
```

### Scenario 4: User Catches Up

```
User reads chapter 190

State:
  lastReadChapter = { chapterNumber: 190 }
  latestChapter = { chapterNumber: 190 }

Display:
  Badge: None
  Subtitle: "Caught up" ✓
```

### Scenario 5: New Manga (No Progress)

```
User adds manga to library, visits the page

State:
  lastReadChapter = undefined
  latestChapter = { chapterNumber: 50 }
  seenLatestChapter = { chapterNumber: 50 }

Display:
  Badge: None
  Subtitle: "Unread"
```

### Scenario 6: Re-reading Old Chapters

```
User goes back to read chapter 15 after reading chapter 175

State:
  lastReadChapter = { chapterNumber: 15 }  // Updated to current chapter
  lastReadAt = [now]
  latestChapter = { chapterNumber: 189 }

Display:
  Badge: None
  Subtitle: "Ch.15 / Ch.189"
```

**Note:** `lastReadChapter` tracks the most recently read chapter, not the furthest read.

---

## Chapter Title Formatting

### formatChapterShort()

A compact format for display in library card subtitles.

```ts
// src/lib/format-chapter.ts
export function formatChapterShort(chapter: ChapterSummary): string
```

| Input | Output |
|-------|--------|
| `{ chapterNumber: 24 }` | "Ch.24" |
| `{ volumeNumber: 3, chapterNumber: 12 }` | "Vol.3 Ch.12" |
| `{ title: "Epilogue" }` | "Epilogue" |
| `{ title: "A Very Long Chapter Title Here" }` | "A Very Long Cha…" |

- Max title length: 18 characters before truncation
- Uses i18n keys: `chapter.chX`, `chapter.volX`
- Handles f32 precision issues (e.g., 123.19999 → "123.2")

---

## Library Refresh

The library automatically checks for new chapters to enable the "Updated" badge.

### When Refresh Happens

| Trigger | Condition |
|---------|-----------|
| Library page mount | If last refresh was >30 minutes ago |
| Periodic interval | Every 30 minutes while on library page |

### How Refresh Works

```ts
// src/pages/library.tsx - refreshLibrary()
async function refreshLibrary() {
  // 1. Process manga in chunks of 5 (throttle to avoid 429 errors)
  for (chunk of mangas, size=5) {
    await Promise.all(chunk.map(async (manga) => {
      // 2. Get source and fetch chapters
      const source = await getSource(manga.activeRegistryId, manga.activeSourceId);
      const chapters = await source.getChapters(mangaId);
      
      // 3. Find chapter with highest chapterNumber
      const latest = chapters.reduce((best, ch) => 
        (ch.chapterNumber ?? -Infinity) > (best.chapterNumber ?? -Infinity) ? ch : best
      );
      
      // 4. Update latestChapter ONLY (triggers badge)
      await updateLatestChapter(registryId, sourceId, mangaId, {
        id: latest.id,
        title: latest.title,
        chapterNumber: latest.chapterNumber,
        volumeNumber: latest.volumeNumber,
      });
    }));
  }
  
  // 5. Save timestamp to localStorage
  localStorage.setItem("library_last_refresh", Date.now().toString());
}
```

### Configuration

```ts
// src/pages/library.tsx
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const MAX_CONCURRENT_REQUESTS = 5;            // Throttle limit
const REFRESH_STORAGE_KEY = "library_last_refresh";
```

### UI During Refresh

- **Loading indicator**: Spinner next to "Library" title (uses `<Spinner>` from hugeicons)
- **Silent operation**: No toasts or alerts
- **Error handling**: Failures logged to console, don't interrupt other manga

---

## Library Sorting

Manga are sorted with this priority:

```ts
// src/pages/library.tsx
sortedMangas.sort((a, b) => {
  // 1. Updated manga first (has "Updated" badge)
  const aUpdated = hasUpdatedBadge(a);
  const bUpdated = hasUpdatedBadge(b);
  if (aUpdated !== bUpdated) return aUpdated ? -1 : 1;
  
  // 2. By lastReadAt (most recently read first)
  const aTime = a.lastReadAt ?? 0;
  const bTime = b.lastReadAt ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  
  // 3. By addedAt (most recently added first)
  return b.addedAt - a.addedAt;
});
```

---

## Cloud Sync

All new fields are synced to Convex cloud.

### Synced Fields

| Field | Synced | Merge Strategy |
|-------|--------|----------------|
| `lastReadChapter` | ✓ | Use chapter from most recent `lastReadAt` |
| `lastReadAt` | ✓ | Keep most recent (max) |
| `latestChapter` | ✓ | Prefer cloud, fall back to local |
| `seenLatestChapter` | ✓ | Prefer cloud, fall back to local |

### Schema

```ts
// convex/schema.ts
library: defineTable({
  // ... existing fields ...
  lastReadChapter: v.optional(v.object({
    id: v.string(),
    title: v.optional(v.string()),
    chapterNumber: v.optional(v.number()),
    volumeNumber: v.optional(v.number()),
  })),
  lastReadAt: v.optional(v.number()),
  latestChapter: v.optional(v.object({...})),
  seenLatestChapter: v.optional(v.object({...})),
})
```

### Merge Logic

```ts
// convex/library.ts - save mutation
// When both cloud and local have lastReadAt, keep the most recent
const lastReadAt = Math.max(args.lastReadAt ?? 0, existing.lastReadAt ?? 0);
const lastReadChapter = (lastReadAt === args.lastReadAt)
  ? args.lastReadChapter
  : existing.lastReadChapter;
```

---

## Translation Keys

```json
// src/locales/en.json
{
  "library": {
    "unread": "Unread",
    "caughtUp": "Caught up",
    "updated": "Updated"
  },
  "chapter": {
    "chX": "Ch.{{n}}",
    "volX": "Vol.{{n}}"
  }
}

// src/locales/zh.json
{
  "library": {
    "unread": "未读",
    "caughtUp": "已读至最新话",
    "updated": "更新"
  },
  "chapter": {
    "chX": "第{{n}}话",
    "volX": "第{{n}}卷"
  }
}
```

---

## Implementation Files

### Frontend

| File | Purpose |
|------|---------|
| `src/data/schema.ts` | `ChapterSummarySchema`, extended `LibraryMangaSchema` |
| `src/stores/library.ts` | `updateLastRead`, `updateChapterInfo`, `updateLatestChapter` actions |
| `src/lib/format-chapter.ts` | `formatChapterShort()` function |
| `src/pages/reader.tsx` | Calls `updateLastRead()` on progress save |
| `src/pages/manga.tsx` | Calls `updateChapterInfo()` on chapters load |
| `src/pages/library.tsx` | Refresh logic, sorting, badge/subtitle display |
| `src/components/manga-card.tsx` | `badge` prop support |
| `src/components/page-header.tsx` | `loading` prop with spinner |
| `src/locales/*.json` | Translation keys |

### Backend (Convex)

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Added new fields to library table |
| `convex/library.ts` | Updated `save` mutation with new fields |

### Sync

| File | Purpose |
|------|---------|
| `src/sync/engine.ts` | `mergeCloudLibrary()` merge logic, cloud push |
| `src/sync/provider.tsx` | Map cloud data with new fields |

---

## Edge Cases

### Missing Chapter Numbers

Some sources use titles only (e.g., "Prologue", "Epilogue"). In these cases:
- "Updated" badge won't show (requires valid `chapterNumber` comparison)
- "Caught up" falls back to ID comparison
- Subtitle shows the title instead of "Ch.X"

### Source Not Installed

If a manga's source is no longer installed:
- Refresh skips the manga (no error)
- Existing progress data is preserved

### Rate Limiting (429)

- Max 5 concurrent requests during refresh
- Errors are logged but don't stop refresh of other manga

### Chapter Order Assumption

Some sources return chapters newest-first, others oldest-first. The refresh logic finds the chapter with the **highest `chapterNumber`** rather than assuming array order.

---

## Future Enhancements

1. **Unread count badge** - Show number of unread chapters (e.g., "3 new")
2. **Progress bar** - Visual indicator on cover showing completion percentage
3. **Manual refresh button** - Pull-to-refresh or button to force refresh
4. **Background sync** - Check for updates even when app is closed (requires service worker)
