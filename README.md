# nemu

A content reader with a pluggable source runtime architecture (Aidoku WASM + Tachiyomi runtime).

## Architecture (current)

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Frontend (React)                         │
├──────────────────────────────────────────────────────────────────────┤
│  src/main.tsx                                                         │
│   - TanStack Router (src/router.tsx)                                  │
│   - Zustand stores (src/stores/*)                                     │
│   - Local persistence: IndexedDB                                      │
│     - User DB (src/data/indexeddb.ts)                                 │
│     - Cache DB (src/data/cache.ts)                                    │
│   - Source runtimes (src/lib/sources/*)                               │
│     - Aidoku: .aix → WebWorker runtime via @nemu.pm/aidoku-runtime     │
│     - Tachiyomi: extension runtime via @nemu.pm/tachiyomi-runtime      │
│   - Reader plugin system (src/lib/plugins/*)                           │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                             Convex backend                             │
├──────────────────────────────────────────────────────────────────────┤
│  - Auth (better-auth via @convex-dev/better-auth)                      │
│  - Canonical tables: library_items, library_source_links, progress      │
│  - Realtime subscriptions → hydrate local IndexedDB (src/sync/setup.tsx)│
└──────────────────────────────────────────────────────────────────────┘

## Key Concepts

### Source layer (`src/lib/sources/`)

**MangaSource Interface** - Unified interface for ALL manga sources:
```typescript
interface MangaSource {
  id: string;
  name: string;
  search(query: string): Promise<SearchResult<Manga>>;
  getManga(mangaId: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPages(mangaId: string, chapterId: string): Promise<Page[]>;
  dispose(): void;
}
```

Any provider (Aidoku, Komga, Kavita, local files) implements this interface.

**SearchResult** - Source-owned pagination:
```typescript
interface SearchResult<T> {
  items: T[];
  hasMore: boolean;
  loadMore?: () => Promise<SearchResult<T>>;
}
```

The source controls its own pagination strategy (pages, cursors, offsets).

**Page** - Source-controlled image fetching:
```typescript
interface Page {
  index: number;
  getImage(): Promise<Blob>;
}
```

Each source handles its own image fetching (proxy, auth headers, etc).

### Registry System (`src/lib/sources/registry.ts`)

Polymorphic registry system for discovering and managing sources:

| Registry Type | Description | Status |
|--------------|-------------|--------|
| **URL** | Remote Aidoku registry | ✅ Implemented |
| **NAS** | Komga/Kavita servers | 📋 Planned |
| **Local** | Local file system | 📋 Planned |

Default registries (defined in `DEFAULT_REGISTRIES`):
- **Aidoku Community** - https://aidoku-community.github.io/sources/index.min.json
- **Aidoku ZH** - https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.json

### Data Layer (`src/data/`)

Separated for different sync strategies:

| Store | Contents | Sync |
|-------|----------|------|
| **UserDataStore** | Library, history, settings | Cloud sync (future) |
| **CacheStore** | WASM binaries, images | Local only |

### Current runtimes

#### Aidoku (`src/lib/sources/aidoku/`)

Runs Aidoku WASM sources in Web Workers (via `@nemu.pm/aidoku-runtime`).

```
adapter.ts          → AidokuMangaSource (implements MangaSource)
async-source.ts     → Web Worker wrapper (Comlink)
source.worker.ts    → Worker thread (runs WASM)
runtime.ts          → WASM instantiation & host functions
```

## Directory Structure (high level)

```
src/
├── lib/sources/         # Source runtimes + registries (Aidoku/Tachiyomi)
├── data/                # IndexedDB persistence (user + cache), schemas, keys
├── stores/              # Zustand stores (library/settings/history/progress/sync)
├── sync/                # Convex subscription hydration + sync UX
├── pages/               # Route-level UI
├── components/          # Shared UI building blocks
└── main.tsx             # App entry
```

## Running

```bash
# Install dependencies (bun)
bun install

# Start dev server
bun dev

# Deploy CORS proxy to Cloudflare Workers (required for Aidoku sources)
cd service && bunx wrangler deploy

# Run tests
bun test

# Type check & build
bun run build
```

## Adding a New Provider

1. Create `src/providers/{provider}/adapter.ts`
2. Implement `MangaSource` interface
3. Create a registry class implementing `SourceRegistryProvider`
4. Register it in `RegistryManager`

Example skeleton:
```typescript
// src/providers/komga/adapter.ts
export class KomgaMangaSource implements MangaSource {
  constructor(private serverUrl: string, private auth: string) {}
  
  async search(query: string): Promise<SearchResult<Manga>> {
    // Call Komga API
  }
  // ... implement other methods
}
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `zustand` | State management |
| `zod` | Schema validation |
| `comlink` | Web Worker communication |
| `fflate` | Unzipping .aix packages |
| `react-virtuoso` | Virtualized lists |
| `dayjs` | Date parsing |
| `cheerio` | HTML parsing (Aidoku WASM) |
| `@tanstack/react-router` | File-based routing |
| `shadcn/ui` | UI components |

## Roadmap

- [x] Aidoku WASM provider
- [x] Registry system (multi-registry with collision-safe keys)
- [x] Data layer (UserDataStore, CacheStore)
- [x] Frontend redesign (library, search, reader, settings)
- [x] Reading progress tracking
- [x] Add source dialog (registry + custom .aix)
- [ ] Komga provider
- [ ] Kavita provider
- [ ] Cloud sync for user data
- [ ] Offline reading
- [ ] Source filters UI
