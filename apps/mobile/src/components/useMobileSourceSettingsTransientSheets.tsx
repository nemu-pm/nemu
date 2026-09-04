import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SourcePackageSetting } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  getSourceSettingOptions,
  getSourceSettingValue,
} from "@/lib/mobileSourceSettings";
import type { MobileSourceLoginSubmission } from "@/lib/mobileSourceSettingActions";
import { useMobileSourceLoginSubmission } from "@/lib/useMobileSourceLoginSubmission";
import { MobileSourceLoginSheet } from "./MobileSourceLoginSheet";
import {
  MobileSourceMultiSelectSheet,
  MobileSourceStringListSheet,
} from "./MobileSourceSettingsSubSheets";

/**
 * A card row that takes over the screen for a round-trip: source login, a
 * multi-select picker, or a string-list editor. Only one native sheet can be
 * presented at a time, so each request first natively dismisses the host
 * settings sheet (the same handoff choreography the Add Source sheet uses for
 * its filter sheet: queue the destination, close, present from the
 * post-dismiss callback), and closing the destination re-presents the host.
 */
type SourceSettingsTransientSheet =
  | { kind: "login"; setting: SourcePackageSetting }
  | { kind: "multi-select"; setting: SourcePackageSetting }
  | { kind: "string-list"; setting: SourcePackageSetting };

