export * from './types'
export * from './registry'
export * from './context'
export * from './components'

// Settings schema types for plugin authors
export type {
  PluginFeature,
  PluginSetting,
  PluginGroupSetting,
  PluginSwitchSetting,
  PluginSliderSetting,
  PluginSelectSetting,
  PluginStepperSetting,
  PluginTextSetting,
} from './settings-schema'
export { extractSettingsDefaults } from './settings-schema'

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

