# Release checklist (local builds)

Releases are built locally: an Xcode Release archive for iOS and a Gradle release
build for Android. Production environment selection is **not** done by a build
service: `apps/mobile/loadRootEnv.cjs` picks the env files from `NODE_ENV`, and
`expo export:embed` (run by Xcode's and Gradle's bundle phases) sets
`NODE_ENV=production`, which reads the root `.env.production.local`. See
`apps/mobile/loadRootEnv.cjs` and the release env contract.

## Before archiving

1. Root `.env.production.local` exists and names the production Convex deployment
   (never `.env.local`, the dev backend).
2. `bun run --cwd apps/mobile preflight:release` passes. The same check also runs
   inside Metro whenever the bundle mode is production (`metro.config.js` ->
   `enforceReleaseEnv`), so an archive or Gradle release that would bake the dev
   backend, an `http` URL or no URL **fails the bundle step**. Development and
   debug bundles are never checked. It prints which rule failed, never the URL.
3. Gates: root `bun run typecheck`, `bun run lint`, `bun test`; mobile
   `typecheck`, `lint`, `test`.
4. **Apple client secrets** (see below) have more than 30 days left.
5. iOS only: `bun run --cwd apps/mobile ocr:models` (downloads the OCR model
   files the `NemuJapaneseLearning` pod bundles; its podspec fails the build
   with this instruction if they are missing), then `pod install` in
   `apps/mobile/ios`.
6. Bump `version` / `buildNumber` in `apps/mobile/app.json`; run
   `bunx expo prebuild --platform ios --no-install` after config changes
   (`expo run:ios` does not re-sync `app.json` into an existing `ios/`).

## Apple client secrets (account deletion depends on them)

Account deletion revokes Sign in with Apple tokens. The Convex env var
`APPLE_CLIENT_SECRET` (and `APPLE_NATIVE_CLIENT_SECRET` if native bundle-id
sign-in is ever used) holds an ES256 JWT that **expires after at most 6 months**
(the script issues 180 days). When it expires, Apple answers `invalid_client`
and `deleteMyAccount` refuses to delete Apple accounts (by design), so
regenerate **before** expiry, every ~5 months:

```bash
# needs APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY or
# APPLE_PRIVATE_KEY_PATH in .env.local (names only; never print values)
npx tsx scripts/generate-apple-secret.ts                         # APPLE_CLIENT_SECRET
APPLE_SECRET_TARGET=native npx tsx scripts/generate-apple-secret.ts  # APPLE_NATIVE_CLIENT_SECRET (needs APPLE_APP_BUNDLE_ID)
```

Run it against the production deployment (`CONVEX_DEPLOYMENT` pointing at prod).
Set a calendar reminder for the date printed by the script's 180-day window.

## iOS: archive and upload

1. Xcode > Product > Archive (Release configuration, scheme `nemu`).
2. Xcode Organizer > Distribute App > App Store Connect > Upload.
   Alternatives Apple documents for uploads: Transporter, or `xcrun altool`
   ([Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds));
   command line: `xcodebuild archive`, then `xcodebuild -exportArchive` with an
   `ExportOptions.plist` (`method` `app-store-connect`, `destination` `upload`).
   Re-check Apple's page before relying on `altool`, whose future is uncertain.
3. Verify the archive: grep `main.jsbundle` for the production deployment name
   (see the release env contract) and review Xcode's privacy report
   (Organizer > archive > Generate Privacy Report) against
   `docs/app-store/privacy-labels.md`.
4. App Store Connect: attach the build, fill privacy labels
   (`privacy-labels.md`), age rating (`age-rating.md`), review notes
   (`review-notes.md`), the privacy policy URL, then submit.

## Android

`./gradlew bundleRelease` (or `assembleRelease`) from `apps/mobile/android`;
the Gradle bundle phase also runs `expo export:embed` with `NODE_ENV=production`,
so the same preflight applies.
