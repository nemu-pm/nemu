# nemu

Nemu is a content reader built around pluggable source runtimes, local-first data storage, and optional Convex-backed sync.

## Architecture

- Frontend: React 19 + Vite + TanStack Router.
- State: Zustand stores created from profile-scoped service containers.
- Local data: IndexedDB for library, collections, progress, cache, source settings, and plugin data.
- Sources: Aidoku WASM sources plus a Tachiyomi local registry in development.
- Backend: Convex for auth, sync, proxy HTTP actions, and related app services.
- Reader extensions: built-in reader plugins registered from `src/lib/plugins`.

## Project Layout

```text
src/
  components/      shared UI
  data/            IndexedDB stores and profile-scoped data providers
  hooks/           app hooks
  lib/             sources, plugins, metadata, settings, reader utilities
  pages/           route screens
  stores/          Zustand store factories
  sync/            sync setup, services container, transport types

convex/            Convex functions, schema, auth, HTTP actions
services/proxy/    Bun + Cloudflare Worker proxy service
services/ocr/      Python OCR service
scripts/           local scripts and build helpers
tests/fixtures/    reusable test fixtures
```

## Source System

Source implementations live under `src/lib/sources/`.

- `aidoku/`: Aidoku `.aix` packages executed in a worker-backed runtime.
- `tachiyomi/`: Tachiyomi local registry support for development workflows.
- `registry.ts`: `RegistryManager` for built-in and user-added registries.

Source support is intentionally limited. Nemu does not assume every upstream Aidoku source or Tachiyomi extension can run in the browser runtime. Aidoku is generally easier to support; Tachiyomi is much more constrained because some extensions depend on polyfills or platform APIs that do not map cleanly to a browser environment.

The registry manager currently wires in:

- built-in Aidoku URL registries
- a Tachiyomi local registry when `import.meta.env.DEV` and `VITE_TACHIYOMI_LOCAL_PATH` are set
- user-added URL registries persisted in IndexedDB

See `docs/sources.md` for compatibility notes, build-report references, and the intended support policy.

## Sync Model

Nemu is local-first.

- Local reads and writes go through profile-scoped services created by `createServicesContainer(...)`.
- `DataServicesProvider` owns the active services container for the current profile.
- `SyncSetup` bridges Convex subscriptions into local IndexedDB and in-memory stores.
- Convex persists canonical cloud data for library items, collections, chapter history/progress, and installed sources.

Prefer the code in `src/data/services-provider.tsx`, `src/sync/services.ts`, and `src/sync/setup.tsx` as the source of truth for sync behavior.

See `docs/collections.md` for the collections data model, sync flow, and integrity rules.

## Reader Plugins

Reader plugin APIs live in `src/lib/plugins`.

- built-in plugins are registered by importing `src/lib/plugins/init.ts`
- plugin types and storage helpers are exported from `@/lib/plugins`
- current built-ins are `japanese-learning` and `dual-reader`

See `docs/plugins.md` for the current plugin API.

## Development

```bash
# install dependencies
bun install

# app + convex dev
bun dev

# local proxy service
bun run service

# lint and typecheck
bun run lint
bun run typecheck

# tests
bun test
bun test --coverage

# production build
bun run build
```

OCR development:

```bash
./services/ocr/run.sh 8080
```

## Deployment Notes

- `bun run deploy` runs the Apple secret generation step and deploys Convex functions.
- The proxy worker source is in `services/proxy/`.
- The frontend uses `https://service.nemu.pm` as the proxy base in `src/config.ts`.

## Useful Environment Variables

- `VITE_CONVEX_URL`
- `VITE_TACHIYOMI_LOCAL_PATH`

Some flows also require OCR or proxy-specific environment/configuration depending on what you are testing.
