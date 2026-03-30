import { create } from 'zustand'
import type { ReaderPlugin } from './types'

const ENABLED_KEY = 'nemu:plugins:enabled'

function loadEnabledState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveEnabledState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function isPluginEnabledForRuntime(
  plugin: ReaderPlugin,
  enabledState: Record<string, boolean>
): boolean {
  return enabledState[plugin.manifest.id] ?? plugin.manifest.defaultEnabled ?? true
}

interface PluginRegistryState {
  /** All registered plugins */
  plugins: Map<string, ReaderPlugin>
  /** Enabled state per plugin (persisted) */
  enabledState: Record<string, boolean>

  // Actions
  register: (plugin: ReaderPlugin) => void
  unregister: (pluginId: string) => void
  setEnabled: (pluginId: string, enabled: boolean) => void
  isEnabled: (pluginId: string) => boolean
  getPlugin: (pluginId: string) => ReaderPlugin | undefined
  getAllPlugins: () => ReaderPlugin[]
  getEnabledPlugins: () => ReaderPlugin[]
}

export const usePluginRegistry = create<PluginRegistryState>((set, get) => ({
  plugins: new Map(),
  enabledState: loadEnabledState(),

  register: (plugin: ReaderPlugin) => {
    const { plugins, enabledState } = get()
    if (plugins.has(plugin.manifest.id)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.manifest.id}" already registered, replacing.`)
      const old = plugins.get(plugin.manifest.id)
      old?.teardown?.()
    }

    // Determine initial enabled state
    const id = plugin.manifest.id
    if (!(id in enabledState)) {
      // First time seeing this plugin - use defaultEnabled (default true)
      const defaultEnabled = plugin.manifest.defaultEnabled ?? true
      enabledState[id] = defaultEnabled
      saveEnabledState(enabledState)
    }

    if (isPluginEnabledForRuntime(plugin, enabledState)) {
      plugin.setup?.()
    }

    set({
      plugins: new Map(plugins).set(id, plugin),
      enabledState: { ...enabledState },
    })
  },

  unregister: (pluginId: string) => {
    const { plugins } = get()
    const plugin = plugins.get(pluginId)
    if (plugin) {
      plugin.teardown?.()
      const next = new Map(plugins)
      next.delete(pluginId)
      set({ plugins: next })
    }
  },

  setEnabled: (pluginId: string, enabled: boolean) => {
    const { plugins, enabledState } = get()
    const plugin = plugins.get(pluginId)
    const wasEnabled = plugin ? isPluginEnabledForRuntime(plugin, enabledState) : enabledState[pluginId] ?? true

    const next = { ...enabledState, [pluginId]: enabled }
    const willBeEnabled = plugin ? isPluginEnabledForRuntime(plugin, next) : enabled

    if (plugin && wasEnabled !== willBeEnabled) {
      if (willBeEnabled) {
        plugin.setup?.()
      } else {
        plugin.teardown?.()
      }
    }

    saveEnabledState(next)
    set({ enabledState: next })
  },

  isEnabled: (pluginId: string) => {
    const { plugins, enabledState } = get()
    const plugin = plugins.get(pluginId)
    if (!plugin) return false
    return isPluginEnabledForRuntime(plugin, enabledState)
  },

  getPlugin: (pluginId: string) => get().plugins.get(pluginId),

  getAllPlugins: () => Array.from(get().plugins.values()),

  getEnabledPlugins: () => {
    const { plugins, enabledState } = get()
    return Array.from(plugins.values()).filter((p) => isPluginEnabledForRuntime(p, enabledState))
  },
}))
