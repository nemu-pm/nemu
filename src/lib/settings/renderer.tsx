/**
 * Unified settings renderer
 * Renders settings UI from a declarative schema
 * Used by: source settings, plugin settings
 */

import { useMemo, type ReactNode } from "react";
import type {
  Setting,
  GroupSetting,
  SelectSetting,
  MultiSelectSetting,
  SwitchSetting,
  SliderSetting,
  SegmentSetting,
  TextSetting,
  PageSetting,
  EditableListSetting,
  FeatureFlags,
} from "./types";
import { isSettingVisible } from "./schema";
import { MAX_SETTING_LIST_ITEMS, sanitizeSettingsSchema } from "./sanitize";
import { formatSettingDisplayValue } from "./display";
import { sanitizeSourceSettingValues } from "./values";
import {
  SettingsGroup,
  SettingsSelect,
  SettingsSegment,
  SettingsMultiSelect,
  SettingsSwitch,
  SettingsStepper,
  SettingsSlider,
  SettingsText,
  SettingsEditableList,
  SettingsPageLink,
} from "@/components/ui/settings-controls";

export interface SettingsRendererProps {
  /** Settings schema to render */
  schema: Setting[];
  /** Current values */
  values: Record<string, unknown>;
  /** Callback when a setting changes */
  onChange: (key: string, value: unknown) => void;
  /** Callback to navigate to a nested page */
  onPushPage?: (page: PageSetting) => void;
  /** Available feature flags for conditional visibility */
  features?: FeatureFlags;
  /** Optional custom renderer for unsupported/source-specific setting types */
  renderCustomSetting?: (
    setting: Setting,
    context: {
      values: Record<string, unknown>;
      onChange: (key: string, value: unknown) => void;
      onPushPage?: (page: PageSetting) => void;
      features: FeatureFlags;
    },
  ) => ReactNode | null | undefined;
}

/**
 * Renders a settings schema into UI controls
 */
export function SettingsRenderer({
  schema,
  values,
  onChange,
  onPushPage,
  features = {},
  renderCustomSetting,
}: SettingsRendererProps) {
  const safeSchema = useMemo(() => sanitizeSettingsSchema(schema), [schema]);
  const safeValues = useMemo(
    () => sanitizeSourceSettingValues(values),
    [values],
  );
  return (
    <>
      {safeSchema.map((setting, index) => (
        <SettingItem
          key={
            setting.type === "group"
              ? `group-${index}`
              : (setting as { key: string }).key || index
          }
          setting={setting}
          values={safeValues}
          onChange={onChange}
          onPushPage={onPushPage}
          features={features}
          renderCustomSetting={renderCustomSetting}
        />
      ))}
    </>
  );
}

interface SettingItemProps {
  setting: Setting;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onPushPage?: (page: PageSetting) => void;
  features: FeatureFlags;
  renderCustomSetting?: SettingsRendererProps["renderCustomSetting"];
}

function SettingItem({
  setting,
  values,
  onChange,
  onPushPage,
  features,
  renderCustomSetting,
}: SettingItemProps) {
  if (!isSettingVisible(setting, values, features)) return null;

  switch (setting.type) {
    case "group":
      return (
        <GroupControl
          setting={setting}
          values={values}
          onChange={onChange}
          onPushPage={onPushPage}
          features={features}
          renderCustomSetting={renderCustomSetting}
        />
      );
    case "select":
      return (
        <SelectControl
          setting={setting}
          value={values[setting.key] as string | undefined}
          onChange={onChange}
        />
      );
    case "multi-select":
      return (
        <MultiSelectControl
          setting={setting}
          value={values[setting.key] as string[] | undefined}
          onChange={onChange}
        />
      );
    case "switch":
      return (
        <SwitchControl
          setting={setting}
          value={values[setting.key] as boolean | undefined}
          onChange={onChange}
        />
      );
    case "slider":
      return (
        <SliderControl
          setting={setting}
          value={values[setting.key] as number | undefined}
          onChange={onChange}
        />
      );
    case "segment":
      return (
        <SegmentControl
          setting={setting}
          value={values[setting.key] as number | undefined}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextControl
          setting={setting}
          value={values[setting.key] as string | undefined}
          onChange={onChange}
        />
      );
    case "page":
      return onPushPage ? (
        <SettingsPageLink
          title={setting.title}
          onClick={() => onPushPage(setting)}
        />
      ) : null;
    case "editable-list":
      return (
        <EditableListControl
          setting={setting}
          value={values[setting.key] as string[] | undefined}
          onChange={onChange}
        />
      );
    default:
      return (
        renderCustomSetting?.(setting, {
          values,
          onChange,
          onPushPage,
          features,
        }) ?? null
      );
  }
}

// ============================================================================
// Individual Control Components
// ============================================================================

