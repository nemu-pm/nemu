# Reader Plugin Architecture

The reader supports plugins that can inject functionality into the reading experience.

## Quick Start

```typescript
import { usePluginRegistry, type ReaderPlugin } from '@/lib/plugins'

const myPlugin: ReaderPlugin = {
  manifest: {
    id: 'my-plugin',
    name: 'My Plugin',
  },
  navbarActions: [...],
  pageOverlays: [...],
  settingsSections: [...],
  hooks: {...},
}

// Register
usePluginRegistry.getState().register(myPlugin)

// Unregister
usePluginRegistry.getState().unregister('my-plugin')
```

## Plugin Structure

```typescript
interface ReaderPlugin {
  manifest: {
    id: string           // Unique identifier
    name: string         // Display name
    description?: string
    icon?: ReactNode     // Icon for settings UI
    defaultEnabled?: boolean  // Default: true
    builtin?: boolean    // Built-in plugins can't be uninstalled
  }

  // UI contributions
  navbarActions?: NavbarAction[]
  pageOverlays?: PageOverlay[]
  settingsSections?: SettingsSection[]  // In-reader settings
  SettingsPage?: () => ReactNode        // Full settings page (app settings)

  // Lifecycle
  hooks?: ReaderHooks
  setup?: () => void    // Called when enabled
  teardown?: () => void // Called when disabled
}
```

## Contribution Points

### Navbar Actions

Buttons in the reader's bottom toolbar.

```typescript
interface NavbarAction {
  id: string
  label: string                              // Tooltip
  icon: ReactNode
  onClick: (ctx: ReaderPluginContext) => void
  isActive?: (ctx: ReaderPluginContext) => boolean
  isDisabled?: (ctx: ReaderPluginContext) => boolean
  isLoading?: boolean
}
```

### Page Overlays

Layers rendered on top of page images. Useful for annotations, highlights, etc.

```typescript
interface PageOverlay {
  id: string
  zIndex?: number  // Default: 10
  render: (pageIndex: number, ctx: ReaderPluginContext) => ReactNode
}
```

The overlay container has `pointer-events: none` but children get `pointer-events: auto`, so interactive elements work.

### Settings Sections

Custom UI in the reader settings popover.

```typescript
interface SettingsSection {
  id: string
  title: string
  render: (ctx: ReaderPluginContext) => ReactNode
}
```

### Hooks

Lifecycle callbacks for reader events.

```typescript
interface ReaderHooks {
  onPageChange?: (pageIndex: number, ctx: ReaderPluginContext) => void
  onChapterChange?: (chapterId: string, ctx: ReaderPluginContext) => void
  onMount?: (ctx: ReaderPluginContext) => void
  onUnmount?: () => void
}
```

## Plugin Context

Plugins receive a context object with reader state and actions:

```typescript
interface ReaderPluginContext {
  // State
  currentPageIndex: number
  pageCount: number
  chapterId: string
  mangaId: string
  sourceId: string
  registryId: string
  readingMode: 'rtl' | 'ltr' | 'scrolling'

  // Page access
  getPageImageUrl: (pageIndex: number) => string | undefined
  getLoadedPageUrls: () => Map<number, string>

  // Actions
  showDialog: (content: ReactNode, options?: DialogOptions) => void
  hideDialog: () => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}
```

## Plugin Storage

For persisted settings, use the storage helper:

```typescript
import { createPluginStorage } from '@/lib/plugins'

const storage = createPluginStorage('my-plugin')

storage.set('key', value)
const value = storage.get<Type>('key')
storage.remove('key')
```

Data is stored in localStorage with prefix `nemu:plugin:{pluginId}:`.

## Plugin Management (Settings Page)

Plugins are managed in the app settings under "Reader Plugins":

- **Enable/Disable**: Toggle plugins on/off with the switch
- **Settings**: Click the gear icon to open plugin-specific settings
- **Built-in plugins**: Cannot be uninstalled, only disabled

Enable state is persisted in localStorage (`nemu:plugins:enabled`).

### Enable/Disable API

```typescript
const { setEnabled, isEnabled } = usePluginRegistry.getState()

// Check if enabled
const enabled = isEnabled('my-plugin')

// Enable/disable
setEnabled('my-plugin', true)
setEnabled('my-plugin', false)
```

## File Structure

```
src/lib/plugins/
├── types.ts          # Core interfaces
├── registry.ts       # Plugin store (zustand)
├── context.tsx       # React context provider
├── components.tsx    # UI integration components
├── init.ts           # Plugin initialization
├── index.ts          # Public exports
└── builtin/
    └── japanese-learning/ # Example plugin
        ├── types.ts
        ├── store.ts
        ├── services.ts
        ├── components.tsx
        └── index.tsx
```

## Example: Japanese OCR Plugin

See `src/lib/plugins/builtin/japanese-learning/` for a complete example that demonstrates:

- Navbar action button
- Page overlay for text block highlights
- Settings section with toggles and sliders
- Dialog for grammar breakdown
- Zustand store for plugin state
- Service stubs for OCR/grammar analysis
- Lifecycle hooks for auto-run and cleanup

### Key patterns:

**Plugin definition** (`index.tsx`):
```typescript
export const japaneseLearningPlugin: ReaderPlugin = {
  manifest: { id: 'japanese-learning', name: 'Japanese Learning', version: '0.1.0' },
  
  navbarActions: [{
    id: 'run-ocr',
    label: 'Run OCR',
    icon: <Icon />,
    onClick: async (ctx) => {
      const imageUrl = ctx.getPageImageUrl(ctx.currentPageIndex)
      const blocks = await runOcr(imageUrl)
      // ...
    },
  }],

  pageOverlays: [{
    id: 'ocr-overlay',
    render: (pageIndex, ctx) => <OcrOverlay pageIndex={pageIndex} ctx={ctx} />,
  }],

  hooks: {
    onChapterChange: () => {
      // Clear OCR results when chapter changes
      useStore.getState().clearResults()
    },
  },
}
```

**Plugin state** (`store.ts`):
```typescript
export const usePluginStore = create<State>((set, get) => ({
  settings: storage.get('settings') ?? DEFAULT_SETTINGS,
  results: new Map(),
  
  setSettings: (partial) => {
    const settings = { ...get().settings, ...partial }
    storage.set('settings', settings)
    set({ settings })
  },
}))
```

## Adding a New Plugin

1. Create folder: `src/lib/plugins/builtin/my-plugin/`
2. Define types in `types.ts`
3. Create zustand store in `store.ts` (if needed)
4. Build UI components in `components.tsx`
5. Export plugin definition from `index.tsx`
6. Register in `src/lib/plugins/init.ts`:

```typescript
import { myPlugin } from './builtin/my-plugin'

export function initializePlugins() {
  const { register } = usePluginRegistry.getState()
  register(japaneseLearningPlugin)
  register(myPlugin) // Add here
}
```

