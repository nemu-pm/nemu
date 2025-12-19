# Authentication & Cloud Sync Plan

## Overview

Add cloud sync for user data via OAuth authentication (Better Auth) and Convex backend. Seamless experience: signed out = IndexedDB only, signed in = Convex with IndexedDB mirror.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Frontend                                 │
│                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────┐ │
│  │   Auth UI   │     │            getUserDataStore()           │ │
│  │  (sign in)  │     │                    │                    │ │
│  └──────┬──────┘     │    ┌───────────────┴───────────────┐    │ │
│         │            │    ▼                               ▼    │ │
│         │            │ ┌─────────┐                 ┌─────────┐ │ │
│         │            │ │ Convex  │ ◄── writes ──► │IndexedDB│ │ │
│         │            │ │ Store   │     mirror      │ Store   │ │ │
│         │            │ └────┬────┘                 └─────────┘ │ │
│         │            └──────┼──────────────────────────────────┘ │
│         │                   │                                    │
└─────────┼───────────────────┼────────────────────────────────────┘
          │                   │
          ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│   Better Auth   │  │     Convex      │
│   (OAuth JWT)   │  │   (Database)    │
│                 │  │                 │
│ • Google        │  │ • users         │
│ • GitHub        │  │ • library       │
│ • Apple         │  │ • history       │
└─────────────────┘  │ • sources       │
                     │ • registries    │
                     └─────────────────┘
```

## Data Flow

### Signed Out
```
App ──► IndexedDBUserDataStore ──► IndexedDB
```

### Signed In
```
App ──► HybridUserDataStore ──┬──► ConvexUserDataStore ──► Convex (primary)
                              └──► IndexedDBUserDataStore ──► IndexedDB (mirror)
