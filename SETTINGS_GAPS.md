# Settings Implementation Gaps

This document tracks missing features in the source settings system compared to the native Aidoku implementation.

## Missing Setting Types

### 1. `button` - Action Button

**What it does:** Displays a button that triggers a WASM function when clicked.

**Schema fields:**
```json
{
  "type": "button",
  "key": "clear_cache",
  "title": "Clear Cache",
  "notification": "clearCache",  // REQUIRED - name of action to trigger
  "destructive": true,           // Optional - red styling
  "confirmTitle": "Clear Cache?", // Optional - show confirm dialog
  "confirmMessage": "This will delete all cached data."
}
```

**How Swift handles it:**
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift:645-668` - UI
- Calls `source.handleNotification(notification: notification)` on click
- This invokes WASM export `handle_notification(string_descriptor)`

**Implementation plan:**
1. Add `ButtonSetting` control to `source-settings-sheet.tsx`
2. Add optional confirmation dialog using `AlertDialog`
3. Add `handleNotification(key: string)` to `AsyncAidokuSource` interface
4. In `runtime.ts`, call `exports.handle_notification` WASM function

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Add ButtonControl component
- `src/lib/sources/aidoku/settings-types.ts` - Update ButtonSetting interface  
- `src/lib/sources/aidoku/async-source.ts` - Add handleNotification method
- `src/lib/sources/aidoku/source.worker.ts` - Expose handleNotification
- `src/lib/sources/aidoku/runtime.ts` - Call WASM handle_notification export

**Complexity:** Medium

---

### 2. `link` - External URL Link

**What it does:** Opens a URL in a browser when clicked.

**Schema fields:**
```json
{
  "type": "link",
  "key": "website",
  "title": "Visit Website",
  "url": "https://example.com",
  "external": true  // Optional - open in new tab vs in-app browser
}
```

**How Swift handles it:**
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift:672-683`
- Opens URL in SFSafariViewController (in-app) or UIApplication.shared.open (external)

**Implementation plan:**
1. Add `LinkControl` to `source-settings-sheet.tsx`
2. Use `window.open(url, '_blank')` for external links

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Add LinkControl component
- `src/lib/sources/aidoku/settings-types.ts` - Update LinkSetting interface

**Complexity:** Easy (< 20 lines)

---

### 3. `login` - Authentication Control

**What it does:** Provides authentication UI for sources requiring login.

**Schema fields:**
```json
{
  "type": "login",
  "key": "auth",
  "title": "Login",
  "method": "basic",  // "basic" | "oauth" | "web"
  "logoutTitle": "Sign Out",
  
  // For method: "basic"
  "useEmail": true,   // Show email field instead of username
  
  // For method: "web" 
  "url": "https://example.com/login",
  "urlKey": "loginUrl",  // Or read URL from this setting key
  "localStorageKeys": ["token", "session"],  // Keys to extract after login
  
  // For method: "oauth"
  "tokenUrl": "https://example.com/oauth/token",
  "callbackScheme": "aidoku",
  "pkce": true
}
```

**How Swift handles it:**
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift:686-1070`
- **Basic:** Shows username/password form, calls `source.handleBasicLogin()`
- **Web:** Opens WebView, extracts cookies/localStorage after login
- **OAuth:** Handles OAuth flow with optional PKCE

**Storage convention:**
- `{key}` = "logged_in" (indicates logged in state)
- `{key}.username` = username
- `{key}.password` = password (for basic auth)

**WASM exports involved:**
- `handle_basic_login(key, username, password) -> bool` - For basic auth sources

**Implementation plan:**

**Phase 1 - Basic Auth:**
1. Add `LoginControl` with username/password form
2. Store credentials in settings store with `.username`/`.password` suffix
3. Call WASM `handle_basic_login` if source exports it

**Phase 2 - Web Auth:**
1. Open login URL in popup/iframe
2. Monitor for redirect or URL pattern match
3. Extract cookies and localStorage keys
4. Store extracted values in settings

**Phase 3 - OAuth:**
1. Implement OAuth flow with PKCE support
2. Handle callback URL parsing
3. Token storage and refresh

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Add LoginControl
- `src/lib/sources/aidoku/settings-types.ts` - Update LoginSetting interface
- `src/lib/sources/aidoku/async-source.ts` - Add handleBasicLogin method
- `src/lib/sources/aidoku/source.worker.ts` - Expose handleBasicLogin
- `src/lib/sources/aidoku/runtime.ts` - Call WASM handle_basic_login export
- New: `src/components/login-web-view.tsx` - For web auth flow

**Complexity:** High (OAuth/Web auth are complex)

---

## Missing Features on Existing Types

### 4. `notification` Field - Change Events

**What it does:** When a setting changes, fires a notification to the WASM source.

**Where it's defined:**
```json
{
  "type": "switch",
  "key": "darkMode",
  "title": "Dark Mode",
  "notification": "onDarkModeChanged"  // <-- this field
}
```

**How Swift handles it:**
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift:202-227`
- Debounces change (500ms)
- Calls `source.handleNotification(notification: notification)`
- Also posts to NotificationCenter

