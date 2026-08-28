# Contributing to Nemu

This file records repository-specific development and verification conventions.

## What Nemu Is

Nemu is a local-first content reader built around pluggable source runtimes and optional Convex-backed cloud sync. This monorepo ships a React 19 web app backed by IndexedDB and an Expo React Native app (`apps/mobile`) backed by SQLite. Both clients consume shared contracts and pure logic from `@nemu/core`.

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

bun run mobile:dev                # start the Expo development server
bun run mobile:typecheck          # typecheck apps/mobile
bun run --cwd apps/mobile lint    # lint the mobile app
bun run --cwd apps/mobile test    # run the mobile test suite
```

### Lint / typecheck gotchas

- **Root `bun run test` covers the web suite plus `@nemu/core`.** Root `bun test` is rooted at `src/`; the `bun run test` script chains `bun test ./tests` (repository contract tests) and `bun run core:test`, so the shared sync/settings/sources/library tests run alongside the web suite.
- **Full lint is a CI gate.** `.github/workflows/ci.yml` validates the shared core and web app; `.github/workflows/mobile.yml` validates the Expo app and runs native jobs when native or prebuild inputs change. Targeted lint is useful while iterating, but both root and mobile lint must pass before merge. `--frozen-lockfile` also means a dependency change is only mergeable with a matching `bun.lock` update committed.
- **Tests need the vaul submodule.** `bun install` plus `git submodule update --init` (for `vendor/vaul`) are both required or tests fail on missing `vaul`/`zustand`. The `vaul` import is path-aliased to `./vendor/vaul/src` in all tsconfigs.
- **bun `mock.module` leaks across files in one run.** When mocking a module in a test, the mock must export *every* named export of the real module, or later test files in the same run break with "export not found".
- `bun run typecheck` covers three projects (`packages/core`, app, `convex/`); `bun run core:typecheck` isolates just the shared core package.
- Keep commit authorship human-owned. Do not add AI-tool `Co-Authored-By` trailers.

## Monorepo Layout

- `src/` — web app (the primary app). Routed by TanStack Router (`src/router.tsx`, `src/pages/`).
- `apps/mobile/` — Expo Router React Native app, native source modules, and mobile-specific tests and prebuild plugins.
- `packages/core/` — `@nemu/core`, shared pure logic (sync mapping helpers, settings, source OAuth, and reader alignment). Consumed by both apps and exported as source TS (no build step).
- `convex/` — Convex backend (schema, auth, HTTP actions, sync mutations). `convex/_generated` is generated, git-ignored from lint.
- `services/proxy/` — Bun + Cloudflare Worker proxy. `services/ocr/` — Python OCR service (`./services/ocr/run.sh 8080`).
- `vendor/vaul` — git submodule; the `vaul` package resolves to it via tsconfig path aliases.
- `docs/` — `sources.md`, `collections.md`, `plugins.md` are the source-of-truth docs for those subsystems.

Root path aliases: `@/*` → `./src/*` (web), `@nemu/core` / `@nemu/core/*` → `./packages/core/src`, `vaul` → `./vendor/vaul/src`. The mobile tsconfig maps `@/*` to `apps/mobile/src/*` while retaining the same `@nemu/core` aliases.

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

The Expo Router app lives in `apps/mobile`. Its local-first store uses account-scoped SQLite databases, while `MobileSyncDataStore` mirrors cloud-backed domains through the same generation-fenced merge contracts used by the web client. Aidoku packages execute through the platform modules in `apps/mobile/modules/nemu-aidoku`; Tachiyomi packages may sync as metadata but remain explicitly unsupported for live execution until a native bridge exists.

Source settings are a credential boundary. Mobile SQLite may contain only the opaque `mobileSourceSettingsVault` marker; the value itself lives in Expo SecureStore under a database-scoped, device-only Keychain/Android Keystore namespace. Database migration v6 moves legacy rows before checkpointing and vacuuming plaintext remnants. Source-authored Aidoku runtime patches follow the same rule: iOS migrates legacy `UserDefaults` values into device-only Keychain entries, while Android migrates legacy `SharedPreferences` values into AES-GCM envelopes whose key is non-exportable in Android Keystore. Profile/source reset paths must clear both layers. Never add a fallback that silently writes credentials to SQLite, `UserDefaults`, or ordinary `SharedPreferences` when secure storage fails; fail the login/settings operation instead.

Mobile source OAuth authorization and token endpoints must be credential-free HTTPS URLs. PKCE callbacks must contain a verifier-bound authorization code (hybrid callbacks exchange the code rather than accepting their token field), and Android must not accept bearer tokens through a collision-prone private-use scheme. Keep any compatibility exception narrower than these invariants and cover it in `mobileSourceOAuthLogic.test.ts`.

Keep shared logic in `packages/core` as pure TypeScript with no DOM or `react-native` imports. Keep platform code behind `.native.ts` seams or Expo modules so the mobile Bun suite can exercise the portable behavior. Changes to `app.json`, prebuild plugins, native modules, assets, dependencies, or checked-in patches must pass the Android and iOS jobs in `.github/workflows/mobile.yml`.

## Deployment / Environment

- Frontend proxy base is `https://service.nemu.pm` (`src/config.ts`); the worker source is in `services/proxy/`.
- `bun run deploy` generates the Apple secret then deploys Convex.
- Key env vars (`.env.local`): `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_TACHIYOMI_LOCAL_PATH`. Preview deploys need correctly scoped staging credentials; treat a failed preview as a deployment blocker until its cause is verified.

## Cross-Repo Aidoku Work

Nemu is one of three related repos: this app, `aidoku-js` (WASM runtime; PRs come from the `at-wr` fork), and `aidoku-community-js` (registry CI). Merge order is aidoku-js → publish runtime → community-js → nemu (bump `@nemu.pm/aidoku-runtime`, then drop any temporary cast in the adapter).
