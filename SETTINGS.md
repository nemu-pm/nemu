# Per-Source Dynamic Settings Implementation Plan

## Overview

Implement a settings system that allows users to configure source-specific options (languages, content ratings, cover quality, login credentials, etc.) with proper UI and persistence.

## Current State

- `settings.json` is extracted from `.aix` packages but only used for initial defaults
- No UI for users to view/modify source settings
- Settings are stored in-memory in `GlobalStore` during runtime
- `defaults.ts` has basic localStorage persistence (debounced writes)

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Source Package (.aix)                    │
├─────────────────────────────────────────────────────────────┤
│  settings.json  →  Schema (UI definition + defaults)        │
│  source.json    →  Manifest (id, name, languages, etc.)     │
│  main.wasm      →  Runtime                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Settings Store                            │
├─────────────────────────────────────────────────────────────┤
│  Schema Cache    →  IndexedDB (settings schema per source)  │
│  User Values     →  IndexedDB (user-modified values)        │
│  Runtime State   →  GlobalStore (active WASM session)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Settings UI                               │
├─────────────────────────────────────────────────────────────┤
│  SourceSettingsPage  →  Per-source settings screen          │
│  SettingControl      →  Renders individual setting types    │
└─────────────────────────────────────────────────────────────┘
```

## Data Structures

### Settings Schema Types

```typescript
// src/lib/sources/aidoku/settings-types.ts

type SettingType = 
  | 'group'
  | 'select'
  | 'multi-select'
  | 'switch'
  | 'stepper'
  | 'segment'
  | 'text'
  | 'button'
  | 'link'
  | 'login'
  | 'page'
  | 'editable-list';

interface BaseSetting {
  key: string;
  title: string;
  type: SettingType;
  requires?: string;      // Key of setting that must be truthy
  requiresFalse?: string; // Key of setting that must be falsy
  notification?: string;  // Event to fire on change
  refreshes?: string[];   // What to refresh: 'content' | 'listings' | 'settings' | 'filters'
}

interface GroupSetting extends BaseSetting {
  type: 'group';
  footer?: string;
  items: Setting[];
}

interface SelectSetting extends BaseSetting {
  type: 'select';
  values: string[];
  titles?: string[];
  default?: string;
}

interface MultiSelectSetting extends BaseSetting {
  type: 'multi-select';
  values: string[];
  titles?: string[];
  default?: string[];
}

interface SwitchSetting extends BaseSetting {
  type: 'switch';
  subtitle?: string;
  default?: boolean;
}

interface StepperSetting extends BaseSetting {
  type: 'stepper';
  minimumValue: number;
  maximumValue: number;
  stepValue?: number;
  default?: number;
}

interface TextSetting extends BaseSetting {
  type: 'text';
  placeholder?: string;
  secure?: boolean;
  default?: string;
}

interface LoginSetting extends BaseSetting {
  type: 'login';
  method: 'basic' | 'oauth' | 'web';
  url?: string;
  urlKey?: string;
  logoutTitle?: string;
}

interface PageSetting extends BaseSetting {
  type: 'page';
  items: Setting[];
  icon?: { type: 'system' | 'url'; name?: string; url?: string; color?: string };
  info?: string;
}

interface EditableListSetting extends BaseSetting {
  type: 'editable-list';
  placeholder?: string;
  default?: string[];
}

type Setting = 
  | GroupSetting 
  | SelectSetting 
  | MultiSelectSetting 
  | SwitchSetting
  | StepperSetting
  | TextSetting
  | LoginSetting
  | PageSetting
  | EditableListSetting;
