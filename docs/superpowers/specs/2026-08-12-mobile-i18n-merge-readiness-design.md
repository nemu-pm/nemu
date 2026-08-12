# Mobile i18n and Merge Readiness Design

Date: 2026-08-12

## Objective

Bring the Nemu mobile application to feature-complete Aidoku-first readiness with complete English, Traditional Chinese, and Japanese localization, minimal mobile-only architecture, verified iOS and Android simulator behavior, and reviewable pull requests that satisfy every merge gate. The pull requests must be ready to merge but must not be merged as part of this work.

This design intentionally excludes Tachiyomi native source execution and store-submission administration. Tachiyomi requires a separate native execution design, and store-account work is not required to demonstrate Aidoku-first feature completeness. Vercel preview failures are also excluded as an accepted environment-configuration limitation; the main deployment path is known to work and the preview organization is not accessible to the user.

## Completion Contract

The work reaches 100% only when all of the following are true:

1. Every in-scope Aidoku workflow is represented in a feature inventory with an implementation, automated coverage, and iOS Simulator plus Android Emulator evidence.
2. English, Traditional Chinese, and Japanese have identical translation-key coverage, valid interpolation, deterministic fallback behavior, and no unintended user-facing hardcoded strings.
3. Language selection persists, takes effect without stale UI, survives restart, and is respected by onboarding, navigation, settings, errors, source discovery, reader controls, accessibility labels, and notifications owned by the app.
4. Mobile-only code has no verified dead exports, duplicate helpers, obsolete compatibility paths, or duplicated state ownership. Cleanup must be evidence-driven and covered by existing or new tests.
5. Shared pure logic lives in `@nemu/core`; mobile retains React Native presentation, device persistence, source sandboxing, and platform integration. No generic framework or abstraction is added without at least two current consumers.
6. Automated validation, native compilation, production export, simulator scenarios, accessibility checks, and dependency review pass with no unresolved P3-or-higher findings.
7. The prerequisite core/backend PR and the mobile PR are independently understandable and sequentially ready to merge. They remain unmerged.

## Pull Request Structure

Use the smallest useful stack: two pull requests.

### Prerequisite: shared core and backend

The first PR contains the existing shared-core extraction, Convex synchronization changes, web adaptations, contracts, and their tests. Its purpose is to establish platform-neutral behavior that mobile consumes. Review focuses on compatibility, account isolation, generation fencing, bounded synchronization, data migrations, and unchanged web behavior.

### Mobile: PR #15

PR #15 contains the Expo application, native Aidoku sandbox, mobile persistence and synchronization adapters, mobile UI, localization, cleanup, and verification evidence. During stacked review its base may be the prerequisite branch so its diff contains only mobile work. It can return to `master` after the prerequisite is merged by a maintainer, but this work will not perform either merge.

The stack must not grow beyond these two PRs unless review discovers a security-critical boundary that cannot be reviewed safely in either one. Corrective work should otherwise use focused commits within the appropriate PR.

## Architecture Boundaries

### Shared domain layer

`packages/core` owns deterministic, platform-neutral operations: synchronization planning and merging, source setting interpretation, OAuth helpers, library presentation rules, reader alignment logic, and reusable source utilities. It cannot import React Native, Expo, browser storage, or native modules.

### Mobile application layer

`apps/mobile/src` owns navigation, screen composition, localized presentation, user interaction, mobile persistence adapters, authentication orchestration, background synchronization, image/cache coordination, and reader/plugin integration. Screens may coordinate feature modules, but they must not duplicate domain algorithms already available in `@nemu/core`.

Large components are split only when a boundary produces a concrete review, test, lifecycle, or reuse benefit. File size alone is not sufficient reason to introduce another abstraction.

### Native Aidoku boundary

`apps/mobile/modules/nemu-aidoku` owns untrusted AIX execution, process/runtime isolation, native HTTP mediation, filesystem constraints, cookie isolation, resource limits, and cancellation. JavaScript calls it through the existing narrow bridge. Invalid source output, unsafe addresses, oversized payloads, timeouts, and runtime failures must fail closed and surface a localized actionable error without exposing credentials.

### Localization boundary

`apps/mobile/src/lib/mobileI18n.ts` remains the authoritative typed mobile catalog unless implementation evidence shows that splitting data files improves validation without adding runtime complexity. Application code consumes typed strings and interpolation helpers rather than raw keys or ad hoc fallback text.

Build-time or test-time validation enforces:

- exact key parity across `en`, `zh`, and `ja`;
- placeholder parity for each translated value;
- complete coverage of the declared `MobileStrings` shape;
- rejection of missing, extra, or empty translations where an empty value is not intentional;
- a controlled allowlist for non-localized literals such as product names, source-provided content, URLs, identifiers, and developer diagnostics.

## Functional Scope

The Aidoku-first feature inventory covers:

