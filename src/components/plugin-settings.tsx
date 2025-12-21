/**
 * Plugin settings dialog - displays plugin-specific settings
 * Settings are auto-rendered from the plugin's settingsSchema
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsDialog } from '@/components/ui/settings-dialog'
import { usePluginRegistry } from '@/lib/plugins'
import { PluginSettingsRenderer, type PluginFeature } from '@/lib/plugins/settings-schema'

interface PluginSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pluginId: string
}

async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  if (!('gpu' in navigator)) return false
  try {
    const adapter = await (navigator as any).gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

export function PluginSettings({ open, onOpenChange, pluginId }: PluginSettingsProps) {
  const { t } = useTranslation()
  const plugin = usePluginRegistry((s) => s.getPlugin(pluginId))
  const [features, setFeatures] = useState<Record<PluginFeature, boolean>>({ webgpu: false })
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  useEffect(() => {
    detectWebGPU().then((available) => {
      setFeatures((f) => ({ ...f, webgpu: available }))
    })
  }, [])

  // Load settings when dialog opens or plugin changes
  useEffect(() => {
    if (open && plugin?.getSettings) {
      const loaded = plugin.getSettings()
      setSettings(loaded)
    }
  }, [open, plugin])

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      if (plugin?.setSettings) {
        const updated = { ...settings, [key]: value }
        setSettings(updated)
        plugin.setSettings(updated)
      }
    },
    [plugin, settings]
  )

  if (!plugin) return null

  const { manifest, settingsSchema, getSettings } = plugin
  const hasSettings = settingsSchema && settingsSchema.length > 0 && getSettings

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={manifest.icon}
      title={manifest.name}
      subtitle={manifest.description}
      empty={!hasSettings}
      emptyMessage={t("pluginSettings.noSettings")}
      maxWidth="max-w-lg"
    >
      {hasSettings && (
        <PluginSettingsRenderer
          schema={settingsSchema}
          values={settings}
          onChange={handleChange}
          features={features}
        />
      )}
    </SettingsDialog>
  )
}