```

### Persisted Settings Value

```typescript
// User's actual settings values (not schema)
interface SourceSettingsData {
  sourceId: string;
  values: Record<string, unknown>;  // key -> value
  updatedAt: number;
}
```

## Implementation Plan

### Phase 1: Schema Storage & Loading

**Files to modify:**
- `src/data/schema.ts` - Add settings schema table
- `src/data/keys.ts` - Add settings keys
- `src/lib/sources/aidoku/url-registry.ts` - Store schema on install
- `src/lib/sources/aidoku/settings-types.ts` - New file for types

**Tasks:**
1. Add `SourceSettingsSchema` table to Dexie schema
2. Store parsed `settings.json` alongside manifest on source install
3. Create `getSettingsSchema(sourceId)` method on registry

### Phase 2: Settings Data Store

**Files to create:**
- `src/stores/source-settings.ts` - Zustand store for settings state

**Tasks:**
1. Create store with:
   - `getSettings(sourceId)` - Get current values (defaults + user overrides)
   - `setSetting(sourceId, key, value)` - Update single setting
   - `resetSettings(sourceId)` - Reset to defaults
2. Merge logic: schema defaults → persisted user values → runtime
3. Persist to IndexedDB on change (debounced)

### Phase 3: Runtime Integration

**Files to modify:**
- `src/lib/sources/aidoku/imports/defaults.ts` - Read from settings store
- `src/lib/sources/aidoku/runtime.ts` - Subscribe to settings changes
- `src/lib/sources/aidoku/source.worker.ts` - Handle settings updates

**Tasks:**
1. `defaults.get` reads from settings store (not just initial values)
2. `defaults.set` writes to settings store (triggers persistence)
3. Add `updateSettings(sourceId, values)` message to worker API
4. When settings change, notify WASM if needed (via `notification` field)

### Phase 4: Settings UI Components

**Files to create:**
- `src/components/settings/SourceSettingsPage.tsx` - Main settings page
- `src/components/settings/SettingControl.tsx` - Individual setting renderer
- `src/components/settings/controls/` - Type-specific controls:
  - `SelectControl.tsx`
  - `MultiSelectControl.tsx`
  - `SwitchControl.tsx`
  - `StepperControl.tsx`
  - `TextControl.tsx`
  - `LoginControl.tsx`
  - `EditableListControl.tsx`

**Tasks:**
1. Create `SourceSettingsPage` that:
   - Loads schema for source
   - Renders settings grouped by `group` type
   - Shows source header (icon, name, version)
   - Has "Reset to Defaults" button
2. Create `SettingControl` that dispatches to type-specific controls
3. Each control:
   - Reads current value from store
   - Updates store on change
   - Respects `requires`/`requiresFalse` for conditional display

### Phase 5: Navigation & Integration

**Files to modify:**
- `src/routes.tsx` or equivalent - Add settings route
- Source list/detail views - Add settings button

**Tasks:**
1. Add route: `/sources/:registryId/:sourceId/settings`
2. Add settings icon/button to source cards
3. Add settings option to source detail page

## UI Design

### Source Settings Page Layout

```
┌─────────────────────────────────────────┐
│  ← Back          Source Settings        │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  [Icon]  MangaDex               │    │
│  │          v11 • multi.mangadex   │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  LANGUAGE                               │
│  ┌─────────────────────────────────┐    │
│  │  Languages              [en] >  │    │
│  └─────────────────────────────────┘    │
│  Select which languages to show         │
├─────────────────────────────────────────┤
│  CONTENT                                │
│  ┌─────────────────────────────────┐    │
│  │  Content Rating              >  │    │
│  │  Cover Quality           [512]  │    │
│  │  Data Saver                 ○   │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  Clear Source Cache             │    │
│  │  Reset Settings                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Control Types

| Type | UI Component |
|------|--------------|
| `select` | Dropdown or navigation to selection page |
| `multi-select` | Navigation to multi-selection page with checkmarks |
| `switch` | Toggle switch |
| `stepper` | Number input with +/- buttons |
| `text` | Text input field |
| `login` | Login button → modal/sheet for credentials |
| `editable-list` | List with add/remove buttons |

## Migration & Compatibility

### Existing Installations

Sources installed before this change won't have `settings.json` cached. Handle by:
1. Check if schema exists in DB
2. If not, re-download `.aix` and extract schema
3. Apply user's existing persisted values (if any from localStorage)

### localStorage → IndexedDB Migration

Current `defaults.ts` uses localStorage with keys like `aidoku:sourceId:key`. Migrate:
1. On first load, check for localStorage keys
2. Import into new IndexedDB-backed store
3. Clear old localStorage keys

## API Summary

### Settings Store API

```typescript
interface SourceSettingsStore {
  // Get merged settings (defaults + user overrides)
  getSettings(sourceId: string): Record<string, unknown>;
  
  // Get settings schema
  getSchema(sourceId: string): Setting[] | null;
  
  // Update a single setting
  setSetting(sourceId: string, key: string, value: unknown): void;
  
  // Reset all settings to defaults
  resetSettings(sourceId: string): void;
  
  // Check if a setting is at default value
  isDefault(sourceId: string, key: string): boolean;
}
```

### Worker API Extension

```typescript
// New message type for settings updates
interface UpdateSettingsMessage {
  type: 'updateSettings';
  settings: Record<string, unknown>;
}
```

## Testing

1. **Unit tests** for settings store merge logic
2. **Integration tests** for settings persistence round-trip
3. **E2E tests** for:
   - Changing language setting and verifying search results change
   - Login flow for sources requiring auth
   - Settings persistence across page reloads

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Schema Storage | 2-3 hours |
| Phase 2: Settings Store | 3-4 hours |
| Phase 3: Runtime Integration | 2-3 hours |
| Phase 4: UI Components | 6-8 hours |
| Phase 5: Navigation | 1-2 hours |
| Testing & Polish | 3-4 hours |
| **Total** | **17-24 hours** |

