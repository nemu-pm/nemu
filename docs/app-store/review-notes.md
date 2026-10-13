# App Review notes (draft for the "Notes" field and the reviewer phone call)

Fill the bracketed items before submitting. Facts come from the code at this
branch; guideline text was read from
[developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/)
and [offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
on 2026-10-12.

## What nemu is

nemu is a manga/comic **reader**. It reads files that the user imports on the
device (CBZ/ZIP) and content from **source directories the user chooses** (书源目录),
and it adds tools for learning Japanese (text recognition, dictionary, text to
speech, an assistant). nemu ships **no comic content and does not host any**. The
recommended source directory that nemu suggests lists only content that is
verified as openly licensed (for example Pepper&Carrot, CC BY). Users may add other
directories at their own choice.

The app is completely free: no in-app purchases, subscriptions, ads or
tracking.

## What `.aix` source files are (be direct about this)

A source file (书源文件, `.aix`) is a package that the user or a directory
supplies. It contains a **WebAssembly module** (`Payload/main.wasm`) plus JSON
metadata (and, for some sources, small JavaScript snippets) written against the
open Aidoku source API. The **runtime that executes it ships inside the app
binary**; the app downloads and runs these source files, which is why we address
Guideline 2.5.2 explicitly:

- A source can only call a fixed set of host functions: HTTP requests (with an
  SSRF policy that refuses private/loopback addresses unless the user explicitly
  allows a private server such as LANraragi, once that feature ships), HTML parsing, image
  drawing, its own saved settings. It returns data (titles, chapters, page
  image URLs). It cannot add screens, change app features, call native iOS APIs,
  or read other apps' or the app's data.
- WebAssembly runs in an isolated runtime; JavaScript snippets run in a separate
  JavaScriptCore context per source with an evaluation budget (no private SPI is
  used).
- The app's own features are unchanged by what a source returns. We regard this
  as data fetched by a configurable content connector, similar to a feed reader,
  not code that "introduces or changes features or functionality of the app"
  (2.5.2). If App Review classifies sources as plug-ins under 4.7, see "Open
  risks" below.

## Reviewer steps

1. Install and launch. No account is required for reading.
2. [Path per the final sources UI] Add the recommended nemu source
   directory [name/URL once the registry is live], install the **Pepper&Carrot**
   source, open a chapter and read.
3. Optional: import a CBZ from Files (the app does not ship one; [attach a sample
   CBZ to the submission]).
4. Sign in with the demo account (Sign in with Apple or Google):
   **[demo account: email/Apple ID + password to be created and tested]**.
   Signed in, the user can sync the library between devices and use the
   server-backed learning features (assistant chat, read-aloud, cloud text
   recognition). Each of these sends content to a named third party; the policy
   at https://nemu.pm/privacy lists them.
5. Account deletion: Settings > Cloud sync > tap the signed-in account row >
   Delete Account, then confirm in the system alert. It deletes the account, synced data, uploaded covers
   and sessions, and revokes Sign in with Apple tokens.
6. Privacy policy: https://nemu.pm/privacy (also in App Store Connect).

## Permissions (Info.plist strings)

- Photos (NSPhotoLibraryUsageDescription): choose a cover image.
- Microphone and Speech Recognition: dictate a message to the assistant. Both are
  optional; nothing else in the app requires them.
- Local Network (NSLocalNetworkUsageDescription): asked only when the user
  points a self-hosted source (LANraragi) at a server on their own network;
  only that configured host is reachable, and only for that source.
- No camera, location, contacts, tracking (no ATT prompt) or notifications.
- `ITSAppUsesNonExemptEncryption=false`: the app uses only standard TLS/OS
  cryptography (HTTPS, Keychain).

## Guideline answers

- **2.5.2 / 4.7**: see ".aix source files".
- **4.8 Login Services**: Sign in with Apple is offered next to Google, limits
  data to name/email, supports private relay. Signing in is optional.
- **5.1.1(v)**: account deletion in the app, includes Sign in with Apple token
  revocation ([Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
- **5.1.2(i)**: the policy names Anthropic, Google, ElevenLabs, Vercel and the
  other recipients; before the first request from any cloud-AI feature (chat,
  read-aloud, smart match, Japanese clean-up) a one-time sheet asks for consent
  and links the policy. Declining cancels that request; analysis falls back to
  on-device where it exists.
- **1.2 User-generated content**: none. The library and collections are private
  to the user; there is no posting, sharing, comments or chat between users.
- **1.1.4 / content**: nemu hosts no content; the user chooses sources. Adult
  sources are hidden by default behind a toggle in Browse; the toggle is not an age
  gate (see age-rating.md).

## Open risks (owner decision)

1. **4.7**: if reviewers treat `.aix` as "plug-ins", 4.7.1-4.7.5 require content
   filtering, a report mechanism, an index of software with universal links, and an
   age-restriction mechanism. nemu has none of these today for third-party
   directories. Mitigation in this submission: the recommended directory only
   lists verified licensed content; user-added directories are the user's
   responsibility.
2. **Copyright**: sources that point to unlicensed content are the user's choice,
   not nemu's, and nemu does not list them.
3. Demo account, sample CBZ and live recommended directory must exist before
   submission.
