# Self-hosted server sources (mobile)

nemu for iOS and Android has built-in sources for servers the user runs
themselves: **Komga**, **Kavita** and **Suwayomi**. They are app code,
not downloaded `.aix` packages: nothing is fetched and executed to support
them. A reviewer sees app features; the only network a server source performs
is to the one address its owner typed in.

The web app is a different product and is out of scope.

Code: `apps/mobile/src/lib/selfHosted/`. Each backend is written from the
server's own published API (Komga's OpenAPI at `/v3/api-docs`, Kavita's
`openapi.json` and wiki), recorded against real servers in `fixtures/`, and
shares no code with any other app's implementation.

## Identity

A server is an ordinary installed source:

| field        | value                                                    |
| ------------ | -------------------------------------------------------- |
| `registryId` | `self-hosted`                                            |
| `sourceId`   | `komga.<slug>`, `kavita.<slug>` (`-1`, `-2`, ... on collision) |
| `id`         | `self-hosted:<sourceId>`, the canonical source key       |
| `selfHosted` | `{ kind, server }`, e.g. `{ "komga", "http://192.168.1.20:25600" }` |

Several servers of one kind are several sources. `<slug>` comes from the
display name when the server is added; the key is chosen once and never
changes.

The ids `komga*`, `kavita*`, `suwayomi*`, `local` and `local-archive` are
reserved. An imported `.aix` or a directory entry with one of them is refused
(`isReservedSourceId`), and the package load plan refuses to run a package under
one whatever record claims it, including a row synced from another device. A
package can therefore never impersonate a server source, inherit its login or
its local-network grant, or collide with an installed server's key.

## What is stored, and where

- **The row** (kind, address, display name, `hasAuthentication`, `disabled`)
  lives in `installed_sources` like any source and **syncs** with the account.
  `selfHosted` is an optional field of the synced installed-source record
  (`convex/schema.ts`, `convex/settings.ts`, `packages/core/src/sync.ts`).
- **The login** (`username`, `password`, `apiKey`) is stored through the
  per-source settings vault, keyed by the canonical source key. The vault keeps
  it in the iOS Keychain / Android Keystore, device-only, behind a thin SQLite
  marker. It is **never synced**, never written to plain AsyncStorage, never part
  of the synced row. Resetting a source's settings, signing out and clearing
  device data already remove it. This is the same store a source's own login
  uses.
- **Kavita session tokens** live in memory only. A rejected token is replaced by
  signing in again once per request; no refresh token is stored.
- **Cover URLs** (persisted in library entries and synced) never contain a
  secret. Kavita page images authenticate with a key in the query string, so that
  key is added to the request at fetch time inside the executor
  (`modifyImageRequest`), never to a stored URL or page list.

## Local-network access

Native networking refuses private, loopback and reserved destinations for
sources. A server source gets one narrow exception, the same one LANraragi has:

- exactly the host and port of the address on **its own row**, never a value a
  package declares and never a setting;
- for **its own scope only**: the profile-scoped execution key
  `<profile>::self-hosted:<sourceId>` (`resolveMobileLocalNetworkAllowanceTargets`,
  applied by `MobileLocalNetworkAllowanceBridge`);
- loopback, unspecified, multicast, reserved and cloud-metadata space stay
  blocked even for a granted host (DNS rebinding included); a disabled or
  removed source loses its grant.

Every request of the source carries that cookie scope (`createNativeTransport`).
Image downloads run in a shared pipeline that knows nothing about the source, so
the executor records each exact image URL it hands out (`imageScopes.ts`) and the
pipeline looks that exact string up; a package cannot name such a URL, so it can
never borrow a server's grant. The same lookup exempts those URLs from the
http-to-https upgrade of source image URLs, because a home server is plain http.

While a server is being added its address has no row yet; the connection test
creates a throwaway scope covering exactly that address and revokes it when the
test ends (`connectionTest.ts`).

## Sync across devices

The row syncs, the login does not. A second device receives the source with its
address and no login and treats it as **needing sign-in**: while the row says
`hasAuthentication` and the vault holds nothing, every operation fails with a
localized "this server's login isn't on this device" message
(`selfHostedNeedsSignIn`, `executorSource.ts`). Opening the source's settings
(the same form it was added with) and saving restores it.

## Library entries and renaming or removing a server

Library entries, progress and chapter keys are keyed by
`(registryId, sourceId, mangaId)`: the key, never the name.

- **Rename**: only `name` changes. Entries and progress stay attached.
- **Change address or login**: same key; the cached session, cached image
  requests and the old native cookies are dropped.
- **Remove**: the row is tombstoned like any uninstalled source. Its settings (the
  login) are reset. Entries keep their identity and show as having no source, as
  they do for any removed source. The key stays reserved: a new server with the
  same name gets `-1`, so entries of the old server can never attach to a
  different one.

## UI

The only new UI is the "Built-in sources" group in the Add Source sheet (Komga,
Kavita) and one native setup form per server (address, name, username and
password, or API key). The form connects first and stores nothing if the server
cannot be reached or rejects the login. A server's Settings entry (Browse
context menu, Settings > Sources) opens the same form.

## Suwayomi

Written against the server's GraphQL API (`/api/graphql`). Listings are the server's Library (manga marked in-library) and All; search filters by title; chapters come from the server's own chapter list (fetched from the source on first open); pages are `/api/v1/...` URLs fetched with the same Basic header. Auth is Basic (the server's BASIC_AUTH mode) or none; the JWT `UI_LOGIN` mode is not supported.
