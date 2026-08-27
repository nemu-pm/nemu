# Contributing to Nemu

This file records repository-specific development and verification conventions.

## What Nemu Is

Nemu is a local-first content reader built around pluggable source runtimes, IndexedDB storage, and optional Convex-backed cloud sync. Today it ships one app from this monorepo: a web app (React 19 + Vite + TanStack Router), backed by the shared `@nemu/core` package. The Expo React Native mobile app (`apps/mobile`) lands in a follow-up PR; `packages/core` is shaped to be consumed by it.

## Commands

```bash
bun install                       # also applies the checked-in runtime/CSS patches
bun dev                           # Vite (web) + convex dev, concurrently
bun run service                   # local proxy service (services/proxy)

bun run lint                      # eslint . (see Lint notes below)
bun run typecheck                 # @nemu/core + app tsc -b + convex tsc, all --noEmit
bun run core:typecheck            # typecheck just packages/core

bun run test                      # web, repository contract, and @nemu/core tests
bun test path/to/file.test.ts     # single test file
bun test --coverage               # with coverage

bunx convex codegen               # regenerate committed Convex bindings

bun run build                     # generate-apple-secret + tsc -b + vite build
bun run deploy                    # generate-apple-secret + convex deploy
```

### Lint / typecheck gotchas

- **Root `bun run test` covers the web suite plus `@nemu/core`.** Root `bun test` is rooted at `src/`; the `bun run test` script chains `bun test ./tests` (repository contract tests) and `bun run core:test`, so the shared sync/settings/sources/library tests run alongside the web suite.
- **Full lint is a CI gate.** `.github/workflows/ci.yml` runs `bun install --frozen-lockfile`, then `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run build` on every pull request and on pushes to `master`. Targeted lint is useful while iterating, but full `bun run lint` must pass before merge. `--frozen-lockfile` also means a dependency change is only mergeable with a matching `bun.lock` update committed.
- **Tests need the vaul submodule.** `bun install` plus `git submodule update --init` (for `vendor/vaul`) are both required or tests fail on missing `vaul`/`zustand`. The `vaul` import is path-aliased to `./vendor/vaul/src` in all tsconfigs.
- **bun `mock.module` leaks across files in one run.** When mocking a module in a test, the mock must export *every* named export of the real module, or later test files in the same run break with "export not found".
- `bun run typecheck` covers three projects (`packages/core`, app, `convex/`); `bun run core:typecheck` isolates just the shared core package.
- Keep commit authorship human-owned. Do not add AI-tool `Co-Authored-By` trailers.

## Monorepo Layout

- `src/` — web app (the primary app). Routed by TanStack Router (`src/router.tsx`, `src/pages/`).
- `packages/core/` — `@nemu/core`, shared pure-logic (sync mapping helpers, settings). Consumed by the web app today and by the mobile app once it lands. Exports source TS directly (no build step).
- `convex/` — Convex backend (schema, auth, HTTP actions, sync mutations). `convex/_generated` is generated, git-ignored from lint.
- `services/proxy/` — Bun + Cloudflare Worker proxy. `services/ocr/` — Python OCR service (`./services/ocr/run.sh 8080`).
- `vendor/vaul` — git submodule; the `vaul` package resolves to it via tsconfig path aliases.
- `docs/` — `sources.md`, `collections.md`, `plugins.md` are the source-of-truth docs for those subsystems.

Path aliases (all tsconfigs): `@/*` → `./src/*` (web), `@nemu/core` / `@nemu/core/*` → `./packages/core/src`, `vaul` → `./vendor/vaul/src`.

## Architecture: Local-First Sync Model

This is the core architecture; understanding it is required before changing data flow.