- first launch, language selection, source recommendations, and onboarding completion;
- cloud authentication, local-only use, profile isolation, sign-out choices, and legacy import/reset flows;
- registry discovery, AIX installation, updates, deletion, source settings, OAuth, and supported source actions;
- browse, filters, search, paginated listings, details, chapter lists, source switching, and error recovery;
- library, collections, membership editing, metadata overrides, history, progress, downloads, and refresh/update behavior;
- reader modes, right-to-left behavior, zoom, progress restoration, controls, chapter switching, image failures, and lifecycle persistence;
- supported reader plugins, including dual reader and Japanese-learning surfaces;
- foreground/background synchronization, offline behavior, restart recovery, cache/data management, and account switching;
- theming, large text, VoiceOver/TalkBack labels, reduced motion where applicable, safe areas, keyboard behavior, and loading/empty/error states.

Basic-login and web-login source settings are in scope only if the Aidoku runtime exposes a safe native handler for them. Unsupported settings must be described accurately and disabled rather than simulated. OAuth remains in scope and requires an on-device callback test.

## Data and Error Flow

User actions flow from a localized screen or component into one mobile orchestration function. Pure decisions are delegated to `@nemu/core`; persistence uses the current profile-scoped mobile store; cloud mutations pass through account and generation fences; source operations pass through the native Aidoku sandbox. State changes emit existing mobile data events so subscribed surfaces refresh without parallel state ownership.

Failures are classified at their actual boundary:

- validation failures remain local and explain the required correction;
- source/network failures preserve current data and offer retry where safe;
- auth or account-identity changes cancel stale work and fail closed;
- sync generation or storage corruption prevents unsafe subscription or mutation and presents recovery guidance;
- native sandbox policy violations terminate the operation without leaking secrets or partial artifacts;
- unexpected render failures reach the localized mobile error boundary.

Logs may contain stable operation identifiers and categories, but not tokens, credentials, raw account subjects, or source-setting secrets.

## Redundancy and Complexity Policy

Cleanup begins with evidence from TypeScript, ESLint, dependency analysis, test coverage, call-site search, and review. A candidate is removed when it is unused, fully duplicated by another path, or retained only for a no-longer-supported behavior. Its tests are deleted only if they exclusively cover the removed behavior; otherwise tests are migrated to the surviving implementation.

The work does not perform broad naming, formatting, folder, design-system, or state-management rewrites. Existing patterns are preferred. A new hook, coordinator, adapter, or component is justified only by a current lifecycle boundary, platform boundary, independently testable policy, or repeated behavior.

## Verification Design

### Automated gates

Both PRs must pass the relevant Bun tests, lint, TypeScript checks, contract tests, native unit tests that are wired into build targets, production Expo exports, and iOS/Android native compilation. Expo Doctor dependency drift is resolved or documented with current upstream compatibility evidence. Security audit findings are triaged by reachability and runtime impact; reachable high-severity findings are fixed before readiness.

Localization tests scan catalogs and user-visible mobile surfaces. Existing source-text tests are retained only when they protect a real native integration contract; behavior tests are preferred for application logic.

### Simulator matrix

Verification uses at least one supported current iPhone simulator and one supported current Android emulator. Each platform runs the same scripted scenario matrix against a controlled account and testable Aidoku sources. Evidence records platform and OS version, build commit, scenario result, relevant logs, and screenshots for key states.

The matrix includes fresh install, all three languages, restart persistence, onboarding, source installation and OAuth callback, browse/search/filter pagination, manga and chapter loading, library and collections, reader modes and restoration, downloads/offline access, background/foreground transitions, account switching, sync recovery, plugins, destructive confirmations, dynamic text, screen-reader labels, dark/light appearance, loading states, empty states, and recoverable failures.

Any scenario that cannot be exercised because an external service is unavailable is not silently marked passed. It receives a deterministic local substitute when that tests the same application boundary; otherwise it remains an explicit readiness blocker.

## Review and Readiness Process

Review proceeds by boundary rather than by file count:

1. shared data contracts, migrations, and web compatibility;
2. authentication, profile isolation, synchronization, and destructive operations;
3. native Aidoku sandbox security, HTTP policy, resource limits, and lifecycle;
4. source discovery and settings;
5. library, collections, history, downloads, and reader behavior;
6. plugins, localization, accessibility, and UX consistency;
7. build configuration, dependencies, CI, and release artifacts.

Each boundary receives a focused self-review and relevant verification evidence. All actionable findings are fixed or explicitly shown to be out of scope. PR descriptions list user-visible behavior, architectural boundaries, migration risk, commands run, simulator evidence, dependency/audit disposition, known accepted limitations, and merge order.

The final state is:

- both PRs are no longer drafts;
- required checks other than the accepted Vercel preview exception are green;
- review comments and threads are resolved;
- no P3-or-higher issue remains;
- the prerequisite PR can be merged first and PR #15 can follow without additional code changes;
- no merge command, merge API, auto-merge setting, or equivalent action is invoked.

## Baseline Evidence

The isolated implementation branch starts at PR #15 head `3df9d2dad29117d5c7749c911050b2ef0d809e80`. At design approval, the baseline passes 1,356 mobile tests and 297 web, Convex-contract, and shared-core tests with zero failures. Known pre-implementation findings are Expo dependency drift, dependency-security advisories requiring reachability triage, three mobile lint warnings, patch whitespace, unwired iOS policy tests, and the absence of a repeatable cross-platform simulator scenario harness.
