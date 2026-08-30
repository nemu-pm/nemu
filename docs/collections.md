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
  syncGeneration
  collectionId
  name
  createdAt
  updatedAt
  removed
  lastRemovedAt

collection_items
  userId
  syncGeneration
  collectionId
  libraryItemId
  addedAt
  updatedAt
  removed
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

`SyncSetup` subscribes to bounded, generation-fenced paginated snapshots:

- `api.sync.collectionsAllV2`
- `api.sync.collectionItemsAllV2`

It verifies every page belongs to one generation before applying collections and memberships together through `saveCollectionsSnapshot(...)`, then updates the in-memory `useCollectionsStore` directly. The unversioned endpoints remain only for the temporary legacy-client rollout window.

This follows the existing local-first sync pattern:

1. The UI writes local state immediately through the Zustand store.
2. Authenticated clients mirror the mutation to Convex.
3. Convex subscriptions hydrate the local cache and reconcile other devices.

## Integrity Rules

Convex does not enforce foreign keys, so collection integrity is maintained explicitly:

- `collections.addItems` verifies the target collection belongs to the current user before inserting memberships.
- `collections.addItems` accepts an out-of-order membership before its library row arrives, but a library-item removal barrier suppresses memberships older than the latest deletion. This lets offline devices synchronize related writes in either order without reviving a deleted item.
- duplicate memberships are de-duplicated by `(userId, collectionId, libraryItemId)`.
- `collections.remove` cascades into `collection_items`.
- `library.remove` and `library.clearAll` cascade into `collection_items`.

Missing library rows are allowed provisionally so independently queued offline writes can converge; normal UI reads only surface memberships whose library item exists. Missing or removed collections are invalid and fail server-side, because that indicates stale UI state or a concurrent delete.

### Merging library items

Merging duplicate library items is a relationship migration, not a sequence of
independent source-link edits. The surviving item receives the union of active
collection memberships, and chapter/manga progress rows that referenced the
merged-away item are retargeted to the survivor. Locally, those changes share
one IndexedDB transaction with the moved source links and source-item
tombstone, so a crash cannot expose a half-merged library.

Authenticated merges also write a generation-scoped outbox record in that
transaction. Cloud replay is idempotent and ordered: save the survivor and its
links, restore its collection memberships in bounded mutations, start the
leased history-retarget worker, and only then remove the old item. The outbox is
cleared after all phases are accepted, is retried after reconnect/load, and is
discarded atomically with synchronized rows when the account generation resets.
This ordering prevents the old item's membership-removal cascade from deleting
the only copy of a collection relationship. As a final server-side guard, that
bounded removal cascade receives the survivor id and transfers any active
source memberships that this client had not hydrated before tombstoning them.

The merged-away library row remains as a permanent `mergedIntoLibraryItemId`
alias. Merge aliases are bounded, cycle-checked, and resolved to their terminal
survivor by later library saves and collection membership mutations. Unlike an
ordinary LWW deletion, an alias outranks a later clock from an offline tab, so
that tab cannot resurrect the retired item or move a globally keyed source link
back to it. Repeated merges collapse finite alias chains; pre-alias tombstones
without this field retain the older LWW-compatible behavior.

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