- **Profile-scoped services.** `createServicesContainer(profileId)` (`src/sync/services.ts`) builds the per-profile Zustand stores + data providers. A `ProfileId` is derived from the Convex/Better Auth user id (or a local fallback). The active container is owned by `DataServicesProvider` (`src/data/services-provider.tsx`) and consumed via `useDataServices` / `useStores` / `useProfileId` from `src/data/context.tsx`.
- **Local-first writes.** All reads/writes hit IndexedDB immediately (`src/data/indexeddb.ts`, `src/data/schema.ts`, `src/data/keys.ts`). Stores: library, collections, progress, cache, source settings, plugin data.
- **Convex is canonical cloud state**, mirrored in via sync. `SyncSetup` (`src/sync/setup.tsx`) is a *sibling* to the app tree (not a parent) so its re-renders don't disturb the app. It bridges Convex subscriptions into local IndexedDB + in-memory stores. Cloud↔local mapping lives in `@nemu/core` (`mapCloud*`, `merge*Snapshot`, `toCloudLibrarySaveInput`).
- **Convex HTTP actions** also provide a fallback proxy path (`convex/http.ts`, `convex/proxy.ts`) for APIs that block the worker proxy.
- **Tombstone / soft-delete model.** Library items (`inLibrary: false`), source links, collections, collection items, and installed sources (`removed: true`) keep deletion tombstones so last-write-wins snapshots converge across devices. Reads filter tombstones from normal UI surfaces; sync and bulk-merge paths must retain them. A newer explicit save/reinstall may revive a tombstone, but unrelated snapshot hydration must not.

Source of truth for sync behavior: `src/data/services-provider.tsx`, `src/sync/services.ts`, `src/sync/setup.tsx`. For Convex, `convex/` code wins over any conflicting doc — update `convex/schema.ts` validators before changing mutation/query payloads.

## Architecture: Source System

Source runtimes live in `src/lib/sources/`:

- `aidoku/` — Aidoku `.aix` WASM packages run in a worker-backed runtime (`@nemu.pm/aidoku-runtime`). Generally well-supported.
- `tachiyomi/` — Tachiyomi local registry support (`@nemu.pm/tachiyomi-runtime`), much more constrained; some extensions need polyfills/platform APIs that don't map to the browser runtime. Wired in only when `import.meta.env.DEV` and `VITE_TACHIYOMI_LOCAL_PATH` are set (served by a custom Vite plugin in `vite.config.ts`).
- `registry.ts` — `RegistryManager`: built-in Aidoku URL registries, the optional Tachiyomi local registry, and user-added URL registries persisted in IndexedDB.

Nemu does NOT assume every upstream Aidoku/Tachiyomi source runs in its runtime. See `docs/sources.md` for compatibility notes and support policy.

## Architecture: Reader Plugins

Plugin APIs in `src/lib/plugins/`; built-ins registered by `src/lib/plugins/init.ts` (currently `japanese-learning` and `dual-reader`). Types and storage helpers exported from `@/lib/plugins`. See `docs/plugins.md`.

## Mobile App

The Expo React Native app is not part of this branch. It lands in a follow-up PR, which adds `apps/mobile`, its toolchain, its own conventions section here, and its CI jobs.

Until then, treat `@nemu/core` as the seam: when logic will be needed by both clients, put it in `packages/core` (pure TS, no DOM/`react-native` imports) rather than in `src/`.

## Deployment / Environment

- Frontend proxy base is `https://service.nemu.pm` (`src/config.ts`); the worker source is in `services/proxy/`.
- `bun run deploy` generates the Apple secret then deploys Convex.
- Key env vars (`.env.local`): `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_TACHIYOMI_LOCAL_PATH`. Preview deploys need correctly scoped staging credentials; treat a failed preview as a deployment blocker until its cause is verified.

## Cross-Repo Aidoku Work

Nemu is one of three related repos: this app, `aidoku-js` (WASM runtime; PRs come from the `at-wr` fork), and `aidoku-community-js` (registry CI). Merge order is aidoku-js → publish runtime → community-js → nemu (bump `@nemu.pm/aidoku-runtime`, then drop any temporary cast in the adapter).
