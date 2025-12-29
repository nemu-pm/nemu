import type { ReactNode } from 'react'
import type { Setting } from '@/lib/settings'

// ============================================================================
// Core Plugin Types
// ============================================================================

export interface ReaderPluginManifest {
  /** Unique plugin identifier */
  id: string
  /** Display name */
  name: string
  /** Plugin description */
  description?: string
  /** Plugin icon (optional) */
  icon?: ReactNode
  /** Whether plugin is enabled by default */
  defaultEnabled?: boolean
  /** Whether plugin is a built-in (cannot be uninstalled, only disabled) */
  builtin?: boolean
}

/**
 * Context provided to plugins - contains reader state and actions
 */
export interface ReaderPluginContext {
  // Current state
  currentPageIndex: number
  /** Indices of all currently visible pages (1 for single page, 2 for paired mode) */
  visiblePageIndices: number[]
  pageCount: number
  chapterId: string
  mangaId: string
  sourceId: string
  registryId: string
  readingMode: 'rtl' | 'ltr' | 'scrolling'
  /** Languages supported by the source (e.g., ['ja'], ['en', 'ja'], ['multi']) */
  sourceLanguages: string[]
  /** Language code for the current chapter (e.g., "ja", "en"). */
  chapterLanguage: string | null

  // Page access
  /** Get blob URL for a page image (if loaded) */
  getPageImageUrl: (pageIndex: number) => string | undefined
  /** Get all currently loaded page URLs */
  getLoadedPageUrls: () => Map<number, string>
  /** Get metadata for a virtual page index */
  getPageMeta: (pageIndex: number) => {
    kind: 'page' | 'spacer'
    chapterId?: string
    localIndex?: number
    key?: string
  } | null
  /** Convenience: metadata for all visible pages */
  getVisiblePageMetas: () => Array<{
    pageIndex: number
    kind: 'page' | 'spacer'
    chapterId?: string
    localIndex?: number
    key?: string
  }>

  // Actions
  /** Show a dialog/modal */
  showDialog: (content: ReactNode, options?: DialogOptions) => void
  /** Hide current dialog */
  hideDialog: () => void
  /** Show a toast notification */
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  // Interaction lock - plugins can request to disable reader interactions (zoom, navbar toggle)
  /** Lock reader interactions (disable zoom/tap gestures) */
  lockInteraction: (pluginId: string) => void
  /** Unlock reader interactions */
  unlockInteraction: (pluginId: string) => void
}

export interface DialogOptions {
  title?: string
  className?: string
  onClose?: () => void
}

// ============================================================================
// Plugin Contribution Points
// ============================================================================

/**
 * Action button in the reader navbar
 */
export interface NavbarAction {
  /** Unique action ID */
  id: string
  /** Tooltip/label */
  label: string
  /** Icon component */
  icon: ReactNode
  /** Click handler */
  onClick: (ctx: ReaderPluginContext) => void
  /** Whether action is currently active (highlighted) */
  isActive?: (ctx: ReaderPluginContext) => boolean
  /** Whether action is disabled */
  isDisabled?: (ctx: ReaderPluginContext) => boolean
  /** Whether action should be visible (return false to hide) */
  isVisible?: (ctx: ReaderPluginContext) => boolean
  /** Hook to get loading state (must be a React hook) */
  useIsLoading?: () => boolean
  /** Optional popover content to show (controlled by usePopoverOpen hook) */
  popoverContent?: () => ReactNode
  /** Hook to get popover open state (must be a React hook) */
  usePopoverOpen?: () => boolean
  /** Callback when popover should close (e.g. click outside) */
  onPopoverClose?: () => void
}

/**
 * Overlay rendered on top of page images
 */
export interface PageOverlay {
  /** Unique overlay ID */
  id: string
  /** Z-index relative to other overlays */
  zIndex?: number
  /** Render the overlay for a specific page */
  render: (pageIndex: number, ctx: ReaderPluginContext) => ReactNode
}

/**
 * Overlay rendered once per reader session (not per page).
 * Use this for global UI like floating buttons, managers, listeners, etc.
 */
export interface ReaderOverlay {
  /** Unique overlay ID */
  id: string
  /** Z-index relative to other overlays */
  zIndex?: number
  /** Render the overlay */
  render: (ctx: ReaderPluginContext) => ReactNode
}

/**
 * Settings section added to reader settings panel
 */
