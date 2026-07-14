# Contributing to Nemu

This file records repository-specific development and verification conventions.

## What Nemu Is

Nemu is a local-first content reader built around pluggable source runtimes, IndexedDB storage, and optional Convex-backed cloud sync. It ships as two apps from one monorepo: a web app (React 19 + Vite + TanStack Router) and an Expo React Native mobile app (`apps/mobile`).

## Commands

```bash
bun install                       # also applies the checked-in runtime/CSS patches
bun dev                           # Vite (web) + convex dev, concurrently
bun run service                   # local proxy service (services/proxy)

bun run lint                      # eslint . (root + mobile; see Lint notes below)
bun run typecheck                 # @nemu/core + app tsc -b + convex tsc, all --noEmit
bun run core:typecheck            # typecheck just packages/core

bun run test                      # web, repository contract, and @nemu/core tests
bun test path/to/file.test.ts     # single test file
bun test --coverage               # with coverage

bunx convex codegen               # regenerate committed Convex bindings

bun run build                     # generate-apple-secret + tsc -b + vite build
bun run deploy                    # generate-apple-secret + convex deploy
```

Mobile app (`apps/mobile`) — has its own separate package and toolchain:

```bash
cd apps/mobile
bun run start                     # expo start
bun run ios | bun run android     # expo run:<platform>
bun run typecheck                 # tsc --noEmit (mobile tsconfig)
bun run lint                      # expo lint (independent of root eslint)
bun run test                      # MOBILE suite only — NOT run by root `bun test`
```

### Lint / typecheck gotchas

- **Two test suites are separate.** Root `bun test` (rooted at `src/`) does NOT run `apps/mobile` tests, and vice versa. Verify both when touching shared logic. The root `bun run test` script *does* chain in `@nemu/core` tests (`bun run core:test`), so the shared sync/settings/sources/library tests run alongside the web suite — but `apps/mobile` tests still require `cd apps/mobile && bun run test`.
- **Full lint is a CI gate.** Targeted lint is useful while iterating, but `bun run lint` and the independent mobile lint must both pass before merge.
- **Tests need the vaul submodule.** `bun install` plus `git submodule update --init` (for `vendor/vaul`) are both required or tests fail on missing `vaul`/`zustand`. The `vaul` import is path-aliased to `./vendor/vaul/src` in all tsconfigs.
- **bun `mock.module` leaks across files in one run.** When mocking a module in a test, the mock must export *every* named export of the real module, or later test files in the same run break with "export not found".
- `bun run typecheck` covers three projects (`packages/core`, app, `convex/`); `bun run core:typecheck` isolates just the shared core package.
- Keep commit authorship human-owned. Do not add AI-tool `Co-Authored-By` trailers.

## Monorepo Layout

- `src/` — web app (the primary app). Routed by TanStack Router (`src/router.tsx`, `src/pages/`).
- `apps/mobile/` — Expo React Native app (`@nemu/mobile`), iOS/Android. Uses Expo Router (`app/`) with screens/components/lib under `apps/mobile/src/`.
- `packages/core/` — `@nemu/core`, shared pure-logic (sync mapping helpers, settings) imported by both web and mobile. Exports source TS directly (no build step); changes here affect both apps.
- `convex/` — Convex backend (schema, auth, HTTP actions, sync mutations). `convex/_generated` is generated, git-ignored from lint.
- `services/proxy/` — Bun + Cloudflare Worker proxy. `services/ocr/` — Python OCR service (`./services/ocr/run.sh 8080`).
- `vendor/vaul` — git submodule; the `vaul` package resolves to it via tsconfig path aliases.
- `docs/` — `sources.md`, `collections.md`, `plugins.md` are the source-of-truth docs for those subsystems.

Path aliases (all tsconfigs): `@/*` → `./src/*` (web), `@nemu/core` / `@nemu/core/*` → `./packages/core/src`, `vaul` → `./vendor/vaul/src`. Mobile additionally uses `@/*` → `apps/mobile/src/*` and `@/design-system` (see below).

## Architecture: Local-First Sync Model

This is the core architecture; understanding it is required before changing data flow.

