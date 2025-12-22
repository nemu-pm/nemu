# Tachiyomi Extension Development & Testing

This document outlines the strategy for incrementally building and testing Keiyoushi extensions with our Kotlin/JS runtime.

## Strategy

### 1. Extension Prioritization

Extensions are tested in order of **recent commit activity** (descending). Newer/actively maintained extensions:
- Are more likely to work with current website APIs
- Have fewer legacy patterns
- Better represent real-world usage

### 2. Testing Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Pick next untested extension (by commit date)           │
│                         ↓                                   │
│  2. Build: ./gradlew devBuild -Pextension=lang/name         │
│                         ↓                                   │
│     ┌── Build fails → Fix shims → Retry build               │
│     │                                                       │
│  3. Test: bun scripts/test-tachiyomi-source.ts lang-name    │
│                         ↓                                   │
│     ├── All pass → Record success                           │
│     ├── Shim issue → Fix shim → Retest                      │
│     ├── Extension bug → Record as upstream issue            │
│     └── Source down → Record as source_unavailable          │
│                         ↓                                   │
│  4. Update dev/extension-tests.json with results            │
└─────────────────────────────────────────────────────────────┘
```

### 3. Test Categories

| Test | Command | What it validates |
|------|---------|-------------------|
| info | `info` | Extension loads, sources enumerated |
| popular | `popular` | Manga listing works |
| search | `search "query"` | Search with query encoding |
| details | `details <url>` | Manga metadata parsing |
| chapters | `chapters <url>` | Chapter list parsing |
| pages | `pages <url>` | Page URLs extraction |
| read | `read <manga> <ch>` | End-to-end image fetch |
| settings | `settings` | Settings schema extraction |

### 4. Result Classification

- **`pass`**: Feature works correctly
- **`fail_shim`**: Missing/broken runtime shim (our bug)
- **`fail_extension`**: Extension code bug (upstream)
- **`fail_source`**: Source website changed/down
- **`skip`**: Not applicable (e.g., no latest support)

## Commands

### List Extensions by Recent Activity

```bash
bun scripts/list-extensions.ts 50
```

Output:
```
# 50 extensions (sorted by last commit)

2025-12-22 51783e8 vi/goctruyentranhvui
2025-12-21 becfa2d ar/yonabar
2025-12-21 becfa2d en/mangadia
...
```

### Build Extension

```bash
cd packages/tachiyomi-js
./gradlew devBuild -Pextension=en/mangapill
```

### Test Extension

```bash
bun scripts/test-tachiyomi-source.ts en-mangapill info
bun scripts/test-tachiyomi-source.ts en-mangapill popular
bun scripts/test-tachiyomi-source.ts en-mangapill search "one piece"
bun scripts/test-tachiyomi-source.ts en-mangapill details "/manga/..."
bun scripts/test-tachiyomi-source.ts en-mangapill chapters "/manga/..."
bun scripts/test-tachiyomi-source.ts en-mangapill pages "/chapter/..."
bun scripts/test-tachiyomi-source.ts en-mangapill settings
```

### Batch Build Multiple Extensions

```bash
cd packages/tachiyomi-js
./gradlew compileExtensions -Pext=en/mangapill,ja/shonenjumpplus,all/mangadex
```

## Test Results

Results are stored in `dev/extension-tests.json`. Each entry records:

```json
{
  "extension": "ja/ganganonline",
  "testedAt": "2025-12-22T12:00:00Z",
  "buildStatus": "pass",
  "tests": {
    "info": "pass",
    "popular": "pass",
    "search": "pass",
    "details": "pass",
    "chapters": "pass",
    "pages": "pass",
    "read": "pass",
    "settings": "pass"
  },
  "notes": "Fixed explicitNulls and URL encoding for Japanese queries"
}
```

## Common Shim Issues

| Error | Likely Cause | Fix Location |
|-------|--------------|--------------|
| `Unresolved reference 'X'` | Missing class/function shim | `src/jsMain/kotlin/` |
| `MissingFieldException` | JSON config needs `explicitNulls = false` | `keiyoushi/utils/Json.kt` |
| HTTP 400 on non-ASCII | URL encoding broken | `okhttp3/HttpUrl.kt` |
| `ClassCastException` | Type mismatch in shim | Check shim return types |

## Tested Extensions

See `dev/extension-tests.json` for full results.

### Quick Status - Passing

| Extension | Build | Popular | Search | Details | Chapters | Pages | Read | Settings |
|-----------|-------|---------|--------|---------|----------|-------|------|----------|
| all/mangadex | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (12) |
| en/mangapill | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| ja/shonenjumpplus | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ja/ganganonline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ja/comicdays | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ja/comicgardo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ja/corocoroonline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ja/zerosumonline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Quick Status - Build Failed (Missing Shims)

| Extension | Blocker |
|-----------|---------|
| pt/mangalivre | Coroutines, Base64, CryptoAES |
| en/armageddon | Coroutines, SoftReference |

## Platform Limitations

### WebView-based Extensions

Some extensions use Android WebView to:
- Extract auth tokens from localStorage after user login
- Solve captchas interactively
- Handle age verification

**Why it can't work in browser:** Cross-origin security. Nemu (on `nemu.app`) cannot access localStorage or execute JS on another domain (`source.com`). This is a fundamental browser security boundary.

**Affected extensions:** ~30 extensions that require login/auth via WebView.

### Cloudflare-Protected Sources

Many sources use Cloudflare protection (`network.cloudflareClient`). The challenge requires:
1. JavaScript execution in a real browser
2. Setting `cf_clearance` cookie
3. Using that cookie for subsequent requests

**Why it can't work:** Our proxy server can't solve JS challenges, and we can't access cross-origin cookies from Nemu.

**Affected extensions:** ~118 extensions using `cloudflareClient`.

## Future Work: Browser Extension

A companion browser extension (Chrome/Firefox) could solve both problems:

```javascript
// Nemu Browser Extension (future)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getToken') {
    // Access localStorage for any domain user has visited
    chrome.storage.local.get([request.domain], (result) => {
      sendResponse({ token: result[request.domain]?.authorization });
    });
  }
  
  if (request.type === 'getCfCookie') {
    // Get Cloudflare clearance cookie
    chrome.cookies.get({ url: request.url, name: 'cf_clearance' }, (cookie) => {
      sendResponse({ cookie: cookie?.value });
    });
  }
});
```

**Benefits:**
- Enables WebView-dependent extensions (login/auth)
- Enables Cloudflare-protected sources
- User's existing browser sessions are reused
- No separate server/Docker needed

**Status:** Not started. Track in issue tracker.

## Contributing

When testing a new extension:

1. Run all tests documented above
2. If issues found, classify as shim/extension/source
3. Fix shim issues before moving on
4. Update `dev/extension-tests.json`
5. Update the quick status table above

