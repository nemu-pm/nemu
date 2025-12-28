/**
 * Source settings - displays and edits source-specific settings
 * 
 * Schema is populated when source is created (on first use).
 * reloadSource is called when source selector changes.
 */
import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseSourceKey } from "@/data/keys";
import { SettingsDialogWithPages } from "@/components/ui/settings-dialog";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import type { PageSetting } from "@/lib/settings";
import { extractDefaults, SettingsRenderer } from "@/lib/settings";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { SOURCE_SELECTION_KEY } from "@/lib/sources/tachiyomi/adapter";

interface SourceSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceKey: string;
  sourceName: string;
  sourceIcon?: string;
  sourceVersion?: number;
  /** Called when source needs to be reloaded (e.g., source selector change) */
  reloadSource?: () => Promise<void>;
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
  reloadSource,
}: SourceSettingsProps) {
  const { t } = useTranslation();
  const store = getSourceSettingsStore();

  // Read directly from store
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

  // Track if we're reloading to show feedback
  const reloadingRef = useRef(false);

  const updateSetting = useCallback(
    async (key: string, value: unknown) => {
      setSetting(sourceKey, key, value);
      
      // Source selector change requires reload to switch to new source
      if (key === SOURCE_SELECTION_KEY && reloadSource && !reloadingRef.current) {
        reloadingRef.current = true;
        toast.promise(
          reloadSource().finally(() => { reloadingRef.current = false; }),
          {
            loading: t("sourceSettings.reloadingSource"),
            success: t("sourceSettings.sourceReloaded"),
            error: t("sourceSettings.reloadFailed"),
          }
        );
      }
    },
    [setSetting, sourceKey, reloadSource, t]
  );

  const isEmpty = !schema || schema.length === 0;
  const registryId = sourceKey ? parseSourceKey(sourceKey).registryId : "";

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
      headerAction={
        <Button variant="secondary" size="sm" onClick={handleReset} className="h-8 gap-1.5 shrink-0">
          <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-4" />
          {t("common.reset")}
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
