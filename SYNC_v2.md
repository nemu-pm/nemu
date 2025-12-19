# Cloud Sync v2

## Goals

1. **Bidirectional real-time sync** - changes propagate both ways instantly
2. **Offline-first** - app works offline, syncs when online
3. **Auto-merge** - smart rules handle conflicts, no user intervention
4. **Clean sign-out** - clear option for what happens to local data

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    UI Components                     │
├─────────────────────────────────────────────────────┤
│                   Zustand Stores                     │
│         (single source of truth for UI)             │
├─────────────────────────────────────────────────────┤
│                   SyncEngine                         │
│    (orchestrates local ↔ cloud synchronization)     │
├──────────────────────┬──────────────────────────────┤
│   IndexedDB (local)  │      Convex (cloud)          │
│   - Always available │   - When authenticated       │
│   - Offline support  │   - Real-time subscriptions  │
└──────────────────────┴──────────────────────────────┘
```

## Auto-Merge Rules (No Conflict UI)

| Data | Strategy | Rationale |
|------|----------|-----------|
| Library manga | Union | Adding is additive, keep all |
| Reading progress | MAX(progress) | Want furthest read position |
| Chapter completion | OR(completed) | Once complete, stays complete |
| Settings | Last-write-wins | Minor, easy to re-configure |
| Installed sources | Union | Additive, WASM cached locally anyway |

### Deletions

- **Soft delete** with `deletedAt` timestamp
- 7-day grace period before permanent removal
- If re-added within grace period, restore

## Data Model

### Sync metadata on local entities:

```typescript
interface SyncMeta {
  updatedAt: number;           // Local modification time
  syncedAt?: number;           // Last successful sync time
  pendingSync: boolean;        // Needs upload to cloud
}
```

### Convex schema:

```typescript
library: defineTable({
  userId: v.string(),
  mangaId: v.string(),
  // ... existing fields
  updatedAt: v.number(),       // Server timestamp
  deletedAt: v.optional(v.number()),  // Soft delete
})
```

## Sync Flows

### Write Flow (User Action)

```
User action (add manga, update progress, etc.)
    ↓
1. Write to IndexedDB immediately
2. Update Zustand store immediately  
3. Mark pendingSync: true
    ↓
If online & authenticated:
    → Push to Convex
    → On success: pendingSync: false, update syncedAt
    → On failure: Keep pendingSync: true, retry later
```

### Cloud → Local Sync

```
Convex subscription update received
    ↓
For each cloud item:
    ↓
Compare with local using merge rules:
    - Library: Add if missing locally
    - Progress: local = MAX(local.progress, cloud.progress)
    - Completed: local = local.completed || cloud.completed
    ↓
Update IndexedDB + Zustand
```

### Sign-In Flow

```
User signs in
    ↓
1. Fetch all cloud data
2. Merge with local data (using auto-merge rules)
3. Push local-only items to cloud
4. Subscribe to real-time updates
    ↓
Done - no user interaction needed
```

### Sign-Out Flow

```
User clicks sign out
    ↓
┌────────────────────────────────────────┐
│  Sign Out                              │
│                                        │
│  ○ Keep data on this device            │
│    (You can sign back in anytime)      │
│                                        │
│  ○ Remove data from this device        │
│    (Cloud data stays safe)             │
│                                        │
│  [Cancel]              [Sign Out]      │
└────────────────────────────────────────┘
    ↓
Execute choice, then sign out
```

## Sync Status UI

Simple indicator, no conflict resolution:

```tsx
function SyncIndicator() {
  const { pendingCount, isOnline, isSyncing } = useSyncStatus();
  
  if (!isOnline) return <CloudOff />;
  if (isSyncing) return <Spinner />;
  if (pendingCount > 0) return <CloudPending count={pendingCount} />;
  return <CloudCheck />; // All synced
}
```

## Implementation

### SyncEngine API

```typescript
class SyncEngine {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;
  
  // Auth events
  onSignIn(): Promise<void>;   // Merge + subscribe
  onSignOut(clearLocal: boolean): Promise<void>;
  
  // Write operations (called by stores)
  trackChange(table: string, id: string, data: unknown): void;
  
  // Sync control
  syncNow(): Promise<void>;    // Force immediate sync
  
  // Status
  readonly status: 'offline' | 'syncing' | 'synced' | 'pending';
  readonly pendingCount: number;
  onStatusChange(cb: (status: SyncStatus) => void): () => void;
}
```

### Store Integration

Stores call `syncEngine.trackChange()` after local writes:

```typescript
// In library store
addManga: async (manga) => {
  await localStore.saveLibraryManga(manga);
  set(state => ({ mangas: [...state.mangas, manga] }));
  syncEngine.trackChange('library', manga.id, manga);
}
```

### Pending Changes Queue

```typescript
interface PendingChange {
  table: string;
  id: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

// Stored in IndexedDB, survives refresh
// Processed on reconnect or periodic retry
```

## Implementation Plan

### Phase 1: Write-through + Basic Sync
- [ ] Add `updatedAt` to Convex tables
- [ ] Create SyncEngine class
- [ ] Implement write-through (local + cloud)
- [ ] Add pending changes queue

### Phase 2: Cloud → Local Sync  
- [ ] Subscribe to Convex queries
- [ ] Implement auto-merge rules
- [ ] Update local on cloud changes

### Phase 3: Sign-in/out
- [ ] Initial merge on sign-in
- [ ] Sign-out dialog with options
- [ ] Clear local data option

### Phase 4: UI + Polish
- [ ] Sync status indicator
- [ ] Offline indicator
- [ ] Retry failed syncs on reconnect

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Edit offline, come online | Queue processes, uploads changes |
| Same manga added on 2 devices | Both exist in cloud (same ID = merge) |
| Delete on A, read on B offline | Soft delete, B's sync restores it |
| Progress 5 on A, progress 10 on B | Merge keeps 10 (MAX) |
| Sign out, sign in different account | "Clear local data" recommended |

## Not Implementing

- ❌ Conflict resolution UI (auto-merge handles it)
- ❌ Manual merge editor
- ❌ Sync history/audit log
- ❌ Selective sync (all or nothing)
