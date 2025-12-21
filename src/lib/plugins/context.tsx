import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { ReaderPluginContext, DialogOptions, NavbarAction, PageOverlay, SettingsSection } from './types'
import { usePluginRegistry } from './registry'

// ============================================================================
// Internal Dialog State
// ============================================================================

interface DialogState {
  content: ReactNode
  options?: DialogOptions
}

// ============================================================================
// Plugin Context Value (extended with internal methods)
// ============================================================================

interface PluginContextValue {
  ctx: ReaderPluginContext
  // Aggregated contributions from all plugins
  navbarActions: NavbarAction[]
  pageOverlays: PageOverlay[]
  settingsSections: SettingsSection[]
  // Dialog state
  dialogState: DialogState | null
  // Interaction lock state (set of plugin IDs that have requested lock)
  interactionLocks: Set<string>
}

const PluginContext = createContext<PluginContextValue | null>(null)

// ============================================================================
// Provider Props
// ============================================================================

interface ReaderPluginProviderProps {
  children: ReactNode
  // Reader state
  currentPageIndex: number
  /** Indices of all currently visible pages (1 for single page, 2 for paired mode) */
  visiblePageIndices: number[]
  pageCount: number
  chapterId: string
  mangaId: string
  sourceId: string
  registryId: string
  readingMode: 'rtl' | 'ltr' | 'scrolling'
  /** Languages supported by the source */
  sourceLanguages: string[]
  // Page access
  getPageImageUrl: (pageIndex: number) => string | undefined
  getLoadedPageUrls: () => Map<number, string>
}

// ============================================================================
// Provider Component
// ============================================================================

