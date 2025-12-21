/**
 * Plugin settings schema types and renderer
 * Plugins define settings declaratively, UI is auto-generated
 */
import * as React from 'react'
import {
  SettingsGroup,
  SettingsSwitch,
  SettingsSlider,
  SettingsSelect,
  SettingsStepper,
  SettingsText,
} from '@/components/ui/settings-controls'

// ============================================================================
// Schema Types
// ============================================================================

export type PluginSettingType = 'group' | 'switch' | 'slider' | 'select' | 'stepper' | 'text'

/** Feature flags that can be checked for conditional settings */
export type PluginFeature = 'webgpu'

interface BasePluginSetting {
  /** Unique key for this setting (used in values object) */
  key: string
  /** Display label */
  title: string
  /** Optional subtitle/description */
  subtitle?: string
  /** Key of another setting that must be truthy for this to show */
  requires?: string
  /** Key of another setting that must be falsy for this to show */
  requiresFalse?: string
  /** Feature that must be available for this to show */
  requiresFeature?: PluginFeature
}

export interface PluginGroupSetting {
  type: 'group'
  /** Group title */
  title: string
  /** Optional footer text */
  footer?: string
  /** Child settings */
  items: PluginSetting[]
}

export interface PluginSwitchSetting extends BasePluginSetting {
  type: 'switch'
  default?: boolean
}

export interface PluginSliderSetting extends BasePluginSetting {
  type: 'slider'
  min: number
  max: number
  step?: number
  /** Format the displayed value (e.g., add % suffix) */
  formatValue?: (value: number) => string
  default?: number
}

export interface PluginSelectSetting extends BasePluginSetting {
  type: 'select'
  /** Option values */
  values: string[]
  /** Option labels (defaults to values if not provided) */
  titles?: string[]
  default?: string
}

export interface PluginStepperSetting extends BasePluginSetting {
  type: 'stepper'
  min: number
  max: number
  step?: number
  default?: number
}

export interface PluginTextSetting extends BasePluginSetting {
  type: 'text'
  placeholder?: string
  /** Password field */
  secure?: boolean
  default?: string
}

export type PluginSetting =
  | PluginGroupSetting
  | PluginSwitchSetting
  | PluginSliderSetting
  | PluginSelectSetting
  | PluginStepperSetting
  | PluginTextSetting

// ============================================================================
// Schema Utilities
// ============================================================================

/**
 * Extract default values from a settings schema
 */
export function extractSettingsDefaults(schema: PluginSetting[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}

  function processItems(items: PluginSetting[]) {
    for (const item of items) {
      if (item.type === 'group') {
        processItems(item.items)
      } else if ('key' in item && 'default' in item && item.default !== undefined) {
        defaults[item.key] = item.default
      }
    }
  }

  processItems(schema)
  return defaults
}

/**
 * Check if a setting should be visible based on requires/requiresFalse/requiresFeature
 */
function isSettingVisible(
  setting: PluginSetting,
  values: Record<string, unknown>,
  features: Record<PluginFeature, boolean>
): boolean {
  if (setting.type === 'group') return true
  if ('requires' in setting && setting.requires) {
    if (!values[setting.requires]) return false
  }
  if ('requiresFalse' in setting && setting.requiresFalse) {
    if (values[setting.requiresFalse]) return false
  }
  if ('requiresFeature' in setting && setting.requiresFeature) {
    if (!features[setting.requiresFeature]) return false
  }
  return true
}

// ============================================================================
// Settings Renderer
// ============================================================================

interface PluginSettingsRendererProps {
  schema: PluginSetting[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  /** Feature availability flags */
  features?: Record<PluginFeature, boolean>
}

/**
 * Renders settings UI from a declarative schema
 */
export function PluginSettingsRenderer({
  schema,
  values,
  onChange,
  features = { webgpu: false },
}: PluginSettingsRendererProps) {
  return (
    <>
      {schema.map((setting, index) => (
        <SettingItem
          key={setting.type === 'group' ? `group-${index}` : setting.key}
          setting={setting}
          values={values}
          onChange={onChange}
          features={features}
        />
      ))}
    </>
  )
}

interface SettingItemProps {
  setting: PluginSetting
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  features: Record<PluginFeature, boolean>
}

function SettingItem({ setting, values, onChange, features }: SettingItemProps) {
  if (!isSettingVisible(setting, values, features)) return null

  switch (setting.type) {
    case 'group':
      return (
        <SettingsGroup title={setting.title} footer={setting.footer}>
          {setting.items.map((item, index) => (
            <SettingItem
              key={item.type === 'group' ? `group-${index}` : item.key}
              setting={item}
              values={values}
              onChange={onChange}
              features={features}
            />
          ))}
        </SettingsGroup>
      )

    case 'switch':
      return (
        <SettingsSwitch
          label={setting.title}
          subtitle={setting.subtitle}
          checked={Boolean(values[setting.key] ?? setting.default ?? false)}
          onCheckedChange={(checked) => onChange(setting.key, checked)}
        />
      )

    case 'slider':
      return (
        <SettingsSlider
          label={setting.title}
          subtitle={setting.subtitle}
          value={Number(values[setting.key] ?? setting.default ?? setting.min)}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          formatValue={setting.formatValue}
          onChange={(value) => onChange(setting.key, value)}
        />
      )

    case 'select':
      return (
        <SettingsSelect
          label={setting.title}
          subtitle={setting.subtitle}
          value={String(values[setting.key] ?? setting.default ?? setting.values[0])}
          options={setting.values.map((value, i) => ({
            value,
            label: setting.titles?.[i] ?? value,
          }))}
          onChange={(value) => onChange(setting.key, value)}
        />
      )

    case 'stepper':
      return (
        <SettingsStepper
          label={setting.title}
          subtitle={setting.subtitle}
          value={Number(values[setting.key] ?? setting.default ?? setting.min)}
          min={setting.min}
          max={setting.max}
          step={setting.step ?? 1}
          onChange={(value) => onChange(setting.key, value)}
        />
      )

    case 'text':
      return (
        <SettingsText
          label={setting.title}
          subtitle={setting.subtitle}
          value={String(values[setting.key] ?? setting.default ?? '')}
          placeholder={setting.placeholder}
          secure={setting.secure}
          onChange={(value) => onChange(setting.key, value)}
        />
      )

    default:
      return null
  }
}

