# Native Auth Flow

How Nemu handles OAuth sign-in on web vs Capacitor (iOS/Android), why the native path is different, and where the threat model still has gaps.

## Web (status quo)

```
User clicks "Sign in with Google"
  → authClient.signIn.social({ provider: "google" })
  → Better Auth redirects the browser tab to Google
  → Google → Better Auth callback (cookie set on .nemu.pm)
  → SPA reloads with session cookie
```

Standard Better Auth crossSubDomainCookies flow. No deep links involved.

## Capacitor (iOS/Android)

The webview cannot redirect off-origin without breaking the SPA shell, and a session cookie set on `.nemu.pm` would not be sent back to a webview running at `capacitor://localhost`. So the native path uses Better Auth's cross-domain plugin: instead of a session cookie, the auth callback emits a short-lived **one-time token** (OTT) which the app exchanges for a session via a custom endpoint.

```mermaid
sequenceDiagram
  participant User
  participant App as Webview (capacitor://localhost)
  participant Browser as @capacitor/browser (SFSafariViewController)
  participant BA as Better Auth (Convex)
  participant Provider as Google / Apple

  User->>App: Click "Sign in with Google"
  App->>App: nonce = crypto.randomUUID(); localStorage[NONCE] = nonce
  App->>BA: signIn.social({ provider, callbackURL: "nemu://auth/callback?nemuNonce=<nonce>", disableRedirect: true })
  BA-->>App: { data: { url: <provider OAuth URL> } }
  App->>Browser: Browser.open({ url })
  Browser->>Provider: User signs in
  Provider-->>BA: callback with code + state
  BA->>BA: validate state (CSRF), mint OTT (3-min, single-use)
  BA-->>Browser: 302 Location: nemu://auth/callback?nemuNonce=<nonce>&ott=<token>
  Browser-->>App: OS routes nemu:// scheme back to the app
  App->>App: native-init.ts dispatches CustomEvent("nemu:deep-link")
  App->>App: sign-in-dialog: verify nemuNonce matches localStorage; clear nonce
  App->>BA: POST /cross-domain/one-time-token/verify { token }
  BA-->>App: 200 + Better-Auth-Cookie header
  App->>App: crossDomainClient persists cookie in localStorage
  App->>App: authClient.getSession() refreshes UI
```

## Components

### Server (`convex/auth.ts`)

- `trustedOrigins` includes `capacitor://localhost`, `https://localhost`, and `nemu://auth/**`. The native scheme is path-scoped so callbackURLs are restricted to the auth path.
- The crossDomain Better Auth plugin emits the `?ott=<token>` query param on the callbackURL. OTTs default to **single-use** with a **3-minute TTL**.

### Client — webview side

- **`src/components/sign-in-dialog.tsx`**:
  - On native, generates a per-flow nonce, persists it under `nemu:oauth-nonce` in localStorage, and threads it through `callbackURL` as `?nemuNonce=…`.
  - Calls `authClient.signIn.social({ provider, callbackURL, disableRedirect: true })` — Better Auth returns the OAuth URL instead of redirecting the webview.
  - Opens that URL in `@capacitor/browser` (SFSafariViewController on iOS, Custom Tab on Android).
  - Listens for the `nemu:deep-link` event, validates the nonce against localStorage (single-use), and redeems the OTT via `POST /cross-domain/one-time-token/verify`.
  - Listens for `browserFinished` so dismissing the in-app browser without completing OAuth clears the loading state.

### Client — native side (`src/lib/native-init.ts`)

- Registers `App.addListener("appUrlOpen", …)`. Filters to `nemu://auth/**` and dispatches a DOM `CustomEvent("nemu:deep-link", { detail: { url, path } })`.
- Closes the in-app browser via `Browser.close()` after the deep link fires.

### Native shells

- **iOS** — `native/ios/App/App/Info.plist` registers `CFBundleURLTypes` with the `nemu` scheme.
- **Android** — `native/android/app/src/main/AndroidManifest.xml` declares an `<intent-filter>` scoped to `<data android:scheme="nemu" android:host="auth"/>`.

## Threat model

