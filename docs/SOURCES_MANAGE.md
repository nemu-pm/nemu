# Source Management Plan

## Overview

Allow users to link a library manga to multiple reading sources, and merge duplicate library entries.

---

## Data Model (Existing)

### Library Item (`LocalLibraryItem`)
```
libraryItemId: string (primary key)
metadata: MangaMetadata (title, cover, authors, description, tags, status)
externalIds: { mangaUpdates?, aniList?, mal? }
overrides: UserOverrides (user edits)
```

### Source Link (`LocalSourceLink`)
```
id: "registryId:sourceId:sourceMangaId"
libraryItemId: string (FK to library item)
registryId, sourceId, sourceMangaId
latestChapter, latestFetchedAt, etc.
```

### Progress (`LocalChapterProgress`, `LocalMangaProgress`)
- Keyed by `registryId:sourceId:sourceMangaId:sourceChapterId`
- **Already per-source** - no merge needed

---

## UI Entry Point

On `library-manga.tsx`, add **"Manage Sources"** button/section.

Shows current linked sources:
```
┌─────────────────────────────────────────┐
│  Sources (2)                    [+ Add] │
├─────────────────────────────────────────┤
│  ★ MangaDex                    [···]   │
│    "Spy x Family" · 243 ch              │
│                                         │
│    MangaSee                    [···]   │
│    "SPY×FAMILY" · 200 ch                │
└─────────────────────────────────────────┘

[···] menu:
  • Open in source
  • Set as primary
  • Remove source
```

---

## Add Source Dialog

Entry point: Click **[+ Add]** button

### Mode Selection (like `add-source-dialog.tsx`)

```
┌─────────────────────────────────────────┐
│           Add Source                     │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────┐ ┌─────────────────┐│
│  │   🔍 Search     │ │   📚 Merge      ││
│  │   Find in       │ │   from Library  ││
│  │   Sources       │ │                 ││
│  └─────────────────┘ └─────────────────┘│
│                                         │
└─────────────────────────────────────────┘
```

---

## Flow A: Search Sources

### Key Insight: Reuse Smart Match

**Don't rely on stored `externalIds`** - they might be:
- Wrong (user selected wrong match previously)
- Missing (user never did smart match)
- Stale

Instead: **Run Smart Match flow** to get fresh titles from MU/AL/MAL.

### Step 1: Smart Match (Reused)

Reuse existing Smart Match logic but:
- **No merge UI** - just need provider matches for titles
- **Auto-run** on dialog open
- **Manual fallback** if no exact matches

```
┌─────────────────────────────────────────┐
│  Finding manga info...                  │
├─────────────────────────────────────────┤
│  ┌─────┐                               │
│  │ ⟳  │  Searching MangaUpdates...     │
│  └─────┘  Searching AniList...          │
│           Searching MyAnimeList...      │
└─────────────────────────────────────────┘
```

If exact matches found → proceed to Step 2
If no matches → show manual search picker (same as current Smart Match manual mode)

### Step 2: Build Title Pool from Matches

From `ExactMatch[]`, extract all titles:

| Provider | Titles |
|----------|--------|
| MangaUpdates | `title`, `associated[].title` |
| AniList | `romaji`, `english`, `native`, `synonyms[]` |
| MAL | `title`, `title_english`, `title_japanese`, `title_synonyms[]` |

Classify by language using `detectTitleLanguage()`:
- `ja`: has hiragana/katakana
- `zh`: has CJK, no kana
- `en`: Latin only

**For Chinese titles**: If preferred lang = zh and no Chinese in pool, use Gemini `findChineseTitle()`.

### Step 3: Search Sources with Title Pool

```
┌─────────────────────────────────────────┐
│  Find in Sources                        │
├─────────────────────────────────────────┤
│  Search: [Spy x Family________] [🔍]   │
│                                         │
│  MangaDex (3)                          │
│  ┌─────┐ ┌─────┐ ┌─────┐               │
│  │cover│ │cover│ │cover│               │
│  │Spy x│ │SPY× │ │スパイ│               │
│  │[Add]│ │[Add]│ │[Add]│               │
│  └─────┘ └─────┘ └─────┘               │
│                                         │
│  Copymanga (2)                         │
│  ┌─────┐ ┌─────┐                       │
│  │cover│ │cover│                       │
│  │間諜家│ │间谍过│                       │
│  └─────┘ └─────┘                       │
│                                         │
│  (Sources with no matches not shown)   │
└─────────────────────────────────────────┘
```

