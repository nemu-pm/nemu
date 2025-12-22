export * from './types'
export * from './registry'
export * from './context'
export * from './components'

// Re-export settings types from unified module for plugin authors
export type {
  Setting,
  GroupSetting,
  SwitchSetting,
  SliderSetting,
  SelectSetting,
  TextSetting,
  FeatureFlags,
} from '@/lib/settings'
export { extractDefaults } from '@/lib/settings'

// Re-export settings controls for custom reader settings UI
export {
  SettingsGroup,
  SettingsPageLink,
  SettingsSelect,
  SettingsSegment,
  SettingsMultiSelect,
  SettingsSwitch,
  SettingsStepper,
  SettingsText,
  SettingsEditableList,
  SettingsRow,
  SettingsSlider,
} from '@/components/ui/settings-controls'
