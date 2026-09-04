import { useCallback, useMemo, useState } from "react";
import type { InstalledSource, SourcePackageSetting } from "@/data/schema";
import { useSourceSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  getMobileInstalledSourceRegistryRef,
  getMobileInstalledSourceSettingsKeys,
} from "@/lib/mobileInstalledSourceKeys";
import {
  canRetryMobileSourceSettingsLoadError,
  getMobileSourceSettingsNavigationResetKey,
  makeMobileSourceKey,
  sourceSettingRequestsDataRefresh,
} from "@/lib/mobileSourceSettings";
import { clearMobileAidokuSandboxDataForSource } from "@/sources/mobileAidokuSandboxData";
import { normalizeInstalledSource } from "@/sources/mobileSourceRuntime";
import {
  resetMobileSourceRuntimeSettings,
  runMobileSourceSettingsOperation,
} from "@/sources/mobileSourceSettingsExecutor";
import { MobileInstalledSourceSettingsSheet } from "./MobileInstalledSourceSettingsSheet";

const EMPTY_SOURCE_SETTINGS: SourcePackageSetting[] = [];

/**
 * Self-contained host for the shared installed-source settings sheet, used by
 * the Browse long-press quick actions so the sheet opens in place instead of
 * pushing the Settings screen.
 *
 * It carries the read/write half of the Settings wiring (load, value writes and
 * their notification operation, reset, retry). Login, OAuth, and package button
 * rows stay with the Settings screen, which owns the confirmation host they
 * need; `MobileSourceSettingsCard` already renders those rows disabled when the
 * handlers are absent, exactly as the reader-plugin sheet does.
 */
export function MobileSourceQuickSettingsSheet({
  source,
  iconUri,
  strings,
  visible,
  onClose,
  onDismiss,
}: {
  source: InstalledSource;
  iconUri: string | null;
  strings: MobileStrings;
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const runtimeSource = useMemo(
    () => normalizeInstalledSource(source),
    [source],
  );
  const schema = source.packageMetadata?.settings ?? EMPTY_SOURCE_SETTINGS;
  const settingsKeys = useMemo(
    () => getMobileInstalledSourceSettingsKeys(source),
    [source],
  );
  const sourceKey = useMemo(() => {
    const { registryId, sourceId } = getMobileInstalledSourceRegistryRef(source);
    return makeMobileSourceKey(registryId, sourceId);
  }, [source]);
  const settings = useSourceSettings(sourceKey, schema, settingsKeys);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }, []);

  const reportError = useCallback(async (message: string) => {
    setOperationError(message);
    await hapticError();
  }, []);

  return (
    <MobileInstalledSourceSettingsSheet
      source={source}
      iconUri={iconUri}
      strings={strings}
      visible={visible}
      disabled={busy}
      settings={schema}
      values={settings.data}
      loading={settings.loading}
      error={settings.error ?? operationError}
      navigationResetKey={getMobileSourceSettingsNavigationResetKey(
        sourceKey,
        settingsKeys,
      )}
      retryDisabled={
        busy ||
        !canRetryMobileSourceSettingsLoadError({
          hasError: Boolean(settings.error),
          state: { loading: settings.loading, mutating: busy },
        })
      }
      retrying={busy && settings.loading}
      onClose={onClose}
      onDismiss={onDismiss}
      onRetry={() => {
        void run(async () => {
          setOperationError(null);
          try {
            await settings.reload();
          } catch {
            await reportError(strings.settings.sourceSettingsActionFailed);
          }
        });
      }}
      onReset={() => {
        void run(async () => {
          setOperationError(null);
          try {
            await resetMobileSourceRuntimeSettings({
              source: runtimeSource,
              clearSandbox: clearMobileAidokuSandboxDataForSource,
              resetProfileSettings: settings.resetSettings,
            });
            await hapticConfirm();
          } catch {
            await reportError(strings.settings.sourceSettingsActionFailed);
          }
        });
      }}
      onChange={(key, value, setting) => {
        void run(async () => {
          setOperationError(null);
          try {
            await settings.setSetting(key, value);
            if (setting.notification) {
              const result = await runMobileSourceSettingsOperation({
                source: runtimeSource,
                settings: { ...settings.data, [key]: value },
                operation: {
                  kind: "notification",
                  notification: setting.notification,
                },
              });
              if (result.status !== "complete") {
                throw new Error(strings.settings.sourceSettingsActionFailed);
              }
            }
            if (!sourceSettingRequestsDataRefresh(setting)) return;
            if (setting.refreshes?.includes("settings")) {
              await settings.reload();
            }
          } catch {
            await reportError(strings.settings.sourceSettingsActionFailed);
          }
        });
      }}
    />
  );
}