export function ReaderPluginProvider({
  children,
  currentPageIndex,
  visiblePageIndices,
  pageCount,
  chapterId,
  mangaId,
  sourceId,
  registryId,
  readingMode,
  sourceLanguages,
  getPageImageUrl,
  getLoadedPageUrls,
}: ReaderPluginProviderProps) {
  const pluginsMap = usePluginRegistry((s) => s.plugins)
  const enabledState = usePluginRegistry((s) => s.enabledState)
  const plugins = useMemo(() => {
    return Array.from(pluginsMap.values()).filter((p) => {
      const enabled = enabledState[p.manifest.id] ?? p.manifest.defaultEnabled ?? true
      return enabled
    })
  }, [pluginsMap, enabledState])
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [interactionLocks, setInteractionLocks] = useState<Set<string>>(new Set())

  const showDialog = useCallback((content: ReactNode, options?: DialogOptions) => {
    setDialogState({ content, options })
  }, [])

  const hideDialog = useCallback(() => {
    dialogState?.options?.onClose?.()
    setDialogState(null)
  }, [dialogState])

  const showToast = useCallback((message: string, type?: 'info' | 'success' | 'error') => {
    // For now, just console.log. Can integrate with a toast library later.
    console.log(`[Toast:${type ?? 'info'}] ${message}`)
  }, [])

  const lockInteraction = useCallback((pluginId: string) => {
    setInteractionLocks((prev) => new Set(prev).add(pluginId))
  }, [])

  const unlockInteraction = useCallback((pluginId: string) => {
    setInteractionLocks((prev) => {
      const next = new Set(prev)
      next.delete(pluginId)
      return next
    })
  }, [])

  const ctx: ReaderPluginContext = useMemo(
    () => ({
      currentPageIndex,
      visiblePageIndices,
      pageCount,
      chapterId,
      mangaId,
      sourceId,
      registryId,
      readingMode,
      sourceLanguages,
      getPageImageUrl,
      getLoadedPageUrls,
      showDialog,
      hideDialog,
      showToast,
      lockInteraction,
      unlockInteraction,
    }),
    [
      currentPageIndex,
      visiblePageIndices,
      pageCount,
      chapterId,
      mangaId,
      sourceId,
      registryId,
      readingMode,
      sourceLanguages,
      getPageImageUrl,
      getLoadedPageUrls,
      showDialog,
      hideDialog,
      showToast,
      lockInteraction,
      unlockInteraction,
    ]
  )

  // Aggregate contributions from all plugins
  const navbarActions = useMemo(
    () => plugins.flatMap((p) => p.navbarActions ?? []),
    [plugins]
  )
  const pageOverlays = useMemo(
    () => plugins.flatMap((p) => p.pageOverlays ?? []).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [plugins]
  )
  const settingsSections = useMemo(
    () => plugins.flatMap((p) => p.settingsSections ?? []),
    [plugins]
  )

  // Call lifecycle hooks
  useEffect(() => {
    plugins.forEach((p) => p.hooks?.onMount?.(ctx))
    return () => {
      plugins.forEach((p) => p.hooks?.onUnmount?.())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount/unmount

  // Page change hook
  const prevPageRef = useMemo(() => ({ current: currentPageIndex }), [])
  useEffect(() => {
    if (prevPageRef.current !== currentPageIndex) {
      plugins.forEach((p) => p.hooks?.onPageChange?.(currentPageIndex, ctx))
      prevPageRef.current = currentPageIndex
    }
  }, [currentPageIndex, plugins, ctx, prevPageRef])

  // Chapter change hook
  const prevChapterRef = useMemo(() => ({ current: chapterId }), [])
  useEffect(() => {
    if (prevChapterRef.current !== chapterId) {
      plugins.forEach((p) => p.hooks?.onChapterChange?.(chapterId, ctx))
      prevChapterRef.current = chapterId
    }
  }, [chapterId, plugins, ctx, prevChapterRef])

  const value: PluginContextValue = useMemo(
    () => ({
      ctx,
      navbarActions,
      pageOverlays,
      settingsSections,
      dialogState,
      interactionLocks,
    }),
    [ctx, navbarActions, pageOverlays, settingsSections, dialogState, interactionLocks]
  )

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get plugin context. Returns null if outside provider (safe for conditional use).
 */
export function usePluginContextSafe(): PluginContextValue | null {
  return useContext(PluginContext)
}

/**
 * Get plugin context. Throws if outside provider.
 */
export function usePluginContext(): PluginContextValue {
  const value = useContext(PluginContext)
  if (!value) {
    throw new Error('usePluginContext must be used within ReaderPluginProvider')
  }
  return value
}

// Fallback context for when outside provider
const NOOP = () => {}
const EMPTY_MAP = () => new Map<number, string>()
const FALLBACK_CTX: ReaderPluginContext = {
  currentPageIndex: 0,
  visiblePageIndices: [0],
  pageCount: 0,
  chapterId: '',
  mangaId: '',
  sourceId: '',
  registryId: '',
  readingMode: 'rtl',
  sourceLanguages: [],
  getPageImageUrl: () => undefined,
  getLoadedPageUrls: EMPTY_MAP,
  showDialog: NOOP,
  hideDialog: NOOP,
  showToast: NOOP,
  lockInteraction: NOOP,
  unlockInteraction: NOOP,
}

export function usePluginCtx(): ReaderPluginContext {
  const value = usePluginContextSafe()
  return value?.ctx ?? FALLBACK_CTX
}

export function usePluginNavbarActions(): NavbarAction[] {
  const value = usePluginContextSafe()
  return value?.navbarActions ?? []
}

export function usePluginPageOverlays(): PageOverlay[] {
  const value = usePluginContextSafe()
  return value?.pageOverlays ?? []
}

export function usePluginSettingsSections(): SettingsSection[] {
  const value = usePluginContextSafe()
  return value?.settingsSections ?? []
}

export function usePluginDialog(): { state: DialogState | null; hide: () => void } {
  const value = usePluginContextSafe()
  return { state: value?.dialogState ?? null, hide: value?.ctx.hideDialog ?? NOOP }
}

/** Returns true if any plugin has locked reader interactions (zoom, navbar toggle) */
export function useIsInteractionLocked(): boolean {
  const value = usePluginContextSafe()
  return (value?.interactionLocks.size ?? 0) > 0
}

