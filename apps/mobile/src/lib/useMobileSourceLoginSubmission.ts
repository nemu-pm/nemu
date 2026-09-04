import { useCallback, useEffect, useRef, useState } from "react";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import type { SourcePackageSetting } from "@/data/schema";
import { getMobileStrings } from "@/lib/mobileI18n";
import type { MobileSourceLoginSubmission } from "@/lib/mobileSourceSettingActions";
import { isMobileSourceLoginCancellation } from "@/sources/mobileSourceSettingsExecutor";

export type MobileSourceLoginHandler = (
  setting: SourcePackageSetting,
  submission: MobileSourceLoginSubmission,
  options?: { signal?: AbortSignal },
) => Promise<string | null> | string | null;

/**
 * Credential-submission lifecycle shared by every login-sheet presentation:
 * the settings card's embedded panel and the native sheet hosts that layer
 * login as its own presented sheet. Owns the abort fence so a superseded or
 * unmounted submission can never persist credentials, and reports the source's
 * validation error through `error`.
 *
 * `submit` resolves with the error string (or null on success); callers close
 * their presentation when it resolves null.
 */
export function useMobileSourceLoginSubmission(onLogin: MobileSourceLoginHandler) {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [setting, setSetting] = useState<SourcePackageSetting | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const close = useCallback(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSubmitting(false);
    setError(null);
    setSetting(null);
  }, []);

  const present = useCallback((next: SourcePackageSetting) => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setSubmitting(false);
    setSetting(next);
  }, []);

  const submit = useCallback(
    async (submission: MobileSourceLoginSubmission): Promise<string | null> => {
      if (!setting || !onLogin || submitting) return null;
      const activeSetting = setting;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSubmitting(true);
      setError(null);
      try {
        const nextError = await onLogin(activeSetting, submission, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestRef.current !== requestId) {
          return null;
        }
        if (nextError) {
          setError(nextError);
          return nextError;
        }
        return null;
      } catch (caught) {
        if (
          controller.signal.aborted ||
          isMobileSourceLoginCancellation(caught) ||
          requestRef.current !== requestId
        ) {
          return null;
        }
        const message = strings.settings.sourceSettingsLoginFailed;
        setError(message);
        return message;
      } finally {
        if (requestRef.current === requestId) {
          abortRef.current = null;
          setSubmitting(false);
        }
      }
    },
    [onLogin, setting, strings.settings.sourceSettingsLoginFailed, submitting],
  );

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return { setting, submitting, error, present, close, submit };
}
