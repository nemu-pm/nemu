import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking } from "react-native";
import type { InstalledSource, SourcePackageSetting } from "@/data/schema";
import { useSourceSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  getMobileInstalledSourceRegistryRef,
  getMobileInstalledSourceSettingsKeys,
} from "@/lib/mobileInstalledSourceKeys";
import { normalizeMobileSourceExternalUrl } from "@/lib/mobileSourceExternalUrl";
import {
  resolveMobileSourceSettingAction,
  type MobileSourceLoginSubmission,
} from "@/lib/mobileSourceSettingActions";
import {
  canRetryMobileSourceSettingsLoadError,
  getMobileSourceSettingsNavigationResetKey,
  makeMobileSourceKey,
  sourceSettingRequestsDataRefresh,
} from "@/lib/mobileSourceSettings";
import { clearMobileAidokuSandboxDataForSource } from "@/sources/mobileAidokuSandboxData";
import { normalizeInstalledSource } from "@/sources/mobileSourceRuntime";
import {
  completeMobileSourceLogin,
  completeMobileSourceLogout,
  getMobileSourceLoginCapabilities,
  isMobileSourceLoginCancellation,
  resetMobileSourceRuntimeSettings,
  runMobileSourceSettingsOperation,
  type MobileSourceLoginCapabilities,
} from "@/sources/mobileSourceSettingsExecutor";
import { MobileInstalledSourceSettingsSheet } from "./MobileInstalledSourceSettingsSheet";

const EMPTY_SOURCE_SETTINGS: SourcePackageSetting[] = [];

/**
 * Self-contained host for the shared installed-source settings sheet, so every
 * entry point outside Settings (Browse long-press, unsupported Browse rows, the
 * source page's options menu, the reader's error) opens it in place instead of
 * pushing the Settings tab.
 *
 * It carries the Settings wiring: load, value writes and their notification
 * operation, reset, retry, login, logout and package buttons. Logout and a
 * button that asks first confirm through a system alert over the sheet, which
 * needs no dismiss-then-present handoff. `onSourceChanged` reports every
 * committed change so the screen underneath can reload the source.
 */
export function MobileSourceQuickSettingsSheet({
  source,
  iconUri,
  strings,
  visible,
  onClose,
  onDismiss,
  onSourceChanged,
}: {
  source: InstalledSource;
  iconUri: string | null;
  strings: MobileStrings;
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onSourceChanged?: () => void;
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

  const reportChanged = () => onSourceChanged?.();

  const [loginCapabilities, setLoginCapabilities] =
    useState<MobileSourceLoginCapabilities | null>(null);
  useEffect(() => {
    if (settings.loading) return;
    let active = true;
    void getMobileSourceLoginCapabilities({
      source: runtimeSource,
      settings: settings.data,
    })
      .then((capabilities) => {
        if (active) setLoginCapabilities(capabilities);
      })
      .catch(() => {
        if (active) setLoginCapabilities({ basic: false, web: false });
      });
    return () => {
      active = false;
    };
  }, [runtimeSource, settings.data, settings.loading]);

  const reloadScopes = useCallback(
    async (setting: SourcePackageSetting) => {
      if (setting.refreshes?.includes("settings")) await settings.reload();
    },
    [settings],
  );

  const formatCredentialsRejected = (detail?: string): string =>
    detail
      ? `${strings.settings.sourceSettingsCredentialsRejected}\n${detail}`
      : strings.settings.sourceSettingsCredentialsRejected;

  const runButton = (setting: SourcePackageSetting) => {
    const decision = resolveMobileSourceSettingAction(setting, settings.data);
    if (decision.kind !== "run-button") return;
    void run(async () => {
      setOperationError(null);
      try {
        const result = await runMobileSourceSettingsOperation({
          source: runtimeSource,
          settings: settings.data,
          operation: { kind: "notification", notification: decision.notification },
        });
        if (result.status !== "complete") {
          throw new Error(strings.settings.sourceSettingsActionFailed);
        }
        await reloadScopes(setting);
        reportChanged();
        await hapticConfirm();
      } catch {
        await reportError(strings.settings.sourceSettingsActionFailed);
      }
    });
  };

  const login = async (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options: { signal?: AbortSignal } = {},
  ): Promise<string | null> => {
    setOperationError(null);
    setBusy(true);
    try {
      const result = await completeMobileSourceLogin({
        source: runtimeSource,
        schema,
        setting,
        submission,
        currentSettings: settings.data,
        clearSandbox: clearMobileAidokuSandboxDataForSource,
        persistSettings: settings.setSettings,
        signal: options.signal,
      });
      if (result.status === "rejected") {
        return formatCredentialsRejected(result.detail);
      }
      if (result.status === "blocked") {
        return strings.settings.sourceSettingsRuntimeUnavailable;
      }
      reportChanged();
      void reloadScopes(setting).catch(() =>
        reportError(strings.settings.sourceSettingsActionFailed),
      );
      void hapticConfirm();
      return null;
    } catch (error) {
      if (isMobileSourceLoginCancellation(error)) throw error;
      await hapticError();
      return strings.settings.sourceSettingsActionFailed;
    } finally {
      setBusy(false);
    }
  };

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
      loginCapabilities={loginCapabilities}
      onClose={onClose}
      onDismiss={onDismiss}
      onLogin={login}
      onLogout={(setting) => {
        Alert.alert(
          setting.logoutTitle ?? strings.settings.sourceSettingsLogout,
          strings.settings.sourceSettingsLogoutConfirm,
          [
            { text: strings.common.cancel, style: "cancel" },
            {
              text: strings.settings.sourceSettingsLogout,
              style: "destructive",
              onPress: () => {
                void run(async () => {
                  setOperationError(null);
                  try {
                    await completeMobileSourceLogout({
                      source: runtimeSource,
                      schema,
                      setting,
                      currentSettings: settings.data,
                      clearSandbox: clearMobileAidokuSandboxDataForSource,
                      persistSettings: settings.setSettings,
                    });
                    await reloadScopes(setting);
                    reportChanged();
                    await hapticConfirm();
                  } catch {
                    await reportError(strings.settings.sourceSettingsActionFailed);
                  }
                });
              },
            },
          ],
        );
      }}
      onAction={(setting) => {
        const decision = resolveMobileSourceSettingAction(setting, settings.data);
        if (decision.kind === "open-link") {
          const url = normalizeMobileSourceExternalUrl(decision.url);
          if (!url) {
            void reportError(strings.settings.sourceSettingsInvalidLink);
            return;
          }
          void Linking.openURL(url).catch(() =>
            reportError(strings.settings.sourceSettingsInvalidLink),
          );
          return;
        }
        if (decision.kind === "invalid-link") {
          void reportError(strings.settings.sourceSettingsInvalidLink);
          return;
        }
        if (decision.kind !== "run-button") return;
        if (!decision.confirmation) {
          runButton(setting);
          return;
        }
        const { confirmation } = decision;
        Alert.alert(
          confirmation.title,
          confirmation.message || strings.settings.sourceSettingsActionConfirm,
          [
            { text: strings.common.cancel, style: "cancel" },
            {
              text: strings.settings.sourceSettingsRunAction,
              style: confirmation.destructive ? "destructive" : "default",
              onPress: () => runButton(setting),
            },
          ],
        );
      }}
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
            reportChanged();
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
            reportChanged();
            if (!sourceSettingRequestsDataRefresh(setting)) return;
            await reloadScopes(setting);
          } catch {
            await reportError(strings.settings.sourceSettingsActionFailed);
          }
        });
      }}
    />
  );
}