- **Profile-scoped services.** `createServicesContainer(profileId)` (`src/sync/services.ts`) builds the per-profile Zustand stores + data providers. A `ProfileId` is derived from the Convex/Better Auth user id (or a local fallback). The active container is owned by `DataServicesProvider` (`src/data/services-provider.tsx`) and consumed via `useDataServices` / `useStores` / `useProfileId` from `src/data/context.tsx`.
- **Local-first writes.** All reads/writes hit IndexedDB immediately (`src/data/indexeddb.ts`, `src/data/schema.ts`, `src/data/keys.ts`). Stores: library, collections, progress, cache, source settings, plugin data.
- **Convex is canonical cloud state**, mirrored in via sync. `SyncSetup` (`src/sync/setup.tsx`) is a *sibling* to the app tree (not a parent) so its re-renders don't disturb the app. It bridges Convex subscriptions into local IndexedDB + in-memory stores. Cloud↔local mapping lives in `@nemu/core` (`mapCloud*`, `merge*Snapshot`, `toCloudLibrarySaveInput`).
- **Convex HTTP actions** also provide a fallback proxy path (`convex/http.ts`, `convex/proxy.ts`) for APIs that block the worker proxy.

Source of truth for sync behavior: `src/data/services-provider.tsx`, `src/sync/services.ts`, `src/sync/setup.tsx`. For Convex, `convex/` code wins over any conflicting doc — update `convex/schema.ts` validators before changing mutation/query payloads.

## Architecture: Source System

Source runtimes live in `src/lib/sources/`:

- `aidoku/` — Aidoku `.aix` WASM packages run in a worker-backed runtime (`@nemu.pm/aidoku-runtime`). Generally well-supported.
- `tachiyomi/` — Tachiyomi local registry support (`@nemu.pm/tachiyomi-runtime`), much more constrained; some extensions need polyfills/platform APIs that don't map to the browser runtime. Wired in only when `import.meta.env.DEV` and `VITE_TACHIYOMI_LOCAL_PATH` are set (served by a custom Vite plugin in `vite.config.ts`).
- `registry.ts` — `RegistryManager`: built-in Aidoku URL registries, the optional Tachiyomi local registry, and user-added URL registries persisted in IndexedDB.

Nemu does NOT assume every upstream Aidoku/Tachiyomi source runs in its runtime. See `docs/sources.md` for compatibility notes and support policy.

## Architecture: Reader Plugins

Plugin APIs in `src/lib/plugins/`; built-ins registered by `src/lib/plugins/init.ts` (currently `japanese-learning` and `dual-reader`). Types and storage helpers exported from `@/lib/plugins`. See `docs/plugins.md`.

## Mobile App Conventions (`apps/mobile`)

The mobile app aims for 100% UI/UX parity with web (haptics everywhere, matching animations) while keeping a native feel (system fonts, native controls, status-bar immersion in reader).

