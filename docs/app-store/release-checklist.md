# Release checklist

iOS releases are built locally from a clean worktree, exported to an `.ipa`, and
uploaded with **Transporter** (the owner's choice), under Man To Tang's team
(`58QTKZUJPL`). Production environment selection is **not** done by a build service:
`apps/mobile/loadRootEnv.cjs` picks the env files from `NODE_ENV`, and
`expo export:embed` (run by Xcode's and Gradle's bundle phases) sets
`NODE_ENV=production`, which reads the root `.env.production.local`.

Status on 2026-11-08: a dry run exported `/tmp/tf/export/nemu.ipa` at 04:43, signed
for `pm.nemu`, version 0.1.0, build 1. It predates `HEAD` and has never been uploaded.
**Do not upload it.** The steps below have not been run in this corrected form.

## Before archiving

1. Root `.env.production.local` exists and names the production Convex deployment
   (`oceanic-akita-716`), never `.env.local`, the dev backend.
2. Backend: production Convex was deployed on 2026-11-08 from `816b6eb1`
   (`docs/convex-deploy-pr34.md`). `git diff --stat 816b6eb1 HEAD -- convex` was empty at
   `b08bc868`. Run it again on the release commit, and redeploy if it is not empty.
3. `bun run --cwd apps/mobile preflight:release` passes. The same check runs inside
   Metro for production bundles (`metro.config.js` > `enforceReleaseEnv`), so an archive
   that would bake the dev backend, an `http` URL or no URL **fails the bundle step**. It
   prints which rule failed, never the URL.
4. Gates: root `bun run typecheck`, `bun run lint`, `bun test`; mobile `typecheck`,
   `lint`, `test`.
5. **Apple client secret** (see below) has more than 30 days left.
6. OCR models exist locally: `bun run --cwd apps/mobile ocr:models` if
   `apps/mobile/modules/nemu-japanese-learning/ios/Models/` is empty. The Ichiran
   kernel exists locally: `apps/mobile/modules/nemu-japanese-learning/scripts/vendor-ichiran.sh`
   if `ios/Vendor/` beside it is empty. The podspec fails a Release build if either is
   missing; a build without the kernel recognises text but has no on-device word
   breakdown, so signed out the sentence sheet only asks for sign-in.
7. Bump `version` in `apps/mobile/app.json` when the marketing version changes.

## iOS: clean worktree build

The working script is `/tmp/tf/dryrun.sh`. `/tmp` does not last, and the script as
saved has four problems, so the corrected commands are recorded here:

| In `/tmp/tf/dryrun.sh` | Effect | Corrected below |
|---|---|---|
| reuses `/tmp/tf/wt` if it exists | that worktree is shared with other work and had uncommitted edits on 2026-11-08, so the build would not be clean | new worktree per release |
| does not copy the OCR models, the Ichiran kernel or `.env.production.local` (`/tmp/tf/devbuild.sh` does) | relies on files left there earlier; the kernel never was, so the 2026-11-08 archive has no on-device analysis | copied explicitly |
| if `expo prebuild` fails, rsyncs `ios/` from the main worktree | that `ios/` is stale and still has `NSCameraUsageDescription`, for a feature that is gone | a prebuild failure stops the build |
| `CURRENT_PROJECT_VERSION=<date>` only | **has no effect.** Expo writes a literal `CFBundleVersion` of `1` into `ios/nemu/Info.plist`, and the archive, `.ipa` and export summary all say `1`. A second upload of 0.1.0 would be refused as a duplicate | sets `CFBundleVersion` too |

`node_modules` is copied rather than installed because `bun install` in a fresh worktree
failed with integrity errors (`/tmp/tf/install.log`). Toolchain: see "Which Xcode".

```bash
set -euo pipefail
SRC=/Users/alanye/Development/nemu-wt-appstore-ui   # a checkout with node_modules, models, kernel and env
COMMIT=<release commit>
BUILD=$(date +%Y%m%d%H%M)
OUT=/tmp/tf/rel-$BUILD
export DEVELOPER_DIR=/Applications/<Xcode>.app/Contents/Developer

git -C "$SRC" worktree add --detach "$OUT/wt" "$COMMIT"
cd "$OUT/wt"
cp -cR "$SRC/node_modules" node_modules
cp -cR "$SRC/apps/mobile/node_modules" apps/mobile/node_modules
M=apps/mobile/modules/nemu-japanese-learning/ios/Models
rsync -a "$SRC/$M/" "$M/"
V=apps/mobile/modules/nemu-japanese-learning/ios/Vendor
rsync -a "$SRC/$V/" "$V/"
cp "$SRC/.env.production.local" .

cd apps/mobile
CI=1 npx expo prebuild --platform ios --no-install >"$OUT/prebuild.log" 2>&1
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" ios/nemu/Info.plist
cd ios && pod install >"$OUT/pod.log" 2>&1

xcodebuild -workspace nemu.xcworkspace -scheme nemu -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/nemu.xcarchive" -derivedDataPath "$OUT/dd" archive \
  DEVELOPMENT_TEAM=58QTKZUJPL CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER=3008797f-b9f4-40b2-848e-3e1639ab2ef2 \
  PRODUCT_BUNDLE_IDENTIFIER=pm.nemu CURRENT_PROJECT_VERSION=$BUILD >"$OUT/archive.log" 2>&1
```

Signing material, both installed: certificate `Apple Distribution: Man To Tang
(58QTKZUJPL)` and App Store profile `3008797f-b9f4-40b2-848e-3e1639ab2ef2` (named
"Alan"). Both expire on **2027-09-09**.

A cold build takes about 15 minutes (`docs/handoff/mobile-polish-2026-10.md`). Run it in the background.

## iOS: export

Write `$OUT/export.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>58QTKZUJPL</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>pm.nemu</key><string>3008797f-b9f4-40b2-848e-3e1639ab2ef2</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
```

```bash
xcodebuild -exportArchive -archivePath "$OUT/nemu.xcarchive" -exportPath "$OUT/export" \
  -exportOptionsPlist "$OUT/export.plist" >"$OUT/export.log" 2>&1
```

Check the `.ipa` before uploading:

```bash
P=$(mktemp -d)/Info.plist
unzip -p "$OUT/export/nemu.ipa" Payload/nemu.app/Info.plist > "$P"
plutil -p "$P" | grep -E 'CFBundleVersion|ShortVersion|DTXcodeBuild|UsageDescription|NonExempt'
unzip -p "$OUT/export/nemu.ipa" Payload/nemu.app/main.jsbundle | grep -c oceanic-akita-716
```

- `CFBundleVersion` is the date stamp, not `1`.
- There is **no** `NSCameraUsageDescription`. The usage strings are Photos, Microphone,
  Speech Recognition and Local Network.
- The grep count is at least 1, which shows the production backend is in the bundle.
- `Organizer > archive > Generate Privacy Report` matches `privacy-labels.md`.

## iOS: upload with Transporter

The app record must exist first (owner list below).

1. Open `/Applications/Transporter.app` and sign in with an Apple Account on Man To
   Tang's team.
2. Add `$OUT/export/nemu.ipa`, then Verify, then Deliver.
3. Wait for processing in App Store Connect > TestFlight. Apple's email reports any
   failure. A delivered upload is not yet an accepted build.

Apple documents Transporter as
[supported for all target types](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

## Which Xcode

The dry run used `Xcode-27.2.0-Beta.3` (27B5038j). **Apple has since released Xcode
27.2**, build 27B52, on 2026-10-29 ([releases](https://developer.apple.com/news/releases/)),
so there is no need to upload from the beta.

App Store Connect can refuse a build made with a beta toolchain. The error is `ITMS-90534
Invalid Toolchain`: "New apps and app updates must be built with the public (GM) versions"
([fastlane #5583](https://github.com/fastlane/fastlane/issues/5583)). Older reports show
betas accepted for TestFlight at first and refused later in the same cycle
([forum thread](https://developer.apple.com/forums/thread/685466),
[Bitrise](https://discuss.bitrise.io/t/ios-error-itms-90534-invalid-toolchain-with-xcode-11-gm-seed-1/10220)).
Those reports are old and Apple's upload page does not address betas, so try-and-see is
not a plan for the App Store submission itself.

| Choice | Build | Note |
|---|---|---|
| **`/Applications/Xcode-27.2.0.app` (installed)** | 27B52 | use for every upload: `DEVELOPER_DIR=/Applications/Xcode-27.2.0.app/Contents/Developer` |
| `Xcode-27.1.0-Release.Candidate.app` (installed) | 27A9275 | same build number Apple lists as the 27.1 release, so it should be accepted. Use it if 27.2 cannot be installed in time. Recheck the Duo after building: some behaviour was tuned on iOS 27.2 |
| `Xcode-27.2.0-Beta.3.app` (installed) | 27B5038j | only as a TestFlight attempt; on `ITMS-90534`, rebuild with one of the above. Same commit, new `BUILD` |
| `Xcode.app` (installed, the `xcode-select` default) | 27A266a (27.0) | **never**: the iOS 27.0 SDK leaves out the Duo code. `NemuWindowLayout.podspec` defines `NEMU_SDK_27_1` only for 27.1 or later SDKs |

Change Xcode by setting `DEVELOPER_DIR`, in a new `$OUT`. The
[minimum](https://developer.apple.com/news/upcoming-requirements/) is Xcode 26 with the
iOS 26 SDK, so all of these pass that rule.

## Apple client secret (account deletion depends on it)

Account deletion revokes Sign in with Apple tokens. Sign-in is the web OAuth flow only,
so tokens belong to the Services ID and the Convex env var `APPLE_CLIENT_SECRET` is the
one that matters. `APPLE_NATIVE_CLIENT_SECRET` matters only if a native flow ever returns.
The secret is an ES256 JWT that **expires after at most 6 months** (the script issues
180 days). When it expires, Apple answers `invalid_client` and `deleteMyAccount` refuses
to delete Apple accounts (by design), so regenerate it **before** expiry, every 5 months
or so:

```bash
# needs APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY or
# APPLE_PRIVATE_KEY_PATH in .env.local (names only; never print values)
npx tsx scripts/generate-apple-secret.ts
```

Run it against the production deployment (`CONVEX_DEPLOYMENT` pointing at prod), and set
a calendar reminder for the date in the script's 180-day window.

## Owner / Tiger: App Store Connect

**Account Holder only** means Apple's page limits it to that role. Check which role
Tiger has.

### Account

- [ ] **Sign the latest agreement** (Business). Account Holder only. An app
  [cannot be added until this is done](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app).
- [ ] **Paid Apps Agreement, tax, banking:** the
  [Paid Apps Agreement](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements)
  is for selling apps or in-app purchases, and nemu has neither, so it should not be
  needed. Apple's page does not explicitly address tax and banking for a free app. Skip
  unless App Store Connect asks.
- [ ] **EU trader status** (Business > Agreements > Compliance > Digital Services Act;
  Account Holder or Admin). [Everyone must declare](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements),
  and it is a self-assessment. A trader's address, phone and email are shown publicly on
  the product page, and the certificate suggests an individual account, so this means Man
  To Tang's personal details. Decide deliberately. A non-trader needs no contact details,
  and EU customers are told consumer rights don't apply.
- [ ] **Who owns nemu?** [Guideline 5.2.1](https://developer.apple.com/app-store/review/guidelines/)
  expects submission by whoever owns or licenses the rights. The repo has no `LICENSE`
  file and the seller shown will be Man To Tang, so make sure that arrangement is settled.

### App record

- [ ] **Create the app** (Account Holder, Admin or App Manager): iOS, name `nemu`
  ([fallbacks](listing.md)), primary language English, bundle ID `pm.nemu` (the App ID
  exists on the profile; it can't change after a build is uploaded), SKU such as
  `nemu-ios` (it can't change), User Access as you prefer.
- [ ] **Fill the [listing](listing.md)** in en, zh-Hans and ja; categories; copyright.
- [ ] **Decide the support URL and email.** No page exists and Apple requires real
  contact information. This is a blocker; see `listing.md`.
- [ ] **Privacy:** policy URL `https://nemu.pm/privacy`, then the labels from
  `privacy-labels.md`.
- [ ] **Age rating** from `age-rating.md`; **content rights** answer from `listing.md`.
- [ ] **Price and availability:** Free. **Decide on China mainland.** App Store Connect
  has [ICP filing statuses](https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-submission-statuses/)
  that block sale there without a filing number. Third-party guides say a foreign developer
  has difficulty getting one, and Apple publishes no list of which apps need it. Recommended:
  turn off China mainland for 0.1.0. The zh-Hans listing still serves other regions.

### Build and TestFlight

- [ ] **Export compliance:** the build sets `ITSAppUsesNonExemptEncryption=false`, so
  [no question or document should be needed](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance).
  If asked: no non-exempt encryption. The app uses HTTPS and system cryptography
  (Keychain, `expo-crypto`), and no native module of its own calls CryptoKit or
  CommonCrypto. Apple leaves the legal determination to the developer, so the owner
  should confirm it; [one report](https://developer.apple.com/forums/thread/802746)
  describes being asked anyway.
- [ ] **Add internal testers** and attach the build.
- [ ] **[Test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information):**
  Beta App Description (`listing.md`), **Feedback Email** (needs a real address, not
  chosen yet), and for external groups the TestFlight App Review contact and notes.
- [ ] **External testers** go through TestFlight App Review, so the 4.7 question can come
  up there first. Use the notes in `review-notes.md`.

### Submission

- [ ] **App Review contact:** name, email, and phone in international format with a plus
  sign (+852 for Hong Kong).
- [ ] **Notes:** paste the block from `review-notes.md`.
- [ ] **Demo account:** create a Google account that does not stop at a device prompt and
  does not expire. Sign-in itself is optional, but sync and the AI features need it. Fill
  the bracket in the notes.
- [ ] **Screenshots:** retake and upload per `screenshots.md`.

### Backend and services

- [ ] **Log retention:** finish the Axiom stream and OCR rotation, or change the policy
  (`log-retention.md`).
- [ ] **Delete a disposable test account** in production, once each with Apple and Google.
- [ ] **Apple and Google sign-in in production:** confirm the Apple Services ID return URL
  and that the Google OAuth consent screen is published, not in testing. Not checkable
  from the repo.
- [ ] **Google AI key is on a paid plan** (free-tier traffic may train Google products) and
  **ElevenLabs retention** is known (`data-flows.md`, open items).
- [ ] **`ocr.nemu.pm` auth:** deploy `services/ocr-gateway`, or accept that the host
  checks no sign-in.
- [ ] **Web parity, if `nemu.pm` will be linked anywhere:** the welcome wizard and "bypass
  Cloudflare" strings. Also fix the `www.nemu.pm` certificate and the GitHub description of
  `nemu-pm/source-registry`, which still says "nemu recommended".

## After approval

- `docs/app-store/*` carries the facts for the next version. Update What's New, which
  is required from the second version on.
- Duo screenshots become [required in April 2027](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
  for apps built with the iOS 27.1 SDK or later.

## Android

`./gradlew bundleRelease` (or `assembleRelease`) from `apps/mobile/android`. The Gradle
bundle phase also runs `expo export:embed` with `NODE_ENV=production`, so the same
preflight applies. Android is not part of this submission.