```

### Sign In (first time with existing local data)
```
1. User signs in
2. Fetch cloud data
3. Merge: cloud wins (discard conflicting local)
4. Upload any local-only items to cloud
5. Switch to HybridUserDataStore
```

---

## Convex Schema

### `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User record (created on first sign-in)
  users: defineTable({
    visitorId: v.optional(v.string()),  // Better Auth user ID
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  }).index("by_visitor_id", ["visitorId"]),

  // Library manga (per user)
  library: defineTable({
    userId: v.id("users"),
    mangaId: v.string(),           // registryId:sourceId:mangaId
    title: v.string(),
    cover: v.optional(v.string()),
    addedAt: v.number(),
    sources: v.array(v.object({
      registryId: v.string(),
      sourceId: v.string(),
      mangaId: v.string(),
    })),
    activeRegistryId: v.string(),
    activeSourceId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "mangaId"]),

  // Reading history (per user)
  history: defineTable({
    userId: v.id("users"),
    registryId: v.string(),
    sourceId: v.string(),
    mangaId: v.string(),
    chapterId: v.string(),
    progress: v.number(),
    total: v.number(),
    completed: v.boolean(),
    dateRead: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "mangaId", "chapterId"])
    .index("by_user_manga", ["userId", "registryId", "sourceId", "mangaId"]),

  // Installed sources (per user)
  sources: defineTable({
    userId: v.id("users"),
    sourceId: v.string(),          // registryId:sourceId (composite)
    registryId: v.string(),
    version: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_source", ["userId", "sourceId"]),

  // Custom registries (per user)
  registries: defineTable({
    userId: v.id("users"),
    registryId: v.string(),
    name: v.string(),
    type: v.union(v.literal("builtin"), v.literal("url")),
    url: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_registry", ["userId", "registryId"]),
});
```

### Convex Functions

```
convex/
├── schema.ts           # Schema above
├── users.ts            # getOrCreate, get
├── library.ts          # list, get, upsert, remove
├── history.ts          # list, get, getForManga, upsert
├── sources.ts          # list, get, upsert, remove
└── registries.ts       # list, get, upsert, remove
```

---

## Better Auth Setup

### Dependencies

```bash
bun add better-auth @better-auth/react
```

### `src/lib/auth.ts`

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL, // Convex HTTP endpoint or separate
});

export const { useSession, signIn, signOut } = authClient;
```

### OAuth Providers

```typescript
// In Better Auth server config
providers: [
  google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
  github({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  }),
  apple({
    clientId: process.env.APPLE_CLIENT_ID!,
    clientSecret: process.env.APPLE_CLIENT_SECRET!,
  }),
]
```

### Environment Variables

```env
# .env.local
VITE_CONVEX_URL=https://xxx.convex.cloud
VITE_AUTH_URL=https://xxx.convex.site

# Convex dashboard secrets
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
```

---

## Storage Implementation

### `src/data/store.ts` (updated interface)

```typescript
export interface UserDataStore {
  // Library
  getLibrary(): Promise<LibraryManga[]>;
  getLibraryManga(id: string): Promise<LibraryManga | null>;
  saveLibraryManga(manga: LibraryManga): Promise<void>;
  removeLibraryManga(id: string): Promise<void>;

  // History
  getHistory(registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<ReadingHistory | null>;
  getHistoryForManga(registryId: string, sourceId: string, mangaId: string): Promise<ReadingHistory[]>;
  saveHistory(history: ReadingHistory): Promise<void>;

  // Installed Sources
  getInstalledSources(): Promise<InstalledSource[]>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
  saveInstalledSource(source: InstalledSource): Promise<void>;
  removeInstalledSource(id: string): Promise<void>;

  // Registries
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
}
```

### `src/data/convex.ts` (new)

```typescript
import { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { UserDataStore } from "./store";

export class ConvexUserDataStore implements UserDataStore {
  constructor(
    private convex: ConvexReactClient,
    private userId: string
  ) {}

  async getLibrary(): Promise<LibraryManga[]> {
    return this.convex.query(api.library.list, { userId: this.userId });
  }

  async saveLibraryManga(manga: LibraryManga): Promise<void> {
    await this.convex.mutation(api.library.upsert, {
      userId: this.userId,
      ...manga,
    });
  }

  // ... implement all methods
}
```

### `src/data/hybrid.ts` (new)

```typescript
import type { UserDataStore } from "./store";

/**
 * Writes to both Convex (primary) and IndexedDB (mirror).
 * Reads from Convex only.
 */
export class HybridUserDataStore implements UserDataStore {
  constructor(
    private primary: UserDataStore,   // Convex
    private mirror: UserDataStore     // IndexedDB
  ) {}

  async getLibrary(): Promise<LibraryManga[]> {
    return this.primary.getLibrary();
  }

  async saveLibraryManga(manga: LibraryManga): Promise<void> {
    await Promise.all([
      this.primary.saveLibraryManga(manga),
      this.mirror.saveLibraryManga(manga),
    ]);
  }

  // ... implement all methods with same pattern
}
```

### `src/data/provider.tsx` (new)

```typescript
import { createContext, useContext, useMemo } from "react";
import { useSession } from "@/lib/auth";
import { useConvex } from "convex/react";
import { IndexedDBUserDataStore } from "./indexeddb";
import { ConvexUserDataStore } from "./convex";
import { HybridUserDataStore } from "./hybrid";
import type { UserDataStore } from "./store";

const StoreContext = createContext<UserDataStore | null>(null);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const convex = useConvex();

  const store = useMemo(() => {
    const indexedDB = new IndexedDBUserDataStore();

    if (session?.user) {
      const convexStore = new ConvexUserDataStore(convex, session.user.id);
      return new HybridUserDataStore(convexStore, indexedDB);
    }

    return indexedDB;
  }, [session?.user?.id, convex]);

  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  );
}

export function useUserDataStore(): UserDataStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useUserDataStore must be used within UserDataProvider");
  return store;
}
```

---

## Sign-In Merge Flow

### `src/lib/sync.ts`

```typescript
/**
 * Merge local IndexedDB data to Convex on first sign-in.
 * Strategy: Cloud wins for conflicts, upload local-only items.
 */
export async function mergeLocalToCloud(
  local: UserDataStore,
  cloud: UserDataStore
): Promise<void> {
  // 1. Get all cloud data (source of truth)
  const [cloudLibrary, cloudSources, cloudRegistries] = await Promise.all([
    cloud.getLibrary(),
    cloud.getInstalledSources(),
    cloud.getRegistries(),
  ]);

  const cloudLibraryIds = new Set(cloudLibrary.map((m) => m.id));
  const cloudSourceIds = new Set(cloudSources.map((s) => s.id));
  const cloudRegistryIds = new Set(cloudRegistries.map((r) => r.id));

  // 2. Get local data
  const [localLibrary, localSources, localRegistries] = await Promise.all([
    local.getLibrary(),
    local.getInstalledSources(),
    local.getRegistries(),
  ]);

  // 3. Upload local-only items to cloud
  const uploads: Promise<void>[] = [];

  for (const manga of localLibrary) {
    if (!cloudLibraryIds.has(manga.id)) {
      uploads.push(cloud.saveLibraryManga(manga));
    }
  }

  for (const source of localSources) {
    if (!cloudSourceIds.has(source.id)) {
      uploads.push(cloud.saveInstalledSource(source));
    }
  }

  for (const registry of localRegistries) {
    if (!cloudRegistryIds.has(registry.id)) {
      uploads.push(cloud.saveRegistry(registry));
    }
  }

  await Promise.all(uploads);

  // 4. Sync history (additive - keep all progress)
  // History is additive: we keep the max progress for each chapter
  // This happens automatically since we upsert with latest data

  // 5. Mirror cloud state to local IndexedDB
  await syncCloudToLocal(cloud, local);
}

/**
 * Full sync from cloud to local (mirror update)
 */
async function syncCloudToLocal(
  cloud: UserDataStore,
  local: UserDataStore
): Promise<void> {
  const [library, sources, registries] = await Promise.all([
    cloud.getLibrary(),
    cloud.getInstalledSources(),
    cloud.getRegistries(),
  ]);

  // Clear and repopulate local
  // (or implement delta sync for efficiency)
  await Promise.all([
    ...library.map((m) => local.saveLibraryManga(m)),
    ...sources.map((s) => local.saveInstalledSource(s)),
    ...registries.map((r) => local.saveRegistry(r)),
  ]);
}
```

---

## UI Components

### `src/components/auth-button.tsx`

```typescript
import { useSession, signIn, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AuthButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Button variant="ghost" size="sm" disabled>...</Button>;
  }

  if (session?.user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <img
              src={session.user.image}
              alt=""
              className="size-6 rounded-full"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>
            {session.user.email}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">Sign In</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => signIn.social({ provider: "google" })}>
          Continue with Google
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signIn.social({ provider: "github" })}>
          Continue with GitHub
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signIn.social({ provider: "apple" })}>
          Continue with Apple
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## File Changes Summary

### New Files

```
convex/
├── schema.ts
├── users.ts
├── library.ts
├── history.ts
├── sources.ts
├── registries.ts
└── auth.ts              # Better Auth Convex adapter

src/
├── lib/
│   ├── auth.ts          # Better Auth client
│   └── sync.ts          # Merge/sync logic
├── data/
│   ├── convex.ts        # ConvexUserDataStore
│   ├── hybrid.ts        # HybridUserDataStore
│   └── provider.tsx     # React context provider
└── components/
    └── auth-button.tsx  # Sign in/out UI
```

### Modified Files

```
src/
├── main.tsx             # Wrap with ConvexProvider, UserDataProvider
├── components/shell.tsx # Add AuthButton to nav
├── stores/*.ts          # Use useUserDataStore() hook instead of getUserDataStore()
└── data/indexeddb.ts    # No changes needed (already implements interface)
```

---

## Implementation Order

1. **Setup Convex** - `bunx convex dev`, create schema
2. **Convex functions** - CRUD for all tables
3. **Better Auth** - OAuth config, Convex adapter
4. **ConvexUserDataStore** - Implement interface
5. **HybridUserDataStore** - Dual-write wrapper
6. **UserDataProvider** - React context with auth-aware switching
7. **Migrate stores** - Update Zustand stores to use hook
8. **Auth UI** - Sign in button, dropdown
9. **Sync logic** - First sign-in merge
10. **Testing** - Sign in/out, data persistence, multi-device

---

## Cost Estimate (Convex Free Tier)

| Resource | Free Limit | Expected Usage |
|----------|------------|----------------|
| Database | 512MB | ~1KB per user (tiny) |
| Bandwidth | 1GB/month | Minimal (text only) |
| Function calls | 1M/month | ~100/user/day |

Free tier easily supports thousands of users.

