import { describe, expect, it } from 'bun:test'
import type { ReaderPlugin } from './types'
import { isPluginEnabledForRuntime } from './registry'

const plugin: ReaderPlugin = {
  manifest: {
    id: 'japanese-learning',
    name: 'Japanese Learning',
    defaultEnabled: true,
  },
}

const optInPlugin: ReaderPlugin = {
  manifest: {
    id: 'ocr',
    name: 'OCR',
    defaultEnabled: false,
  },
}

describe('plugin enable state', () => {
  it('falls back to the plugin default when no persisted state exists', () => {
    expect(isPluginEnabledForRuntime(plugin, {})).toBe(true)
    expect(isPluginEnabledForRuntime(optInPlugin, {})).toBe(false)
  })

  it('respects an explicit persisted disable', () => {
    expect(
      isPluginEnabledForRuntime(plugin, { 'japanese-learning': false })
    ).toBe(false)
  })

  it('respects an explicit persisted enable', () => {
    expect(
      isPluginEnabledForRuntime(optInPlugin, { ocr: true })
    ).toBe(true)
  })
})
