# Reader Plugin API

This document describes the current plugin surface in `src/lib/plugins`.

## Registration

```ts
import { usePluginRegistry, type ReaderPlugin } from '@/lib/plugins'

const plugin: ReaderPlugin = {
  manifest: {
    id: 'my-plugin',
    name: 'My Plugin',
    defaultEnabled: true,
  },
}

usePluginRegistry.getState().register(plugin)
usePluginRegistry.getState().unregister('my-plugin')
```

Built-in plugins are registered from `src/lib/plugins/init.ts`.

## Plugin Shape

```ts
interface ReaderPlugin {
  manifest: {
    id: string
    name: string
    description?: string
    icon?: ReactNode
    defaultEnabled?: boolean
    builtin?: boolean
  }

  navbarActions?: NavbarAction[]
  pageOverlays?: PageOverlay[]
  readerOverlays?: ReaderOverlay[]
  settingsSections?: SettingsSection[]

  settingsSchema?: Setting[]
  getSettings?: () => Record<string, unknown>
  setSettings?: (values: Record<string, unknown>) => void

  hooks?: ReaderHooks
  setup?: () => void
  teardown?: () => void
}
```

## Contribution Points

### Navbar Actions

Buttons rendered in the reader chrome.

```ts
interface NavbarAction {
  id: string
  label: string
  icon: ReactNode
  onClick: (ctx: ReaderPluginContext) => void
  isActive?: (ctx: ReaderPluginContext) => boolean
  isDisabled?: (ctx: ReaderPluginContext) => boolean
  isVisible?: (ctx: ReaderPluginContext) => boolean
  useIsVisible?: () => boolean
  useIsLoading?: () => boolean
  popoverContent?: () => ReactNode
  usePopoverOpen?: () => boolean
  onPopoverClose?: () => void
}
```

### Page Overlays

Rendered once per page.

```ts
interface PageOverlay {
  id: string
  zIndex?: number
  render: (pageIndex: number, ctx: ReaderPluginContext) => ReactNode
}
```

### Reader Overlays

Rendered once per reader session, useful for floating UI or managers.

```ts
interface ReaderOverlay {
  id: string
  zIndex?: number
  render: (ctx: ReaderPluginContext) => ReactNode
}
```

### Settings Sections

Rendered inside the in-reader settings UI.

```ts
interface SettingsSection {
  id: string
  title: string
  render: (ctx: ReaderPluginContext) => ReactNode
}
```

### Hooks

```ts
interface ReaderHooks {
  onPageChange?: (pageIndex: number, ctx: ReaderPluginContext) => void
  onChapterChange?: (chapterId: string, ctx: ReaderPluginContext) => void
  onMount?: (ctx: ReaderPluginContext) => void
  onUnmount?: () => void
}
```

`onPageChange` may also be re-fired when visible page image URLs become available for the current page. That behavior is intentional and used by OCR-style plugins.

## Plugin Context

Plugins receive a richer context than the older docs described. Common fields include:

```ts
interface ReaderPluginContext {
  currentPageIndex: number
  visiblePageIndices: number[]
  pageCount: number
  chapterId: string
  mangaId: string
  mangaTitle?: string | null
  mangaGenres?: string[]
  sourceId: string
  registryId: string
  readingMode: 'rtl' | 'ltr' | 'scrolling'
  sourceLanguages: string[]
  chapterLanguage: string | null
  chapterTitle?: string
  chapterNumber?: number
  volumeNumber?: number
  currentChapterPageCount?: number

  getPageImageUrl: (pageIndex: number) => string | undefined
  getPageImageBlob?: (pageIndex: number) => Promise<Blob | null>
  getLoadedPageUrls: () => Map<number, string>
  getPageMeta: (pageIndex: number) => PageMeta | null
  getVisiblePageMetas: () => VisiblePageMeta[]
  resolvePageIndex?: (pageNumber: number, chapterId?: string) => number | null

  showDialog: (content: ReactNode, options?: DialogOptions) => void
  hideDialog: () => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
  lockInteraction: (pluginId: string) => void
  unlockInteraction: (pluginId: string) => void
}
```

Use `src/lib/plugins/types.ts` as the source of truth for the exact shape.

## Settings APIs

Plugins can contribute declarative settings to app settings:

```ts
import type { Setting } from '@/lib/plugins'

const settingsSchema: Setting[] = [
  {
    type: 'switch',
    key: 'enabled',
    label: 'Enable feature',
    defaultValue: true,
  },
]
```

If you expose `settingsSchema`, also expose `getSettings` and `setSettings` so the generated UI can read and write values.

For custom reader-only controls, use `settingsSections`.

## Storage Helpers

Small synchronous values:

```ts
import { createPluginStorage } from '@/lib/plugins'

const storage = createPluginStorage('my-plugin')
storage.set('key', { ok: true })
const value = storage.get<{ ok: boolean }>('key')
storage.remove('key')
```

Larger async values backed by IndexedDB:

```ts
import { createPluginAsyncStorage } from '@/lib/plugins'

const storage = createPluginAsyncStorage('my-plugin')
await storage.set('cache', { ok: true })
const value = await storage.get<{ ok: boolean }>('cache')
await storage.remove('cache')
await storage.clear()
```

## File Layout

```text
src/lib/plugins/
  builtin/         built-in plugins
  components.tsx   plugin UI integration
  context.tsx      reader plugin provider
  index.ts         public exports
  init.ts          built-in registration
  registry.ts      plugin registry store
  types.ts         core types and storage helpers
```

Current built-ins:

- `japanese-learning`
- `dual-reader`

## Authoring Notes

- prefer `settingsSchema` for app settings instead of bespoke settings pages
- use `readerOverlays` for singleton UI, not `pageOverlays`
- treat `setup` and `teardown` as enable/disable lifecycle hooks
- treat `hooks.onMount` and `hooks.onUnmount` as reader-session lifecycle hooks

When in doubt, check `src/lib/plugins/types.ts`, `src/lib/plugins/context.tsx`, and an existing built-in plugin before extending the API.
