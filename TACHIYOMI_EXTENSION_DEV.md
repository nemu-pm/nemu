# Tachiyomi Extension Development & Testing

This document outlines the strategy for incrementally building and testing Keiyoushi extensions with our Kotlin/JS runtime.

## Quick Start

**Build a single extension:**
```bash
cd packages/tachiyomi-js
./gradlew devBuild -Pextension=en/mangapill --configuration-cache
```

**Test it:**
```bash
# Quick info check
bun scripts/test-tachiyomi-source.ts en-mangapill info

# Test popular manga
bun scripts/test-tachiyomi-source.ts en-mangapill popular

# Search
bun scripts/test-tachiyomi-source.ts en-mangapill search "one piece"

# Interactive REPL (explore freely)
bun scripts/test-tachiyomi-source.ts en-mangapill interactive
```

**One-liner build + test:**
```bash
cd packages/tachiyomi-js && ./gradlew devBuild -Pextension=en/mangapill -q && bun ../../scripts/test-tachiyomi-source.ts en-mangapill popular
```

**CI-style test (JSON output):**
```bash
bun dev/test-extension.ts en/mangapill
```

Output goes to: `dev/tachiyomi-extensions/en-mangapill/`

> **Tip:** Config cache makes rebuilds fast (~0.5s warm). Just re-run the same `devBuild` command after code changes.

---

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
│  4. Update dev/tachiyomi-extension-tests.json with results            │
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

### 4. Acceptance Criteria

An extension is considered **working** when it passes the CLI test script reliably:

```bash
bun scripts/test-tachiyomi-source.ts <ext> popular   # Returns manga list
bun scripts/test-tachiyomi-source.ts <ext> search    # Returns search results  
bun scripts/test-tachiyomi-source.ts <ext> details   # Parses manga metadata
bun scripts/test-tachiyomi-source.ts <ext> chapters  # Returns chapter list
bun scripts/test-tachiyomi-source.ts <ext> pages     # Returns page URLs
bun scripts/test-tachiyomi-source.ts <ext> cover     # Fetches cover with source headers
```

The `cover` test is critical - it verifies that source headers (Referer, User-Agent, etc.) are correctly passed through the proxy. Many CDNs return 403 without proper headers.

The CLI is the source of truth. If it works in CLI, it works in production.

### 5. Result Classification

- **`working`**: All CLI tests pass
- **`partial`**: Some tests fail (note which)
- **`not_working`**: Build or critical tests fail

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
./gradlew devBuild -Pextension=en/mangapill --configuration-cache
```

The `--configuration-cache` flag enables Gradle's configuration cache for faster rebuilds (~0.5s warm vs ~15s cold).

### Test Extension

```bash
bun scripts/test-tachiyomi-source.ts en-mangapill info
bun scripts/test-tachiyomi-source.ts en-mangapill popular
bun scripts/test-tachiyomi-source.ts en-mangapill search "some manga name you saw in popular"
bun scripts/test-tachiyomi-source.ts en-mangapill details "/manga/..."
bun scripts/test-tachiyomi-source.ts en-mangapill chapters "/manga/..."
bun scripts/test-tachiyomi-source.ts en-mangapill pages "/chapter/..."
bun scripts/test-tachiyomi-source.ts en-mangapill settings
```

### Batch Build Multiple Extensions

```bash
cd packages/tachiyomi-js
./gradlew compileExtensions -Pext=en/mangapill,ja/shonenjumpplus,all/mangadex --configuration-cache --parallel
```

## Test Results

Results are stored in `dev/tachiyomi-extension-tests.json`:

```json
{
  "extension": "ja/ganganonline",
  "testedAt": "2025-12-22",
  "status": "working",
  "comment": "GigaViewer multisrc."
}
```

## Common Shim Issues

| Error | Likely Cause | Fix Location |
|-------|--------------|--------------|
| `Unresolved reference 'X'` | Missing class/function shim | `src/jsMain/kotlin/` |
| `MissingFieldException` | JSON config needs `explicitNulls = false` | `keiyoushi/utils/Json.kt` |
| HTTP 400 on non-ASCII | URL encoding broken | `okhttp3/HttpUrl.kt` |
| `ClassCastException` | Type mismatch in shim | Check shim return types |
| `Invalid regular expression: unmatched ]` | ksoup Unicode regex mode | Preprocessor transforms |
| `Lone quantifier brackets` | Unescaped `]` in regex | Preprocessor transforms |

### Preprocessor Transforms for ksoup/Regex Issues

ksoup compiles CSS selectors to JavaScript regexes with Unicode flag (`u`), which has stricter escape rules:

1. **CSS attribute selectors with `\=`**: Transform `a[href*=type\\=]` → `a[href*=\"type=\"]`
2. **Regex with unescaped `]`**: Transform `(\\[.*?])` → `(\\[.*?\\])`
3. **Empty negated character class**: Transform `[^]` → `[^\\]`

These transforms are in `packages/tachiyomi-js/buildSrc/src/main/kotlin/ExtensionBuildTasks.kt` under `CodeTransformations`.

## Tested Extensions

Inspect `dev/tachiyomi-extension-tests.json` for full results.

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
4. Update `dev/tachiyomi-extension-tests.json`
5. Update the quick status table above

