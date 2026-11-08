# Convex deploy for PR #34

**Deployed** to production (`oceanic-akita-716`) on 2026-11-08 from
`alan/pick-local` at `816b6eb1`, ahead of PR #34's merge, so the TestFlight
build has its backend. Schema validation passed; the push added the two
`r2_uploads` indexes and deleted none. After #34 merges, redeploying from
master only picks up later `convex/` changes.

This file records what that deploy changed and how the mobile app copes with a
backend that lags it.

Nothing needs migrating: every new field is optional and the new table starts
empty.

## What changes

New public functions:

- `accountDeletion.deleteMyAccount` (action): deletes the signed-in user's
  rows, R2 objects and auth records, revoking Sign in with Apple tokens first.
- `settings.saveSourceDirectory`, `settings.saveLocalArchiveVolume`: sync the
  source-directory list and imported-archive metadata (never the files).
- `r2.generateUploadUrl` is now a plain mutation (same `{}` → `{ key, url }`
  shape as the component's) that records the uploader in `r2_uploads`.

Changed arguments (all additive, all optional):

- `history.save` / `history.saveBatch`: `resetAt` (Mark as Unread). A save
  that carries a newer reset moves the work's `manga_progress` summary back to
  the newest chapter still read, or clears `lastReadSourceChapterId`.
- `settings.saveInstalledSource` (and the installed-source validator):
  `selfHosted: { kind: "komga" | "kavita" | "suwayomi", server }`.

Schema (all optional or new):

- New table `r2_uploads` (`by_user`, `by_key`).
- `settings`: `sourceDirectories`, `localArchiveVolumes`, installed source
  `selfHosted`.
- `chapter_progress.resetAt`.
- `manga_progress.lastReadSourceChapterId` becomes optional (absent once every
  chapter of a work is marked unread).

Sync version: `sync.generation` reports `chapterProgressIntraPageVersion: 2`
(`CHAPTER_PROGRESS_SYNC_VERSION`), was 1. Version 2 means "resetAt accepted";
the mobile app also reads it as "PR #34's functions are deployed".

Signed-in only now (`requireAuth` added): `ai_metadata.*`,
`japanese_learning.normalize`, R2 uploads. `ai_metadata`, `nemu_chat` and
`tts` no longer log titles, prompts, model output or error text.

Nothing is removed.

## Compatibility with the web app live on master

Checked against master at `50b28a33`:

- Sync version 2: master's web enables intra-page sync for `version >= 1`
  (`supportsChapterProgressIntraPageSync`), so 2 behaves exactly like 1 for it.
  It never sends `resetAt`.
- Optional `lastReadSourceChapterId`: master's web schema already has it as
  `z.string().optional()` and the library pages null-check it.
- `resetAt` on returned `chapter_progress` rows: an extra field master's web
  ignores. When master's web later pushes older reading for a chapter that was
  marked unread, the server's merge discards it (it was recorded before the
  reset), so a web tab cannot undo a Mark as Unread.
- R2 upload: same argument and return shape; `useUploadFile(api.r2)` keeps
  working for signed-in users.
- `ai_metadata.findChineseTitle`/`findChineseDescription` still accept
  `englishTitle` (now unused).

**Behaviour change on the web**: a signed-out web visitor can no longer use the
AI metadata lookups (metadata match and add-source drawers), Japanese
Learning's text normalisation, or cover upload; those calls now fail with
"Not authenticated". Signed-in users are unaffected. If signed-out use matters,
the web needs to hide or sign-in-gate those entry points (not done in PR #34).

## Mobile against master's backend (before the deploy)

For reference, what the TestFlight build does until the deploy lands:

- It sends no `resetAt`, `saveSourceDirectory`, `saveLocalArchiveVolume`, or
  self-hosted source while `sync.generation` reports version 1. Those stay on
  the device and sync in the first pass after the version turns 2.
- Delete Account says deletion is not available yet and that the account was
  not deleted; it sends nothing. A missing function at call time reads the
  same way. It never reports success.

## Risks

- Apple revoke picks credentials by the token's audience. Web and mobile both
  sign in through the OAuth redirect (`signIn.social`), so tokens belong to
  the Services ID and use `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET`, which
  production has. `APPLE_APP_BUNDLE_ID` / `APPLE_NATIVE_CLIENT_SECRET` (unset
  on production) matter only if native Sign in with Apple is adopted; without
  them a native token's deletion would fail closed
  (`ACCOUNT_DELETION_APPLE_UNAVAILABLE`), deleting nothing.
- The signed-out web regression above.
- `r2_uploads` only knows uploads made after the deploy. Deletion also finds
  older covers through `library_items`, but an older object no longer
  referenced by a library item is not found.

## Verify afterwards

1. `npx convex function-spec` (or the dashboard's Functions list) shows
   `accountDeletion:deleteMyAccount`, `settings:saveSourceDirectory`,
   `settings:saveLocalArchiveVolume`.
2. Dashboard → run `sync:generation` as a signed-in user: it returns
   `chapterProgressIntraPageVersion: 2`.
3. Web (master build), signed in: library loads, reading progress saves,
   and a cover upload works.
4. Mobile (TestFlight), signed in: add a source directory, then check the
   user's `settings` row has `sourceDirectories`. Mark a chapter as unread and
   check its `chapter_progress` row has `resetAt`, and the web shows it unread.
5. Delete a throwaway account from the mobile Account page: the toast says
   it was deleted, and its rows are gone from `library_items`,
   `chapter_progress` and `settings`.
