# Cloud Sync Plan

## Overview

Optional cloud sync for user data. IndexedDB is always the local source of truth. When signed in, Convex provides real-time sync across devices via subscriptions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
│                                                                  │
│  ┌──────────────┐         ┌──────────────────────────────────┐  │
│  │ Zustand      │◄───────│  Convex Subscriptions            │  │
│  │ Stores       │ sync    │  (when signed in)                │  │
│  └──────┬───────┘         └──────────────────────────────────┘  │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              getUserDataStore()                           │   │
│  │                      │                                    │   │
│  │         ┌────────────┴────────────┐                      │   │
│  │         ▼                         ▼                       │   │
│  │  ┌─────────────┐          ┌─────────────┐                │   │
│  │  │  IndexedDB  │          │   Convex    │                │   │
│  │  │ (signed out)│          │ (signed in) │                │   │
│  │  └─────────────┘          └─────────────┘                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model (2 Tables)

### Library
Manga collection with embedded reading history per chapter.

```typescript
LibraryManga {
  id: string,                    // registryId:sourceId:mangaId
  title: string,
  cover?: string,
  addedAt: number,
  sources: SourceLink[],
  activeRegistryId: string,
  activeSourceId: string,
  history: {                     // Embedded, keyed by chapterId
    [chapterId: string]: {
      progress: number,
      total: number,
      completed: boolean,
      dateRead: number,
    }
  },
}
```

### Settings
User preferences and installed sources.

```typescript
UserSettings {
  readingMode: 'rtl' | 'ltr' | 'scrolling',
  installedSources: InstalledSource[],
  // Future: theme, notifications, etc.
}
```

### What's NOT Synced

| Data | Reason |
|------|--------|
| Registries | Defaults in code, custom registries rare |
| WASM binaries | Cache, rebuilt on-demand |
| Images | Cache |
| Custom .aix files | User re-imports on new device |

---

## Convex Schema

### `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    visitorId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  }).index("by_visitor_id", ["visitorId"]),

  library: defineTable({
    userId: v.id("users"),
    mangaId: v.string(),
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
    history: v.record(v.string(), v.object({
      progress: v.number(),
      total: v.number(),
      completed: v.boolean(),
      dateRead: v.number(),
    })),
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "mangaId"]),

  settings: defineTable({
    userId: v.id("users"),
    readingMode: v.union(
      v.literal("rtl"),
      v.literal("ltr"),
      v.literal("scrolling")
    ),
    installedSources: v.array(v.object({
      id: v.string(),
      registryId: v.string(),
      version: v.number(),
    })),
  }).index("by_user", ["userId"]),
});
```

---

## Convex Subscriptions (2 total)

```typescript
// src/providers/sync-provider.tsx

useEffect(() => {
  if (!session?.user) return;

  // 1. Library subscription
  const unsubLibrary = convex.onUpdate(
    api.library.list,
    { userId },
    (data) => {
      useLibraryStore.setState({ mangas: data });
    }
  );

  // 2. Settings subscription
  const unsubSettings = convex.onUpdate(
    api.settings.get,
    { userId },
    (data) => {
      useSourcesStore.setState({ installedSources: data.installedSources });
      useSettingsStore.setState({ readingMode: data.readingMode });
    }
  );

  return () => {
    unsubLibrary();
    unsubSettings();
  };
}, [session?.user?.id]);
```

---

## Store Switching

### `src/data/provider.tsx`

```typescript
export function getUserDataStore(): UserDataStore {
  const session = getAuthSession();
  
  if (session?.user) {
    return getConvexUserDataStore(session.user.id);
  }
  
  return getIndexedDBUserDataStore();
}
```

### On Auth State Change

```typescript
useEffect(() => {
  // Reload all stores when auth changes
  useLibraryStore.getState().load();
  useSourcesStore.getState().initialize();
  useSettingsStore.getState().load();
}, [session?.user?.id]);
```

### First Sign-In Merge

```typescript
async function mergeLocalToCloud(userId: string): Promise<void> {
  const local = getIndexedDBUserDataStore();
  const cloud = getConvexUserDataStore(userId);

  // Get local data
  const [localLibrary, localSettings] = await Promise.all([
    local.getLibrary(),
    local.getSettings(),
  ]);

  // Get cloud data
  const [cloudLibrary, cloudSettings] = await Promise.all([
    cloud.getLibrary(),
    cloud.getSettings(),
  ]);

  // Cloud wins for conflicts, upload local-only items
  const cloudIds = new Set(cloudLibrary.map(m => m.id));
  
  for (const manga of localLibrary) {
    if (!cloudIds.has(manga.id)) {
      await cloud.saveLibraryManga(manga);
    }
  }

  // Merge installed sources (union)
  const cloudSourceIds = new Set(cloudSettings.installedSources.map(s => s.id));
  const newSources = localSettings.installedSources.filter(
    s => !cloudSourceIds.has(s.id)
  );
  
  if (newSources.length > 0) {
    await cloud.saveSettings({
      ...cloudSettings,
      installedSources: [...cloudSettings.installedSources, ...newSources],
    });
  }
}
```

---

## Auth (Better Auth)

### OAuth Providers
- Google
- GitHub
- Apple

### `src/lib/auth.ts`

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL,
});

export const { useSession, signIn, signOut } = authClient;
```

