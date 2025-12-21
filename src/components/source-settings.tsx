/**
 * Source settings - displays and edits source-specific settings
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDataServices } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import { SettingsDialogWithPages } from "@/components/ui/settings-dialog";
import {
  SettingsGroup,
  SettingsPageLink,
  SettingsSelect,
  SettingsSegment,
  SettingsMultiSelect,
  SettingsSwitch,
  SettingsStepper,
  SettingsText,
  SettingsEditableList,
} from "@/components/ui/settings-controls";
import { Button } from "@/components/ui/button";
import type {
  Setting,
  GroupSetting,
  SelectSetting,
  MultiSelectSetting,
  SwitchSetting,
  StepperSetting,
  SegmentSetting,
  TextSetting,
  PageSetting,
  EditableListSetting,
} from "@/lib/sources/aidoku/settings-types";
import { isSettingVisible, extractDefaults } from "@/lib/sources/aidoku/settings-types";
import { getSourceSettingsStore } from "@/stores/source-settings";

interface SourceSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceKey: string;
  sourceName: string;
  sourceIcon?: string;
  sourceVersion?: number;
}

interface PageStackItem {
  title: string;
  content: React.ReactNode;
}

export function SourceSettings({
  open,
  onOpenChange,
  sourceKey,
  sourceName,
  sourceIcon,
  sourceVersion,
}: SourceSettingsProps) {
  const { t } = useTranslation();
  const { cacheStore } = useDataServices();
  const store = getSourceSettingsStore();

  // Use stable selectors that return cached state
  const schema = store((s) => s.schemas.get(sourceKey) ?? null);
  const userValues = store((s) => s.values.get(sourceKey));
  const setSetting = store((s) => s.setSetting);
  const resetSettings = store((s) => s.resetSettings);

  // Loading state for schema - "idle" | "loading" | "done"
  const [schemaLoadState, setSchemaLoadState] = useState<"idle" | "loading" | "done">("idle");

  // Load schema from cache if not already in store (only attempt once)
  useEffect(() => {
    if (open && !schema && schemaLoadState === "idle") {
      setSchemaLoadState("loading");
      store.getState().loadSchema(sourceKey, cacheStore)
        .finally(() => setSchemaLoadState("done"));
    }
  }, [open, schema, sourceKey, cacheStore, schemaLoadState]);

  // Reset load state when sourceKey changes
  useEffect(() => {
    setSchemaLoadState("idle");
  }, [sourceKey]);

  // Merge defaults with user values (memoized to avoid infinite loops)
  const values = useMemo(() => {
    const defaults = schema ? extractDefaults(schema) : {};
    return { ...defaults, ...userValues };
  }, [schema, userValues]);

  // Track nested page navigation
  const [pageStack, setPageStack] = useState<PageStackItem[]>([]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPageStack([]);
    }
    onOpenChange(open);
  }, [onOpenChange]);

  const pushPage = useCallback((page: PageSetting) => {
    setPageStack((prev) => [...prev, {
      title: page.title,
      content: (
        <SettingsList
          items={page.items}
          values={values}
          onUpdate={(key, value) => setSetting(sourceKey, key, value)}
          onPushPage={pushPage}
        />
      ),
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, setSetting, sourceKey]);

  const popPage = useCallback(() => {
    setPageStack((prev) => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    resetSettings(sourceKey);
    setPageStack([]);
  }, [resetSettings, sourceKey]);

  const updateSetting = useCallback(
    (key: string, value: unknown) => {
      setSetting(sourceKey, key, value);
    },
    [setSetting, sourceKey]
  );

  const isLoading = schemaLoadState === "loading";
  const isEmpty = !schema || schema.length === 0;
  const { registryId } = parseSourceKey(sourceKey);

  return (
    <SettingsDialogWithPages
      open={open}
      onOpenChange={handleOpenChange}
      icon={sourceIcon}
      title={sourceName}
      subtitle={registryId}
      version={sourceVersion}
      pageStack={pageStack}
      onPushPage={(page) => setPageStack((prev) => [...prev, page])}
      onPopPage={popPage}
      loading={isLoading}
      loadingMessage={t("sourceSettings.loadingSettings")}
      empty={!isLoading && isEmpty}
      emptyMessage={t("sourceSettings.noSettings")}
      footer={
        <Button variant="outline" onClick={handleReset} className="w-full">
          {t("sourceSettings.resetToDefaults")}
        </Button>
      }
    >
      <SettingsList
        items={schema ?? []}
        values={values}
        onUpdate={updateSetting}
        onPushPage={pushPage}
      />
    </SettingsDialogWithPages>
  );
}

interface SettingsListProps {
  items: Setting[];
  values: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onPushPage: (page: PageSetting) => void;
}

function SettingsList({ items, values, onUpdate, onPushPage }: SettingsListProps) {
  return (
    <>
      {items.map((item, index) => {
        if (!isSettingVisible(item, values)) return null;

        switch (item.type) {
          case "group":
            return (
              <GroupControl
                key={item.key || index}
                setting={item}
                values={values}
                onUpdate={onUpdate}
                onPushPage={onPushPage}
              />
            );
          case "page":
            return (
              <SettingsPageLink
                key={item.key || index}
                title={item.title}
                onClick={() => onPushPage(item)}
              />
            );
          case "select":
            return (
              <SelectControl
                key={item.key}
                setting={item}
                value={values[item.key] as string | undefined}
                onUpdate={onUpdate}
              />
            );
          case "multi-select":
            return (
              <MultiSelectControl
                key={item.key}
                setting={item}
                value={values[item.key] as string[] | undefined}
                onUpdate={onUpdate}
              />
            );
          case "switch":
            return (
              <SwitchControl
                key={item.key}
                setting={item}
                value={values[item.key] as boolean | undefined}
                onUpdate={onUpdate}
              />
            );
          case "stepper":
            return (
              <StepperControl
                key={item.key}
                setting={item}
                value={values[item.key] as number | undefined}
                onUpdate={onUpdate}
              />
            );
          case "text":
            return (
              <TextControl
                key={item.key}
                setting={item}
                value={values[item.key] as string | undefined}
                onUpdate={onUpdate}
              />
            );
          case "editable-list":
            return (
              <EditableListControl
                key={item.key}
                setting={item}
                value={values[item.key] as string[] | undefined}
                onUpdate={onUpdate}
              />
            );
          case "segment":
            return (
              <SegmentControl
                key={item.key}
                setting={item}
                value={values[item.key] as number | undefined}
                onUpdate={onUpdate}
              />
            );
          // Skip button, link, login for now
          default:
            return null;
        }
      })}
    </>
  );
}

// Adapters from Aidoku setting types to shared controls

function GroupControl({
  setting,
  values,
  onUpdate,
  onPushPage,
}: {
  setting: GroupSetting;
  values: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onPushPage: (page: PageSetting) => void;
}) {
  return (
    <SettingsGroup title={setting.title} footer={setting.footer}>
      <SettingsList
        items={setting.items}
        values={values}
        onUpdate={onUpdate}
        onPushPage={onPushPage}
      />
    </SettingsGroup>
  );
}

function SelectControl({
  setting,
  value,
  onUpdate,
}: {
  setting: SelectSetting;
  value: string | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? [];
  const currentValue = value ?? setting.default ?? settingValues[0] ?? "";
  const options = settingValues.map((val, i) => ({
    value: val,
    label: setting.titles?.[i] ?? val,
  }));

  return (
    <SettingsSelect
      label={setting.title}
      value={currentValue}
      options={options}
      onChange={(v) => onUpdate(setting.key, v)}
    />
  );
}

function SegmentControl({
  setting,
  value,
  onUpdate,
}: {
  setting: SegmentSetting;
  value: number | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? setting.options ?? [];
  const currentIndex = value ?? setting.default ?? 0;
  const options = settingValues.map((val, i) => setting.titles?.[i] ?? val);

  return (
    <SettingsSegment
      label={setting.title}
      value={currentIndex}
      options={options}
      onChange={(i) => onUpdate(setting.key, i)}
    />
  );
}

function MultiSelectControl({
  setting,
  value,
  onUpdate,
}: {
  setting: MultiSelectSetting;
  value: string[] | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const settingValues = setting.values ?? [];
  const currentValue = value ?? setting.default ?? [];
  const options = settingValues.map((val, i) => ({
    value: val,
    label: setting.titles?.[i] ?? val,
  }));

  return (
    <SettingsMultiSelect
      label={setting.title}
      value={currentValue}
      options={options}
      onChange={(v) => onUpdate(setting.key, v)}
    />
  );
}

function SwitchControl({
  setting,
  value,
  onUpdate,
}: {
  setting: SwitchSetting;
  value: boolean | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const currentValue = value ?? setting.default ?? false;

  return (
    <SettingsSwitch
      label={setting.title}
      subtitle={setting.subtitle}
      checked={currentValue}
      onCheckedChange={(checked) => onUpdate(setting.key, checked)}
    />
  );
}

function StepperControl({
  setting,
  value,
  onUpdate,
}: {
  setting: StepperSetting;
  value: number | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const currentValue = value ?? setting.default ?? setting.minimumValue;

  return (
    <SettingsStepper
      label={setting.title}
      value={currentValue}
      min={setting.minimumValue}
      max={setting.maximumValue}
      step={setting.stepValue}
      onChange={(v) => onUpdate(setting.key, v)}
    />
  );
}

function TextControl({
  setting,
  value,
  onUpdate,
}: {
  setting: TextSetting;
  value: string | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const currentValue = value ?? setting.default ?? "";

  return (
    <SettingsText
      label={setting.title}
      value={currentValue}
      placeholder={setting.placeholder}
      secure={setting.secure}
      onChange={(v) => onUpdate(setting.key, v)}
    />
  );
}

function EditableListControl({
  setting,
  value,
  onUpdate,
}: {
  setting: EditableListSetting;
  value: string[] | undefined;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const currentValue = value ?? setting.default ?? [];

  return (
    <SettingsEditableList
      label={setting.title}
      value={currentValue}
      placeholder={setting.placeholder}
      onChange={(v) => onUpdate(setting.key, v)}
    />
  );
}
