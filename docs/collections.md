# Collections

Collections are user-defined groups of library items. They are a library organization feature, not a separate source runtime feature: collection membership points at existing `library_items` rows and never stores source-specific manga IDs directly.

## User Flows

- Library title menu: the library page title opens a menu with "All" plus every collection when the library has books.
- Manage collections: create, rename, and delete collections from the title menu or the collection membership flow.
- Collection detail: `/library/collection/$id` shows only library entries that are members of that collection.
- Add books to a collection: collection detail pages can open an add-books sheet with staged membership changes.
- Edit a book's collections: library manga pages and source manga pages expose a collections action for books that are already in the library.

The UI stages checkbox changes locally in dialogs and writes only the diff on save. Canceling a dialog leaves membership unchanged.

## Data Model

Collections use two normalized tables in Convex and mirrored IndexedDB stores.

```text
collections
  userId
  collectionId
  name
  createdAt
  updatedAt

collection_items
  userId
  collectionId
  libraryItemId
  addedAt
  updatedAt
```

Important identifiers:

- `collectionId` is a client-generated UUID and is stable across devices.
- `libraryItemId` is the canonical user-library entry id from `library_items`.
- `userId` scopes both tables to the authenticated user. Collections are not shared resources yet.

`collection_items` is intentionally a join table. This keeps membership independent from library metadata, source links, and read progress.

## Local Storage

IndexedDB stores are added in `src/data/indexeddb.ts` at schema version 12:

- `collections`, keyed by `collectionId`
- `collection_items`, keyed by `[collectionId, libraryItemId]`

Local write helpers mirror the Convex integrity rules:

- adding membership to a missing local collection is ignored
- deleting a collection deletes its local memberships
- deleting a library item deletes its local collection memberships
- clearing account data clears both collection stores

## Cloud Sync

Convex is the canonical cloud store for signed-in users. Local writes go through `src/sync/services.ts`, which writes IndexedDB first and then calls Convex mutations when authenticated.

`SyncSetup` subscribes to full snapshots:

- `api.sync.collectionsAll`
- `api.sync.collectionItemsAll`

Those snapshots are applied together through `saveCollectionsSnapshot(...)`, then the in-memory `useCollectionsStore` is updated directly.

This follows the existing local-first sync pattern:

1. The UI writes local state immediately through the Zustand store.
2. Authenticated clients mirror the mutation to Convex.
3. Convex subscriptions hydrate the local cache and reconcile other devices.

## Integrity Rules

Convex does not enforce foreign keys, so collection integrity is maintained explicitly:

- `collections.addItems` verifies the target collection belongs to the current user before inserting memberships.
- `collections.addItems` verifies each `libraryItemId` belongs to the current user before inserting that membership.
- duplicate memberships are de-duplicated by `(userId, collectionId, libraryItemId)`.
- `collections.remove` cascades into `collection_items`.
- `library.remove` and `library.clearAll` cascade into `collection_items`.

Missing library items are skipped rather than failing the whole add operation. Missing collections are treated as invalid and fail server-side, because that indicates stale UI state or a concurrent delete.

## Routing

The collection detail route is:

```text
/library/collection/$id
```

This coexists with:

```text
/library/$id
```

TanStack Router matches more-specific static segments before dynamic segments, so `/library/collection/$id` is safe beside `/library/$id`. Navigation should use path patterns plus params, for example:

```tsx
navigate({
  to: "/library/collection/$id",
  params: { id: collection.collectionId },
});
```

## Future Sharing

Collections are still single-user owned. If shared collections are added later, do not reuse `userId` as the permission boundary for membership. A likely migration path is:

1. add `ownerUserId` to `collections`
2. treat existing `userId` as owner during backfill
3. authorize access through a resource permissions table keyed by `("collection", collectionId)`
4. keep chapter and manga progress scoped to the viewer's own `userId`

See `docs/plans/permissions.md` for the broader permissions plan.