---

## Missing Source Handling

When library manga references an uninstalled source:

```tsx
// src/pages/library.tsx
{manga.sourceNotInstalled && (
  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
    <Badge variant="destructive">Source missing</Badge>
  </div>
)}
```

Clicking shows dialog:
```
⚠️ Source "custom-source" not installed

This manga was added from a source that isn't 
installed on this device.

[Import .aix]  [Remove from Library]
```

---

## UserDataStore Interface (Updated)

```typescript
export interface UserDataStore {
  // Library (with embedded history)
  getLibrary(): Promise<LibraryManga[]>;
  getLibraryManga(id: string): Promise<LibraryManga | null>;
  saveLibraryManga(manga: LibraryManga): Promise<void>;
  removeLibraryManga(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;

  // Convenience: update single manga's history
  saveChapterProgress(
    mangaId: string,
    chapterId: string,
    progress: ChapterProgress
  ): Promise<void>;
}
```

---

## File Structure

```
src/
├── data/
│   ├── schema.ts           # Zod schemas (updated)
│   ├── keys.ts             # Composite keys
│   ├── store.ts            # UserDataStore interface
│   ├── indexeddb.ts        # IndexedDB implementation
│   └── convex.ts           # Convex implementation
├── sync/
│   └── provider.tsx        # Auth-aware store switching + subscriptions
├── stores/
│   ├── library.ts          # Manga collection
│   ├── sources.ts          # Registry + installed sources
│   ├── settings.ts         # Reading mode, preferences
│   └── history.ts          # Convenience layer over library.history
├── lib/
│   └── auth.ts             # Better Auth client
└── components/
    └── auth-button.tsx     # Sign in/out UI

convex/
├── schema.ts
├── auth.ts                 # Better Auth adapter
├── users.ts
├── library.ts
└── settings.ts
```

---

## Implementation Order

1. **Update schemas** - `src/data/schema.ts` ✅
2. **Update IndexedDB store** - Embed history in library, add settings
3. **Migrate history store** - Use library.history instead
4. **Add settings store** - Reading mode, etc.
5. **Convex setup** - Schema, functions
6. **ConvexUserDataStore** - Implement interface
7. **Better Auth** - OAuth config
8. **Sync provider** - Auth-aware switching + subscriptions
9. **Auth UI** - Sign in button
10. **First sign-in merge** - Local → cloud
11. **Missing source UI** - Handle uninstalled sources

---

## Migration Notes

### IndexedDB Schema Bump

```typescript
// Bump DB_VERSION to trigger migration
const DB_VERSION = 3;

request.onupgradeneeded = (event) => {
  // Remove old history store
  if (db.objectStoreNames.contains("history")) {
    db.deleteObjectStore("history");
  }
  
  // Add settings store
  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "id" });
  }
  
  // Library store unchanged (history field added dynamically)
};
```

### Migrate Existing History

```typescript
// One-time migration on app load
async function migrateHistoryToLibrary(): Promise<void> {
  const oldHistory = await getOldHistoryStore();
  const library = await getLibrary();
  
  for (const manga of library) {
    const histories = oldHistory.filter(
      h => h.registryId === manga.activeRegistryId &&
           h.sourceId === manga.activeSourceId &&
           h.mangaId === manga.sources[0].mangaId
    );
    
    manga.history = {};
    for (const h of histories) {
      manga.history[h.chapterId] = {
        progress: h.progress,
        total: h.total,
        completed: h.completed,
        dateRead: h.dateRead,
      };
    }
    
    await saveLibraryManga(manga);
  }
}
```
