/**
 * Source settings - displays and edits source-specific settings
 * 
 * Schema is loaded when source is created (not here).
 * This component just reads from the source-settings store.
 */
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { parseSourceKey } from "@/data/keys";
import { SettingsDialogWithPages } from "@/components/ui/settings-dialog";
import { Button } from "@/components/ui/button";
import type { PageSetting } from "@/lib/settings";
import { extractDefaults, SettingsRenderer } from "@/lib/settings";
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
  const store = getSourceSettingsStore();

  // Read directly from store - schema is already loaded when source was created
  const schema = store((s) => s.schemas.get(sourceKey) ?? null);
  const userValues = store((s) => s.values.get(sourceKey));
  const setSetting = store((s) => s.setSetting);
  const resetSettings = store((s) => s.resetSettings);

  // Merge defaults with user values
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
        <SettingsRenderer
          schema={page.items}
          values={values}
          onChange={(key, value) => setSetting(sourceKey, key, value)}
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
      empty={isEmpty}
      emptyMessage={t("sourceSettings.noSettings")}
      footer={
        <Button variant="outline" onClick={handleReset} className="w-full">
          {t("sourceSettings.resetToDefaults")}
        </Button>
      }
    >
      <SettingsRenderer
        schema={schema ?? []}
        values={values}
        onChange={updateSetting}
        onPushPage={pushPage}
      />
    </SettingsDialogWithPages>
  );
}