- **Design system ownership is enforced by ESLint.** `eslint.config.js` marks a set of components (`GlassSurface`, `NemuPressable`, `NemuNativeSwitch`, `PageHeader`, `MobileSheetScaffold`, `MangaCard`, `SourceCard`, …) as owned by `@/design-system`. Mobile code MUST import shared UI from `@/design-system` (the public entry point), not from `@/components/<Name>` or deep `@/design-system/components/*` paths, and must import design tokens/typography/theme/nav helpers from `@/design-system` (not `@/design/*`). Deep imports and `@/design/*` are errors.
- **File conventions:** components are flat `src/components/Mobile*.tsx`; pure logic in `src/lib/*.ts` with a sibling `.test.ts`; hooks as `src/lib/use*.ts`; design tokens in `src/design/tokens.ts`.
- When the same component/logic appears in web and mobile, factor the shared piece out (into `@nemu/core` or a shared primitive) rather than duplicating.
- **Platform seam (`.native.ts`/base split).** Modules that import runtime `expo-*`/`react-native` at module top level (`haptics`, `mobileAuthClient`, `nativeKV`, `nativeCache`, `mobileImageCache`, `mobileAidokuExecutorBridge`, `sourcePackageCache`, …) are split into `Foo.native.ts` (real impl, resolved by Metro on native) and a base `Foo.ts` (no `expo-*`/`react-native` import, resolved by bun's test runner and Expo web). RN behavior and every storage constant (cookie prefix `nemu`, scheme/storage prefixes, SecureStore keys, `nemu-cache`/`nemu-image-cache` dirs, filename encoding, `nemu-mobile.db`) stay byte-for-byte identical in the `.native.ts`; only the base differs. tsc resolves the **base** file for typechecking (it does not resolve the `.native` extension), so the base must keep a type-compatible surface (e.g. same constructor signature, same exported names). Pure logic in a hook that needs `useEventListener`/`expo-*` belongs in a sibling `.ts` with no expo import so it's unit-testable under bun (proven by `nemuAgentSheetReducer.ts`); the hook layers on the expo side-effects.
- **Mobile data is account-scoped and fail-closed.** `MobileDataProvider` (`src/data/mobileData.tsx`) selects a retained account profile before mounting SQLite or source runtimes. The legacy account keeps `nemu-mobile.db`; additional accounts use an opaque, hashed database name. Profile transitions unmount the previous store, reset native source state, and only mount the next `NativeUserDataStore` after the transition completes. Expo web uses the same opaque profile partitioning for local state. Never put raw auth subjects in filenames, cache keys, logs, or source-runtime session ids.
- **Web and mobile deliberately use different local-store implementations but one cloud contract.** Web owns the `createServicesContainer` / IndexedDB path; mobile owns `NativeUserDataStore` plus the write-through `MobileSyncDataStore`. Both consume the same `@nemu/core` mapping and merge helpers (`toCloud*`, `mapCloud*`, `merge*Snapshot`, `mergeInstalledSources`). Do not fork that mapping logic between clients.
- **Tombstone / soft-delete model.** Library items (`inLibrary: false`), source links, collections, collection items, and installed sources (`removed: true`) keep deletion tombstones so last-write-wins snapshots converge across devices. Mobile also persists pending source-link and collection deletions until Convex delivery is observed. Reads filter tombstones from normal UI surfaces; sync and bulk-merge paths must retain them. A newer explicit save/reinstall may revive a tombstone, but unrelated snapshot hydration must not.
- **Mobile uses the pinned third-party JSC on iOS and Android, not Hermes** (`with-third-party-jsc` writes `expo.jsEngine: "jsc"`; this is required by the `@nemu.pm/aidoku-runtime` WASM instantiation path). JSC lacks `BigInt`, `WeakRef`, `FinalizationRegistry`, and worklet optional-chaining/nullish-coalescing, so mobile ships shims: `src/polyfills/bigInt.ts` (number-backed `BigInt`, gated by `__NEMU_BIGINT_SHIMMED__`), `src/polyfills/weakRef.ts` (strong `WeakRef` + no-op `FinalizationRegistry` — note this defeats GC-triggered cleanup, so dependencies relying on `WeakRef` for cleanup will leak), and `babel.config.js` rewrites BigInt literals + transforms worklet syntax for JSC. Never use the number-backed `BigInt` shim where all 64 bits must remain exact; dual-reader hashes use explicit high/low `uint32` words for that reason. Android's non-Intl JSC also exposes a broken native `String.prototype.normalize` that can SIGSEGV inside missing ICU data, so `stringNormalize.android.ts` installs the lazy pure-JS normalization implementation before Expo/router loads. `expo-file-system`'s `File.bytes()` returns corrupted data on JSC, so binary reads go through `base64ToBytes(await file.base64())` (see `src/lib/mobileBase64.ts`); the same workaround is applied in `mobileAidokuExecutorBridge.native.ts`, `MobileMetadataEditorSheet`, and dual-reader secondary image prefetch. If/when `aidoku-runtime` supports Hermes, switching eliminates this whole class of polyfills — until then, do not flip the engine.

## Deployment / Environment

- Frontend proxy base is `https://service.nemu.pm` (`src/config.ts`); the worker source is in `services/proxy/`.
- `bun run deploy` generates the Apple secret then deploys Convex.
- Key env vars (`.env.local`): `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_TACHIYOMI_LOCAL_PATH`. Preview deploys need correctly scoped staging credentials; treat a failed preview as a deployment blocker until its cause is verified.

## Cross-Repo Aidoku Work

Nemu is one of three related repos: this app, `aidoku-js` (WASM runtime; PRs come from the `at-wr` fork), and `aidoku-community-js` (registry CI). Merge order is aidoku-js → publish runtime → community-js → nemu (bump `@nemu.pm/aidoku-runtime`, then drop any temporary cast in the adapter).