function getSourceSettingStringList(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): string[] {
  const value = getSourceSettingValue(setting, values);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Shared dismiss-then-present choreography behind a source/plugin settings
 * sheet. The host spreads `settingsSheetProps` onto its
 * `MobileNativeSheetScaffold`, passes `cardProps` to `MobileSourceSettingsCard`,
 * and renders `renderTransientSheet()` next to the scaffold.
 */
export function useMobileSourceSettingsTransientSheets({
  visible,
  disabled,
  values,
  strings,
  onChange,
  onClose,
  onDismiss,
  onLogin,
}: {
  visible: boolean;
  disabled: boolean;
  values: Record<string, unknown>;
  strings: MobileStrings;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
  onClose: () => void;
  onDismiss?: () => void;
  onLogin?: (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null>;
}) {
  const login = useMobileSourceLoginSubmission(
    onLogin ?? (() => Promise.resolve(null)),
  );

  const [transient, setTransient] =
    useState<SourceSettingsTransientSheet | null>(null);
  const [transientPresented, setTransientPresented] = useState(false);
  const [settingsSuppressed, setSettingsSuppressed] = useState(false);
  // The refs own the dismiss sequencing so native `onClose`/`onDismiss`
  // callbacks can be told apart from a genuine owner-initiated close without
  // extra renders.
  const transientRef = useRef<SourceSettingsTransientSheet | null>(null);
  const transientPhaseRef = useRef<
    "dismiss-settings" | "dismiss-transient" | null
  >(null);
  const transientPresentedRef = useRef(false);
  const hostVisibleRef = useRef(visible);

  useLayoutEffect(() => {
    hostVisibleRef.current = visible;
  }, [visible]);

  useLayoutEffect(() => {
    transientPresentedRef.current = transientPresented;
  }, [transientPresented]);

  const requestTransient = useCallback(
    (next: SourceSettingsTransientSheet) => {
      // The first accepted tap owns this visibility cycle.
      if (transientRef.current || transientPhaseRef.current) return;
      transientRef.current = next;
      transientPhaseRef.current = "dismiss-settings";
      setTransient(next);
      // Suppressing `visible` starts the settings sheet's native dismissal;
      // its post-dismiss callback presents the destination.
      setSettingsSuppressed(true);
      if (next.kind === "login") login.present(next.setting);
    },
    [login],
  );

  const closeTransient = useCallback(() => {
    if (transientPhaseRef.current || !transientRef.current) return;
    transientPhaseRef.current = "dismiss-transient";
    setTransientPresented(false);
  }, []);

  const handleTransientDismissed = useCallback(() => {
    const phase = transientPhaseRef.current;
    transientPhaseRef.current = null;
    transientRef.current = null;
    setTransient(null);
    if (phase === "dismiss-transient" && hostVisibleRef.current) {
      // Un-suppressing re-presents the settings sheet from its closed state.
      setSettingsSuppressed(false);
    }
  }, []);

  // The owner closed the whole sheet while a round-trip was in flight: drop
  // the handoff and surface the close instead of re-presenting anything.
  useEffect(() => {
    if (visible) return;
    if (
      !transientRef.current &&
      transientPhaseRef.current === null &&
      !settingsSuppressed
    ) {
      return;
    }
    const wasPresented = transientPresentedRef.current;
    transientPhaseRef.current = wasPresented ? "dismiss-transient" : null;
    transientRef.current = null;
    if (wasPresented) {
      // Let the destination finish its native dismissal animation before its
      // state is cleared in the post-dismiss callback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTransientPresented(false);
    } else {
      setTransient(null);
    }
    setSettingsSuppressed(false);
    onClose();
    onDismiss?.();
  }, [onClose, onDismiss, settingsSuppressed, visible]);

  const renderTransientSheet = (): ReactNode => {
    if (!transient) return null;
    switch (transient.kind) {
      case "login":
        if (!login.setting) return null;
        return (
          <MobileSourceLoginSheet
            key={`login:${login.setting.key}`}
            setting={login.setting}
            visible={transientPresented}
            submitting={login.submitting}
            error={login.error}
            onClose={closeTransient}
            onDismiss={handleTransientDismissed}
            onSubmit={(submission) => {
              void login.submit(submission).then((submitError) => {
                // A successful submission dismisses the login sheet and
                // re-presents the settings sheet with the fresh values.
                if (!submitError) closeTransient();
              });
            }}
          />
        );
      case "multi-select": {
        const sheet = transient;
        return (
          <MobileSourceMultiSelectSheet
            key={`multi-select:${sheet.setting.key}`}
            disabled={disabled}
            visible={transientPresented}
            single={sheet.setting.single === true}
            options={getSourceSettingOptions(sheet.setting)}
            selectedValues={getSourceSettingStringList(sheet.setting, values)}
            setting={sheet.setting}
            strings={strings}
            onDismiss={handleTransientDismissed}
            onClose={closeTransient}
            onToggle={(optionValue) => {
              const optionValues = new Set(
                getSourceSettingOptions(sheet.setting).map(
                  (option) => option.value,
                ),
              );
              const current = getSourceSettingStringList(
                sheet.setting,
                values,
              ).filter((item) => optionValues.has(item));
              const single = sheet.setting.single === true;
              const next = single
                ? [optionValue]
                : current.includes(optionValue)
                  ? current.filter((item) => item !== optionValue)
                  : [...current, optionValue];
              onChange(sheet.setting.key, next, sheet.setting);
              if (single) closeTransient();
            }}
          />
        );
      }
      case "string-list": {
        const sheet = transient;
        return (
          <MobileSourceStringListSheet
            key={`string-list:${sheet.setting.key}`}
            disabled={disabled}
            visible={transientPresented}
            items={getSourceSettingStringList(sheet.setting, values)}
            setting={sheet.setting}
            strings={strings}
            onDismiss={handleTransientDismissed}
            onClose={closeTransient}
            onAdd={(item) => {
              onChange(
                sheet.setting.key,
                [
                  ...getSourceSettingStringList(sheet.setting, values),
                  item,
                ],
                sheet.setting,
              );
            }}
            onRemove={(index) => {
              onChange(
                sheet.setting.key,
                getSourceSettingStringList(sheet.setting, values).filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
                sheet.setting,
              );
            }}
          />
        );
      }
    }
  };

  return {
    settingsSheetProps: {
      visible: visible && !settingsSuppressed,
      onClose: () => {
        // Native closes that belong to a transient round-trip must not reach
        // the owner, or it would tear the sheet (and its pending handoff) down.
        if (transientPhaseRef.current || transientRef.current) return;
        onClose();
      },
      onDismiss: () => {
        if (transientPhaseRef.current === "dismiss-settings") {
          // The settings sheet is fully away; present the destination.
          transientPhaseRef.current = null;
          setTransientPresented(true);
          return;
        }
        onDismiss?.();
      },
    },
    cardProps: {
      ...(onLogin
        ? {
            onRequestLoginSheet: (setting: SourcePackageSetting) => {
              requestTransient({ kind: "login", setting });
            },
          }
        : null),
      onRequestMultiSelectSheet: (setting: SourcePackageSetting) => {
        requestTransient({ kind: "multi-select", setting });
      },
      onRequestStringListSheet: (setting: SourcePackageSetting) => {
        requestTransient({ kind: "string-list", setting });
      },
    },
    renderTransientSheet,
  };
}