### Multi-Language Search Strategy

Each source has a `language` property. Select search query:

| Source Lang | Search Query Priority |
|-------------|----------------------|
| `en` | English title → Romaji → Japanese |
| `ja` | Japanese title (native) → Romaji |
| `zh` | Chinese title (from pool or Gemini) → Japanese → English |
| `ko` | Korean → Japanese → English |
| `multi` | English first, then try others |

**UX Notes:**
- Only show sources with matches (hide empty)
- Max 3 results per source
- User can edit search query and re-search
- Click [Add] → link source

### Match Validation

When user clicks [Add], validate using `findMatchingTitle()`:
- Compare selected manga's title against title pool
- If low confidence, show confirmation: "This might not be the same manga. Add anyway?"

---

## Code Reuse Strategy

### Extract from `metadata-match-drawer.tsx`:

1. **Smart Match Store** (`useSmartMatchStore`) - already separate in `store.ts`
2. **Provider Search** (`searchAllProviders`, `findExactMatches`) - already in `store.ts`
3. **Title Pool Extraction** - NEW: extract title pool from `ExactMatch[]`

### Refactor Plan

```
src/lib/metadata/
├── store.ts          # Smart Match store (existing)
├── matching.ts       # Title matching utilities (existing)
├── title-pool.ts     # NEW: Build title pool from ExactMatch[]
└── ...

src/components/
├── smart-match-flow.tsx       # NEW: Shared Smart Match search + manual fallback
├── metadata-match-drawer.tsx  # Uses smart-match-flow + merge UI
└── source-search-drawer.tsx   # Uses smart-match-flow + source search UI
```

### Shared `useSmartMatchFlow` Hook

```tsx
function useSmartMatchFlow(initialQuery: string) {
  // Runs provider search, finds exact matches, handles manual fallback
  return {
    phase: "searching" | "manual" | "ready",
    exactMatches: ExactMatch[],
    titlePool: TitlePool | null,  // Built from exactMatches
    
    // Manual fallback
    manualSearch: (query: string) => void,
    selectManualResult: (result: ProviderSearchResult) => void,
  };
}
```

**Usage:**
- `metadata-match-drawer.tsx`: Full flow with merge UI
- `source-search-drawer.tsx`: Just get `titlePool`, then search sources

---

## Flow B: Merge from Library

For when user has duplicate library entries they want to combine.

### Step 1: Library Picker

```
┌─────────────────────────────────────────┐
│  Merge from Library                     │
├─────────────────────────────────────────┤
│  Search: [spy_______________]           │
│                                         │
│  Matching titles first:                 │
│  ┌─────────────────────────────────┐   │
│  │ [cover] 間諜家家酒               │   │
│  │         Copymanga · 50 ch read  │   │
│  │                         [Merge] │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ [cover] SPY×FAMILY              │   │
│  │         MangaSee · 10 ch read   │   │
│  │                         [Merge] │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Other library manga:                   │
│  ┌─────────────────────────────────┐   │
│  │ [cover] One Piece               │   │
│  │         MangaDex · 1000 ch read │   │
│  │                         [Merge] │   │
│  └─────────────────────────────────┘   │
│  ...                                    │
└─────────────────────────────────────────┘
```

