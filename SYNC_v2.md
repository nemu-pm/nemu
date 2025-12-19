# Cloud Sync v2

## Goals

1. **Bidirectional real-time sync** - changes propagate both ways instantly
2. **Offline-first** - app works offline, syncs when online
3. **Conflict resolution** - user chooses when data conflicts
4. **Clean sign-out** - clear option for what happens to local data

## Architecture

### Data Layers

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

### SyncEngine Responsibilities

1. **Write-through**: All writes go to local first, then cloud (if auth'd)
2. **Cloud subscription**: Listen to Convex queries, merge into local
3. **Conflict detection**: Compare timestamps/versions on merge
4. **Queue offline changes**: Track pending uploads for when online

## Data Model Changes

### Add sync metadata to all synced entities:

```typescript
interface SyncMetadata {
  localUpdatedAt: number;      // Local modification timestamp
  cloudUpdatedAt?: number;     // Last known cloud timestamp
  syncStatus: 'synced' | 'pending' | 'conflict';
  conflictData?: unknown;      // Cloud version when conflict detected
}

interface LibraryManga {
  // ... existing fields
  _sync: SyncMetadata;
}
```

### Convex schema additions:

```typescript
// convex/schema.ts
library: defineTable({
  // ... existing fields
  updatedAt: v.number(),  // Server timestamp for conflict detection
})
```

## Sync Flows

### 1. Write Flow (Local → Cloud)

```
User action
    ↓
Write to IndexedDB (immediate)
    ↓
Update Zustand store (immediate)
    ↓
If authenticated & online:
    ├─→ Push to Convex
    │       ↓
    │   Success → Update syncStatus: 'synced'
    │       ↓
    │   Conflict (409) → Mark syncStatus: 'conflict', store cloud version
    │       ↓
    │   Offline/Error → Keep syncStatus: 'pending'
```

### 2. Cloud → Local Sync

```
Convex subscription fires
    ↓
Compare cloud.updatedAt vs local.cloudUpdatedAt
    ↓
If cloud is newer AND local is 'synced':
    → Update local with cloud data
    ↓
If cloud is newer AND local is 'pending':
    → Mark as 'conflict', store both versions
    ↓
If local is newer (pending upload):
    → Keep local, it will push on next sync
```

### 3. Conflict Resolution

When `syncStatus === 'conflict'`:

```tsx
<ConflictDialog
  localData={manga}
  cloudData={manga._sync.conflictData}
  onResolve={(choice: 'local' | 'cloud' | 'merge') => {
    if (choice === 'local') {
      // Force push local to cloud
      syncEngine.forceUpload(manga.id);
    } else if (choice === 'cloud') {
      // Accept cloud version
      syncEngine.acceptCloud(manga.id);
    } else {
      // Manual merge (open editor)
      syncEngine.manualMerge(manga.id, mergedData);
    }
  }}
/>
```

## Sign-In Flow

```
User signs in
    ↓
Fetch cloud data
    ↓
For each cloud item:
    ├─→ Not in local → Add to local (synced)
    ├─→ In local, same data → Mark synced
    └─→ In local, different data → Mark conflict
    ↓
For each local-only item:
    → Push to cloud (or mark pending if offline)
    ↓
Show conflict resolution UI if any conflicts
```

## Sign-Out Flow

```
User clicks sign out
    ↓
Show dialog:
┌────────────────────────────────────────┐
│  Sign Out                              │
│                                        │
│  What should happen to your local      │
│  data?                                 │
│                                        │
│  ○ Keep local data                     │
│    (Stay signed in on this device      │
│     with cached data)                  │
│                                        │
│  ○ Clear local data                    │
│    (Remove all data from this device)  │
│                                        │
│  [Cancel]              [Sign Out]      │
└────────────────────────────────────────┘
    ↓
If "Keep": Just sign out, local data remains
If "Clear": Delete IndexedDB, clear caches, sign out
```

## Pending Changes Indicator

Show sync status in UI:

```tsx
<SyncStatus>
  {pendingCount > 0 && (
    <Badge variant="warning">
      {pendingCount} pending
    </Badge>
  )}
  {conflictCount > 0 && (
    <Badge variant="destructive" onClick={showConflicts}>
      {conflictCount} conflicts
    </Badge>
  )}
  {isOnline && pendingCount === 0 && conflictCount === 0 && (
    <Badge variant="success">Synced</Badge>
  )}
</SyncStatus>
```

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Add `_sync` metadata to schema
- [ ] Create `SyncEngine` class
- [ ] Add `updatedAt` to Convex tables
- [ ] Implement write-through to local + cloud

### Phase 2: Conflict Detection
- [ ] Track local vs cloud timestamps
- [ ] Detect conflicts on cloud subscription
- [ ] Store conflict data

### Phase 3: UI
- [ ] Conflict resolution dialog
- [ ] Sign-out options dialog
- [ ] Sync status indicator
- [ ] Pending changes list

### Phase 4: Offline Support
- [ ] Queue pending changes
- [ ] Retry on reconnect
- [ ] Handle offline reads gracefully

## API Design

```typescript
interface SyncEngine {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;
  
  // Auth
  onSignIn(userId: string): Promise<SyncResult>;
  onSignOut(clearLocal: boolean): Promise<void>;
  
  // Sync operations
  push(entity: SyncableEntity): Promise<void>;
  pull(): Promise<void>;
  
  // Conflict resolution
  getConflicts(): Conflict[];
  resolveConflict(id: string, resolution: 'local' | 'cloud'): Promise<void>;
  
  // Status
  getPendingCount(): number;
  getStatus(): 'synced' | 'syncing' | 'offline' | 'conflicts';
  
  // Events
  onStatusChange(callback: (status: SyncStatus) => void): () => void;
  onConflict(callback: (conflict: Conflict) => void): () => void;
}
```

## Edge Cases

1. **User signs in on two devices simultaneously**
   - Both push local data → server accepts both (no conflicts if different manga)
   - Same manga edited → last-write-wins with conflict flag

2. **User goes offline mid-sync**
   - Pending changes stay queued
   - Resume on reconnect

3. **Cloud data deleted while offline**
   - On reconnect, local item marked as conflict
   - User chooses: re-upload or accept deletion

4. **Large initial sync**
   - Paginate cloud data fetch
   - Show progress indicator
   - Allow cancel (partial sync state)

## Migration from v1

1. Mark all existing local data as `syncStatus: 'pending'`
2. On next sign-in, merge runs and resolves status
3. No data loss, just re-sync everything