export interface SettingsSection {
  /** Unique section ID */
  id: string
  /** Section title */
  title: string
  /** Render the settings UI */
  render: (ctx: ReaderPluginContext) => ReactNode
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Hook called when reader state changes
 */
export interface ReaderHooks {
  /** Called when page changes */
  onPageChange?: (pageIndex: number, ctx: ReaderPluginContext) => void
  /** Called when chapter changes */
  onChapterChange?: (chapterId: string, ctx: ReaderPluginContext) => void
  /** Called when reader mounts */
  onMount?: (ctx: ReaderPluginContext) => void
  /** Called when reader unmounts */
  onUnmount?: () => void
}

/**
 * Complete plugin definition
 */
export interface ReaderPlugin {
  manifest: ReaderPluginManifest

  // Contributions
  navbarActions?: NavbarAction[]
  pageOverlays?: PageOverlay[]
  /** Overlays mounted once per reader session */
  readerOverlays?: ReaderOverlay[]
  /** Settings sections shown in reader settings popover */
  settingsSections?: SettingsSection[]

  // Settings (schema-based, auto-rendered in app settings)
  /** Declarative settings schema - UI is auto-generated */
  settingsSchema?: Setting[]
  /** Get current settings values */
  getSettings?: () => Record<string, unknown>
  /** Update settings values */
  setSettings?: (values: Record<string, unknown>) => void

  // Lifecycle hooks
  hooks?: ReaderHooks

  // Plugin state management (called once on registration)
  setup?: () => void
  teardown?: () => void
}

// ============================================================================
// Plugin Store Types (for plugin-specific persisted state)
// ============================================================================

/** Sync storage for small plugin settings (localStorage) */
export interface PluginStorage {
  get: <T>(key: string) => T | undefined
  set: <T>(key: string, value: T) => void
  remove: (key: string) => void
}

/** Async storage for larger plugin data (IndexedDB) */
export interface PluginAsyncStorage {
  get: <T>(key: string) => Promise<T | null>
  set: <T>(key: string, value: T) => Promise<void>
  remove: (key: string) => Promise<void>
  clear: () => Promise<void>
}

export function createPluginStorage(pluginId: string): PluginStorage {
  const prefix = `nemu:plugin:${pluginId}:`

  return {
    get: <T>(key: string): T | undefined => {
      try {
        const raw = localStorage.getItem(prefix + key)
        return raw ? JSON.parse(raw) : undefined
      } catch {
        return undefined
      }
    },
    set: <T>(key: string, value: T): void => {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value))
      } catch {
        // ignore
      }
    },
    remove: (key: string): void => {
      try {
        localStorage.removeItem(prefix + key)
      } catch {
        // ignore
      }
    },
  }
}

// ============================================================================
// Async Plugin Storage (IndexedDB-backed)
// ============================================================================

const PLUGIN_DB_NAME = 'nemu-plugins'
const PLUGIN_DB_VERSION = 1

let pluginDbPromise: Promise<IDBDatabase> | null = null

function getPluginDB(): Promise<IDBDatabase> {
  if (!pluginDbPromise) {
    pluginDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PLUGIN_DB_NAME, PLUGIN_DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        // Single store for all plugins, keys are namespaced
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data')
        }
      }
    })
  }
  return pluginDbPromise
}

export function createPluginAsyncStorage(pluginId: string): PluginAsyncStorage {
  const prefix = `${pluginId}:`

  return {
    get: async <T>(key: string): Promise<T | null> => {
      try {
        const db = await getPluginDB()
        return new Promise((resolve, reject) => {
          const tx = db.transaction('data', 'readonly')
          const store = tx.objectStore('data')
          const request = store.get(prefix + key)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve(request.result ?? null)
        })
      } catch {
        return null
      }
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      try {
        const db = await getPluginDB()
        return new Promise((resolve, reject) => {
          const tx = db.transaction('data', 'readwrite')
          const store = tx.objectStore('data')
          const request = store.put(value, prefix + key)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve()
        })
      } catch {
        // Silently fail - cache is best effort
      }
    },
    remove: async (key: string): Promise<void> => {
      try {
        const db = await getPluginDB()
        return new Promise((resolve, reject) => {
          const tx = db.transaction('data', 'readwrite')
          const store = tx.objectStore('data')
          const request = store.delete(prefix + key)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve()
        })
      } catch {
        // ignore
      }
    },
    clear: async (): Promise<void> => {
      try {
        const db = await getPluginDB()
        // Clear only this plugin's keys (iterate and delete matching prefix)
        return new Promise((resolve, reject) => {
          const tx = db.transaction('data', 'readwrite')
          const store = tx.objectStore('data')
          const request = store.openCursor()
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const cursor = request.result
            if (cursor) {
              if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
                cursor.delete()
              }
              cursor.continue()
            } else {
              resolve()
            }
          }
        })
      } catch {
        // ignore
      }
    },
  }
}