**Implementation plan:**
1. In `source-settings-sheet.tsx`, after calling `setSetting()`:
   - Check if setting has `notification` field
   - If yes, call `source.handleNotification(notification)` (debounced)

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Add notification handling
- Need access to source instance or a way to call handleNotification

**Complexity:** Medium (requires wiring source instance to UI)

---

### 5. `refreshes` Field - Content Refresh

**What it does:** Triggers UI refresh after setting change.

**Schema:**
```json
{
  "type": "select",
  "key": "lang",
  "title": "Language",
  "refreshes": ["content", "listings", "settings", "filters"]
}
```

**Values:**
- `"content"` - Refresh manga content/chapters
- `"listings"` - Refresh source listings
- `"settings"` - Reload settings page
- `"filters"` - Reload filter options

**How Swift handles it:**
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift:211-215`
- Posts `Notification.Name("refresh-\(refresh)")` for each value
- Source settings page listens for `refresh-settings`:
  `vendor/Aidoku/Aidoku/iOS/New/Views/Source/SourceSettingsView.swift:90-94`

**Implementation plan:**
1. Define refresh event types
2. After setting change, emit events for each `refreshes` value
3. Source browse page should listen and reload

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Emit refresh events
- `src/pages/source.tsx` or similar - Listen for refresh events
- May need an event bus or React context

**Complexity:** Medium

---

### 6. Page Icons

**What it does:** Shows an icon next to page setting title.

**Schema:**
```json
{
  "type": "page",
  "title": "Advanced",
  "icon": {
    "type": "system",  // "system" | "url"
    "name": "gear",    // SF Symbol name for system
    "url": "...",      // URL for custom icon
    "color": "#FF0000" // Optional tint color
  },
  "items": [...]
}
```

**Implementation plan:**
1. Map common SF Symbol names to Lucide/Hugeicons equivalents
2. For URL icons, render `<img>`
3. Apply color tint if specified

**Files to modify:**
- `src/components/source-settings-sheet.tsx` - Update PageControl

**Complexity:** Easy

---

## Priority Order

1. **`link`** - Easy win, commonly used
2. **`button` + `notification`** - Required for sources with clear cache, etc.
3. **`refreshes`** - Better UX for language/filter changes  
4. **`login` (basic)** - Enables authenticated sources
5. **Page icons** - Polish
6. **`login` (web/oauth)** - Complex, fewer sources use it

---

## Reference Files

### Swift Implementation
- `vendor/Aidoku/Aidoku/iOS/New/Views/Common/Settings/SettingView.swift` - Main UI
- `vendor/Aidoku/Aidoku/Shared/Sources/SourceActor.swift:147-150` - handleNotification
- `vendor/Aidoku/Aidoku/Shared/Sources/Source.swift:371-374` - performAction

### Schema
- `vendor/Aidoku/aidoku-rs/crates/cli/src/supporting/schema/settings.schema.json`
- `vendor/Aidoku/aidoku-rs/crates/lib/src/structs/setting.rs`

### WASM Exports
- `handle_notification(string_descriptor)` - Notify source of action/change
- `handle_basic_login(key, username, password) -> bool` - Basic auth handler

