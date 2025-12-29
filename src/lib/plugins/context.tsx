import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type {
  ReaderPluginContext,
  DialogOptions,
  NavbarAction,
  PageOverlay,
  ReaderOverlay,
  SettingsSection,
} from './types'
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
  readerOverlays: ReaderOverlay[]
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
  /** Language code for the current chapter */
  chapterLanguage: string | null
  // Page access
  getPageImageUrl: (pageIndex: number) => string | undefined
  getLoadedPageUrls: () => Map<number, string>
  getPageMeta: (pageIndex: number) => {
    kind: 'page' | 'spacer'
    chapterId?: string
    localIndex?: number
    key?: string
  } | null
  getVisiblePageMetas: () => Array<{
    pageIndex: number
    kind: 'page' | 'spacer'
    chapterId?: string
    localIndex?: number
    key?: string
  }>
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
  chapterLanguage,
  getPageImageUrl,
  getLoadedPageUrls,
  getPageMeta,
  getVisiblePageMetas,
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
      chapterLanguage,
      getPageImageUrl,
      getLoadedPageUrls,
      getPageMeta,
      getVisiblePageMetas,
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
      chapterLanguage,
      getPageImageUrl,
      getLoadedPageUrls,
      getPageMeta,
      getVisiblePageMetas,
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
  const readerOverlays = useMemo(
    () => plugins.flatMap((p) => p.readerOverlays ?? []).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [plugins]
  )
  const settingsSections = useMemo(
    () => plugins.flatMap((p) => p.settingsSections ?? []),
    [plugins]
  )

  // ----------------------------------------------------------------------------
  // Lifecycle hooks
  //
  // IMPORTANT: In TanStack Router, changing route params (e.g. mangaId) often
  // does not unmount the component tree. We treat (registryId, sourceId, mangaId)
  // changes as a new "reader session" and remount plugins accordingly.
  // ----------------------------------------------------------------------------

  const sessionKey = useMemo(
    () => `${registryId}:${sourceId}:${mangaId}`,
    [registryId, sourceId, mangaId]
  )
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

  const mountedPluginsRef = useRef<Map<string, (typeof plugins)[number]>>(new Map())
  const prevSessionKeyRef = useRef<string | null>(null)

  // Ensure final cleanup always runs on component unmount
  useEffect(() => {
    return () => {
      mountedPluginsRef.current.forEach((p) => p.hooks?.onUnmount?.())
      mountedPluginsRef.current = new Map()
      prevSessionKeyRef.current = null
    }
  }, [])

  // Mount/unmount plugins on session/plugin changes
  useEffect(() => {
    const prevSessionKey = prevSessionKeyRef.current
    const prevMounted = mountedPluginsRef.current
    const nextPlugins = new Map(plugins.map((p) => [p.manifest.id, p] as const))

    const mount = (p: (typeof plugins)[number]) => p.hooks?.onMount?.(ctxRef.current)
    const unmount = (p: (typeof plugins)[number]) => p.hooks?.onUnmount?.()

    // Initial mount
    if (prevSessionKey === null) {
      nextPlugins.forEach(mount)
      mountedPluginsRef.current = nextPlugins
      prevSessionKeyRef.current = sessionKey
      return
    }

    // New reader session: unmount everything, then mount fresh
    if (prevSessionKey !== sessionKey) {
      prevMounted.forEach(unmount)
      nextPlugins.forEach(mount)
      mountedPluginsRef.current = nextPlugins
      prevSessionKeyRef.current = sessionKey
      return
    }

    // Same session: diff plugins (enable/disable)
    prevMounted.forEach((p, id) => {
      if (!nextPlugins.has(id)) unmount(p)
    })
    nextPlugins.forEach((p, id) => {
      if (!prevMounted.has(id)) mount(p)
    })

    mountedPluginsRef.current = nextPlugins
    prevSessionKeyRef.current = sessionKey
  }, [plugins, sessionKey])

  // Page change hook
  const prevPageRef = useMemo(() => ({ current: currentPageIndex }), [])
  useEffect(() => {
    if (prevPageRef.current !== currentPageIndex) {
      plugins.forEach((p) => p.hooks?.onPageChange?.(currentPageIndex, ctx))
      prevPageRef.current = currentPageIndex
    }
  }, [currentPageIndex, plugins, ctx, prevPageRef])

  // Visible page image availability hook
  // Some plugins (e.g. OCR auto-detect) need to react when the *current* page's image URL
  // becomes available (blob URL loaded) even if the user hasn't changed pages.
  //
  // We intentionally re-use `onPageChange` for this signal so plugins don't need a new hook.
  // This effect is carefully gated to avoid double-calling `onPageChange` on real page turns.
  const prevUrlSignalRef = useRef<{
    sessionKey: string
    chapterId: string
    pageIndex: number
    visibleKey: string | null
  }>({ sessionKey, chapterId, pageIndex: currentPageIndex, visibleKey: null })
  useEffect(() => {
    const prev = prevUrlSignalRef.current

    // If the reader session, chapter, or page index changed, let the dedicated hooks handle it.
    // Reset the URL key so we can fire again when the new page's image loads.
    if (prev.sessionKey !== sessionKey || prev.chapterId !== chapterId || prev.pageIndex !== currentPageIndex) {
      prevUrlSignalRef.current = {
        sessionKey,
        chapterId,
        pageIndex: currentPageIndex,
        visibleKey: null,
      }
      return
    }

    const indices = ctx.visiblePageIndices
    if (indices.length === 0) return

    const urls = indices.map((i) => ctx.getPageImageUrl(i) ?? '')
    // Avoid spamming while nothing is loaded yet
    if (!urls.some(Boolean)) return

    const visibleKey = `${indices.join(',')}|${urls.join('||')}`
    if (prev.visibleKey === visibleKey) return

    prevUrlSignalRef.current = { ...prev, visibleKey }
    plugins.forEach((p) => p.hooks?.onPageChange?.(currentPageIndex, ctx))
  }, [sessionKey, chapterId, currentPageIndex, ctx, plugins])

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
      readerOverlays,
      settingsSections,
      dialogState,
      interactionLocks,
    }),
    [ctx, navbarActions, pageOverlays, readerOverlays, settingsSections, dialogState, interactionLocks]
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
const EMPTY_PAGE_META = () => null
const EMPTY_PAGE_METAS = () => []
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
  chapterLanguage: null,
  getPageImageUrl: () => undefined,
  getLoadedPageUrls: EMPTY_MAP,
  getPageMeta: EMPTY_PAGE_META,
  getVisiblePageMetas: EMPTY_PAGE_METAS,
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

export function usePluginReaderOverlays(): ReaderOverlay[] {
  const value = usePluginContextSafe()
  return value?.readerOverlays ?? []
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
