# nemu

A frontend-only content reader with a pluggable provider architecture. Currently supports Aidoku WASM sources running directly in the browser, with the architecture designed for future providers (Komga, Kavita, etc).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Frontend                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   App.tsx    │───▶│ Zustand Store │───▶│   Registry   │      │
│  │   (React)    │    │  (registry)   │    │   Manager    │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│                                                  │               │
│         ┌────────────────────────────────────────┼────────┐     │
│         │              Providers                 │        │     │
│         ├────────────────────────────────────────▼────────┤     │
│         │       ┌─────────────────────────────────┐       │     │
│         │       │     MangaSource Interface       │       │     │
│         │       │  search() getManga() getPages() │       │     │
│         │       └─────────────────────────────────┘       │     │
│         │           ▲           ▲           ▲             │     │
│         │           │           │           │             │     │
│         │  ┌────────┴──┐ ┌──────┴─────┐ ┌───┴────────┐   │     │
│         │  │  Aidoku   │ │   Komga    │ │  Kavita    │   │     │
│         │  │  Adapter  │ │  (future)  │ │  (future)  │   │     │
│         │  └─────┬─────┘ └────────────┘ └────────────┘   │     │
│         │        │                                        │     │
│         │  ┌─────▼─────┐                                  │     │
│         │  │   WASM    │                                  │     │
│         │  │  Runtime  │                                  │     │
│         │  │ (Worker)  │                                  │     │
│         │  └───────────┘                                  │     │
│         └─────────────────────────────────────────────────┘     │
│                                                                  │
│         ┌─────────────────────────────────────────────────┐     │
│         │                 Data Layer                      │     │
│         ├─────────────────────────────────────────────────┤     │
│         │  UserDataStore        │      CacheStore         │     │
│         │  (syncable)           │      (local only)       │     │
│         │  - Library            │      - WASM binaries    │     │
│         │  - Reading history    │      - Images           │     │
│         │  - Installed sources  │      - Metadata         │     │
│         └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                      ┌───────────────────────┐
                      │     CORS Proxy        │
                      │   (for web sources)   │
                      └───────────────────────┘
```

## Key Concepts

### Provider Layer (`src/providers/`)

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

### Registry System (`src/providers/registry.ts`)

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

### Current Providers

#### Aidoku (`src/providers/aidoku/`)

Runs Aidoku WASM sources in Web Workers:

```
adapter.ts          → AidokuMangaSource (implements MangaSource)
async-source.ts     → Web Worker wrapper (Comlink)
source.worker.ts    → Worker thread (runs WASM)
runtime.ts          → WASM instantiation & host functions
```

## Directory Structure

```
src/
├── providers/           # Source provider layer
│   ├── types.ts         # MangaSource, SearchResult, Page, Manga, Chapter
│   ├── registry.ts      # RegistryManager, registry types
│   ├── index.ts         # Public exports
│   └── aidoku/          # Aidoku provider implementation
│       ├── adapter.ts   # MangaSource implementation
│       ├── async-source.ts
│       ├── source.worker.ts
│       ├── runtime.ts
│       ├── url-registry.ts  # Aidoku URL registry
│       ├── types.ts     # Aidoku-specific types
│       └── imports/     # WASM host function implementations
│
├── data/                # Data persistence layer
│   ├── schema.ts        # Zod schemas (LibraryManga, ReadingHistory, etc)
│   ├── keys.ts          # Composite key generation & constants
│   ├── store.ts         # UserDataStore interface
│   ├── indexeddb.ts     # IndexedDB implementation
│   └── cache.ts         # CacheStore interface
│
├── stores/              # Zustand state stores
│   ├── sources.ts       # Source registry & installation
│   ├── library.ts       # User's manga library
│   └── history.ts       # Reading progress
│
├── pages/               # Page components
│   ├── library.tsx      # Library grid view
│   ├── search.tsx       # Aggregated search
│   ├── manga.tsx        # Manga details & chapters
│   ├── reader.tsx       # Chapter reader
│   └── settings.tsx     # Source management
│
├── components/          # Shared components
│   ├── ui/              # shadcn/ui components
│   ├── shell.tsx        # App shell with nav
│   ├── cover-image.tsx  # Lazy cover images
│   └── add-source-dialog.tsx
│
├── router.tsx           # TanStack Router config
├── App.tsx              # Root component
└── main.tsx             # Entry point

service/
└── wrangler.toml        # Cloudflare Workers CORS proxy
```

## Running

```bash
# Install dependencies
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

## Large assets (Cloudflare R2)

- Heavy binaries (for example `r2-assets/models/comictextdetector.pt.onnx`) live in `./r2-assets`. Place any new large files there and they will be uploaded to Cloudflare R2 during `npm run build` via the `sync:r2-assets` script.
- At runtime, large assets are expected to be served from a CDN/R2 domain. The text detector model defaults to `https://assets.nemu.pm/models/comictextdetector.pt.onnx` and can be overridden with `VITE_R2_ASSET_BASE_URL` or a file-specific `VITE_TEXT_DETECTOR_MODEL_URL`.

### Configuring Cloudflare R2 uploads

Set the following environment variables for build environments (Vercel, CI, or local when you want to push files):

- `R2_BUCKET`: Bucket name.
- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`: R2 API credentials with write access to the bucket.
- Optional: `R2_ASSET_PREFIX` to namespace objects inside the bucket, `R2_ENDPOINT` to override the default endpoint.

During the build, `npm run sync:r2-assets` will:

1. Hash every file under `r2-assets`.
2. Skip uploads when the remote object already has the same `sha256` metadata.
3. Upload only changed/new files with the correct content-type.

Expose the bucket through a Cloudflare R2 public bucket domain or a custom subdomain such as `assets.nemu.pm`, and set `VITE_R2_ASSET_BASE_URL` accordingly so clients load assets from R2 instead of the Vercel public folder.

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