**Sorting:**
1. Matching titles first (using `findMatchingTitle()` against current manga's title + title pool if available)
2. Then alphabetical

**Search filter:** Filters the list in real-time

### Step 2: Merge Confirmation

```
┌─────────────────────────────────────────┐
│  Merge Manga                            │
├─────────────────────────────────────────┤
│                                         │
│  Merging into: Spy x Family             │
│  ┌─────────┐                           │
│  │ [cover] │  Current manga            │
│  │         │  MangaDex (243 ch)        │
│  └─────────┘                           │
│                                         │
│       + Adding source from:             │
│  ┌─────────┐                           │
│  │ [cover] │  間諜家家酒                │
│  │         │  Copymanga (180 ch)       │
│  └─────────┘                           │
│                                         │
│  This will:                             │
│  • Add Copymanga source to current      │
│  • Remove "間諜家家酒" from library     │
│  • Keep current manga's metadata        │
│                                         │
│           [Cancel]  [Merge]             │
└─────────────────────────────────────────┘
```

### Merge Behavior

| Data | Behavior |
|------|----------|
| **Metadata** | Keep A's (title, cover, authors, description, tags, status) |
| **External IDs** | Keep A's |
| **User Overrides** | Keep A's |
| **Source Links** | Add all of B's source links to A |
| **Reading Progress** | No merge needed - already per-source, just re-link to A's libraryItemId |

**Implementation:**
1. Get all `LocalSourceLink` where `libraryItemId === B.libraryItemId`
2. Update each to `libraryItemId = A.libraryItemId`
3. Get all `LocalMangaProgress` and `LocalChapterProgress` for B's sources
4. Update each to `libraryItemId = A.libraryItemId`
5. Delete B from library

---

## Algorithm: Build Title Pool

```
Input: ExactMatch[] (from Smart Match)

Output: TitlePool {
  en: string[],   // English/romaji titles
  ja: string[],   // Japanese titles  
  zh: string[],   // Chinese titles
  all: string[]   // All titles for fuzzy matching
}
```

### Extract from Each Provider

```typescript
function buildTitlePool(matches: ExactMatch[]): TitlePool {
  const pool: TitlePool = { en: [], ja: [], zh: [], all: [] };
  
  for (const match of matches) {
    const loc = match.result.localizationData;
    
    if (match.provider === "anilist" && loc?.alTitle) {
      if (loc.alTitle.english) pool.en.push(loc.alTitle.english);
      if (loc.alTitle.romaji) pool.en.push(loc.alTitle.romaji);
      if (loc.alTitle.native) pool.ja.push(loc.alTitle.native);
      if (loc.alSynonyms) {
        for (const syn of loc.alSynonyms) {
          classifyAndAdd(syn, pool);
        }
      }
    }
    
    if (match.provider === "mal") {
      if (loc?.malTitleEnglish) pool.en.push(loc.malTitleEnglish);
      if (loc?.malTitleJapanese) pool.ja.push(loc.malTitleJapanese);
      // ... synonyms
    }
    
    if (match.provider === "mangaupdates" && loc?.muAssociated) {
      for (const assoc of loc.muAssociated) {
        classifyAndAdd(assoc.title, pool);
      }
    }
  }
  
  pool.all = [...new Set([...pool.en, ...pool.ja, ...pool.zh])];
  return pool;
}
```

### Language Classification

Use `detectTitleLanguage()` from `matching.ts`:
- Has hiragana/katakana → `ja`
- Has CJK but no kana → `zh`
- Latin only → `en`

---

## Algorithm: Source Search Query Selection

```typescript
function getSearchQuery(titlePool: TitlePool, sourceLang: string): string {
  if (sourceLang === "ja") {
    return titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0];
  }
  if (sourceLang === "zh") {
    return titlePool.zh[0] ?? titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0];
  }
  if (sourceLang === "ko") {
    return titlePool.ja[0] ?? titlePool.en[0] ?? titlePool.all[0];
  }
  // Default: English
  return titlePool.en[0] ?? titlePool.all[0];
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Source already linked | Don't show in search results |
| Smart Match finds no matches | Show manual search picker |
| Source search fails | Show error inline, don't block other sources |
| Merging manga with self | Disabled/hidden |
| Library manga B has same source as A | Skip that source link (already linked) |

---

## Files to Create/Modify

### New Files
- `src/lib/metadata/title-pool.ts` - Build title pool from ExactMatch[]
- `src/components/smart-match-flow.tsx` - Shared Smart Match logic (search + manual)
- `src/components/source-search-drawer.tsx` - Source search UI
- `src/components/library-merge-picker.tsx` - Library manga picker for merge
- `src/components/source-manage-section.tsx` - Manage linked sources UI

### Modify
- `src/components/metadata-match-drawer.tsx` - Extract shared logic to smart-match-flow
- `src/pages/library-manga.tsx` - Add "Manage Sources" section
- `src/stores/library.ts` - Add merge functions

---

## Implementation Order

1. **Title Pool Builder** - Extract from ExactMatch[] (reuse localizationData)
2. **Smart Match Flow** - Extract shared logic from metadata-match-drawer
3. **Source Search Drawer** - Use Smart Match flow + search sources
4. **Link Source** - Add source link to library item
5. **Merge from Library** - Library picker + merge logic
6. **Manage Sources UI** - List, reorder, remove sources

---

## Open Questions

1. **Source language detection** - Do sources declare their language? Need to check source manifest.
2. **Primary source** - How to handle? Store in library item or derive from first link?
3. **Chapter deduplication** - When showing chapters, how to handle duplicates across sources?