function GroupControl({
  setting,
  values,
  onChange,
  onPushPage,
  features,
  renderCustomSetting,
}: {
  setting: GroupSetting;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onPushPage?: (page: PageSetting) => void;
  features: FeatureFlags;
  renderCustomSetting?: SettingsRendererProps["renderCustomSetting"];
}) {
  return (
    <SettingsGroup title={setting.title} footer={setting.footer}>
      {setting.items.map((child, index) => (
        <SettingItem
          key={
            child.type === "group"
              ? `group-${index}`
              : (child as { key: string }).key || index
          }
          setting={child}
          values={values}
          onChange={onChange}
          onPushPage={onPushPage}
          features={features}
          renderCustomSetting={renderCustomSetting}
        />
      ))}
    </SettingsGroup>
  );
}

function SelectControl({
  setting,
  value,
  onChange,
}: {
  setting: SelectSetting;
  value: string | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? [];
  const currentValue =
    typeof value === "string" && settingValues.includes(value)
      ? value
      : (setting.default ?? settingValues[0] ?? "");
  const options = settingValues.map((val, i) => ({
    value: val,
    label: setting.titles?.[i] ?? val,
  }));

  return (
    <SettingsSelect
      label={setting.title}
      subtitle={setting.subtitle}
      value={currentValue}
      options={options}
      onChange={(v) => onChange(setting.key, v)}
    />
  );
}

function MultiSelectControl({
  setting,
  value,
  onChange,
}: {
  setting: MultiSelectSetting;
  value: string[] | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? [];
  const candidateValue = Array.isArray(value)
    ? value
        .slice(0, MAX_SETTING_LIST_ITEMS)
        .filter(
          (item): item is string =>
            typeof item === "string" && settingValues.includes(item),
        )
    : (setting.default ?? []);
  const currentValue = setting.single
    ? candidateValue.slice(0, 1)
    : candidateValue;
  const options = settingValues.map((val, i) => ({
    value: val,
    label: setting.titles?.[i] ?? val,
  }));

  return (
    <SettingsMultiSelect
      label={setting.title}
      value={currentValue}
      options={options}
      onChange={(v) => {
        if (!setting.single) {
          onChange(setting.key, v);
          return;
        }
        // Aidoku's multi-single-select stores an array but behaves like a
        // radio group: selecting a new value replaces the old one, and the
        // current choice is not toggled off by tapping it again.
        if (v.length === 0 && currentValue.length > 0) return;
        onChange(setting.key, v.slice(-1));
      }}
    />
  );
}

function SwitchControl({
  setting,
  value,
  onChange,
}: {
  setting: SwitchSetting;
  value: boolean | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const currentValue =
    typeof value === "boolean" ? value : (setting.default ?? false);

  return (
    <SettingsSwitch
      label={setting.title}
      subtitle={setting.subtitle}
      checked={currentValue}
      onCheckedChange={(checked) => onChange(setting.key, checked)}
    />
  );
}

function SliderControl({
  setting,
  value,
  onChange,
}: {
  setting: SliderSetting;
  value: number | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const currentValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(setting.max, Math.max(setting.min, value))
      : (setting.default ?? setting.min);

  // Use slider if formatValue is provided (more visual), otherwise stepper
  if (setting.formatValue && setting.max > setting.min) {
    return (
      <SettingsSlider
        label={setting.title}
        subtitle={setting.subtitle}
        value={currentValue}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        formatValue={(value) =>
          formatSettingDisplayValue(setting.formatValue, value)
        }
        onChange={(v) => onChange(setting.key, v)}
      />
    );
  }

  return (
    <SettingsStepper
      label={setting.title}
      subtitle={setting.subtitle}
      value={currentValue}
      min={setting.min}
      max={setting.max}
      step={setting.step}
      onChange={(v) => onChange(setting.key, v)}
    />
  );
}

function SegmentControl({
  setting,
  value,
  onChange,
}: {
  setting: SegmentSetting;
  value: number | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? setting.options ?? [];
  const currentIndex =
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < settingValues.length
      ? value
      : (setting.default ?? 0);
  const options = settingValues.map((val, i) => setting.titles?.[i] ?? val);

  return (
    <SettingsSegment
      label={setting.title}
      value={currentIndex}
      options={options}
      onChange={(i) => onChange(setting.key, i)}
    />
  );
}

function TextControl({
  setting,
  value,
  onChange,
}: {
  setting: TextSetting;
  value: string | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const currentValue =
    typeof value === "string" ? value : (setting.default ?? "");

  return (
    <SettingsText
      label={setting.title}
      subtitle={setting.subtitle}
      value={currentValue}
      placeholder={setting.placeholder}
      secure={setting.secure}
      onChange={(v) => onChange(setting.key, v)}
    />
  );
}

function EditableListControl({
  setting,
  value,
  onChange,
}: {
  setting: EditableListSetting;
  value: string[] | undefined;
  onChange: (key: string, value: unknown) => void;
}) {
  const currentValue = Array.isArray(value)
    ? value
        .slice(0, MAX_SETTING_LIST_ITEMS)
        .filter((item): item is string => typeof item === "string")
    : (setting.default ?? []);

  return (
    <SettingsEditableList
      label={setting.title}
      value={currentValue}
      placeholder={setting.placeholder}
      onChange={(v) => onChange(setting.key, v)}
    />
  );
}