| # | Threat | Mitigation today | Residual risk |
|---|---|---|---|
| 1 | Better Auth callback CSRF (state replay) | Better Auth `state` is single-use, server-validated | Low — covered |
| 2 | OTT replay or expiry abuse | Better Auth crossDomain plugin: single-use, 3-min TTL | Low — covered |
| 3 | Unsolicited deep link triggering OTT redemption (malicious app or copy-pasted URL fires `nemu://auth/callback?ott=…`) | **Client-side nonce check**: webview rejects any callback whose `nemuNonce` doesn't match the value stored in localStorage at flow start | Mitigated, but only against *active* injection. Attacker would need to also know the nonce, which never leaves the legitimate webview's localStorage. |
| 4 | **Passive interception of the OAuth callback URL by another app that registered the `nemu://` scheme** | Path-scoped intent-filter (`nemu://auth/*`) narrows the surface, but iOS/Android still allow multiple apps to claim the same scheme + host | **Open.** A second installed app receiving the callback URL has BOTH the nonce and the OTT. It can call `/cross-domain/one-time-token/verify` itself and mint a session for an attacker-controlled client. Only Universal Links / App Links fully solve this. |
| 5 | OTT exchange origin spoofing | Better Auth verifies request origin against `trustedOrigins` | Low — covered, but `trustedOrigins` includes `nemu://auth/**` so any caller able to set that origin can pass the check. Realistically only the OS routes traffic with that origin. |
| 6 | Secrets in the bundle | None on the client; OAuth client secrets live in Convex env | Low — no client-side secrets |

## Migration: Universal Links / App Links (planned)

Goal: replace the custom `nemu://` scheme with HTTPS-based deep links the OS cryptographically binds to the signed app. This fully solves threat #4.

### iOS Universal Links

1. Host `apple-app-site-association` (no extension, JSON, no redirects, served `application/json`) at `https://nemu.pm/.well-known/apple-app-site-association`:
   ```json
   {
     "applinks": {
       "details": [
         {
           "appIDs": ["<TEAMID>.pm.nemu.app"],
           "components": [
             { "/": "/auth/native-callback*" }
           ]
         }
       ]
     }
   }
   ```
2. Add the **Associated Domains** capability to the iOS target with `applinks:nemu.pm`.
3. Update `Info.plist` (`com.apple.developer.associated-domains` entitlement). Re-sign the provisioning profile.
4. Update `signIn.social` callbackURL to `https://nemu.pm/auth/native-callback?nemuNonce=…`.
5. Update `native-init.ts` `appUrlOpen` filter to match the HTTPS path instead of `nemu://`.

### Android App Links

1. Host `assetlinks.json` at `https://nemu.pm/.well-known/assetlinks.json`:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "pm.nemu.app",
       "sha256_cert_fingerprints": ["<APP-SIGNING-CERT-SHA256>"]
     }
   }]
   ```
2. Update the manifest's auth `<intent-filter>` with `android:autoVerify="true"` and `<data android:scheme="https" android:host="nemu.pm" android:pathPrefix="/auth/native-callback"/>`.
3. Same client-side change as iOS — switch callbackURL to the HTTPS path.

### Cleanup once verified

- Drop `"nemu://auth/**"` from `convex/auth.ts` `trustedOrigins`.
- Drop the `nemu` scheme from `Info.plist` `CFBundleURLTypes` and the `<data android:scheme="nemu"/>` intent-filter.
- Keep the `nemuNonce` check or remove (defense-in-depth — small, cheap, can stay).
- Keep this doc updated: move the threat-model table to "Closed" once #4 lands.

## Operational notes

- `nemu:oauth-nonce` is **transient**. It exists only between OAuth start and callback. If it lingers (user crashes mid-flow), the next sign-in overwrites it.
- Better Auth's OTT TTL is 3 minutes — if the user takes longer than that on the provider page, the redemption fails. The dialog surfaces the failure as a toast and the user can retry.
- The `browserFinished` listener fires when the in-app browser is dismissed by the user. We listen for it to clear the loading state; it does NOT distinguish "dismissed" from "completed normally" — the deep-link handler is what marks success.
- The web flow is unchanged by any of this.
