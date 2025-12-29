/**
 * Plugin initialization
 *
 * This file registers all built-in plugins.
 * Import this file early in the app lifecycle (e.g., main.tsx).
 */

import { usePluginRegistry } from './registry'
import { japaneseLearningPlugin, dualReaderPlugin } from './builtin'

export function initializePlugins() {
  const { register } = usePluginRegistry.getState()

  // Register built-in plugins
  register(japaneseLearningPlugin)
  register(dualReaderPlugin)

  console.log('[Plugins] Initialized built-in plugins')
}

// Auto-initialize on import
initializePlugins()
