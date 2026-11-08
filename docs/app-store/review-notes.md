# App Review notes

Checked against the code at `b08bc868` and the archived `Info.plist` on 2026-11-08.
Guideline text was read from
[developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/)
on the same day. Run the steps below on the final build before submitting: the
button labels come from the English strings, not from a walkthrough of that build.

## Paste into App Review Information > Notes

The field holds [up to 4000 bytes](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).
This block fits. Fill the bracket first.

```text
WHAT NEMU IS
nemu is a manga reader. It reads the sources and servers the user adds, CBZ/ZIP files the user imports, and a built-in directory of open-licensed examples called Example Sources. nemu hosts no comics. There are no in-app purchases, ads or tracking.

TRY IT WITH NO ACCOUNT
1. Fresh install. Get Started > choose a language > Next.
2. On Add Sources, NDL Public Domain Picks is already selected. Tap Install & Continue, then Start Reading.
3. Open the Browse tab > NDL Public Domain Picks. It lists seven Edo and Meiji works from the National Diet Library of Japan, public domain, read through NDL's IIIF service.
4. Open a work, for example Fugaku Hyakkei, then a volume. It reads right to left: the next page is on the left.
5. Other examples: Browse > + lists Pepper&Carrot (CC BY 4.0), Mini Fantasy Theater (CC BY-SA 4.0) and Little Nemo in Slumberland (public domain). A title's info shows its licence.

LANRARAGI NEEDS YOUR OWN SERVER
Browse > + also lists LANraragi. It has no content of its own. Install it and open it: there is nothing to read until a server address is entered in its settings (Base URL), and we provide no server. Connect your server in the same list does the same for other self-hosted servers. The local network permission is asked only if the user enters an address on their own network.

IPAD AND IPHONE DUO
iPad is supported in all orientations, with two-page spreads in landscape. On iPhone Duo, use the outer display (one page, controls in the vertical bar, an optional cover view) or the inner display (two-page spreads).

DIRECTORIES THE USER ADDS
No third-party directory is listed or linked in the app. A user can add their own: Browse > + > Add Source Directory, by pasting an HTTPS address, or through a nemu:// or aidoku:// link, which always shows the address and asks first. The app says that nemu does not host or review them.

WHAT A SOURCE IS (GUIDELINES 2.5.2, 4.7)
A source is an .aix package: a WebAssembly module and JSON metadata, sometimes with small JavaScript snippets, in the open Aidoku source format. The runtime is in the app binary and downloads and runs these packages. A source can only call a fixed set of host functions: HTTP (private addresses refused unless the user configured that server), HTML parsing, image drawing and its own settings. It returns data: titles, chapters, page URLs. It cannot add screens, change features, reach native iOS APIs or read other data. WebAssembly runs in an isolated runtime, and JavaScript in a separate JavaScriptCore context per source with an evaluation budget. We regard this as a content connector, like a feed reader.

ACCOUNT (OPTIONAL)
Sign in with Apple or Google from Settings. Both use the web sign-in flow. Signing in adds sync and the server-backed learning features (chat, read-aloud, cloud text recognition). A one-time notice asks for consent before the first cloud AI request and links the privacy policy. Demo account: [demo Google account and password].
Delete: Settings > Account > Delete Account. This removes the account, synced data, uploaded covers and sessions, and revokes Sign in with Apple tokens.

PERMISSIONS
Photos (choose a cover), Microphone and Speech Recognition (dictate to Nemu Chat), Local Network (a server the user enters). All are optional. No camera, location, contacts, tracking or notifications. Background modes (fetch, processing) are for library sync when signed in.
```

## Permissions as built

Read from `Payload/nemu.app/Info.plist` in the 2026-11-08 archive, which a clean
prebuild of `apps/mobile/app.json` generated:

| Key | Value or use |
|---|---|
| `NSPhotoLibraryUsageDescription` | choose a cover image |
| `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` | dictate to Nemu Chat |
| `NSLocalNetworkUsageDescription` | a server whose address the user entered |
| `NSCameraUsageDescription` | **absent** (`expo-image-picker` has `cameraPermission: false`) |
| `UIBackgroundModes` | `fetch`, `processing`, from `expo-background-task`, used by `mobileBackgroundSync` |
| `CFBundleURLSchemes` | `nemu`, `aidoku` (add-directory links), `neko` (source OAuth callback only) |
| `ITSAppUsesNonExemptEncryption` | `false` |
| `UIDeviceFamily` / `MinimumOSVersion` | iPhone and iPad / 16.4 |

The cover view on the Duo's outer display is a plain page view. It is not the
removed Show Cover on Outer Display feature, which used the camera.

## Guideline answers

- **2.5.2 / 4.7**: see "What a source is". 4.7.2 and 4.7.3 hold: a source reaches
  no native API and no privacy permission.
- **4.8 Login Services**: Sign in with Apple sits beside Google, limits data to
  name and email and supports private relay. 4.8 asks for an equivalent login
  option and does not ask for the native sheet, so the web flow meets it.
- **5.1.1(v)**: reading needs no account, and deletion is in the app at
  Settings > Account. The same guideline says an app may not store tokens "to
  social networks" off the device. Better Auth keeps the Google and Apple tokens
  in Convex, and the policy says so. Neither is a social network login in the
  sense that sentence seems to mean, but expect the question.
- **5.1.2(i)**: the policy names each recipient, including third-party AI. A
  one-time sheet (`MobileAiConsentHost`) asks before the first cloud AI request
  and links the policy. Declining cancels that request.
- **1.2**: not user-generated content. The library and collections are private,
  with no posting, sharing or chat between users. Nemu Chat is an assistant.
- **5.2 / content**: the built-in directory lists only public-domain works, works
  their rights holder publishes under a free licence, and a connector for the
  user's own server. Each entry's basis is recorded in
  [`curation/entries.json`](https://github.com/nemu-pm/source-registry/blob/main/curation/entries.json).
- **Explicit content**: sources a directory marks explicit are hidden until the
  user turns on a switch in Browse. It is a preference, not an age gate (see
  `age-rating.md`).

## Open risks (owner decision)

1. **4.7 is the main one.** It names plug-ins, and if App Review counts `.aix`
   packages as plug-ins, nemu does not meet 4.7.1 (filtering and reporting), 4.7.4
   (an index with universal links; nemu has custom schemes and no associated
   domains) or 4.7.5 (an age restriction based on verified or declared age) for
   directories a user adds. The mitigation is that the built-in directory is
   curated and nothing else is listed or linked. There is no fallback answer if
   Review insists; it would need product work.
2. **`nemu.pm` shows a different product from the app.** The web welcome wizard
   (`src/components/welcome-wizard.tsx`) offers named third-party sources, and
   `src/locales/en.json` still says "bypass Cloudflare protection". A reviewer who
   follows a marketing URL to the site root sees that, so `listing.md` leaves that URL
   empty. `/privacy` sits outside the web shell and is clean. The app's About links only
   to `/privacy` and to the public GitHub repo, whose README describes Aidoku and
   Tachiyomi support.
3. **Reachable content versus the rating.** See `age-rating.md`.
4. **Demo account.** Sign-in is Apple or Google only, so the reviewer needs a Google
   account that does not stop at a device prompt, and it [must not expire](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).
   If Google challenges the login, attach a recording of sign-in and deletion.
5. **Deletion is untested in production.** Run it once with a disposable Apple
   account and once with Google. It needs a valid `APPLE_CLIENT_SECRET` (see
   `release-checklist.md`). An expired secret stops deletion for Apple accounts.
6. **The policy's 30-day log statement may not be true yet.** See `log-retention.md`.
